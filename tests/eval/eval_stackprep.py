# -*- coding: utf-8 -*-
"""EVAL-1 Wave 2 栈准备与探针（eval_ 前缀，防 pytest 收集；一次性工具件）。

职责（全部只读真实库 / 只写副本库 settings）：
1. 副本库 settings 护栏：PARSE_ENGINE → pymupdf4llm（禁 MinerU 云，owner 指令 2026-08-31）
2. 副本库 settings 键清单（只打印键名，绝不打印值——凭据零残留纪律）
3. 语料文本量探针（决策 39：扫 eval_kb_manifest.json 仓库内语料，决定灌库批次策略）

用法：python tests/eval/eval_stackprep.py --replica-db <path>
"""
import argparse
import json
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))
MANIFEST_PATH = os.path.join(HERE, "eval_kb_manifest.json")


def _utf8():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
    except Exception:
        pass


def _resolve_manifest_path(item):
    """同 eval_runner._resolve_kb_path 语义：external 条目经 EVAL_KB_EXTERNAL_DIR
    解析（评委自备件）；仓库内条目相对仓库根。决策 39 后 manifest 全仓库内条目。"""
    if not item.get("external"):
        return os.path.join(REPO_ROOT, item["path"])
    base = os.environ.get("EVAL_KB_EXTERNAL_DIR", "")
    if not base:
        return None  # 自备件未指根目录：探针跳过该条（不报错，灌库由 runner 守卫）
    return os.path.join(base, item["path"])


def probe_kb_candidates() -> None:
    """扫 manifest 语料逐条探文本量（大小 + PDF 页数/字符数估算 chunk 量），
    供灌库批次策略参考。旧 KB_CANDIDATE_DIR 本机绝对路径随决策 39 语料切换移除
    （任务书瑕疵①：死路径不再入仓库）。"""
    try:
        with open(MANIFEST_PATH, encoding="utf-8") as fh:
            items = json.load(fh)
    except Exception as e:  # noqa: BLE001 —— 探针失败不阻断护栏主职责
        print(f"[probe] manifest 读取失败（跳过探针）: {e}")
        return
    for it in items:
        src = it.get("source", it.get("path", "?"))
        resolved = _resolve_manifest_path(it)
        if not resolved or not os.path.exists(resolved):
            print(f"[cand] SKIP（不存在/自备件未指根） {src}")
            continue
        size_kb = os.path.getsize(resolved) // 1024
        if it.get("kind") == "file" and resolved.lower().endswith(".pdf"):
            try:
                import fitz
                d = fitz.open(resolved)
                text = "".join(page.get_text() for page in d)
                print(f"[cand] {size_kb}KB pages={len(d)} chars={len(text)} "
                      f"est_chunks(512)={len(text) // 512}  <- {src}")
            except Exception as e:  # noqa: BLE001 —— fitz 缺库/损坏文件只降级
                print(f"[cand] {size_kb}KB (PDF 探针跳过: {e})  <- {src}")
        else:
            try:
                chars = len(open(resolved, encoding="utf-8-sig").read())
                print(f"[cand] {size_kb}KB chars={chars} "
                      f"est_chunks(512)={chars // 512}  <- {src}")
            except Exception as e:  # noqa: BLE001
                print(f"[cand] {size_kb}KB (读取失败: {e})  <- {src}")


def guardrail(replica_db: str, tier: str = "go") -> None:
    con = sqlite3.connect(replica_db)
    # 空库起步时 PARSE_ENGINE 行不存在——UPDATE-only 会静默无效（本会话实证），
    # 一律 upsert。前端 saveGoKey 未接线（handoff §七），GO_API_KEY 行不由本脚本写。
    con.execute("INSERT INTO settings(key,value) VALUES('PARSE_ENGINE','pymupdf4llm') "
                "ON CONFLICT(key) DO UPDATE SET value='pymupdf4llm'")
    # go 档决策（owner 09-04）：副本库落档位开关（非密钥，可程序写）。
    # standard = 清空开关回标准档；go = ZEN_TEST_MODE=1 + TEST_CHANNEL=go。
    if tier == "go":
        con.execute("INSERT INTO settings(key,value) VALUES('ZEN_TEST_MODE','1') "
                    "ON CONFLICT(key) DO UPDATE SET value='1'")
        con.execute("INSERT INTO settings(key,value) VALUES('TEST_CHANNEL','go') "
                    "ON CONFLICT(key) DO UPDATE SET value='go'")
    else:
        con.execute("DELETE FROM settings WHERE key IN ('ZEN_TEST_MODE','TEST_CHANNEL')")
    con.commit()
    keys = [r[0] for r in con.execute("SELECT key FROM settings ORDER BY key")]
    print(f"[guardrail] PARSE_ENGINE -> pymupdf4llm, tier -> {tier}, "
          "rows_changed:", con.total_changes)
    print("[guardrail] settings keys (names only):", keys)
    for must in ("EMBEDDING_API_KEY", "GO_API_KEY"):
        print(f"[guardrail] has {must}:", must in keys)
    if tier == "go" and "GO_API_KEY" not in keys:
        print("[guardrail] ⚠ GO_API_KEY 缺失：go 档对话/判卷将失败——"
              "请 owner 经副本栈前端(5174)设置页或 .env 注入（键值不过 agent）")
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
    ap.add_argument("--tier", choices=["go", "standard"], default="go",
                    help="副本库档位开关（默认 go，owner 09-04 拍板；"
                         "GO_API_KEY 密钥本体仍须 owner 本人注入）")
    args = ap.parse_args()
    guardrail(args.replica_db, args.tier)
    if not args.no_probe:
        probe_kb_candidates()


if __name__ == "__main__":
    main()
