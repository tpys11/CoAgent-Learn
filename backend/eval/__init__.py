# -*- coding: utf-8 -*-
"""评估工具包（独立目录，不进主对话链路）。

三硬指标 judge（对标官方评分 XH-202630 实用价值 30 分）：
- hallucination: 幻觉率 <5%   —— 双通道（程序验引用为主，LLM 异厂商判卷为辅）
- fit:           适配准确率 ≥85% —— |difficulty − level_score| ≤ 0.25 一致率
- coverage:      覆盖率 ≥90%  —— 核心知识点命中（关键词通道先行，语义通道接缝预留）

设计原则：judge 全部为纯函数（可离线单测）；LLM 依赖只经显式注入的 judge_llm 接缝；
数据格式见 data/README.md；统一入口 run_eval.py。
"""
