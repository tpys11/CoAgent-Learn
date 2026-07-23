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
        self.total_tokens = 0  # 累计token消耗

    def _create_client(self) -> OpenAI:
        raise NotImplementedError

    def _strip_thinking(self, content: str) -> str:
        """去除 DeepSeek 的思考标签 <｜end▁of▁thinking｜> ... """
        return re.sub(r"█████.*?█████", "", content, flags=re.DOTALL).strip()

    def chat(self, messages: list[dict], temperature: float = 0.7) -> str:
        """普通对话，返回文本"""
        for attempt in range(1, self.max_retries + 1):
            try:
                resp = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=messages,
                    temperature=temperature,
                    timeout=config.LLM_REQUEST_TIMEOUT,
                )
                content = resp.choices[0].message.content or ""
                self._log_tokens(resp, "chat", attempt)
                return self._strip_thinking(content)
            except Exception as e:
                logger.warning(f"chat 第{attempt}次失败: {e}")
                if attempt == self.max_retries:
                    raise RuntimeError(f"chat 全部{self.max_retries}次重试均失败") from e
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
                    timeout=config.LLM_REQUEST_TIMEOUT,
                )
                content = resp.choices[0].message.content or "{}"
                content = self._strip_thinking(content)
                self._log_tokens(resp, "json", attempt)
                return self._parse_json(content)
            except Exception as e:
                logger.warning(f"chat_with_json 第{attempt}次失败: {e}")
                if attempt == self.max_retries:
                    raise RuntimeError(f"chat_with_json 全部{self.max_retries}次重试均失败") from e
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
            pass
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            try:
                import json
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
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


class DeepSeekLLM(BaseLLM):
    """DeepSeek 实现"""

    def __init__(self, api_key: str | None = None):
        self.model_name = "deepseek-chat"
        self._api_key = api_key
        super().__init__()

    def _create_client(self) -> OpenAI:
        return OpenAI(
            api_key=self._api_key or config.DEEPSEEK_API_KEY,
            base_url=config.DEEPSEEK_BASE_URL,
        )
