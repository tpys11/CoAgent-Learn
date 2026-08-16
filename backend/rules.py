# -*- coding: utf-8 -*-
"""对话流程全局固定规则（与前端"对话→全局性基础设定"界面文案对齐的单一事实源）

前端「对话」界面把以下内容列为「全局性基础设定（所有模式共有）」：
搜索机制 / 知识库管理 / 学情画像 / 上下文自动压缩 / 资源生成。
这里的常量被 prompts.py（规划/生成提示词）与 skills 引用，保证「界面说明 = 实际执行」。
"""

# 会话摘要（上下文自动压缩）规则
SESSION_SUMMARY = (
    "会话摘要要求（500-800字）：保留用户明确的偏好/背景/目标（身份、学习方式、阅读偏好……）、"
    "事实性信息（学过的知识点、结论、决定）、用户明确说'记住/重要/下次'的内容、对话脉络（问了什么、解决了什么）；"
    "不保留寒暄、重复、修正过程、已被后续覆盖的旧信息。"
)

# 搜索机制（全局设定文案）：优质信息源 + 并行搜索返回 10-20 条优质内容
FIXED_SEARCH_RULES = (
    "联网搜索固定规则：优先返回优质信息源（优质社区、官方信息），"
    "并行执行多个搜索查询并汇总去重，最终返回 10-20 条优质结果供参考。"
)

# 优质信息源域名池（web_search skill 排序时对命中优质源的条目加分置顶）
QUALITY_SOURCE_POOL = [
    "arxiv.org", "stanford.edu", "mit.edu", "berkeley.edu", "cmu.edu",
    "github.com", "stackoverflow.com", "wikipedia.org", "python.org",
    "docs.python.org", "developer.mozilla.org", "react.dev", "vuejs.org",
    "deepseek.com", "openai.com", "anthropic.com", "tensorflow.org",
    "pytorch.org", "scikit-learn.org", "nature.com", "ieee.org",
    "acm.org", "springer.com", "sciencedirect.com", "researchgate.net",
    "cnblogs.com", "zhihu.com", "juejin.cn", "csdn.net",
]
