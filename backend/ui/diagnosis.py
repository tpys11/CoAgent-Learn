"""知识诊断弹窗——自适应命名测试，评估用户AI领域知识水平"""

from nicegui import ui
from typing import Callable

# 测试题库：分层覆盖AI/Agent领域核心概念
QUESTIONS = [
    # 第一轮：宽泛概念（10个）
    {
        "concept": "Python编程",
        "level": 0,
        "category": "编程基础",
    },
    {
        "concept": "Git版本控制",
        "level": 0,
        "category": "工程基础",
    },
    {
        "concept": "大语言模型（LLM）",
        "level": 0,
        "category": "AI基础",
    },
    {
        "concept": "提示词工程（Prompt Engineering）",
        "level": 0,
        "category": "AI应用",
    },
    {
        "concept": "RAG检索增强生成",
        "level": 0,
        "category": "AI技术",
    },
    {
        "concept": "向量数据库（Vector DB）",
        "level": 0,
        "category": "AI技术",
    },
    {
        "concept": "Function Calling（函数调用）",
        "level": 0,
        "category": "Agent技术",
    },
    {
        "concept": "AI Agent（智能体）",
        "level": 0,
        "category": "Agent核心",
    },
    {
        "concept": "LangChain/LangGraph",
        "level": 0,
        "category": "Agent框架",
    },
    {
        "concept": "MCP协议（Model Context Protocol）",
        "level": 0,
        "category": "Agent协议",
    },
    # 第二轮：收窄概念（各方向5个）
    {
        "concept": "Embedding（文本嵌入）",
        "level": 1,
        "category": "AI技术",
        "parent": "RAG检索增强生成",
    },
    {
        "concept": "文档切块（Chunking）",
        "level": 1,
        "category": "RAG细节",
        "parent": "RAG检索增强生成",
    },
    {
        "concept": "语义检索与相似度排序",
        "level": 1,
        "category": "RAG细节",
        "parent": "RAG检索增强生成",
    },
    {
        "concept": "上下文窗口（Context Window）",
        "level": 1,
        "category": "LLM细节",
        "parent": "大语言模型（LLM）",
    },
    {
        "concept": "Token与分词器",
        "level": 1,
        "category": "LLM细节",
        "parent": "大语言模型（LLM）",
    },
    {
        "concept": "Agent循环（Think-Act-Observe）",
        "level": 1,
        "category": "Agent细节",
        "parent": "AI Agent（智能体）",
    },
    {
        "concept": "工具注册与调用",
        "level": 1,
        "category": "Agent细节",
        "parent": "AI Agent（智能体）",
    },
    {
        "concept": "多Agent协同模式",
        "level": 1,
        "category": "Agent细节",
        "parent": "AI Agent（智能体）",
    },
    {
        "concept": "StateGraph状态图",
        "level": 1,
        "category": "LangGraph细节",
        "parent": "LangChain/LangGraph",
    },
    {
        "concept": "条件路由与人工干预",
        "level": 1,
        "category": "LangGraph细节",
        "parent": "LangChain/LangGraph",
    },
    # 第三轮：深入概念
    {
        "concept": "HNSW近似最近邻检索",
        "level": 2,
        "category": "向量检索",
        "parent": "向量数据库（Vector DB）",
    },
    {
        "concept": "稀疏向量与稠密向量融合检索",
        "level": 2,
        "category": "向量检索",
        "parent": "向量数据库（Vector DB）",
    },
    {
        "concept": "Agent记忆分层（短期/中期/长期）",
        "level": 2,
        "category": "Agent记忆",
        "parent": "AI Agent（智能体）",
    },
    {
        "concept": "ReAct范式与链式思考",
        "level": 2,
        "category": "Agent推理",
        "parent": "AI Agent（智能体）",
    },
    {
        "concept": "GraphRAG与知识图谱增强检索",
        "level": 2,
        "category": "高级RAG",
        "parent": "RAG检索增强生成",
    },
]

OPTIONS = [
    {"label": "比较熟悉", "value": "familiar", "score": 3},
    {"label": "知道但不熟悉", "value": "heard", "score": 1},
    {"label": "完全不知道", "value": "unknown", "score": 0},
    {"label": "自定义输入", "value": "custom", "score": -1},
]


class DiagnosisDialog:
    def __init__(self, on_complete: Callable):
        self.on_complete = on_complete
        self.current_level = 0
        self.round_size = 10  # 第一轮
        self.current_round = 0
        self.question_index = 0
        self.answers = {}
        self.current_questions = []
        self.dialog = None

    def open(self):
        self.current_level = 0
        self.round_size = 10
        self.current_round = 0
        self.current_questions = [q for q in QUESTIONS if q["level"] == 0][:10]
        self.answers = {}
        self._show_question()

    def _show_question(self):
        if self.question_index >= len(self.current_questions):
            self._next_round()
            return
        q = self.current_questions[self.question_index]

        # 隐藏上一题
        if self.dialog:
            self.dialog.clear()

        with ui.dialog(value=True) as d, ui.card().classes("w-full max-w-lg"):
            self.dialog = d
            d.props("persistent")
            ui.label(f"📋 知识诊断 · 第{self.current_round + 1}轮").classes("text-sm font-medium")
            ui.separator()
            ui.label(q["concept"]).classes("text-lg font-semibold mt-2 mb-4")
            ui.label(f"分类: {q['category']}").classes("text-xs text-gray-500 mb-4")

            for opt in OPTIONS:
                with ui.row().classes("gap-2 items-center"):
                    ui.button(
                        opt["label"],
                        on_click=lambda _, v=opt["value"], s=opt["score"], n=q["concept"], c=q["category"]: self._answer(v, s, n, c),
                    ).classes("w-full")

            ui.separator()
            with ui.row().classes("gap-2 justify-end mt-2"):
                ui.button("退出评估", on_click=lambda: self._finish(skipped=True)).props("flat")
                ui.label(f"第 {self.question_index + 1}/{len(self.current_questions)} 题").classes("text-xs text-gray-400")

        d.open()

    def _answer(self, value: str, score: int, name: str, category: str):
        self.answers[name] = {"value": value, "score": score, "category": category}
        self.question_index += 1
        if self.question_index < len(self.current_questions):
            self._show_question()
        else:
            self._next_round()

    def _next_round(self):
        """根据上一轮回答动态生成下一轮题目"""
        familiar_names = [n for n, a in self.answers.items() if a["value"] == "familiar"]

        if self.current_level >= 2 or len(familiar_names) < 2:
            self._finish(skipped=False)
            return

        self.current_level += 1
        self.current_round += 1
        self.round_size = 5

        # 找出familiar概念的sub概念
        next_qs = []
        for name in familiar_names:
            sub_qs = [q for q in QUESTIONS if q.get("parent") == name and q["level"] <= self.current_level]
            next_qs.extend(sub_qs)

        if not next_qs:
            self._finish(skipped=False)
            return

        self.current_questions = next_qs[:5]
        self.question_index = 0
        self._show_question()

    def _finish(self, skipped: bool):
        if self.dialog:
            self.dialog.close()

        if skipped:
            self.on_complete(None)
            ui.notify("已跳过知识诊断", type="info")
            return

        # 计算评估结果
        total_qs = len(self.answers)
        familiar_qs = sum(1 for a in self.answers.values() if a["value"] == "familiar")
        by_category = {}
        for name, a in self.answers.items():
            cat = a["category"]
            if cat not in by_category:
                by_category[cat] = {"total": 0, "familiar": 0}
            by_category[cat]["total"] += 1
            if a["value"] == "familiar":
                by_category[cat]["familiar"] += 1

        summary_lines = [f"知识诊断完成：共回答 {total_qs} 个概念，其中 {familiar_qs} 个较熟悉。"]
        for cat, stats in by_category.items():
            pct = int(stats["familiar"] / max(stats["total"], 1) * 100)
            summary_lines.append(f"- {cat}: {stats['familiar']}/{stats['total']} ({pct}%)")

        known = [n for n, a in self.answers.items() if a["value"] == "familiar"]
        if known:
            summary_lines.append(f"比较熟悉的领域: {', '.join(known)}")
        unknowns = [n for n, a in self.answers.items() if a["value"] == "unknown"]
        if unknowns:
            summary_lines.append(f"建议学习的盲区: {', '.join(unknowns)}")

        result = {
            "raw_answers": self.answers,
            "by_category": by_category,
            "total_answered": total_qs,
            "familiar_count": familiar_qs,
            "summary": "\n".join(summary_lines),
            "known": known,
            "unknowns": unknowns,
        }
        self.on_complete(result)
        self._show_result_dialog(result)
        ui.notify("知识诊断完成", type="positive")

    def _show_result_dialog(self, result: dict):
        """显示知识诊断结果卡片"""
        with ui.dialog(value=True) as d, ui.card().classes("w-full max-w-lg").style(
            "border-radius: 16px;"
        ):
            d.props("persistent")
            with ui.column().classes("w-full gap-4 p-2"):
                # 头部
                with ui.row().classes("w-full items-center gap-3"):
                    ui.icon("assessment", size="32px").classes("text-orange-500")
                    ui.label("📋 知识诊断报告").classes("text-lg font-semibold")

                # 总体得分
                total = result["total_answered"]
                familiar = result["familiar_count"]
                score_pct = int(familiar / max(total, 1) * 100)
                with ui.card().classes("w-full").style(
                    "background: linear-gradient(135deg, #c75f1a15, #e8843d10);"
                    "border: 1px solid #c75f1a30;"
                    "border-radius: 12px;"
                ):
                    with ui.row().classes("w-full items-center justify-between px-4 py-3"):
                        with ui.column().classes("items-center"):
                            ui.label(f"{familiar}/{total}").classes("text-2xl font-bold text-orange-600")
                            ui.label("熟悉程度").classes("text-xs text-secondary")
                        with ui.column().classes("items-center"):
                            ui.label(f"{score_pct}%").classes("text-2xl font-bold text-orange-600")
                            ui.label("知识覆盖率").classes("text-xs text-secondary")
                        with ui.column().classes("items-center"):
                            ui.label(f"{result.get('current_level', 0) + 1}轮").classes("text-2xl font-bold text-orange-600")
                            ui.label("测试深度").classes("text-xs text-secondary")

                ui.separator()

                # 分类详情
                ui.label("📊 分类掌握情况").classes("text-sm font-semibold")
                for cat, stats in result["by_category"].items():
                    pct = int(stats["familiar"] / max(stats["total"], 1) * 100)
                    bar_color = "green" if pct >= 60 else ("orange" if pct >= 30 else "red")
                    with ui.row().classes("w-full items-center gap-2"):
                        ui.label(cat).classes("text-xs w-24 text-secondary")
                        ui.linear_progress(value=pct / 100, size="6px").classes(
                            "flex-1"
                        ).props(f"color={bar_color}")
                        ui.label(f"{pct}%").classes("text-xs text-secondary w-10")

                ui.separator()

                # 熟悉领域
                if result.get("known"):
                    ui.label("✅ 比较熟悉的领域").classes("text-sm font-semibold text-green-700")
                    with ui.row().classes("gap-1 flex-wrap"):
                        for name in result["known"]:
                            ui.badge(name, color="green").props("outline")

                # 盲区
                if result.get("unknowns"):
                    ui.label("⚠️ 建议学习的盲区").classes("text-sm font-semibold text-red-600 mt-2")
                    with ui.row().classes("gap-1 flex-wrap"):
                        for name in result["unknowns"]:
                            ui.badge(name, color="red").props("outline")

                ui.separator()

                # 总结
                with ui.card().classes("w-full p-3").style(
                    "background: var(--q-dark); border-radius: 8px;"
                ):
                    ui.markdown(result["summary"]).classes("text-xs leading-relaxed")

                # 关闭按钮
                with ui.row().classes("w-full justify-end mt-2"):
                    ui.button(
                        "开始学习",
                        on_click=d.close,
                    ).style(
                        "background-color: #c75f1a !important; color: white !important; border-radius: 8px;"
                    )
