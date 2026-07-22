"""动态学习形象 — 根据学习进度成长的卡通形象"""

from nicegui import ui

# 成长阶段: (emoji, 名称, 描述)
GROWTH_STAGES = [
    ("🥚", "知识之卵", "旅程刚刚开始"),
    ("🐣", "破壳初啼", "迈出了第一步"),
    ("🐥", "蹒跚学步", "基础知识在积累"),
    ("🌱", "萌芽生长", "理解的种子在发芽"),
    ("🌿", "茁壮成长", "知识体系在扩展"),
    ("🌳", "根深叶茂", "扎实的知识根基"),
    ("🌟", "初绽光芒", "开始融会贯通"),
    ("⭐", "星光璀璨", "深入理解的探索者"),
    ("🦉", "智慧之眼", "具有洞察力的学习者"),
    ("🔮", "知识先知", "形塑自己的知识宇宙"),
    ("👑", "领域大师", "你是这个领域的佼佼者"),
]

LEVEL_THRESHOLDS = [0, 5, 15, 30, 60, 120, 240, 480, 960, 1920]  # 分钟


class LearningAvatar:
    """学习形象组件 — 显示当前成长阶段、专注时长、学习状态"""

    def __init__(self):
        self.total_minutes = 0
        self.current_stage = 0
        self.container = None
        self.avatar_label = None
        self.stage_name_label = None
        self.progress_bar = None

    def render(self, container):
        self.container = container
        with container:
            with ui.card().classes("w-full stats-bar").style("border-radius: 12px;"):
                with ui.column().classes("w-full items-center gap-1 py-3 px-4"):
                    # 卡通形象（大号）
                    self.avatar_label = ui.label(GROWTH_STAGES[0][0]).classes(
                        "text-4xl cursor-pointer transition-all"
                    ).style("transition: transform 0.3s;")
                    self.avatar_label.on("mouseenter", lambda: self.avatar_label.style("transform: scale(1.2);"))
                    self.avatar_label.on("mouseleave", lambda: self.avatar_label.style("transform: scale(1);"))

                    # 阶段名称
                    self.stage_name_label = ui.label(GROWTH_STAGES[0][1]).classes(
                        "text-xs font-semibold text-center"
                    )
                    # 阶段描述
                    ui.label(GROWTH_STAGES[0][2]).classes(
                        "text-xs text-secondary text-center"
                    )

                    # 进度条
                    self.progress_bar = ui.linear_progress(
                        value=0, size="4px"
                    ).classes("w-full mt-1").props("rounded")

                    # 学习时间
                    self.time_label = ui.label("学习 0 分钟").classes(
                        "text-xs text-secondary mt-1"
                    )

    def update(self, total_minutes: int):
        """更新成长状态"""
        self.total_minutes = total_minutes

        # 计算阶段
        stage = 0
        for i, threshold in enumerate(LEVEL_THRESHOLDS):
            if total_minutes >= threshold:
                stage = i
        stage = min(stage, len(GROWTH_STAGES) - 1)

        if stage != self.current_stage:
            self.current_stage = stage
            emoji, name, desc = GROWTH_STAGES[stage]
            if self.avatar_label:
                self.avatar_label.set_text(emoji)
                self.avatar_label.style(
                    "animation: avatarBounce 0.5s ease;"
                )
            if self.stage_name_label:
                self.stage_name_label.set_text(name)

        # 进度条 — 当前阶段向下一阶段的进度
        if self.current_stage < len(LEVEL_THRESHOLDS) - 1:
            current_threshold = LEVEL_THRESHOLDS[self.current_stage]
            next_threshold = LEVEL_THRESHOLDS[self.current_stage + 1]
            progress = (total_minutes - current_threshold) / (next_threshold - current_threshold)
            progress = min(max(progress, 0), 1)
        else:
            progress = 1.0

        if self.progress_bar:
            self.progress_bar.set_value(progress)

        # 时间显示
        if self.time_label:
            hours = total_minutes // 60
            mins = total_minutes % 60
            if hours > 0:
                self.time_label.set_text(f"学习 {hours} 小时 {mins} 分钟")
            else:
                self.time_label.set_text(f"学习 {mins} 分钟")

    def get_stage_emoji(self) -> str:
        return GROWTH_STAGES[self.current_stage][0]
