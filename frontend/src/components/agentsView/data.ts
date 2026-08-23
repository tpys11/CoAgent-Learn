import type { AgentConfig } from '../../types'
import { DEFAULT_AGENTS } from '../../types'
import { Settings, Layers, LayoutTemplate } from 'lucide-react'

export interface SkillInfo { name: string; description: string; folder: string }

export type Block = 'agents' | 'skills' | 'templates'

/** 预设档位库（极速 / 思考 / 研究），intro=档位概述，detail=预设内部细节（只读展示） */
export const PRESET_TEMPLATES: Array<{ name: string; desc: string; intro: string; detail: Array<[string, string]>; agents: AgentConfig[] }> = [
  {
    name: '极速', desc: '最短响应（1 秒内首字）',
    intro: '档位概述：面向一般对话环节——概念确认、即兴提问、碎片化学习，用户希望时间尽可能短。\n**效果**\n- 时间：绝大多数时候 1 秒内输出首字，最长不超过 3 秒\n- 内容总量：字数偏少，大多数 500-800 字，最多不超过 1000 字',
    detail: [
      ['编排流程', '学习助手（快模型）→ 输出（跳过审核）'],
      ['检索方法', '只有基础文字检索，并在生成内容前默认检索一次（不做图片跨模态检索）'],
      ['生成模型', '快模型（flash，保 1 秒内首字）'],
      ['检测机制', '无（跳过审核保秒回）'],
    ],
    agents: DEFAULT_AGENTS.map(a => a.id === 'main' ? { ...a, model: 'fast' } : { ...a }),
  },
  {
    name: '思考', desc: '完整流程 + 轻量单审',
    intro: '档位概述：面向需要认真一点的回答——知识库无对应内容但对精确度要求不高。\n**效果**\n- 内容增强：联网搜索一轮（搜索机制见全局设定）\n- 内容总量：大部分 800-1200 字，最多不超过 1500 字\n- 检测机制：flash 轻量单审',
    detail: [
      ['编排流程', '规划 → 知识库检索 → 生成 → flash 单审 → 输出（学情画像：后台文档注入）'],
      ['检索方法', '主动检索一次：文字检索 + 图片跨模态检索（Qwen3-VL）'],
      ['内容增强', '按需联网搜索（学习助手判定并派发搜索子 Agent）+ 子 Agent 整理（来源→核心观点→关键数据）'],
      ['生成模型', '强模型（质量优先）'],
      ['检测机制', 'flash 轻量单审（三维度：符实性/难度适配/规范性）'],
    ],
    agents: DEFAULT_AGENTS,
  },
  {
    name: '研究', desc: '完整流程 + 严格检测',
    intro: '档位概述：面向对内容精确度要求极高的任务——知识库无对应内容且需要严谨。\n**效果**\n- 内容增强：联网搜索可多轮（1-5 轮，每轮总结、不足续搜；多轮待实现当前一轮）\n- 内容总量：不做限制\n- 独立检测机制：用其他模型厂商的模型作为独立检测阶段（待实现，当前为 flash 单审）',
    detail: [
      ['编排流程', '规划 → 知识库检索 → 生成 → 单审 → 输出（学情画像：后台文档注入）'],
      ['检索方法', '主动检索一次：文字检索 + 图片跨模态检索（Qwen3-VL）'],
      ['内容增强', '联网搜索一轮（多轮搜索待实现：1-5 轮，每轮总结、不足续搜）'],
      ['生成模型', '强模型（质量优先）'],
      ['检测机制', 'flash 单审（其他模型厂商独立检测待实现）'],
    ],
    agents: DEFAULT_AGENTS,
  },
]

/** 全局性基础设定卡片（默认文案；用户可在前端编辑，localStorage 持久化覆盖） */
export const DEFAULT_GLOBAL_CARDS: Array<[string, string]> = [
  ['搜索机制', '固定搜索规则：优质信息源（优质社区、官方信息），并行搜索 agent 返回 10-20 条优质内容（思考/研究档共享）'],
  ['知识库管理', '后台入库（切片/向量化/图片向量）；对话中默认做一次知识库检索（极速仅文字，思考/研究含图片跨模态）'],
  ['学情画像', '后台提炼画像文档（基本情况/学习情况/阅读偏好），生成时直接注入（0 对话时间）'],
  ['上下文自动压缩', '每满 30 条后台压缩最早 30% 为会话摘要；历史细节可向量召回'],
  ['资源生成', '回答完成后模型判断适合的形式并建议（与档位无关）'],
]

/** 各模板的节点颜色深浅分布：按模板编排的基础逻辑标注各节点职责负载（0-5，越深负载越高） */
export const TEMPLATE_LEVELS: Record<string, Record<string, number>> = {
  '极速': { plan: 1, study_memory: 1, kb: 1, generate: 2, review: 1 },
  '思考': { plan: 1, study_memory: 2, kb: 3, generate: 4, review: 3 },
  '研究': { plan: 1, study_memory: 2, kb: 4, generate: 5, review: 5 },
}

/** 模型选择中文标签 */
export const MODEL_LABEL: Record<string, string> = { global: '跟随全局', main: '强模型', fast: '快模型' }

/** 推荐 Skill 市场（内置，后端已实现，勾选即在该 Agent 的 Skill 卡片中可选） */
export const MARKET_SKILLS = [
  { name: 'fetch_web', desc: '抓取指定网页内容并提取正文文本', category: '信息获取' },
  { name: 'calculator', desc: '安全计算数学表达式（幂/根/三角等）', category: '计算工具' },
  { name: 'execute_code', desc: '在受限 Python 沙箱中执行代码并返回输出', category: '开发工具' },
  { name: 'pdf_parse', desc: '解析 PDF 文件提取文本（按页）', category: '文档处理' },
  { name: 'doc_parse', desc: '解析 Word 文档提取文本（段落+表格）', category: '文档处理' },
]

/** MCP 聚合平台 */
export const MCP_PLATFORMS = [
  { name: 'mcp.so', url: 'https://mcp.so', desc: 'MCP 服务器搜索引擎' },
  { name: 'Smithery', url: 'https://smithery.ai', desc: 'MCP 服务器注册与发现平台' },
  { name: 'PulseMCP', url: 'https://www.pulsemcp.com', desc: 'MCP 服务器列表与评测' },
  { name: 'Glama', url: 'https://glama.ai/mcp/servers', desc: 'MCP 服务器目录' },
]

/** Skill 开发模板（下载用） */
export const SKILL_TEMPLATE = `# Skill 开发模板（Python）

将你的 Skill 文件夹放入后端 skills/ 目录（或上传目录）后刷新即自动注册。

skills/your_skill_name/__init__.py:

from skills import Skill

class YourSkill(Skill):
    name = "your_skill"           # 唯一标识（小写+下划线）
    description = "技能的一句话说明"  # 展示给用户与模型
    input_schema = {               # 入参说明（可选）
        "keyword": {"type": "string", "description": "参数说明"}
    }

    def execute(self, keyword="", **kwargs) -> dict:
        # 在这里实现你的能力，返回 dict
        return {"results": [{"content": f"处理 {keyword} 的结果"}], "total": 1}
`

export const SKILL_TABS: Array<{ key: string; label: string }> = [
  { key: 'installed', label: '已安装' },
  { key: 'market', label: '推荐市场' },
  { key: 'mcp', label: 'MCP 市场' },
  { key: 'dev', label: '开发者' },
]

/** 系统预设 Skill 封面图（public/skill-covers/） */
export const SKILL_COVER: Record<string, string> = {
  fetch_web: '/skill-covers/fetch-web.jpg',
  calculator: '/skill-covers/calculator.jpg',
  execute_code: '/skill-covers/execute-code.jpg',
  pdf_parse: '/skill-covers/pdf-parse.jpg',
  doc_parse: '/skill-covers/doc-parse.jpg',
}
export const coverOf = (name: string) => SKILL_COVER[name] || '/skill-covers/generic.jpg'

/** Skill 分类（已安装视图左侧栏） */
export const SKILL_CATS = [
  { key: 'all', label: '全部' },
  { key: '检索', label: '检索与信息' },
  { key: '记忆', label: '记忆与画像' },
  { key: '视觉', label: '视觉理解' },
  { key: '计算', label: '计算与执行' },
  { key: '文档', label: '文档处理' },
]
export const SKILL_CAT_MAP: Record<string, string> = {
  knowledge_retrieval: '检索', web_search: '检索', fetch_web: '检索',
  memory_ops: '记忆', user_diagnosis: '记忆',
  vision: '视觉',
  calculator: '计算', execute_code: '计算',
  pdf_parse: '文档', doc_parse: '文档',
}

export const BLOCKS: Array<{ key: Block; icon: any; label: string }> = [
  { key: 'agents', icon: Settings, label: 'Agent 管理' },
  { key: 'skills', icon: Layers, label: 'Skill 管理' },
  { key: 'templates', icon: LayoutTemplate, label: '对话' },
]
