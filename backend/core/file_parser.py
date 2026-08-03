# -*- coding: utf-8 -*-
"""文件解析：按扩展名提取文本（PDF/Word/PPT/纯文本）"""


TEXT_EXTS = {"txt", "md", "py", "js", "ts", "json", "csv", "html", "css", "log", "yaml", "yml"}


def parse_file(filename: str, data: bytes) -> str:
    """解析文件内容为纯文本，失败返回空串"""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    try:
        if ext == "pdf":
            import io as _io
            from pypdf import PdfReader
            reader = PdfReader(_io.BytesIO(data))
            parts = []
            for page in reader.pages:
                t = (page.extract_text() or "").strip()
                if t:
                    parts.append(t)
            return "\n\n".join(parts)
        if ext == "docx":
            import io as _io
            from docx import Document
            doc = Document(_io.BytesIO(data))
            parts = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
            for table in doc.tables:
                for row in table.rows:
                    cells = [c.text.strip() for c in row.cells if c.text.strip()]
                    if cells:
                        parts.append(" | ".join(cells))
            return "\n".join(parts)
        if ext == "pptx":
            import io as _io
            from pptx import Presentation
            prs = Presentation(_io.BytesIO(data))
            parts = []
            for i, slide in enumerate(prs.slides):
                slide_parts = []
                for shape in slide.shapes:
                    if shape.has_text_frame:
                        t = shape.text_frame.text.strip()
                        if t:
                            slide_parts.append(t)
                    if shape.has_table:
                        for row in shape.table.rows:
                            cells = [c.text.strip() for c in row.cells if c.text.strip()]
                            if cells:
                                slide_parts.append(" | ".join(cells))
                if slide_parts:
                    parts.append("第" + str(i + 1) + "页: " + " / ".join(slide_parts))
            return "\n".join(parts)
        if ext in TEXT_EXTS:
            return data.decode("utf-8", errors="replace")
        # 未知扩展名尝试按文本解码
        return data.decode("utf-8", errors="replace")
    except Exception:
        return ""
