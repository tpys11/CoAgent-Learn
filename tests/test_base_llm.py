"""BaseLLM 独立验证脚本 — 测试 chat 和 chat_with_json"""
import sys
sys.path.insert(0, ".")

from backend.core.config import config

print(f"API Key 已配置: {'是' if config.DEEPSEEK_API_KEY and 'sk-your-key' not in config.DEEPSEEK_API_KEY else '否（请在 .env 中填入真实 Key）'}")
print(f"Base URL: {config.DEEPSEEK_BASE_URL}")
print()

if "sk-your-key" in config.DEEPSEEK_API_KEY or not config.DEEPSEEK_API_KEY:
    print("跳过 API 调用测试（Key 未填入）。填入后再次运行本脚本。")
    sys.exit(0)

from backend.core.base_llm import DeepSeekLLM

llm = DeepSeekLLM()

# 测试1: 普通对话
print("=== 测试1: chat ===")
result = llm.chat([
    {"role": "user", "content": "用一句话解释什么是多智能体系统（不超过20字）"}
])
print(f"回复: {result}")
print(f"累计Token: {llm.total_tokens}")
print()

# 测试2: JSON结构化输出
print("=== 测试2: chat_with_json ===")
schema = {
    "type": "object",
    "properties": {
        "概念": {"type": "string", "description": "概念名称"},
        "定义": {"type": "string", "description": "一句话定义"},
        "应用场景": {"type": "string", "description": "一个典型应用场景"},
    },
    "required": ["概念", "定义", "应用场景"],
}
result = llm.chat_with_json([
    {"role": "user", "content": "请解释：LangGraph 是什么？"}
], schema)
for k, v in result.items():
    print(f"  {k}: {v}")
print(f"累计Token: {llm.total_tokens}")
print()

print("全部测试通过！")
