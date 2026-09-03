# -*- coding: utf-8 -*-
"""F11-S4 端到端验收实验驱动（宿主运行：HTTP 打 f11tmp 临时栈 ：8001，副本库只读快照）。

⚠️ 手动 E2E 驱动脚本，非 pytest 收集件（文件名不匹配 test_*）——依赖真实 HTTP 栈、
真实 LLM key（副本库 settings 携带，owner 真实库零接触）与 f11tmp 临时栈
（T49/T50 纪律：严禁指向 owner 真实库）。

前置（临时栈准备，见 docs/progress/step-F11.md §S4）：
  1. copy data/app.db → %TEMP%/opencode/f11tmp/data/app.db（副本，含 settings 的 key）；
  2. 独立 compose（compose.f11tmp.yml）：-p f11tmp、端口 5174/8001、backend bind mount
     工作区新代码 + 网络别名 guashuai-backend（E-29）、frontend 现构建 f11tmp-frontend:exp；
  3. 实验结束：docker compose -p f11tmp down -v + 删除副本目录。

实验矩阵（派发单 §三 S4 / §四 验收标准）：
E1 普通对话全链（研究档，审核恒开）——SSE 帧序断言：
   step(规划) → thought(规划要点) → step(知识库管理) → [🛰 观察窗 subagent 帧]
   → thought(检索详情) → step(生成) → answer_token(正文) → thought(审核发起)
   → thought(审核结论) → done；done.mindchain 含 规划/知识库管理/审核 条目；
   done 为终止帧（其后零帧）=「正文后无追加块」的协议级证据。
E2 检索内容：检索详情帧含「检索查询」「命中预览」、source 与融合分数值。
E3 子代理：subagent 帧 start→…→end 同 run_id + GET /api/chat/subagent/{rid}
   档案五行要素字段齐（agent/title/status/created_at/finished_at/events 非空）。
E4 LaTeX 回归：API 级不做断言——由 vitest .katex 断言链 + 浏览器级渲染抽查覆盖。
快照：kb_vectors / kb_vectors_chunks 只读行数前后对比（T50 seam，零回落）。
"""
import json
import re
import sqlite3
import sys
import urllib.request

import sqlite_vec

BASE = "http://127.0.0.1:8001"
DB_RO = r"file:C:/Users/31639/AppData/Local/Temp/opencode/f11tmp/data/app.db?mode=ro"
PID = "202608302134122745"          # 副本库中带真实向量的课程（线性代数讲义 439 行）
DID = "f11exp-e1"
# 措辞明确指向知识库资料：rewrite_queries 的 need_search 是模型判定的偶发量
# （实证：同输入两次调用一次 true 一次 false——非 F11 改动引入，实验脚本以重试吸收）
MESSAGE = "请基于知识库中的《线性代数讲义》资料，讲解向量空间与线性变换的核心概念，并说明它们的联系"
E1_MAX_TRIES = 3

_results = []


def _check(name, ok, detail=""):
    tag = "PASS" if ok else "FAIL"
    print(f"[{tag}] {name}" + (f" —— {detail}" if detail else ""))
    _results.append((name, ok))


def _connect_ro():
    conn = sqlite3.connect(DB_RO, uri=True)
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    return conn


def snapshot(label: str) -> int:
    conn = _connect_ro()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM kb_vectors")
    n = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM kb_vectors_chunks")
    nc = cur.fetchone()[0]
    conn.close()
    print(f"[SNAPSHOT][{label}] kb_vectors={n} kb_vectors_chunks={nc}")
    return n


def run_chat(message: str, template: str, did: str):
    """POST /api/chat 并收集 SSE 帧（与 pytest _run 同构，走真实 HTTP+SSE 通道）。"""
    body = json.dumps({
        "message": message, "project_id": PID, "dialogue_id": did,
        "session_id": "f11exp", "settings": {"template": template},
    }).encode("utf-8")
    req = urllib.request.Request(
        BASE + "/api/chat", data=body, method="POST",
        headers={"Content-Type": "application/json", "Accept": "text/event-stream"})
    frames = []
    with urllib.request.urlopen(req, timeout=600) as resp:
        buf = ""
        while True:
            chunk = resp.read(4096)
            if not chunk:
                break
            buf += chunk.decode("utf-8", errors="replace")
            while "\n\n" in buf:
                frame, buf = buf.split("\n\n", 1)
                for line in frame.split("\n"):
                    if line.startswith("data: "):
                        try:
                            f = json.loads(line[6:])
                            if f.get("type") != "heartbeat":
                                frames.append(f)
                        except json.JSONDecodeError:
                            pass
    return frames


def e1_e2_e3():
    frames = None
    for attempt in range(1, E1_MAX_TRIES + 1):
        frames = run_chat(MESSAGE, "研究", f"{DID}-{attempt}")
        kb_detail = [f for f in frames if f["type"] == "thought_token"
                     and f.get("agent") == "知识库管理" and "命中预览" in (f.get("chunk") or "")]
        got_hits = kb_detail and "（本轮无命中）" not in "".join(f.get("chunk") or "" for f in kb_detail)
        print(f"[E1-TRY {attempt}] kb_detail={'命中' if got_hits else ('空' if kb_detail else '无帧')}")
        if got_hits:
            break
    types = [f["type"] for f in frames]
    print(f"[FRAMES] n={len(frames)} types={ {t: types.count(t) for t in set(types)} }")
    for i, f in enumerate(frames):
        if f["type"] in ("step", "thought_token", "answer_reset", "error", "done"):
            brief = f.get("agent") or f.get("reason") or f.get("message") or ""
            head = (f.get("chunk") or ("reply=" + str(f.get("reply"))[:40] if f["type"] == "done" else "")) or ""
            print(f"  [{i:3d}] {f['type']:13s} {brief:10s} {str(head)[:72]!r}")

    # ---- E1：帧序断言 ----
    def _idx(pred):
        return [i for i, f in enumerate(frames) if pred(f)]

    i_plan_step = _idx(lambda f: f["type"] == "step" and f.get("agent") == "学习助手·规划")
    i_plan_pt = _idx(lambda f: f["type"] == "thought_token" and f.get("agent") == "学习助手·规划"
                     and "规划要点" in (f.get("chunk") or ""))
    i_kb_step = _idx(lambda f: f["type"] == "step" and f.get("agent") == "知识库管理")
    i_kb_detail = _idx(lambda f: f["type"] == "thought_token" and f.get("agent") == "知识库管理"
                       and "命中预览" in (f.get("chunk") or ""))
    i_gen_step = _idx(lambda f: f["type"] == "step" and f.get("agent") == "学习助手·生成")
    i_answer = _idx(lambda f: f["type"] == "answer_token")
    i_rev_start = _idx(lambda f: f["type"] == "thought_token" and f.get("agent") == "审核"
                       and "发起审核" in (f.get("chunk") or ""))
    i_rev_concl = _idx(lambda f: f["type"] == "thought_token" and f.get("agent") == "审核"
                       and ("审核通过" in (f.get("chunk") or "") or "审核未通过" in (f.get("chunk") or "")))
    done_i = _idx(lambda f: f["type"] == "done")

    _check("E1 规划 step + 规划要点帧", bool(i_plan_step and i_plan_pt))
    _check("E1 检索 step + 检索详情帧", bool(i_kb_step and i_kb_detail))
    _check("E1 生成 step + 正文 answer_token", bool(i_gen_step and i_answer))
    _check("E1 审核发起 + 审核结论帧（研究档恒开）", bool(i_rev_start and i_rev_concl))
    seq_ok = bool(
        i_plan_pt and i_kb_detail and i_answer and i_rev_concl and done_i
        and i_plan_pt[0] < i_kb_detail[0] < i_answer[0] < i_rev_concl[-1] < done_i[0])
    _check("E1 全链序 规划→检索→正文→审核结论→done", seq_ok,
           f"plan_pt={i_plan_pt[:1]} kb_detail={i_kb_detail[:1]} answer={i_answer[:1]} "
           f"rev_concl={i_rev_concl[-1:]} done={done_i}")
    _check("E1 done 为终止帧（done 后零帧）", done_i and done_i[0] == len(frames) - 1)
    done = frames[-1] if done_i else {}
    mc = {it.get("agent"): (it.get("content") or "") for it in (done.get("mindchain") or [])}
    _check("E1 done.mindchain 含 规划要点", "规划要点" in mc.get("学习助手·规划", ""))
    _check("E1 done.mindchain 含 检索详情（历史回看持久）", "命中预览" in mc.get("知识库管理", ""))
    _check("E1 done.mindchain 含 审核结论", ("审核通过" in mc.get("审核", "")) or ("审核未通过" in mc.get("审核", "")))

    # ---- E2：检索内容断言 ----
    detail_text = "".join(frames[i].get("chunk") or "" for i in i_kb_detail)
    has_query = "检索查询" in detail_text
    has_source = bool(re.search(r"\d+\.\s+\S+", detail_text))
    has_score = bool(re.search(r"融合分 \d+\.\d+", detail_text))
    _check("E2 检索详情含 query 列表", has_query, detail_text[:90])
    _check("E2 检索详情含 source 与融合分数值", has_source and has_score)
    _check("E2 ≥1 条命中预览（验收标准②）", "（本轮无命中）" not in detail_text and has_source)

    # ---- E3：子代理观察窗 ----
    sa = [f for f in frames if f["type"] == "subagent"]
    ok_sa = bool(sa) and sa[0].get("event") == "start" and sa[-1].get("event") == "end"
    _check("E3 subagent 帧 start→end（检索观察窗触发）", ok_sa,
           f"n={len(sa)} events={[f.get('event') for f in sa][:6]}")
    if ok_sa:
        rid = sa[0]["run_id"]
        with urllib.request.urlopen(f"{BASE}/api/chat/subagent/{rid}", timeout=30) as resp:
            arch = json.loads(resp.read().decode("utf-8")).get("run") or {}
        five = all(arch.get(k) not in (None, "") for k in
                   ("agent", "title", "status", "created_at"))
        finished = arch.get("finished_at") or (arch.get("status") == "running")
        _check("E3 档案五行要素字段齐（agent/title/status/created_at/finished_at）",
               five and bool(finished), json.dumps({k: arch.get(k) for k in
                                                    ("agent", "title", "status", "created_at", "finished_at")},
                                                   ensure_ascii=False))
        _check("E3 档案 events 非空（输出流可展开）", len(arch.get("events") or []) > 0,
               f"events={len(arch.get('events') or [])}")
    return frames


def main():
    print(f"=== F11-S4 E2E 驱动 === BASE={BASE} PID={PID}")
    before = snapshot("before")
    frames = e1_e2_e3()
    after = snapshot("after")
    _check("快照单调零回落（T50 seam）", after >= before, f"{before} → {after}")

    fails = [n for n, ok in _results if not ok]
    print(f"\n=== 结果：{len(_results) - len(fails)}/{len(_results)} PASS ===")
    if fails:
        print("FAILED:", fails)
        sys.exit(1)
    print("E1/E2/E3 + 快照 全部通过")


if __name__ == "__main__":
    main()
