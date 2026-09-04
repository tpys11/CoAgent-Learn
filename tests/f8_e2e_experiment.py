# -*- coding: utf-8 -*-
"""F8-S6 端到端验收实验驱动（在 f8tmp-backend 容器内运行，副本库上做全部读写）。

⚠️ 手动 E2E 驱动脚本，非 pytest 收集件（文件名不匹配 test_*）——它依赖真实
HTTP 栈与副本库，严禁在单测环境运行（T49：测试禁连真实库）。

用法（副本库方案，见 docs/dispatch/step-F8.md §三 S6）：
  1. 复制 owner data/app.db 到独立临时目录（副本，真实库零接触）；
  2. compose override 将 backend 卷指向副本目录、容器名/端口隔离（-p f8tmp）；
  3. docker cp 本脚本进 f8tmp-backend 后 `python -X utf8 /tmp/f8_e2e_experiment.py`；
  4. 实验结束 down -v 并删除副本。

实验矩阵（派发单 §三 S6）：
E1 中文文本 PDF：规范化前后对比（chunk 无句中断行/标点前空格）
E2 公式 PDF：chunk 内 LaTeX 保留（渲染由 vitest .katex 断言覆盖）
E4 引擎切换：上传响应可见 parse_engine + 容器日志引擎健康 WARNING
E5 扫描件无 token：结构化报错含 mineru.net 申请指引
快照：kb_vectors 只读行数前后对比（T50 seam，异常波动立即停）

副本库预处理：清 MINERU_API_TOKEN（避免真实云调用/配额消耗）、PARSE_ENGINE 置
pymupdf4llm 基线——owner 真实 settings 的 token/mineru 状态已在探针中记录。
⚠️ settings PUT 必须全字段回填（SettingsSave 部分字段提交会让 pydantic 默认值
覆写 EMBEDDING_MODEL 等配置——首轮实验实证：bge-m3 不接受 dimensions 参数，
覆写后入库 400）。
"""
import json
import sqlite3
import sys
import urllib.request
import uuid

BASE = "http://127.0.0.1:8000"
DB_RW = "/app-data/app.db"
PID = "f8exp"


def _connect_ro():
    import sqlite_vec
    conn = sqlite3.connect("file:/app-data/app.db?mode=ro", uri=True)
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    return conn


def snapshot(label: str):
    conn = _connect_ro()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM kb_vectors")
    n_vec = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM kb_vectors_chunks")
    n_chunks = cur.fetchone()[0]
    conn.close()
    print(f"[SNAPSHOT][{label}] kb_vectors={n_vec} kb_vectors_chunks={n_chunks}")
    return {"kb_vectors": n_vec, "kb_vectors_chunks": n_chunks}


def chunks_of(source: str):
    conn = _connect_ro()
    cur = conn.cursor()
    cur.execute("SELECT chunk, content FROM kb_vectors WHERE project_id=? AND source=? ORDER BY chunk",
                (PID, source))
    rows = cur.fetchall()
    conn.close()
    return rows


def settings_masked():
    conn = _connect_ro()
    cur = conn.cursor()
    cur.execute("SELECT key, value FROM settings")
    out = {}
    for k, v in cur.fetchall():
        out[k] = ("set(len=%d)" % len(v)) if ("KEY" in k or "TOKEN" in k or "APP_ID" in k) else v
    conn.close()
    print("[SETTINGS]", json.dumps(out))
    return out


def prepare_copy_settings():
    """副本库预处理（写副本，非真实库）：清 MinerU token、置 pymupdf4llm 基线，
    并恢复首轮实验被 SettingsSave 默认值误覆写的 embedding 配置（owner 原值见首轮
    [SETTINGS] 快照：EMBEDDING_MODEL=Qwen/Qwen3-VL-Embedding-8B，VECTOR_MODEL=qwen）。
    bge-m3 不接受 dimensions 参数（上游 400，code 20015）——这正是覆写后入库 400 的根因。"""
    conn = sqlite3.connect(DB_RW)
    cur = conn.cursor()
    cur.execute("DELETE FROM settings WHERE key='MINERU_API_TOKEN'")
    for k, v in (("PARSE_ENGINE", "pymupdf4llm"),
                 ("EMBEDDING_MODEL", "Qwen/Qwen3-VL-Embedding-8B"),
                 ("VECTOR_MODEL", "qwen"),
                 ("EMBEDDING_BASE_URL", "https://api.siliconflow.cn/v1"),
                 ("EMBEDDING_DIM", "1024")):
        cur.execute("INSERT INTO settings(key, value, updated_at) VALUES (?,?,datetime('now')) "
                    "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')",
                    (k, v))
    conn.commit()
    conn.close()
    print("[PREPARE] copy settings: token cleared, engine=pymupdf4llm, embedding config restored")


def http(method: str, path: str, body: dict | None = None, file_bytes: bytes | None = None,
         fields: dict | None = None, filename: str = "exp.pdf"):
    url = BASE + path
    if file_bytes is not None:
        boundary = uuid.uuid4().hex
        payload = b""
        for k, v in (fields or {}).items():
            payload += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n").encode()
        payload += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; "
                    f"filename=\"{filename}\"\r\nContent-Type: application/pdf\r\n\r\n").encode() + \
                   file_bytes + f"\r\n--{boundary}--\r\n".encode()
        req = urllib.request.Request(url, data=payload, method=method)
        req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    elif body is not None:
        req = urllib.request.Request(url, data=json.dumps(body).encode(), method=method)
        req.add_header("Content-Type", "application/json")
    else:
        req = urllib.request.Request(url, method=method)
    with urllib.request.urlopen(req, timeout=600) as resp:
        return json.loads(resp.read().decode("utf-8"))


def make_pdf(path: str, lines: list, draw_rect: bool = False):
    """生成实验 PDF：fontname=china-s（内置简体中文字形——默认 Helvetica 无 CJK，
    会产出替换点污染文字层，首轮教训）；空字符串行 = 段落间隔；
    自动分页（单页 ~33 行，超页行会落到 MediaBox 外被丢弃——次轮教训）。"""
    import fitz
    doc = fitz.open()
    page = doc.new_page()
    y = 72
    for ln in lines:
        if y > 740:
            page = doc.new_page()
            y = 72
        if ln:
            page.insert_text((72, y), ln, fontsize=12, fontname="china-s")
        y += 20
    if draw_rect:  # 模拟扫描件的图像区域（页面无文字层语义）
        page.draw_rect(fitz.Rect(72, y, 500, 700), color=(0, 0, 0.8), width=2)
    doc.save(path)
    doc.close()
    with open(path, "rb") as f:
        return f.read()


def main():
    print("=== F8-S6 实验开始 ===")
    prepare_copy_settings()
    settings_masked()
    base_snap = snapshot("baseline")

    # 建实验项目（幂等：已存在忽略）
    try:
        r = http("POST", "/api/projects", {"name": "F8 验收实验", "description": "S6 临时实验"})
        print("[PROJECT]", json.dumps(r, ensure_ascii=False)[:150])
    except Exception as e:
        print("[PROJECT] create skipped:", str(e)[:100])

    # ── E1：中文硬换行 + 标点空格噪声 PDF（节间空行成段，确保 ≥10 chunks 供抽查）──
    e1_lines = []
    p = 0
    total = 0
    while total < 6500:  # 512 字块 + overlap → 约 12+ chunks
        p += 1
        sec = [
            f"第{p}节 讨论知识库上传链路的质量增强实践与工程考量",
            f"本节阐述第{p}类噪声的成因与治理路径 。提取文本",
            f"在硬换行处断句，导致检索命中时上下文支离破碎，评审难以",
            f"还原原始语序；标点前空格 ，同样破坏阅读体验与分块质量。",
            f"规范化闸门把这些噪声在入库前统一清洗，宁漏勿错的保守",
            f"规则设计确保正常 markdown 结构不被误伤。结论如下。",
            f"以上即第{p}节的完整内容。后续小节继续展开实现细节，",
            f"包括围栏保护、表格旁路与幂等性的守卫测试设计。",
            "",  # 段落间隔（分块边界）
        ]
        e1_lines += sec
        total += sum(len(ln) for ln in sec)
    e1_bytes = make_pdf("/tmp/e1.pdf", e1_lines)
    r1 = http("POST", "/api/knowledge/upload-file?wait=true", file_bytes=e1_bytes,
              fields={'project_id': PID, 'session_id': 'f8s6', 'api_key': '', 'wait': '1'},
              filename="e1.pdf")
    print("[E1][upload]", json.dumps(r1, ensure_ascii=False))
    e1_rows = chunks_of("e1.pdf")
    print(f"[E1][chunks] n={len(e1_rows)} engine={r1.get('parse_engine')}")
    bad_break, bad_space = [], []
    for idx, (cno, c) in enumerate(e1_rows):
        lines = c.split("\n")
        for i in range(len(lines) - 1):
            ln, nxt = lines[i], lines[i + 1]
            if ln.strip() and nxt.strip() \
               and not ln.rstrip().endswith(tuple("。！？；：.!?;:")) \
               and not ln.lstrip().startswith(("#", "-", ">", "|")) \
               and not nxt.lstrip().startswith(("#", "-", ">", "|", "```")):
                bad_break.append((cno, ln[-14:], nxt[:14]))
        if " ，" in c or " 。" in c:
            bad_space.append(cno)
    print(f"[E1][噪声检查] 句中断行残留={len(bad_break)} 标点前空格残留={len(bad_space)}")
    for b in bad_break[:5]:
        print("  break-residue:", b)
    for cno, c in e1_rows[:10]:
        print(f"[E1][chunk#{cno}]", c[:120].replace("\n", "⏎"))

    # ── E2：公式 PDF（LaTeX 保留）──
    e2_bytes = make_pdf("/tmp/e2.pdf", [
        "质能方程是相对论的核心结论：",
        "$E=mc^2$ 描述了质量与能量的等价关系。",
        "积分公式 \\int_0^1 x dx = 1/2 亦为常见示例。",
    ])
    r2 = http("POST", "/api/knowledge/upload-file?wait=true", file_bytes=e2_bytes, fields={'project_id': PID, 'session_id': 'f8s6', 'api_key': '', 'wait': '1'}, filename="e2.pdf")
    print("[E2][upload]", json.dumps(r2, ensure_ascii=False))
    e2_rows = chunks_of("e2.pdf")
    hit = [c for _, c in e2_rows if "E=mc^2" in c]
    print(f"[E2][chunks] n={len(e2_rows)} 含LaTeX chunk 数={len(hit)}")
    for cno, c in e2_rows[:10]:
        print(f"[E2][chunk#{cno}]", c[:120].replace("\n", "⏎"))

    # ── E4：引擎切换 → 上传响应可见 engine ──
    cur = http("GET", "/api/settings")
    print("[E4][before] parse.engine =", cur["parse"]["engine"])
    # 全字段 PUT（SettingsSave 所有字段显式回填）——部分字段 PUT 会让 pydantic 默认值
    # 覆写 owner 配置（首轮实验教训：EMBEDDING_MODEL 被默认值 bge-m3 覆写 → dimensions 400）
    save = {
        "vector_model": cur["vector_model"],
        "embedding_base_url": cur["embedding"]["base_url"],
        "embedding_api_key": "",           # 空 = 保持已存 key 不变（后端契约）
        "embedding_model": cur["embedding"]["model"],
        "embedding_dim": cur["embedding"]["dim"],
        "rerank_backend": cur["rerank"]["backend"],
        "rerank_base_url": cur["rerank"]["base_url"],
        "rerank_api_key": "",
        "rerank_model": cur["rerank"]["model"],
        "vl_api_key": "",
        "kb_mode": cur["kb_mode"],
        "review_enabled": cur["review"]["enabled"],
        "review_model": cur["review"]["model"],
        "parse_engine": "mineru",
        "mineru_api_token": "",
        "mathpix_app_id": "",
        "mathpix_app_key": "",
        "chunk_mode": cur["chunking"]["mode"],
        "chunk_size": cur["chunking"]["chunk_size"],
        "chunk_overlap": cur["chunking"]["chunk_overlap"],
        "rrf_k": cur["chunking"]["rrf_k"],
        "fetch_mult": cur["chunking"]["fetch_mult"],
    }
    r = http("PUT", "/api/settings", save)
    print("[E4][switch->mineru]", json.dumps(r, ensure_ascii=False))
    e4_bytes = make_pdf("/tmp/e4.pdf", [
        "引擎切换可见性验证段落，",
        "这一段用于 E4 实验。当前无 token 应降级 pymupdf4llm。",
    ])
    r4 = http("POST", "/api/knowledge/upload-file?wait=true", file_bytes=e4_bytes, fields={'project_id': PID, 'session_id': 'f8s6', 'api_key': '', 'wait': '1'}, filename="e4.pdf")
    print("[E4][upload(engine=mineru,无token)]", json.dumps(r4, ensure_ascii=False))
    save["parse_engine"] = "pymupdf4llm"
    r = http("PUT", "/api/settings", save)
    print("[E4][restore->pymupdf4llm]", json.dumps(r, ensure_ascii=False))

    # ── E5：扫描件（无文字层）无 token → 结构化报错 ──
    e5_bytes = make_pdf("/tmp/e5.pdf", [" "], draw_rect=True)
    r5 = http("POST", "/api/knowledge/upload-file?wait=true", file_bytes=e5_bytes, fields={'project_id': PID, 'session_id': 'f8s6', 'api_key': '', 'wait': '1'}, filename="e5.pdf")
    print("[E5][upload(scan,no-token)]", json.dumps(r5, ensure_ascii=False))

    after_snap = snapshot("after")
    delta = {t: after_snap[t] - base_snap.get(t, 0) for t in after_snap}
    print("[SNAPSHOT][delta]", json.dumps(delta))
    dropped = [t for t, d in delta.items() if d < 0]
    print("[SNAPSHOT][verdict]", "ANOMALY-DROP: " + ",".join(dropped) if dropped else "monotonic-ok")
    print("=== F8-S6 实验结束 ===")


if __name__ == "__main__":
    sys.exit(main())
