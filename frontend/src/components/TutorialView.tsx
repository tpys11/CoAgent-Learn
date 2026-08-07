import { useState } from 'react'
import { Zap, BookOpen, Compass } from 'lucide-react'

type Section = 'basic' | 'detail' | 'philosophy'

const SECTIONS: Array<{ key: Section; icon: any; label: string; desc: string }> = [
  { key: 'basic', icon: Zap, label: '基础教程', desc: '最短上手路径' },
  { key: 'detail', icon: BookOpen, label: '详细教程', desc: '功能逐项展开' },
  { key: 'philosophy', icon: Compass, label: '设计思想', desc: '核心设计要点' },
]

/** 占位条目：等用户提供正式文案后替换 */
function Placeholder({ hint }: { hint: string }) {
  return (
    <div className="border border-dashed border-[#d0d0d0] rounded-xl px-4 py-6 text-center">
      <p className="text-xs text-gray-400">{hint}</p>
    </div>
  )
}

/** 基础教程：高度格式化、最短文字承载（骨架已搭好，文案待填） */
function BasicTutorial() {
  const steps: Array<{ n: string; title: string; text: string }> = [
    { n: '01', title: '配置 API Key', text: '（待补充：一句话说明）' },
    { n: '02', title: '新建项目', text: '（待补充：一句话说明）' },
    { n: '03', title: '输入问题', text: '（待补充：一句话说明）' },
    { n: '04', title: '查看生成物', text: '（待补充：一句话说明）' },
  ]
  return (
    <div className="flex flex-col gap-2">
      {steps.map(s => (
        <div key={s.n} className="flex items-center gap-4 px-4 py-3 bg-[#fafafa] border border-[#e5e5e5] rounded-xl shadow-soft">
          <span className="text-lg font-bold text-gray-300 w-8 flex-shrink-0">{s.n}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{s.title}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.text}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

/** 详细教程：左侧列表展开，选择条目后右侧展示对应介绍 */
function DetailTutorial() {
  const [active, setActive] = useState(0)
  const blocks: Array<{ title: string; text?: string; filled?: boolean; sections?: Array<{ name: string; desc: string }> }> = [
    {
      title: '主对话界面',
      filled: true,
      sections: [
        { name: '界面概览', desc: '主对话界面是完成学习提问的主要场所：顶部为统计信息条，中部为对话消息流与思考链，底部为输入框。左侧项目树用于切换项目与对话，右侧栏提供多智能体协作流程、知识图谱与第二对话窗口。' },
        { name: '输入框 · 输入优化', desc: '控制模型提问策略：默认模式由模型自行判断是否需要追问（通常问 1-3 个问题）；详尽模式会继续追问直到信息足够；不询问模式直接按已有信息生成，适合快速提问。' },
        { name: '输入框 · 检索与搜索', desc: '知识库检索控制回答的知识来源：自由模式由模型自行决定，知识库模式优先从知识库检索；联网搜索在需要补充外部资料时启用，增强模式会寻找权威信息源。' },
        { name: '输入框 · 输出形式', desc: '结构化程度决定内容排版：低结构化以段落为主，高结构化增加列表与表格；输出格式可选完整 Markdown 文档，或以对话消息形式直接输出。' },
        { name: '输入框 · 输出内容', desc: '可控制是否展示大模型的思考链（关 / 开）；输出量决定篇幅——精简只输出核心观点、适中附带论证过程、拓展补充延伸内容；学习深度决定讲解层次——浅为基础概念、中为概念加原理、深为原理加推导与前沿。' },
      ],
    },
    { title: '多智能体工作流', text: '（待补充：Agent 画布、思考链、审核机制的说明）' },
    { title: '记忆系统', text: '（待补充：三层记忆、自动管理开关的说明）' },
    { title: '知识库与知识图谱', text: '（待补充：上传、检索、图谱交互的说明）' },
    { title: '资源界面', text: '（待补充：资料与生成物管理的说明）' },
  ]
  return (
    <div className="flex border border-[#e5e5e5] rounded-xl overflow-hidden min-h-[320px]">
      {/* 左：条目列表 */}
      <div className="w-44 flex-shrink-0 border-r border-[#e5e5e5] bg-[#f5f5f5] p-2 flex flex-col gap-1">
        {blocks.map((b, i) => (
          <button
            key={b.title}
            onClick={() => setActive(i)}
            className={`px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-colors ${
              active === i ? 'bg-[#1a1a1a] text-white shadow-soft' : 'text-gray-500 hover:bg-[#ededed]'
            }`}
          >
            {b.title}
          </button>
        ))}
      </div>
      {/* 右：对应介绍 */}
      <div className="flex-1 p-5">
        <h3 className="text-sm font-bold mb-3">{blocks[active].title}</h3>
        {blocks[active].filled && blocks[active].sections ? (
          <div className="flex flex-col gap-4">
            {blocks[active].sections.map(sec => (
              <div key={sec.name}>
                <h4 className="text-xs font-bold mb-1">{sec.name}</h4>
                <p className="text-xs text-gray-600 leading-relaxed">{sec.desc}</p>
              </div>
            ))}
          </div>
        ) : (
          <Placeholder hint={blocks[active].text || ''} />
        )}
      </div>
    </div>
  )
}

/** 设计哲学：抽象为几个要点，每个功能是要点的展开（骨架，文案待填） */
function DesignPhilosophy() {
  const points = [
    { title: '要点一（待命名）', text: '（待补充：核心设计思想，及各功能如何作为该要点的展开）' },
    { title: '要点二（待命名）', text: '（待补充）' },
    { title: '要点三（待命名）', text: '（待补充）' },
  ]
  return (
    <div className="flex flex-col gap-3">
      {points.map((p, i) => (
        <div key={i} className="px-4 py-3 bg-[#fafafa] border border-[#e5e5e5] rounded-xl shadow-soft">
          <p className="text-sm font-semibold mb-1">{p.title}</p>
          <p className="text-xs text-gray-400 leading-relaxed">{p.text}</p>
        </div>
      ))}
    </div>
  )
}

/** 教程与设计思想：全屏界面 */
export default function TutorialView() {
  const [section, setSection] = useState<Section>('basic')
  return (
    <div className="flex-1 h-full min-w-0 flex panel rounded-3xl overflow-hidden">
      {/* 节导航 */}
      <div className="w-52 flex-shrink-0 border-r border-[#e5e5e5] bg-[#f5f5f5] py-3 px-2 flex flex-col gap-1">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">教程与设计思想</p>
        {SECTIONS.map(({ key, icon: Icon, label, desc }) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all ${
              section === key ? 'bg-[#f0f0f0] text-[#1a1a1a]' : 'text-gray-500 hover:bg-[#ededed]'
            }`}
          >
            <Icon size={16} className="flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold">{label}</p>
              <p className="text-[10px] text-gray-400">{desc}</p>
            </div>
          </button>
        ))}
      </div>
      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-display text-xl mb-5">{SECTIONS.find(s => s.key === section)?.label}</h2>
          {section === 'basic' && <BasicTutorial />}
          {section === 'detail' && <DetailTutorial />}
          {section === 'philosophy' && <DesignPhilosophy />}
        </div>
      </div>
    </div>
  )
}
