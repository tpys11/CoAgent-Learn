# -*- coding: utf-8 -*-
"""EVAL-1 Wave 2 栈准备与探针（eval_ 前缀，防 pytest 收集；一次性工具件）。

职责（全部只读真实库 / 只写副本库 settings）：
1. 副本库 settings 护栏：PARSE_ENGINE → pymupdf4llm（禁 MinerU 云，owner 指令 2026-08-31）
2. 副本库 settings 键清单（只打印键名，绝不打印值——凭据零残留纪律）
3. PDF 文本量探针（决定灌库批次策略）

用法：python tests/eval/eval_stackprep.py --replica-db <path>
"""
import argparse
import os
import sqlite3
import sys

KB_CANDIDATE_DIR = r"D:\desktop\挂帅\0、学习方式、对象\文件（上传到系统）"


def _utf8():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
    except Exception:
        pass


def probe_kb_candidates() -> None:
    """扫候选目录树：列全部文件（大小）；对 AI/Agent 相关 PDF 探文本量。"""
    for root, _dirs, files in os.walk(KB_CANDIDATE_DIR):
        for fn in files:
            p = os.path.join(root, fn)
            size_kb = os.path.getsize(p) // 1024
            print(f"[cand] {size_kb}KB  {p}")
            if fn.lower().endswith(".pdf") and ("ai" in fn.lower() or "agent" in fn.lower()):
                try:
                    import fitz
                    d = fitz.open(p)
                    text = "".join(page.get_text() for page in d)
                    print(f"[probe] pages={len(d)} chars={len(text)} "
                          f"est_chunks(512)={len(text) // 512}  <- {fn}")
                except Exception as e:  # noqa: BLE001
                    print(f"[probe] FAIL {fn}: {e}")


def guardrail(replica_db: str) -> None:
    con = sqlite3.connect(replica_db)
    con.execute("UPDATE settings SET value='pymupdf4llm' WHERE key='PARSE_ENGINE'")
    con.commit()
    keys = [r[0] for r in con.execute("SELECT key FROM settings ORDER BY key")]
    print("[guardrail] PARSE_ENGINE -> pymupdf4llm, rows_changed:", con.total_changes)
    print("[guardrail] settings keys (names only):", keys)
    for must in ("EMBEDDING_API_KEY",):
        print(f"[guardrail] has {must}:", must in keys)
    con.close()


def probe_pdf() -> None:
    # P0-S2：PDF_CANDIDATE 原为未定义名（调用即 NameError）；改为环境变量供给，
    # 不把 owner 本机绝对路径写死进仓库（评委自备 PDF 时设 EVAL_PDF_CANDIDATE 即可）。
    candidate = os.environ.get("EVAL_PDF_CANDIDATE", "")
    if not candidate:
        raise SystemExit("[probe-pdf] 未设置 EVAL_PDF_CANDIDATE（评委自备 PDF 的绝对路径）")
    import fitz
    d = fitz.open(candidate)
    text = "".join(page.get_text() for page in d)
    print(f"[probe] pdf pages={len(d)} chars={len(text)} est_chunks(512)={len(text) // 512}")


def main():
    _utf8()
    ap = argparse.ArgumentParser()
    ap.add_argument("--replica-db", required=True)
    ap.add_argument("--no-probe", action="store_true")
    args = ap.parse_args()
    guardrail(args.replica_db)
    if not args.no_probe:
        probe_kb_candidates()


if __name__ == "__main__":
    main()
