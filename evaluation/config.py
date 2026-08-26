# -*- coding: utf-8 -*-
"""评测器配置：被测系统地址 + judge（裁判）的模型配置"""

# 被测系统（你们的多 Agent 系统）
SYSTEM_URL = "http://localhost:8000"
SYSTEM_API_KEY = "sk-1b1c5ae0973f4feabfcdba4245d5976d"   # 调你们系统要用的 DeepSeek key（评测时填）

# judge 用【另一家厂商】的模型，避免同源偏差（评委加分）
JUDGE_BASE_URL = "https://open.bigmodel.cn/api/paas/v4"
JUDGE_API_KEY = "336c43cbb3e64b7ca5630e2f7f86bf41.zKmM4I9yAoSCBBad"    # 智谱 key
JUDGE_MODEL = "glm-4-flash"
