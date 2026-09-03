"""
BaseLLM 统一模型封装
- 对话 + JSON结构化输出 + 异常重试 + token日志
- 首个实现：DeepSeek（OpenAI 兼容协议）
"""
import re
import time
import logging
from openai import OpenAI
from .config import config

logger = logging.getLogger("base_llm")


class BaseLLM:
    """大模型统一调用基类，子类只需实现 _create_client"""

    def __init__(self):
        self.client = self._create_client()
        self.max_retries = 3
        self.retry_delays = [2, 4, 8]
        self.total_tokens = 0  # 累计token消耗

    def _create_client(self) -> OpenAI:
        raise NotImplementedError

    def chat(self, messages: list[dict], temperature: float = 0.7, max_tokens: int | None = None) -> str:
        """普通对话，返回文本"""
        kwargs = self._thinking_kwargs()
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens
        for attempt in range(1, self.max_retries + 1):
            try:
                resp = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=2000,
                    timeout=config.LLM_REQUEST_TIMEOUT,
                    **kwargs,
                )
                content = resp.choices[0].message.content or ""
                self._log_tokens(resp, "chat", attempt)
                # D3：旧的 █████ 思考剥离助手已删——实证（2026-08-30，真实 API 双样本）
                # DeepSeek thinking=True 时思考走独立 message.reasoning_content 字段，
                # content 纯净、原正则永不匹配（死代码）；保留 .strip() 与原行为逐字节等价。
                return content.strip()
            except Exception as e:
                logger.warning(f"chat 第{attempt}次失败: {e}")
                if attempt == self.max_retries:
                    _msg = f"chat 全部{self.max_retries}次重试均失败"
                    if "429" in str(e):
                        _msg += "（免费模型限流：请稍后重试，或在 设置→AI服务 切换预设档/模型）"
                    raise RuntimeError(_msg) from e
                time.sleep(attempt * 2)

    def chat_with_json(self, messages: list[dict], output_schema: dict, temperature: float = 0.3) -> dict:
        """返回结构化 JSON（DeepSeek response_format + schema提示）"""
        schema_desc = self._describe_schema(output_schema)
        system = messages[0] if messages and messages[0].get("role") == "system" else None
        json_instruction = (
            f"你必须严格按以下JSON Schema输出，不要输出任何其他内容：\n{schema_desc}\n"
            "确保JSON格式完全正确，所有字段必填。"
        )
        if system:
            system["content"] = f"{system['content']}\n\n{json_instruction}"
        else:
            messages.insert(0, {"role": "system", "content": json_instruction})

        for attempt in range(1, self.max_retries + 1):
            try:
                resp = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=messages,
                    temperature=temperature,
                    response_format={"type": "json_object"},
                    max_tokens=2000,
                    timeout=config.LLM_REQUEST_TIMEOUT,
                )
                # D3：旧的 █████ 思考剥离助手已删（同 chat 内注释）；_parse_json 内部自带 strip，行为等价。
                content = resp.choices[0].message.content or "{}"
                self._log_tokens(resp, "json", attempt)
                return self._parse_json(content)
            except Exception as e:
                logger.warning(f"chat_with_json 第{attempt}次失败: {e}")
                if attempt == self.max_retries:
                    _msg = f"chat_with_json 全部{self.max_retries}次重试均失败"
                    if "429" in str(e):
                        _msg += "（免费模型限流：请稍后重试，或在 设置→AI服务 切换预设档/模型）"
                    raise RuntimeError(_msg) from e
                time.sleep(attempt * 2)

    def _describe_schema(self, schema: dict) -> str:
        """将 JSON Schema 转为人可读的中文描述，写入提示词"""
        props = schema.get("properties", {})
        required = schema.get("required", [])
        lines = ["{"]
        for key, val in props.items():
            req = "必填" if key in required else "可选"
            vtype = val.get("type", "string")
            desc = val.get("description", "")
            lines.append(f'  "{key}": {vtype}, // {req}, {desc}')
        lines.append("}")
        return "\n".join(lines)

    def _parse_json(self, raw: str) -> dict:
        """从模型输出中提取JSON，容错处理"""
        raw = raw.strip()
        try:
            import json
            return json.loads(raw)
        except json.JSONDecodeError:
            logger.debug("模型输出直出 JSON 解析失败，回退正则提取")
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            try:
                import json
                return json.loads(match.group())
            except json.JSONDecodeError:
                logger.debug("围栏片段 JSON 解析失败，放弃解析")
        raise ValueError(f"无法从模型输出中解析JSON: {raw[:200]}")

    def _log_tokens(self, resp, call_type: str, attempt: int):
        usage = resp.usage
        if usage:
            self.total_tokens += usage.total_tokens
            logger.info(
                f"[{call_type}] 第{attempt}次 | "
                f"输入={usage.prompt_tokens} 输出={usage.completion_tokens} "
                f"小计={usage.total_tokens} 累计={self.total_tokens}"
            )

    def _thinking_kwargs(self) -> dict:
        """F14-S4b：DeepSeek v4 思考开关只对 DeepSeek 端点透传。
        为什么：extra_body thinking/reasoning_effort 是 DeepSeek 私有扩展，Zen 等
        OpenAI 兼容网关语义未知——缺失 reasoning_content 时前端本就自动降级（双通道），无需透传。"""
        if getattr(self, "thinking", None) is None:
            return {}
        if self._base_url and "deepseek" not in self._base_url:
            return {}
        kwargs: dict = {"extra_body": {"thinking": {"type": "enabled" if self.thinking else "disabled"}}}
        if self.thinking and self.effort:
            kwargs["reasoning_effort"] = self.effort
        return kwargs


    def chat_stream(self, messages: list[dict], on_token, temperature: float = 0.7, on_content=None, cancel_event=None, on_reasoning=None, response_format=None):
        """流式对话，每收到一个token调用on_token(chunk_text)。
        同时消费 delta.reasoning_content（v4 思考模式的推理内容，作为思维链推送）与 delta.content（最终回答），
        推理阶段 content 为空时仍能持续推送推理文本，保证前端思维链实时可见。
        on_content：仅 content（最终回答）token 时调用——生成节点的回答内容直接流式推给前端。
        on_reasoning：仅 reasoning_content（思考）token 时调用——生成节点的思考单独流式进思维链（与回答内容区分）。
        cancel_event：用户手动停止时置位（threading.Event），chunk 循环内检查，最多延迟一个 chunk 即中断生成。"""
        kwargs = self._thinking_kwargs()
        if response_format is not None:
            kwargs["response_format"] = response_format
        for attempt in range(self.max_retries):
            if cancel_event and cancel_event.is_set():
                return  # 用户手动停止：重试/等待间隙也立即退出
            try:
                response = self.client.chat.completions.create(
                    model=self.model_name, messages=messages, temperature=temperature, stream=True, **kwargs
                )
                for chunk in response:
                    if cancel_event and cancel_event.is_set():
                        return  # 用户手动停止：立即中断（不抛错，上层按已取消处理）
                    delta = chunk.choices[0].delta
                    reasoning = getattr(delta, "reasoning_content", None) or ""
                    piece = delta.content or ""
                    if reasoning:
                        on_token(reasoning)
                        if on_reasoning:
                            on_reasoning(reasoning)
                    if piece:
                        on_token(piece)
                        if on_content:
                            on_content(piece)
                return
            except Exception as e:
                logger.warning(f"chat_stream 第{attempt+1}次失败: {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delays[attempt])
        _msg = f"chat_stream 全部{self.max_retries}次重试均失败"
        if "429" in str(e):
            _msg += "（免费模型限流：请稍后重试，或在 设置→AI服务 切换预设档/模型）"
        raise RuntimeError(_msg)

class DeepSeekLLM(BaseLLM):
    """OpenAI 兼容协议实现（DeepSeek/OpenAI/通义/GLM/Kimi/豆包等）"""

    def __init__(self, api_key: str | None = None, model: str | None = None, base_url: str | None = None,
                 thinking: bool | None = None, effort: str | None = None):
        self.model_name = model or "deepseek-v4-flash-vision-exp"
        self._api_key = api_key
        self._base_url = base_url
        # thinking: None=跟随 API 默认（v4 为思考模式，推理内容可作思维链展示）；False=非思考模式（决策快）
        self.thinking = thinking
        # effort: 思考强度（low=极短思考/high=深入思考），思考模式开启时生效；None=默认 high
        self.effort = effort
        super().__init__()

    def _create_client(self) -> OpenAI:
        if not self._api_key:
            raise RuntimeError("未配置 API Key（请在设置→基础→模型与 API Key 中填写）")
        return OpenAI(
            api_key=self._api_key,
            base_url=self._base_url or config.DEEPSEEK_BASE_URL,
            timeout=120,
        )
