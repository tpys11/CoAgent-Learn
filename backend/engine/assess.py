# -*- coding: utf-8 -*-
"""S3 Assess（Loop3）：流内学情评估——flash 判定本轮 level_score 并写回画像缓存。
写回目标 = dialogues.profile JSON（_build_preloaded 的读取源），采用读改写**加键不改键**，
防止与 settings 页等其他写入者互踩。失败软着陆：任何异常不写不抛，返回 None，
generate 回落规则地板（output_strategy.compute_t 内建分支）。"""
import datetime
import json

from engine.llm_io import think_then_json


def evaluate_level(llm_fast, message: str, history_text: str,
                   previous_score: float | None) -> tuple[str, dict | None]:
    """flash 评估：返回 (思考原文, {"level_score","evidence"} 或 None)。"""
    prompt = (
        "你是学情评估器。根据用户最新消息与近期对话，评估其当前知识理解水平。\n"
        '只输出 JSON：{"level_score": 0到1的小数, "evidence": "一句话依据"}\n'
        "判据：逻辑是否混乱、有无明显知识错误、提问深度、术语使用准确度。"
        "0=完全新手，1=领域熟练者。\n"
        + (f"上次评估分：{previous_score:.2f}（仅作参照，勿盲从）\n" if previous_score is not None else "")
        + (f"近期对话：\n{history_text[:800]}\n" if history_text else "")
        + f"最新消息：{message[:800]}"
    )
    # E-46：Console Go 上游拒绝空 user content（凌晨 Run 2 尚接受，06:53 起收紧 400）。
    # 评估提示词整体在 system，user 消息必须非空——放最新消息原文，空则兜底指令。
    thinking, result = think_then_json(llm_fast, prompt, message[:800] or "请按标准输出评估 JSON",
                                       "学情与记忆管理", silent=True)
    try:
        score = float(result.get("level_score"))
        if not 0 <= score <= 1:
            return thinking, None
        return thinking, {"level_score": score,
                          "evidence": str(result.get("evidence") or "")[:120]}
    except Exception:
        return thinking, None


def load_profile_cache(did: str) -> dict:
    """读取 dialogues.profile JSON 缓存（T 计算的数据源）；失败返回空字典。"""
    try:
        from core.db.project_repo import get_project_repo
        rows = get_project_repo()._db.execute(
            "SELECT profile FROM dialogues WHERE id=%s", (did,))
        d = json.loads(rows[0]["profile"]) if rows and rows[0].get("profile") else {}
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def store_level_score(did: str, score: float, evidence: str) -> bool:
    """把 level_score 加键写入 dialogues.profile JSON（读改写，保全其他键）。
    返回是否成功；失败由调用方决定回落策略，本函数绝不抛出。"""
    try:
        from core.db.project_repo import get_project_repo
        repo = get_project_repo()
        d = load_profile_cache(did)
        d["level_score"] = round(score, 4)
        d["level_evidence"] = evidence
        d["level_updated_at"] = datetime.datetime.now().isoformat(timespec="seconds")
        repo._db.execute("UPDATE dialogues SET profile=%s WHERE id=%s",
                         (json.dumps(d, ensure_ascii=False), did))
        return True
    except Exception:
        return False


def coerce_score(value) -> float | None:
    """任意来源的分数 → [0,1] float 或 None（防御画像/评估双路脏数据）。"""
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if 0 <= f <= 1 else None


def assess_and_store(llm_fast, did: str, message: str, history_text: str = "",
                     previous_score: float | None = None) -> tuple[float | None, str, str]:
    """S3 阶段入口：评估并落库；返回 (本轮流内可用 level_score 或 None, 思考原文, evidence一句话)。
    落库失败不掩埋评估值——本轮路由仍可使用，只是下轮无新鲜分。"""
    thinking, out = evaluate_level(llm_fast, message, history_text, previous_score)
    if not out:
        return None, thinking, ""
    store_level_score(did, out["level_score"], out.get("evidence", ""))
    return out["level_score"], thinking, out.get("evidence", "")  # 评估值即使落库失败也可供本轮使用


# ---------------- 答题反馈合流（L5 反馈回路 / 缺口①②钉死项） ----------------

QUIZ_WEIGHT_NEW = 0.6   # 答题正确率权重（主信号，缺口①规范定稿）
QUIZ_WEIGHT_OLD = 0.4   # 现有画像分权重
QUIZ_WINDOW = 10        # 正确率统计窗口（最近 N 题）


def merge_quiz_signal(old_score: float | None, accuracy: float) -> float:
    """程序规则合流（无 LLM）：new = clamp01(0.6×acc + 0.4×old)；无旧分冷启动直采 acc。
    连续答错拉低 → 下轮 T 变小 → 策略③降维；连续答对抬高 → 策略②进阶——演示镜头的机制基础。"""
    if old_score is None:
        return max(0.0, min(1.0, float(accuracy)))
    merged = QUIZ_WEIGHT_NEW * float(accuracy) + QUIZ_WEIGHT_OLD * float(old_score)
    return max(0.0, min(1.0, merged))


def apply_quiz_feedback(dialogue_id: str, project_id: str, answers: list) -> dict:
    """quiz 提交服务入口：落库 → 近窗正确率 → 合流更新 level_score（加键写回）。
    返回 {saved, total, correct, accuracy, old_score, new_score}；全程失败软着陆不抛。"""
    try:
        from core.db.quiz_repo import get_quiz_repo
        saved = get_quiz_repo().insert_many(dialogue_id, answers)
        agg = get_quiz_repo().recent_accuracy(dialogue_id, limit=QUIZ_WINDOW)
    except Exception:
        return {"saved": 0, "total": 0, "correct": 0, "accuracy": None,
                "old_score": None, "new_score": None}
    old = load_profile_cache(dialogue_id).get("level_score")
    old = coerce_score(old)
    new_score = None
    if agg["accuracy"] is not None:
        new_score = merge_quiz_signal(old, agg["accuracy"])
        store_level_score(dialogue_id, new_score,
                          f"答题反馈：近{agg['total']}题正确率{agg['accuracy']:.0%}")
    return {"saved": saved, "total": agg["total"], "correct": agg["correct"],
            "accuracy": agg["accuracy"], "old_score": old, "new_score": new_score}
