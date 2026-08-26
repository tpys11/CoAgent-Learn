# -*- coding: utf-8 -*-
"""输出策略模块（Loop3）：T 计算 → 模式路由 → 提示词指令。
三纯函数零副作用；权重与阈值全部常量（用户拍板：先常量跑体感）。

语义备忘：
- T 越小越保守贴知识库语域，越大越贴用户语域
- 思考档低 T(<0.4) → 策略③「先用户后KB」为**模式覆盖语义**（有意教学法），非 bug
- 研究档恒为策略③（模式一票优先，不经 T 路由）
"""
import os

WEIGHT_CURRENT = 0.7   # 当前知识水平比重
WEIGHT_TARGET = 0.3    # 目标知识水平比重
THRESH_LOW = 0.4       # 思考档：低于此走策略③
THRESH_HIGH = 0.6      # 高于此走策略②（极速档同值）

_DEFAULT_CURRENT = 0.4   # 画像无水平信息时的默认当前值
_DEFAULT_TARGET = 0.6    # 默认目标值（学习场景通常向上追求）

_LEVEL_WORDS = {"入门": 0.2, "初学": 0.2, "了解": 0.35, "一般": 0.45, "中等": 0.5,
                "进阶": 0.65, "熟练": 0.8, "熟悉": 0.8, "精通": 0.95}


def _map_level(value):
    """画像水平字段 → [0,1] 分数；无法识别返回 None。"""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value) if 0 <= value <= 1 else None
    s = str(value).strip()
    for k, v in _LEVEL_WORDS.items():
        if k in s:
            return v
    try:
        f = float(s)
        return f if 0 <= f <= 1 else None
    except ValueError:
        return None


def _pick(profile: dict, keys: list):
    """多候选键名取第一个非空值（画像键名跨版本存在变体）。"""
    for k in keys:
        v = (profile or {}).get(k)
        if v not in (None, "", []):
            return v
    return None


def compute_t(profile: dict, assess_score: float | None = None) -> float:
    """T = clamp01(0.7×当前 + 0.3×目标)。
    当前：优先用本轮流内学情评估分（S3 Assess），缺失回落画像 selfLevel 规则映射；
    目标：画像 target 字段映射；均缺失用默认值。"""
    profile = profile or {}
    cur = assess_score if (assess_score is not None and 0 <= assess_score <= 1) \
        else _map_level(_pick(profile, ["selfLevel", "当前水平", "水平"]))
    tgt = _map_level(_pick(profile, ["target", "目标", "学习目标"]))
    if cur is None:
        cur = _DEFAULT_CURRENT
    if tgt is None:
        tgt = _DEFAULT_TARGET
    t = WEIGHT_CURRENT * cur + WEIGHT_TARGET * tgt
    return max(0.0, min(1.0, t))


def route(template: str, t: float) -> int:
    """(模式, T) → 策略号 1|2|3。
    研究档模式覆盖恒为③；极速/思考按阈值；未知模板按思考处理。"""
    if template == "研究":
        return 3
    if template == "极速":
        return 1 if t < THRESH_HIGH else 2
    # 思考及未识别模板
    if t < THRESH_LOW:
        return 3
    return 1 if t <= THRESH_HIGH else 2


_STRATEGY_TEXT = {
    1: "语言组织以知识库表述为基准：术语规范、结构严谨、贴近教材语域；"
       "避免口语化改写与跳跃表达。",
    2: "语言组织贴合用户当前的语言风格与表达习惯：可延续其用词框架与提问视角；"
       "在准确性前提下保持其语域，不做教科书式重写。",
    3: "先顺着用户当前的表述框架与措辞展开回答，再以知识库基准补充校正关键概念——"
       "先用户、后锚定。",
}


def directive(strategy_id: int, t: float) -> str:
    """策略号 → 注入生成提示词的指令文本（含 T 值供模型感知幅度）。"""
    base = _STRATEGY_TEXT.get(strategy_id, _STRATEGY_TEXT[1])
    return f"【输出策略指令·T={t:.2f}】{base}"


def strategy_name(strategy_id: int) -> str:
    return {1: "①KB基准", 2: "②用户语域", 3: "③用户先+KB锚定"}.get(strategy_id, "?")
