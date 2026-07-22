

在 `backend/core/` 下创建了统一的模型调用层，让上层 Agent 代码无需关心底层是哪个模型、怎么处理异常、怎么过滤特有输出——调用两个方法即可。

***

## 新建文件

| 文件                         | 职责                           |
| -------------------------- | ---------------------------- |
| `backend/core/__init__.py` | 包标记                          |
| `backend/core/config.py`   | 从 `.env` 读取全部配置，集中管理         |
| `backend/core/base_llm.py` | 基类 `BaseLLM` + DeepSeek 子类实现 |
| `tests/test_base_llm.py`   | 独立验证脚本（需填入 Key 后运行）          |

***

## 配置统一入口 config.py

之前环境变量散落在各处用 `os.getenv()` 读取，现在全部收敛到 `Config` 类：

```python
class Config:
    DEEPSEEK_API_KEY: str
    DEEPSEEK_BASE_URL: str   # 默认 https://api.deepseek.com/v1
    LLM_MAX_CONCURRENCY: int # 默认 3
    LLM_REQUEST_TIMEOUT: int # 默认 120秒
    SQLITE_PATH: str
    REDIS_HOST / REDIS_PORT
    CHROMA_PERSIST_DIRECTORY
```

全项目只需 `from backend.core.config import config` 一处导入。

***

## BaseLLM 基类设计

核心类 `BaseLLM` 定义了两个对外接口，所有子类（DeepSeek / 后续新增模型）只需实现 `_create_client()` 即可。

### chat(messages) — 普通对话

调用 DeepSeek 对话接口，返回纯文本。内部自动做三件事：

1. **思考标签过滤**：用正则 `▐□□□□□*` 去除 DeepSeek R1 系列的 reasoning token（`_strip_thinking` 方法）

2. **超时重试**：失败后最多重试3次，间隔 2s → 4s → 6s 递增，给网络抖动留余量

3. **Token 日志**：每次调用记录 prompt_tokens、completion_tokens，并累加到 `total_tokens`

### chat_with_json(messages, output_schema) — JSON 结构化输出

Agent 之间传递结构化数据用。关键设计：

1. **自动注入 Schema 指令**：将用户的 JSON Schema 转为人可读描述（`_describe_schema`），拼接进 system prompt，告诉模型每个字段的类型、是否必填、含义

2. **启用 `response_format={"type": "json_object"}`**：告诉 DeepSeek API 只输出 JSON

3. **两层容错解析**（`_parse_json`）：先直接 `json.loads`；失败则用正则 `\{[\s\S]*\}` 从输出中提取 JSON 块再解析；仍失败则抛明确异常

### 重试机制

```
第1次 → 失败 → 等2秒
第2次 → 失败 → 等4秒  
第3次 → 失败 → 抛 RuntimeError
```

适用于暂时的网络波动或 API 限流，不适合永久性错误（如 Key 无效因 OpenAI SDK 本身已抛错，重试不会消耗配额）。

***

## DeepSeekLLM 子类

```python
class DeepSeekLLM(BaseLLM):
    def __init__(self):
        self.model_name = "deepseek-chat"
        super().__init__()

    def _create_client(self) -> OpenAI:
        return OpenAI(
            api_key=config.DEEPSEEK_API_KEY,
            base_url=config.DEEPSEEK_BASE_URL,
        )
```

仅 **6 行代码**。以后新增模型（如 GLM、Qwen）只需要写一个类似的子类、指定 model_name 和 OpenAI 兼容的连接参数。Agent 层代码不用改一行。

***

## 关键技术细节

**为什么用 OpenAI SDK 而不是 langchain-deepseek**：OpenAI SDK 是底层协议——DeepSeek、GLM、Qwen、Kimi 等国内模型全部兼容 OpenAI chat/completions 接口。直接调用避免 langchain 版本冲突，且 JSON mode（`response_format={"type": "json_object"}`）依赖原生 SDK 支持。

**思考标签为什么需要过滤**：DeepSeek R1 模型的 Chat API 会在输出中嵌入 `****▐ response****` 标签（包含内部推理链）。这些 tag 在上层 Agent 做文本匹配或 JSON 解析时会干扰。`_strip_thinking` 用正则清理。

**Token 计数的实际用途**：开发阶段监控每次调用的消耗，避免 Key 余额意外耗尽。后续 Agent 编排时可据此做并发限流（Redis 记录瞬时用量）。

***

## 验证方式

运行 `tests/test_base_llm.py`：

```bash
cd guashuai-project
python tests/test_base_llm.py
```

如果 `.env` 中填了真实 DeepSeek API Key，脚本会执行两次调用并打印结果和 Token 消耗。Key 未填入时脚本安全跳过，不报错。
