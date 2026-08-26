# -*- coding: utf-8 -*-
"""学情匹配度报告聚合服务（评估体系设计稿 §五 报告层 v1：现有数据拼装，零新采集）。

四要素 → 一端点：
- 知识盲区定位   profile.薄弱点 ∪ quiz 错题知识点聚合
- 难度匹配曲线   eval_traces 中 assess 阶段 level_score 时间序列（今日 Trace 基建的直接复用）
- 学习路径规划图 kb_tree 标题树着色（blind/learning/mastered/untouched）
- 综合匹配度总分  kp 加权正确率均值，无 quiz 数据回退当前 level_score

纯函数 build_match_report 可离线单测；所有读取走 get_db()/kb_repo 单例，
隔离测试按既有模式打 _instance 与模块单例。
"""
import json

KP_BLIND = 0.6     # 正确率低于此 → 盲区
KP_MASTER = 0.85   # 高于此 → 掌握


def _loads(raw):
    try:
        v = json.loads(raw) if isinstance(raw, str) else raw
        return v if isinstance(v, (dict, list)) else None
    except Exception:
        return None


def _as_list(v) -> list[str]:
    """画像字段兼容两种形态：list[str] 或逗号分隔字符串。"""
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    if isinstance(v, str) and v.strip():
        return [p.strip() for p in v.replace('，', ',').split(',') if p.strip()]
    return []


def _pick_dialogue(db, project_id: str, dialogue_id: str | None):
    """报告锚定画像的对话行：显式指定优先；否则取项目内 profile 最新的对话。"""
    if dialogue_id:
        rows = db.execute(
            "SELECT id, profile FROM dialogues WHERE id=%s AND project_id=%s",
            (dialogue_id, project_id))
        if rows:
            return rows[0]
    rows = db.execute(
        "SELECT id, profile FROM dialogues WHERE project_id=%s "
        "AND profile IS NOT NULL AND TRIM(profile)<>'' ORDER BY id DESC LIMIT 1",
        (project_id,))
    return rows[0] if rows else None


def _trend(db, project_id: str, limit: int = 200) -> list:
    """level_score 序列：assess 阶段 Trace 的 output_digest JSON。"""
    out = []
    try:
        rows = db.execute(
            "SELECT output_digest, created_at FROM eval_traces "
            "WHERE stage='assess' AND project_id=%s ORDER BY id LIMIT %s",
            (project_id, int(limit)))
    except Exception:
        return out
    for r in rows or []:
        d = _loads(r.get("output_digest") or "")
        score = (d or {}).get("level_score")
        if isinstance(score, (int, float)) and 0 <= score <= 1:
            out.append({"t": r.get("created_at"), "score": round(float(score), 4)})
    return out


def _kp_accuracy(db, project_id: str, dialogue_id: str | None) -> list:
    """知识点正确率聚合（quiz_answers JOIN dialogues 定位项目）。"""
    where_extra, params = "", [project_id]
    if dialogue_id:
        where_extra = " AND qa.dialogue_id=%s"
        params.append(dialogue_id)
    try:
        rows = db.execute(
            "SELECT qa.kp_tag AS kp, COUNT(*) AS total, SUM(qa.correct) AS correct "
            "FROM quiz_answers qa JOIN dialogues d ON qa.dialogue_id=d.id "
            "WHERE d.project_id=%s AND TRIM(qa.kp_tag)<>''" + where_extra +
            " GROUP BY qa.kp_tag ORDER BY total DESC",
            tuple(params))
    except Exception:
        return []
    out = []
    for r in rows or []:
        total = int(r.get("total") or 0)
        correct = int(r.get("correct") or 0)
        if total <= 0:
            continue
        out.append({"kp": str(r["kp"]), "total": total, "correct": correct,
                    "accuracy": round(correct / total, 4)})
    return out


def _kp_status(acc: float | None) -> str:
    if acc is None:
        return "untouched"
    if acc < KP_BLIND:
        return "blind"
    if acc < KP_MASTER:
        return "learning"
    return "mastered"


def color_tree(nodes: list, kp_map: dict, weak: set, strong: set) -> list:
    """标题树着色：节点名命中知识点/薄弱/强项清单则着对应状态，否则 untouched；递归子级。"""
    def one(n):
        name = str((n or {}).get("name") or "").strip()
        status = "untouched"
        if name:
            if name in kp_map:
                status = _kp_status(kp_map[name])
            if name in weak and status in ("untouched", "learning"):
                status = "blind"
            if name in strong and status == "untouched":
                status = "mastered"
        kids = n.get("children") if isinstance(n, dict) else None
        return {"name": name, "status": status,
                "children": [one(c) for c in (kids or []) if isinstance(c, dict)]}
    return [one(n) for n in nodes or [] if isinstance(n, dict)]


def build_match_report(project_id: str, dialogue_id: str | None = None,
                       db=None, kb_repo=None) -> dict:
    """聚合入口。db/kb_repo 参数仅供测试注入，生产走单例。"""
    from core.db.base import get_db
    database = db or get_db()

    # 画像与学情分
    dlg = _pick_dialogue(database, project_id, dialogue_id)
    profile = _loads((dlg or {}).get("profile") or "") or {}
    weak = _as_list(profile.get("薄弱点"))
    strong = _as_list(profile.get("强项"))
    level_now = {"score": profile.get("level_score"),
                 "evidence": profile.get("level_evidence", ""),
                 "updated_at": profile.get("level_updated_at", "")}

    # 曲线与知识点正确率
    trend = _trend(database, project_id)
    kps = _kp_accuracy(database, project_id, dialogue_id)
    kp_map = {k["kp"]: k["accuracy"] for k in kps}

    # 路径树（kb_tree 全源顶层合并去重）
    tree_nodes: list = []
    try:
        repo = kb_repo
        if repo is None:
            from core.db import get_kb_repo
            repo = get_kb_repo()
        seen = set()
        for doc in repo.get_all_kb_trees(project_id) or []:
            for n in (doc.get("tree") or []):
                name = str((n or {}).get("name") or "")
                if name and name not in seen:
                    seen.add(name)
                    tree_nodes.append(n)
    except Exception:
        tree_nodes = []

    # 盲区/强项合并派生
    blind = list(dict.fromkeys(weak + [k["kp"] for k in kps if k["accuracy"] < KP_BLIND]))
    mastered = list(dict.fromkeys(strong + [k["kp"] for k in kps if k["accuracy"] >= KP_MASTER]))

    # 总分：kp 加权均值 → 回退 level_score
    tot = sum(k["total"] for k in kps)
    hit = sum(k["correct"] for k in kps)
    if tot > 0:
        overall = round(hit / tot, 4)
        basis = "quiz"
    elif isinstance(level_now["score"], (int, float)):
        overall = round(float(level_now["score"]), 4)
        basis = "level_score"
    else:
        overall = None
        basis = "empty"
    label = ("优秀" if (overall or 0) >= KP_MASTER else
             "良好" if (overall or 0) >= 0.7 else
             "起步" if (overall or 0) >= KP_BLIND else "预热")

    return {
        "overall": {"score": overall, "label": label, "basis": basis},
        "level_now": level_now,
        "trend": trend,
        "kp_accuracy": kps,
        "weak_points": blind,
        "strong_points": mastered,
        "path_tree": color_tree(tree_nodes, kp_map, set(blind), set(mastered)),
        "thresholds": {"blind": KP_BLIND, "master": KP_MASTER},
    }
