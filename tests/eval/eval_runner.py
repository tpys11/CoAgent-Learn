# -*- coding: utf-8 -*-
"""EVAL-1 Wave 2 批量跑数驱动器（eval_ 前缀防 pytest 收集；手动驱动件，勿改名）。

职责：按 eval_cases.json 驱动用例（建项目→灌KB→逐例新建对话→等画像→chat SSE→收
trace→落证据与 results）。纯 HTTP 驱动，零产品代码；凭据只用空串走 .env 兜底。

用法（宿主 .venv）：
  python tests/eval/eval_runner.py --base http://127.0.0.1:18000 \
      --batch P1 --outdir docs/submission/evidence --kb tests/eval/eval_kb_manifest.json
批次：P1 / P2 / P3 / IF / smoke
"""
import argparse
import json
import os
import sys
import time

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
CASES_PATH = os.path.join(HERE, "eval_cases.json")


# ---------- HTTP 基础 ----------

def _post_json(base, path, payload, timeout=30):
    r = requests.post(base + path, json=payload, timeout=timeout)
    r.raise_for_status()
    return r.json()


def _get_json(base, path, timeout=30):
    r = requests.get(base + path, timeout=timeout)
    r.raise_for_status()
    return r.json()


def chat_stream(base, payload, on_frame=None, read_timeout=600):
    """POST /api/chat，逐帧解析 SSE；返回聚合结果。"""
    out = {"request_id": None, "reply": "", "review": None, "mindchain": [],
           "resets": [], "error": None, "steps": []}
    r = requests.post(base + "/api/chat", json=payload,
                      stream=True, timeout=(10, read_timeout))
    r.raise_for_status()
    buf = ""
    for chunk in r.iter_content(chunk_size=1024, decode_unicode=True):
        if not chunk:
            continue
        buf += chunk
        while "\n\n" in buf:
            frame, buf = buf.split("\n\n", 1)
            for line in frame.split("\n"):
                if not line.startswith("data: "):
                    continue
                try:
                    ev = json.loads(line[6:])
                except json.JSONDecodeError:
                    continue
                if on_frame:
                    on_frame(ev)
                t = ev.get("type")
                if t == "start":
                    out["request_id"] = ev.get("request_id")
                elif t == "answer_reset":
                    out["resets"].append({"attempt": ev.get("attempt"),
                                          "reason": ev.get("reason")})
                elif t == "step":
                    out["steps"].append(ev.get("agent"))
                elif t == "done":
                    out["reply"] = ev.get("reply") or ""
                    out["review"] = ev.get("review")
                    out["mindchain"] = ev.get("mindchain") or []
                elif t == "error":
                    out["error"] = ev.get("message")
    return out


def wait_profile_ready(base, did, timeout=180):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            st = _get_json(base, f"/api/dialogues/{did}/profile_status").get("status")
        except Exception:
            st = None
        if st == "ready":
            return True
        time.sleep(2)
    return False


# ---------- 项目 / 对话 / 画像 ----------

def ensure_project(base, persona, run_stamp):
    name = f"eval-{persona}-{run_stamp}"
    pid = _post_json(base, "/api/projects",
                     {"name": name, "simple": False, "domain": "人工智能"})["id"]
    return pid


def new_dialogue(base, pid, case_id, wizard):
    did = "edlg-" + case_id.lower()
    _post_json(base, "/api/dialogues",
               {"project_id": pid, "name": f"对话-{case_id}", "id": did, "api_key": ""})
    ready = wait_profile_ready(base, did)
    # 向导画像覆写（真实用户路径：向导保存 → 对话 profile 缓存）
    _post_json(base, f"/api/dialogues/{did}/profile", {"profile": wizard})
    return did, ready


# ---------- KB 灌库 ----------

def _resolve_kb_path(item):
    """P0-S2：manifest 中 external=true 的条目为评委自备件——路径是「自备根目录」的
    相对形式，经 EVAL_KB_EXTERNAL_DIR 解析；仓库内条目（data/preset_library、data/documents/*）
    原样返回。决策 39（09-04）起 manifest 已全仓库内条目，external 机制保留为零依赖兜底。
    不设环境变量时对自备件显式报错，绝不回落到任何写死的本机绝对路径。"""
    if not item.get("external"):
        return item["path"]
    base = os.environ.get("EVAL_KB_EXTERNAL_DIR", "")
    if not base:
        raise SystemExit(
            f"[kb] 自备件 {item['source']} 无法定位：请设置 EVAL_KB_EXTERNAL_DIR "
            f"为其所在根目录（该条标注评委自备，仓库不含其本体）")
    return os.path.join(base, item["path"])


def ingest_kb(base, pid, kb_items, log):
    """kb_items: [{kind: file|text, path, source, external?}]；重复入库由后端 hash 去重。
    EVALOPT 09-04：文本改「后台直投 + 统一轮询」——同步 wait=true 会被大纲提取的
    LLM 重试等待拖爆 runner 超时（本会话 smoke 实证：DeepSeek 端点容器内 SSL 中断，
    每调用 3 次重试×20-40s）；后台路径服务器并行处理，墙钟≈最慢一份。
    加料步骤（大纲/出题/图谱）失败即跳过（设计如此），不影响三硬指标。"""
    results = []
    pending_texts = []
    for it in kb_items:
        src = it["source"]
        resolved = _resolve_kb_path(it)
        if it["kind"] == "text":
            with open(resolved, encoding="utf-8-sig") as fh:
                text = fh.read()
            try:
                resp = _post_json(base, "/api/knowledge/upload",
                                  {"project_id": pid, "text": text, "source": src,
                                   "session_id": "default", "api_key": ""}, timeout=60)
            except Exception as e:  # noqa: BLE001 —— 投递失败如实记录
                resp = {"status": "error", "msg": str(e)[:150]}
            results.append({"source": src, **resp})
            if resp.get("status") == "processing":
                pending_texts.append(src)
            log(f"  [kb-text] {src}: {resp.get('status')} {(resp.get('msg') or '')[:80]}")
        else:
            with open(resolved, "rb") as fh:
                files = {"file": (os.path.basename(resolved), fh,
                                  "application/pdf")}
                r = requests.post(base + "/api/knowledge/upload-file",
                                  data={"project_id": pid, "session_id": "default",
                                        "api_key": "", "wait": "false"},
                                  files=files, timeout=300)
            resp = r.json()
            if resp.get("status") == "processing":
                resp = _poll_progress(base, pid, src, log)
            results.append({"source": src, **resp})
            log(f"  [kb-file] {src}: {resp.get('status')} chunks={resp.get('chunks') or resp.get('done')}")
    for src in pending_texts:
        resp = _poll_progress(base, pid, src, log)
        for r in results:
            if r.get("source") == src:
                r.update(resp)
        log(f"  [kb-text-poll] {src}: {resp.get('status')} "
            f"chunks={resp.get('chunks') or resp.get('done')} {(resp.get('msg') or '')[:80]}")
    return results


def _poll_progress(base, pid, source, log, timeout=900):
    t0 = time.time()
    last = None
    while time.time() - t0 < timeout:
        try:
            p = _get_json(base, f"/api/knowledge/upload-progress",
                          timeout=15) if False else _get_json(
                base, f"/api/knowledge/upload-progress?project_id={pid}&source={source}",
                timeout=15)
        except Exception as e:
            p = {"poll_error": str(e)[:120]}
        done = p.get("done")
        total = p.get("total")
        if done is not None and total and done >= total:
            return {"status": "ok", "chunks": total, "progress": p,
                    "parse_engine": p.get("parse_engine")}
        if p.get("status") == "error" or p.get("error"):
            return {"status": "error", "progress": p}
        # FIXEVAL 库内事实兜底（双信号收口）：进度态是 backend 进程内存字典——后台直投
        # 路径不写进度、进程重启即丢、enhance 阶段把 done 重置后 LLM 异常被吞不阻断，
        # 三种形态都让上面的快路径永假、轮询耗满 timeout 假性卡死；而后台日志"入库完成"。
        # 故以库内可见事实（list 中该 source chunks>0）为终态判定兜底；进度快路径与
        # error 路径原样保留，正常形态行为零变更。
        try:
            docs = _get_json(base, f"/api/knowledge/list?project_id={pid}",
                              timeout=15).get("docs") or []
        except Exception as e:  # noqa: BLE001 —— list 探测失败等同暂无库内事实，续走原轮询节奏
            log(f"    [progress] {source}: doc-list probe failed {str(e)[:80]}")
            docs = []
        for d in docs:
            if (d.get("source") or d.get("name")) == source and (d.get("chunks") or 0) > 0:
                log(f"    [progress] {source}: rescued-by-doc-list chunks={d.get('chunks')}")
                return {"status": "ok", "chunks": d.get("chunks"), "via": "doc-list"}
        cur = f"{done}/{total}"
        if cur != last:
            log(f"    [progress] {source}: {cur}")
            last = cur
        time.sleep(3)
    return {"status": "timeout", "progress": last}


# ---------- KB 检索冒烟自检（覆盖率/ContextRecall 的前置闸门） ----------

def kb_retrieval_check(base, pid, kb_items, log, top_k=3):
    """灌库后逐文档探针 GET /api/knowledge/query：
    通过条件=全部探针返回非空 且 ≥半数探针命中其目标文档（metadata.source 匹配）。
    不通过即 SystemExit 卡闸门——防"知识库没生效通识作答"重演（覆盖率 38% 教训）。
    --skip-check 可跳过。返回 (探针明细, passed)。"""
    probes = [{"q": os.path.splitext(it["source"])[0][:40], "source": it["source"]}
              for it in kb_items]
    detail, src_matched = [], 0
    for p in probes:
        try:
            r = _get_json(base, f"/api/knowledge/query?project_id={pid}"
                                f"&q={requests.utils.quote(p['q'])}&top_k={top_k}",
                          timeout=60)
        except Exception as e:  # noqa: BLE001 —— 探针失败等同零命中，如实入明细
            r = {"results": [], "error": str(e)[:120]}
        hits = r.get("results") or []
        hit_srcs = [str(((h or {}).get("metadata") or {}).get("source")
                        or (h or {}).get("source") or "") for h in hits]
        matched = any(p["source"] in s or s in p["source"]
                      for s in hit_srcs if s)
        src_matched += 1 if matched else 0
        detail.append({"probe": p["q"], "hits": len(hits),
                       "target_matched": matched, "hit_sources": hit_srcs[:3]})
        log(f"  [kb-check] {p['q'][:24]}: hits={len(hits)} target_matched={matched}")
    non_empty = bool(detail) and all(d["hits"] > 0 for d in detail)
    passed = non_empty and src_matched >= max(1, len(detail) // 2)
    log(f"[kb-check] {'PASS' if passed else 'FAIL'} "
        f"(探针 {len(detail)}，非空 {sum(1 for d in detail if d['hits'])}，命中目标 {src_matched})")
    return detail, passed


# ---------- 用例执行 ----------

def _load_go_api_key(replica_db):
    """GO_API_KEY 解析链（内存传递零打印零落盘；凭据唯一来源=owner）：
    ① 副本库 settings（owner 经 UI 注入的规范路径——但前端 saveGoKey 未接线，
    该行通常为空）② 仓库根 .env 的 GO_API_KEY（owner 手工添加，本会话拍板路径）。"""
    import sqlite3
    try:
        con = sqlite3.connect(f"file:{replica_db}?mode=ro", uri=True)
        try:
            row = con.execute(
                "SELECT value FROM settings WHERE key='GO_API_KEY'").fetchone()
        finally:
            con.close()
        if row and row[0]:
            return row[0]
    except sqlite3.OperationalError:
        pass
    env_path = os.path.join(os.path.dirname(os.path.dirname(
        os.path.dirname(os.path.abspath(__file__)))), ".env")
    try:
        with open(env_path, encoding="utf-8-sig") as fh:
            for line in fh:
                s = line.strip()
                if s.startswith("GO_API_KEY="):
                    val = s.split("=", 1)[1].strip().strip('"').strip("'")
                    if val:
                        return val
    except OSError:
        pass
    return ""


def build_tier_extras(args):
    """按档位构造 chat payload 附加段：go=模型/端点/key 三件套（对齐真实前端
    请求形态）；standard=空（api_key 留空走后端 .env DEEPSEEK 兜底）。"""
    if args.tier != "go":
        return {}
    key = _load_go_api_key(args.replica_db)
    if not key:
        raise SystemExit(
            "[tier=go] GO_API_KEY 未找到（副本库 settings 与仓库 .env 均无）："
            "请 owner 在仓库根 .env 加一行 GO_API_KEY=<你的go密钥>，"
            "然后重启评测后端容器（docker restart guashuai-eval-backend）；"
            "或 --tier standard 回标准档")
    return {"model": args.chat_model, "base_url": args.chat_base_url,
            "api_key": key}


def run_chat_case(base, case, persona, pid, kb_sources, outdir, log, extras=None):
    cid = case["id"]
    did, ready = new_dialogue(base, pid, cid, persona["wizard"])
    log(f"  [{cid}] dialogue={did} profile_ready={ready}")
    payload = {"message": case["q"], "dialogue_id": did, "project_id": pid,
               "api_key": "", "settings": {"template": "研究"},
               "client_msg_id": "eval-" + cid}
    payload.update(extras or {})
    t0 = time.time()
    stream = chat_stream(base, payload)
    elapsed = round(time.time() - t0, 1)
    traces = (_get_json(base, f"/api/eval/traces/{stream['request_id']}")
              if stream["request_id"] else {"traces": []})
    entry = {
        "case_id": cid, "persona": case["persona"], "question": case["q"],
        "expect_kps": case.get("kps") or [],
        "answer": stream["reply"], "request_id": stream["request_id"],
        "dialogue_id": did, "project_id": pid, "elapsed_s": elapsed,
        "resets": stream["resets"], "steps": stream["steps"],
        "review": stream["review"], "mindchain": stream["mindchain"],
        "error": stream["error"], "profile_ready": ready,
        "level_score": None, "t_value": None, "strategy_id": None,
        "strategy_name": None, "kb_sources": kb_sources,
    }
    for tr in traces.get("traces", []):
        if tr.get("stage") == "assess":
            try:
                entry["level_score"] = json.loads(tr.get("output_digest") or "{}").get("level_score")
            except json.JSONDecodeError:
                pass
        elif tr.get("stage") == "generate":
            try:
                m = json.loads(tr.get("metrics_json") or "{}")
                entry["t_value"] = m.get("t_value")
                entry["strategy_id"] = m.get("strategy_id")
                entry["strategy_name"] = m.get("strategy_name")
            except json.JSONDecodeError:
                pass
        elif tr.get("stage") == "review":
            try:
                entry["review_digest"] = json.loads(tr.get("output_digest") or "{}")
            except json.JSONDecodeError:
                pass
    _dump_evidence(outdir, cid, {
        "request": payload, "trace": traces, "answer": stream["reply"],
        "stream_meta": {k: stream[k] for k in ("resets", "steps", "error")},
        "elapsed_s": elapsed,
    })
    return entry


def _dump_evidence(outdir, cid, data):
    d = os.path.join(outdir, "cases", cid)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "request.json"), "w", encoding="utf-8") as fh:
        json.dump(data["request"], fh, ensure_ascii=False, indent=2)
    with open(os.path.join(d, "trace.json"), "w", encoding="utf-8") as fh:
        json.dump(data["trace"], fh, ensure_ascii=False, indent=2)
    with open(os.path.join(d, "answer.md"), "w", encoding="utf-8") as fh:
        fh.write(data["answer"] or "")
    with open(os.path.join(d, "meta.json"), "w", encoding="utf-8") as fh:
        json.dump({k: v for k, v in data.items() if k not in ("request", "trace", "answer")},
                  fh, ensure_ascii=False, indent=2)


def _checkpoint(outdir, name, entries):
    path = os.path.join(outdir, f"results-{name}.json")
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(entries, fh, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def _dump(outdir, name, data):
    """通用落盘（不经 results- 前缀——eval_judge 的批次 glob 只认 results-*.json）。"""
    with open(os.path.join(outdir, name), "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)


# ---------- IF 批次 ----------

def run_if_batch(base, cases, outdir, kb_items, log, extras=None):
    entries = []
    state = {}
    for case in cases["if_cases"]:
        cid = case["id"]
        try:
            if cid == "IF-06":
                entry = _if06_report(base, case, state, outdir, log)
            else:
                persona = cases["personas"][case["persona"]]
                pid = ensure_project(base, case["persona"], "if" + cid[-2:])
                kb_sources = [it["source"] for it in kb_items]
                ingest_kb(base, pid, kb_items, log) if not state.get("kb-" + pid) else None
                state["kb-" + pid] = True
                did, ready = new_dialogue(base, pid, cid, persona["wizard"])
                base_q = {"id": cid + "-B", "persona": case["persona"],
                          "q": case["baseline_q"], "kps": []}
                baseline = run_chat_case.__wrapped__(base, base_q, persona, pid,
                                                     kb_sources, outdir, log) \
                    if hasattr(run_chat_case, "__wrapped__") else None
                if baseline is None:
                    baseline = _raw_chat(base, base_q["q"], did, pid, cid + "-B",
                                         persona, kb_sources, outdir, extras)
                quiz_resp = None
                if case.get("quiz"):
                    quiz_resp = _post_json(base, "/api/quiz/submit", {
                        "dialogue_id": did, "project_id": pid,
                        "answers": case["quiz"]}, timeout=60)
                    time.sleep(2)
                if case.get("profile_change"):
                    merged = dict(persona["wizard"])
                    merged.update(case["profile_change"])
                    _post_json(base, f"/api/dialogues/{did}/profile",
                               {"profile": merged})
                    time.sleep(1)
                fw_q = {"id": cid + "-F", "persona": case["persona"],
                        "q": case["followup_q"], "kps": []}
                followup = _raw_chat(base, fw_q["q"], did, pid, cid + "-F",
                                     persona, kb_sources, outdir, extras)
                entry = {"case_id": cid, "persona": case["persona"],
                         "dialogue_id": did, "project_id": pid,
                         "baseline": baseline, "quiz": case.get("quiz"),
                         "quiz_resp": quiz_resp,
                         "profile_change": case.get("profile_change"),
                         "followup": followup, "assert_spec": case["assert"],
                         "error": None}
        except Exception as e:  # noqa: BLE001 —— 单例失败不阻断批次，如实记录
            entry = {"case_id": cid, "error": f"{type(e).__name__}: {e}"[:400]}
        entries.append(entry)
        _checkpoint(outdir, "IF", entries)
        log(f"  [{cid}] done error={entry.get('error')}")
    return entries


def _raw_chat(base, question, did, pid, tag, persona, kb_sources, outdir,
              extras=None):
    payload = {"message": question, "dialogue_id": did, "project_id": pid,
               "api_key": "", "settings": {"template": "研究"},
               "client_msg_id": "eval-" + tag}
    payload.update(extras or {})
    t0 = time.time()
    stream = chat_stream(base, payload)
    traces = (_get_json(base, f"/api/eval/traces/{stream['request_id']}")
              if stream["request_id"] else {"traces": []})
    entry = {"question": question, "answer": stream["reply"],
             "request_id": stream["request_id"], "elapsed_s": round(time.time() - t0, 1),
             "level_score": None, "t_value": None, "strategy_id": None,
             "strategy_name": None, "resets": stream["resets"],
             "review": stream["review"], "error": stream["error"],
             "kb_sources": kb_sources}
    for tr in traces.get("traces", []):
        if tr.get("stage") == "assess":
            try:
                entry["level_score"] = json.loads(tr.get("output_digest") or "{}").get("level_score")
            except json.JSONDecodeError:
                pass
        elif tr.get("stage") == "generate":
            try:
                m = json.loads(tr.get("metrics_json") or "{}")
                entry["t_value"] = m.get("t_value")
                entry["strategy_id"] = m.get("strategy_id")
                entry["strategy_name"] = m.get("strategy_name")
            except json.JSONDecodeError:
                pass
    _dump_evidence(outdir, tag, {"request": payload, "trace": traces,
                                 "answer": stream["reply"],
                                 "stream_meta": {"resets": stream["resets"],
                                                 "error": stream["error"]},
                                 "elapsed_s": entry["elapsed_s"]})
    return entry


def _if06_report(base, case, state, outdir, log):
    target = state.get("IF-01") or {}
    pid, did = target.get("project_id"), target.get("dialogue_id")
    if not pid:
        return {"case_id": "IF-06", "error": "IF-01 state missing"}
    report = _get_json(base, f"/api/report/match?project_id={pid}&dialogue_id={did}")
    keys = list(report.keys()) if isinstance(report, dict) else []
    entry = {"case_id": "IF-06", "project_id": pid, "dialogue_id": did,
             "report": report, "top_keys": keys,
             "has_overall": "overall" in report,
             "assert_spec": case["assert"], "error": None}
    with open(os.path.join(outdir, "cases", "IF-06", "match_report.json"),
              "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
    return entry


# ---------- 主入口 ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:18000")
    ap.add_argument("--batch", required=True,
                    choices=["P1", "P2", "P3", "IF", "smoke"])
    ap.add_argument("--outdir", default="docs/submission/evidence")
    ap.add_argument("--kb", default=os.path.join(HERE, "eval_kb_manifest.json"))
    ap.add_argument("--skip-kb", action="store_true",
                    help="跳过灌库（复用同 run_stamp 的既有项目时用）")
    ap.add_argument("--skip-check", action="store_true",
                    help="跳过灌库后的 KB 检索冒烟自检闸门")
    ap.add_argument("--tier", choices=["go", "standard"], default="go",
                    help="被测档位（owner 09-04 拍板默认 go）：go=请求携带 "
                         "glm-5.3-flash + GO 端点 + 副本库 GO_API_KEY 直传")
    ap.add_argument("--replica-db", default=os.path.join(
        os.environ.get("TEMP", "/tmp"), "coagent-eval-data", "app.db"),
        help="副本库路径（go 档只读抽 GO_API_KEY，键值不打印不落盘）")
    ap.add_argument("--chat-model", default="glm-5.3-flash",
                    help="go 档主模型实名（与 backend MODEL_GO_MAIN 双源同值）")
    ap.add_argument("--chat-base-url", default="https://opencode.ai/zen/go/v1",
                    help="go 档端点（与 backend GO_BASE_URL 默认一致）")
    ap.add_argument("--limit", type=int, default=0,
                    help="每批次只取前 N 例（0=全量 18；owner 09-04 拍板本轮 9）")
    args = ap.parse_args()

    with open(CASES_PATH, encoding="utf-8") as fh:
        cases = json.load(fh)
    kb_items = []
    if os.path.exists(args.kb):
        with open(args.kb, encoding="utf-8") as fh:
            kb_items = json.load(fh)

    run_stamp = time.strftime("%Y%m%d-%H%M%S")
    os.makedirs(args.outdir, exist_ok=True)

    def log(msg):
        print(time.strftime("[%H:%M:%S] ") + msg, flush=True)

    extras = build_tier_extras(args)
    if extras:
        log(f"[tier={args.tier}] chat 附加: model={extras.get('model')} "
            f"base_url={extras.get('base_url')} key=<副本库直传,未打印>")

    if args.batch == "smoke":
        persona = cases["personas"]["P1"]
        pid = ensure_project(base := args.base, "smoke", run_stamp)
        if kb_items and not args.skip_kb:
            ingest_kb(base, pid, kb_items, log)
            detail, passed = kb_retrieval_check(base, pid, kb_items, log)
            _dump(args.outdir, "kb-check-smoke.json", detail)
            if not passed and not args.skip_check:
                raise SystemExit("[kb-check] 检索冒烟未通过：知识库大概率未生效，"
                                 "先排查灌库/ embedding 配置再跑正式批次"
                                 "（--skip-check 强制放行）")
        case = cases["cases"][0]
        log(f"[smoke] project={pid} case={case['id']}")
        kb_sources = [it["source"] for it in kb_items]
        entry = run_chat_case(base, case, persona, pid, kb_sources,
                              args.outdir, log, extras)
        _checkpoint(args.outdir, "smoke", [entry])
        log(f"[smoke] reply_len={len(entry['answer'])} error={entry['error']}")
        return

    if args.batch == "IF":
        entries = run_if_batch(args.base, cases, args.outdir, kb_items, log,
                               extras)
        log(f"[IF] done: {sum(1 for e in entries if not e.get('error'))}/{len(entries)} ok")
        return

    persona = cases["personas"][args.batch]
    batch_cases = [c for c in cases["cases"] if c["persona"] == args.batch]
    if args.limit and args.limit > 0:
        batch_cases = batch_cases[:args.limit]
    base = args.base
    pid = ensure_project(base, args.batch, run_stamp)
    log(f"[{args.batch}] project={pid} cases={len(batch_cases)}")
    kb_sources = [it["source"] for it in kb_items]
    if kb_items and not args.skip_kb:
        ingest_kb(base, pid, kb_items, log)
        detail, passed = kb_retrieval_check(base, pid, kb_items, log)
        _dump(args.outdir, f"kb-check-{args.batch}.json", detail)
        if not passed and not args.skip_check:
            raise SystemExit(f"[kb-check] {args.batch} 批次检索冒烟未通过，停止跑数"
                             "（--skip-check 强制放行）")
    entries = []
    for i, case in enumerate(batch_cases, 1):
        log(f"  [{i}/{len(batch_cases)}] {case['id']}")
        try:
            entry = run_chat_case(base, case, persona, pid, kb_sources,
                                  args.outdir, log, extras)
        except Exception as e:  # noqa: BLE001 —— 单例失败记录后继续，稍后统一重试
            entry = {"case_id": case["id"], "persona": case["persona"],
                     "question": case["q"], "expect_kps": case.get("kps") or [],
                     "error": f"{type(e).__name__}: {e}"[:400]}
        entries.append(entry)
        _checkpoint(args.outdir, args.batch, entries)
    ok = sum(1 for e in entries if not e.get("error"))
    log(f"[{args.batch}] done: {ok}/{len(entries)} ok, results -> results-{args.batch}.json")


if __name__ == "__main__":
    sys.exit(main())
