# -*- coding: utf-8 -*-
"""T38：A2 answer_reset 的行为层守卫——钉「重试环真的入队了 reset，且先于下一稿 token」。

背景（T38 教训）：test_a2_answer_reset.py 的 4 条全部只测 _frame() 对手工构造
元组的序列化 + SSEBatcher 的 attempt 透传；总领变异实证——把 pipeline_v2 的
token_queue.put(("answer_reset", ...)) 换成 pass，4 条全绿（守卫钉错了层）。

本文件钉行为层：隔离 app（四点进程内隔离，同 test_engine_v2_golden 口径）+
审核打桩（第 1 次 passed=False、第 2 次 passed=True，确定性驱动重试环），
经真实 SSE 通道（token_queue → 泵 → _frame）收帧，断言入队序列的下游投影：
  1) 存在性：恰有一帧 answer_reset（删掉重试环的推帧行 → 此处红）；
  2) 先于性：reset(0) 早于下一稿（attempt=1）的任意 answer_token；
  3) 递增性：reset(n) 之后没有 attempt ≤ n 的 answer token。
另断言 done.reply == 第二稿（两稿不拼接的用户可见后果）。

导入纪律（T33）：engine.pipeline_v2 / main / engine.review 一律延迟到 fixture
或测试函数执行期导入——collection 期 import 会触发 core.config.load_dotenv
污染 test_db_path 的导入期快照。
"""
import json
import pathlib
import sys

import pytest

_ROOT = pathlib.Path(__file__).resolve().parents[1]
for _p in (str(_ROOT), str(_ROOT / "backend")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import fastapi.testclient  # noqa: E402

from tests._engine_helpers import RoutingFastLLM, ScriptedLLM  # noqa: E402

_DRAFT_1 = "第一稿：地球是平的。"
_DRAFT_2 = "第二稿：地球是圆的。"

# 研究档 review_claims 的定值判决：第 1 次未过（无 retrieval_gap 断言 → 不触发召回审核），
# 第 2 次通过 → 恰好一轮重试、恰好一帧 reset。
_FAIL_VERDICT = {"passed": False, "score": 40,
                 "reasons": "断言「地球是平的」无证据支撑",
                 "issues": [{"problem": "【虚构】地球是平的", "fix": "证据未覆盖"}],
                 "claims": [], "skipped": False}
_PASS_VERDICT = {"passed": True, "score": 100, "reasons": "",
                 "issues": [], "claims": [], "skipped": False}


@pytest.fixture()
def isolated_app(tmp_path, monkeypatch):
    """与 test_engine_v2_golden.isolated_app 同口径的四点隔离 + 本测试专用打桩。"""
    monkeypatch.setenv("SQLITE_DIR", str(tmp_path))
    import core.db.base as base_mod
    import core.postgres_client as pgmod
    import core.background as bgmod

    client = base_mod.SQLiteClient(str(tmp_path / "iso.db"))
    client.init_tables()
    monkeypatch.setattr(base_mod.get_db, "_instance", client, raising=False)
    monkeypatch.setattr(pgmod, "pg_client", client)
    monkeypatch.setattr(bgmod, "submit", lambda fn=None, *a, **k: None)

    import engine.pipeline_v2 as eng  # T33：执行期导入
    # 生成侧：同一实例先后吐两稿（重试环复用同一 llm_gen，:474 while 外取）
    gen = ScriptedLLM([_DRAFT_1, _DRAFT_2])
    monkeypatch.setattr(eng, "_make_llm", lambda req, model_override=None: gen)
    # 快模型：意图分类器/学情评估器按提示词特征固定响应（同 directive_flow 先例）
    monkeypatch.setattr(eng, "_make_fast_llm", lambda req: RoutingFastLLM())

    # 检索定值（:313 函数内延迟导入 → patch 模块属性即可），绕开真实网络
    import engine.retrieve as rt_mod
    monkeypatch.setattr(rt_mod, "retrieve_stage",
                        lambda *a, **k: {"search_results": [{"title": "t1", "content": "c1"}],
                                         "search_meta": {}})

    import main as _main  # SQLITE_DIR 已就位后再导入应用
    return _main.app


def _capture(app, body):
    """经真实 HTTP+SSE 通道收帧（token_queue 的 FIFO 下游投影）；只留答案相关帧型。"""
    frames = []
    with fastapi.testclient.TestClient(app).stream("POST", "/api/chat", json=body) as resp:
        assert resp.status_code == 200
        for line in resp.iter_lines():
            if not line.startswith("data: "):
                continue
            f = json.loads(line[6:])
            if f.get("type") in {"heartbeat", "start", "step", "subagent", "thought_token"}:
                continue
            frames.append(f)
    return frames


def test_retry_loop_emits_reset_before_next_draft(isolated_app, monkeypatch):
    """审核未过一轮 → 重试环必须真的入队 answer_reset，且先于下一稿任何 token。

    变异靶：pipeline_v2 重试环中
    token_queue.put(("answer_reset", attempt - 1, "审核未通过"))
    —— 删掉该行，下方「存在性」断言必红。"""
    monkeypatch.setenv("CHAT_ENGINE", "v2")
    # 审核打桩（:495 研究档走 review_claims；:382 函数内延迟导入 → patch 模块属性）
    import engine.review as review_mod  # T33：执行期导入
    verdicts = [_FAIL_VERDICT, _PASS_VERDICT]

    def fake_review_claims(*_a, **_k):
        return verdicts.pop(0)

    monkeypatch.setattr(review_mod, "review_claims", fake_review_claims)

    body = {"message": "请讲解RAG的原理与应用", "api_key": "dummy-key",
            "project_id": "p-t38", "dialogue_id": "d-t38", "session_id": "s-t38",
            "settings": {"template": "研究"}}   # 研究档审核恒开，不碰任何开关
    frames = _capture(isolated_app, body)
    types = [f["type"] for f in frames]
    assert types and types[-1] == "done", f"流应以 done 收尾：{types}"

    # 1) 存在性（行为层）：恰有一帧 answer_reset——删掉推帧行 → 此处红
    resets = [(i, f) for i, f in enumerate(frames) if f["type"] == "answer_reset"]
    assert len(resets) == 1, f"应恰有一帧 answer_reset，实际 {len(resets)}；types={types}"
    r_idx, reset = resets[0]
    assert reset["attempt"] == 0 and reset["reason"] == "审核未通过", reset

    after = frames[r_idx + 1:]
    # 2) 先于性：reset(0) 之后必须出现下一稿（attempt=1）token（新稿首字直发，必然有帧）
    d2 = [f for f in after if f["type"] == "answer_token" and f.get("attempt") == 1]
    assert d2, "reset 之后没有下一稿（attempt=1）的 answer_token"
    # 3) 递增性：reset(n) 之后没有 attempt ≤ n 的 answer token（旧稿不得复活）
    bad = [f for f in after
           if f["type"] == "answer_token" and f.get("attempt", 0) <= reset["attempt"]]
    assert not bad, f"reset(n) 之后出现 attempt ≤ n 的旧稿 token：{bad}"

    # 用户可见后果：终稿 = 第二稿全文（旧稿被作废、两稿不拼接）
    assert frames[-1]["reply"] == _DRAFT_2, frames[-1].get("reply")
