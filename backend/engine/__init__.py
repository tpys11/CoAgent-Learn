# -*- coding: utf-8 -*-
"""v2 对话引擎（新核心逻辑，替代旧 LangGraph 编排）。

设计稿：《挂帅/新引擎设计稿v1.md》。
不变量：SSE 八类帧契约冻结；ChatRequest 不变；数据层 repo 沿用。
Loop 进度：L1 骨架（Intake最小 + Generate直连 + 帧泵 + CHAT_ENGINE flag）。
"""
