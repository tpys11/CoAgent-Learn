"""citation_compile 引用标注技能：审核输出标准化为 [来源:xxx#chunk-N] 最简锚点（3.5）"""
from skills import Skill


class CitationCompile(Skill):
    name = "citation_compile"
    description = "对照知识库检索片段，给回答内容补 [来源:xxx#chunk-N] 引用标注"
    input_schema = {
        "content": {"type": "string", "description": "待标注的回答内容"},
        "kb_chunks": {"type": "array", "description": "知识库检索片段 [{content, metadata:{source, chunk}}]"},
        "api_key": {"type": "string", "description": "会话 API Key"},
        "model": {"type": "string", "description": "会话模型名"},
        "base_url": {"type": "string", "description": "会话 Base URL"},
    }
    output_schema = {
        "content": {"type": "string", "description": "标注引用后的回答内容"},
        "citations": {"type": "integer", "description": "标注引用条数"},
    }
    retries = 1

    def execute(self, content="", kb_chunks=None, api_key="", model="", base_url="", **kwargs):
        try:
            kb_chunks = kb_chunks or []
            if not content or not kb_chunks:
                return {"content": content, "citations": 0, "note": "无知识库片段，跳过引用标注"}
            from core.config import config
            from core.base_llm import DeepSeekLLM
            _key = api_key or config.DEEPSEEK_API_KEY
            _base = base_url or config.DEEPSEEK_BASE_URL
            _model = model or "deepseek-chat"
            if not _key:
                return {"content": content, "citations": 0, "note": "未配置 API Key，跳过引用标注"}
            _chunks_txt = "\n".join(
                "[来源:%s#chunk-%s] %s" % (
                    str(c.get("metadata", {}).get("source", "未知"))[:60],
                    str(c.get("metadata", {}).get("chunk", "?")),
                    str(c.get("content", ""))[:400],
                )
                for c in kb_chunks[:8]
            )
            _prompt = (
                "下面是回答内容与知识库片段。请给回答内容中凡是依据知识库片段写出的关键句，"
                "在该句末尾追加引用标注 [来源:xxx#chunk-N]（对照片段里的 [来源:...] 标注，保留原样格式）。"
                "只输出标注后的回答全文，不要解释、不要改动内容本身。\n\n【知识库片段】\n" + _chunks_txt +
                "\n\n【回答内容】\n" + (content or "")[:6000]
            )
            llm = DeepSeekLLM(api_key=_key, model=_model, base_url=_base, thinking=False)
            _out = llm.chat([{"role": "user", "content": _prompt}], temperature=0.2)
            _out = (_out or "").strip()
            if not _out:
                return {"content": content, "citations": 0, "note": "标注结果为空，保留原文"}
            return {"content": _out, "citations": _out.count("[来源:")}
        except Exception as e:
            return {"content": content, "citations": 0, "error": str(e)[:200], "note": "引用标注失败，保留原文"}