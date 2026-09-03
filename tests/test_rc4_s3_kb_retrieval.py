# -*- coding: utf-8 -*-
"""RC4-S3：KB 0 候选短路修复（红先行）。

根因机理（owner 09-02 轨迹实证：subagent_runs rc6d74ef1095a，project=202608302134122745，
input=「正定与半正定在二次型几何意义上有何区别」，events=start→input→「终筛留存 0 条
（候选共 0）」→end，缺「改写查询」「第1轮取回」，1s/34tok 短路于 rewrite_queries 判定）：
①backend/engine/retrieve.py rewrite_queries——规划器 need_search=false 时已产出的 queries
被整体丢弃（T55 误判实锤：数学课程知识题被提示词「数学计算类 need_search=false」规则误杀）
→ 单轮 ：293 / 研究档 :254 双双跳过取回 → 终筛 0 候选；数据侧无罪（kb_tree 行 + 433 向量
在库实测）。②except 静默吞异常无日志（CONVENTIONS §6 违例），LLM 调用失败同轨迹不可观测。

修复语义：queries 非空=检索意图最强信号——need=false+queries 非空是规划器自相矛盾输出，
以 queries 为准；prompt 收紧「课程知识题≠纯计算」；失败路径 warning 可观测（控制流不变）。
T33：main/pipeline 一律执行期导入；零真实网络（ScriptedLLM+monkeypatch 先例）。"""
from engine import retrieve as rt
from tests._engine_helpers import ScriptedLLM


def test_rewrite_queries_overrule_need_false_when_queries_present():
    """修复①：规划器 need=false 但产出了 queries → 以 queries 为准（need=true）。
    修复前此输入被整体丢弃 → 0 候选短路（owner 轨迹根因）。"""
    llm = ScriptedLLM(['{"need_search": false, "queries": ["正定与半正定的几何意义区别"]}'])
    out = rt.rewrite_queries(llm, "正定与半正定在二次型几何意义上有何区别？")
    assert out["need_search"] is True
    assert out["queries"] == ["正定与半正定的几何意义区别"]


def test_rewrite_research_decompose_overrule_need_false():
    """修复①研究档同款：分解契约下 need=false+queries 非空同样以 queries 为准。"""
    llm = ScriptedLLM(['{"need_search": false, "queries": ["二次型正定性判定"], "decomposed": false}'])
    out = rt.rewrite_queries(llm, "二次型正定性怎么判定？", research=True)
    assert out["need_search"] is True
    assert out["queries"] == ["二次型正定性判定"]


def test_retrieve_stage_not_short_circuited_by_planner_misjudge(monkeypatch):
    """修复①端到端：规划器误判 need=false+queries 非空时，取回照常发生（KB 召回进候选），
    轨迹不再出现「终筛 0（候选共 0）」短路。web 置空模拟公网不可用，纯 KB 命中。"""
    llm = ScriptedLLM([
        '{"need_search": false, "queries": ["正定与半正定 二次型"]}',   # 误判输出（修复后被拯救）
        '{"keep": [0]}',                                                # 终筛留第 0 条
    ])
    monkeypatch.setattr(rt, "_web_search", lambda q: [])
    monkeypatch.setattr(rt, "_kb_search", lambda q, pid: [
        {"title": "线性代数讲义", "content": "正定二次型定义……", "metadata": {"source": "线性代数讲义.pdf"}}])
    emitted: list[str] = []
    out = rt.retrieve_stage(llm, "正定与半正定在二次型几何意义上有何区别？",
                            "研究", "202608302134122745", rounds=1,
                            emit=lambda t, **kw: emitted.append(str(kw.get("text"))))
    assert out["search_meta"]["raw_count"] >= 1                      # 候选不再为 0
    assert out["search_meta"]["queries"] == ["正定与半正定 二次型"]    # 查询进日志
    assert any("第1轮取回" in e for e in emitted)                    # 「第1轮取回」轨迹行回归
    assert len(out["search_results"]) == 1
    assert out["search_results"][0]["title"] == "线性代数讲义"


def test_rewrite_crash_logs_warning(caplog):
    """修复②：规划器调用失败不再静默——warning 留痕（控制流不变，仍走失败契约）。"""
    import logging
    class _Boom:
        def chat_stream(self, *a, **k):
            raise RuntimeError("zen 429")
    with caplog.at_level(logging.WARNING, logger="coagent.retrieve"):
        out = rt.rewrite_queries(_Boom(), "任何")
    assert out == {"need_search": False, "queries": [], "decomposed": False}
    assert any("查询规划器" in r.message for r in caplog.records)
