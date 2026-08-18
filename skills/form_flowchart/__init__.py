"""form_flowchart 输出形式技能：将讲解内容组织成 mermaid 流程图（用户要求流程图/flowchart/mermaid 时由 form_router 路由）"""
import re
from skills import Skill


class FormFlowchart(Skill):
    name = "form_flowchart"
    description = "将内容组织成 mermaid 流程图（用户要求流程图/flowchart/mermaid 时路由）"
    input_schema = {
        "topic": {"type": "string", "description": "主题/问题"},
        "context": {"type": "string", "description": "讲解上下文"},
        "api_key": {"type": "string", "description": "会话 API Key"},
        "model": {"type": "string", "description": "会话模型名"},
        "base_url": {"type": "string", "description": "会话 Base URL"},
    }
    output_schema = {
        "mermaid": {"type": "string", "description": "mermaid 流程图代码（graph TD）"},
        "note": {"type": "string", "description": "产物说明"},
    }
    retries = 1

    def execute(self, topic="", context="", api_key="", model="", base_url="", **kwargs):
        try:
            from core.config import config
            from core.base_llm import DeepSeekLLM
            _key = api_key or config.DEEPSEEK_API_KEY
            _base = base_url or config.DEEPSEEK_BASE_URL
            _model = model or "deepseek-chat"
            if not _key:
                return {"error": "未配置 API Key"}
            llm = DeepSeekLLM(api_key=_key, model=_model, base_url=_base, thinking=False)
            _prompt = (
                "根据以下讲解内容，生成一个 mermaid 流程图（graph TD 语法），用中文节点标签，"
                "只输出 mermaid 代码本身，不要任何解释。\n主题：" + (topic or "")[:300] +
                "\n内容：" + (context or "")[:6000]
            )
            _out = llm.chat([{"role": "user", "content": _prompt}], temperature=0.4)
            _out = re.sub(r"^```mermaid\s*|^```\s*|```$", "", (_out or "").strip()).strip()
            if not _out:
                return {"error": "生成结果为空"}
            return {"mermaid": _out, "note": "已按流程图形式组织输出"}
        except Exception as e:
            return {"error": str(e)[:200]}
