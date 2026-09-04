"""pdf_parse：解析 PDF 文件并提取文本"""
from skills import Skill


class PdfParse(Skill):
    name = "pdf_parse"
    description = "解析 PDF 文件并提取文本内容（按页）"
    input_schema = {"file_path": {"type": "string", "description": "PDF 文件路径"}, "max_chars": {"type": "integer", "description": "最大返回字符数"}}

    def execute(self, file_path="", max_chars=3000, **kwargs):
        if not file_path:
            return {"results": [], "error": "缺少 file_path 参数"}
        try:
            from pypdf import PdfReader
            reader = PdfReader(file_path)
            text = "\n".join((page.extract_text() or "") for page in reader.pages)
            return {"results": [{"content": text[:max_chars]}], "total": len(reader.pages)}
        except Exception as e:
            return {"results": [], "error": str(e)[:200]}
