import { useState } from 'react'
import { X, Sparkles } from 'lucide-react'

/** 快速使用引导（静态项目教程）：HomeView 左上角「快速引导」点击弹出 */
const GUIDE_SECTIONS: Array<{ icon: string; title: string; lines: string[] }> = [
  { icon: '🏠', title: '主页与课程', lines: [
    '新建课程：点右下角「新建课程」卡片，创建你的专属学习课程（可命名/传资料/定目标）。',
    '进入课程：点课程卡片进入对话界面；卡片上的进度条/进度语会随学习更新。',
    '改名 / 删除：课程卡上「✎」改名、「✕」删除（删除会连带课程记忆）。',
  ]},
  { icon: '💬', title: '对话与多智能体', lines: [
    '直接发消息提问；系统由 学情诊断 → 知识库检索 → 领域生成 → 交叉审核 多智能体协同回答。',
    '右侧「执行过程」可展开/收起多 Agent 思考与调度过程（AgentFlow）。',
    '回答引用知识库时带 [来源:...]，点击可跳转原文出处。',
  ]},
  { icon: '📚', title: '资源与知识库', lines: [
    '在课程侧栏「资源」上传文档（md/txt/pdf/word/ppt），或从系统预设资源加入课程。',
    '上传后系统会切块入库，回答基于你的资料生成，更贴合课程、更少幻觉。',
  ]},
  { icon: '🧠', title: '记忆系统', lines: [
    '侧栏「记忆」查看 个人全局画像（你的背景/偏好/学习情况）与各课程记忆。',
    '记忆由 AI 在对话后自动沉淀更新，课程间按关联度共享。',
  ]},
  { icon: '📊', title: '特殊形式输出', lines: [
    '右侧「特殊形式输出」可将当前对话一键生成 总结/报告/流程图/树状图/表格/测试题 等。',
    '测试题可直接作答，答对答错会反馈到学情（答错自动降维、连对进阶）。',
  ]},
  { icon: '🗂', title: '本地文档与其他', lines: [
    '「本地文档」可导入本地资料阅读；右侧还有 知识图谱 / 第二对话 等工具。',
  ]},
]

/** 顶部导航快速指引：一行一行简短使用步骤 */
const QUICK_STEPS = [
  '1. 新建课程 → 2. 上传课程资料 → 3. 开始提问学习 → 4. 做测试题检验 → 5. 看记忆与报告追踪进度',
]

export default function GuideModal({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState(0)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-[640px] max-w-[92vw] max-h-[86vh] flex flex-col rounded-3xl bg-white shadow-2xl border hairline overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b hairline bg-[var(--bg-panel)]">
          <div className="flex items-center gap-2.5">
            <Sparkles size={16} />
            <h2 className="text-base font-bold">快速使用引导</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-dim hover:bg-[var(--bg-hover)] transition-colors" title="关闭">
            <X size={16} />
          </button>
        </div>
        {/* 快速步骤（顶部一条线） */}
        <div className="px-6 pt-3">
          <p className="text-[11px] leading-relaxed text-[var(--text-muted)] bg-[var(--bg-panel)] border hairline rounded-xl px-3.5 py-2.5">{QUICK_STEPS[0]}</p>
        </div>
        {/* 分节：左侧目录 + 右侧内容 */}
        <div className="flex-1 min-h-0 flex px-6 py-4 gap-4">
          <div className="w-[150px] flex-shrink-0 flex flex-col gap-0.5 overflow-y-auto">
            {GUIDE_SECTIONS.map((s, i) => (
              <button key={s.title} onClick={() => setActive(i)}
                className={`px-3 py-2 rounded-xl text-left text-xs font-medium transition-colors ${active === i ? 'bg-[#1a1a1a] text-white' : 'text-dim hover:bg-[var(--bg-hover)]'}`}>
                <span className="mr-1.5">{s.icon}</span>{s.title}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="border hairline rounded-2xl p-4 bg-[var(--bg-panel)] flex flex-col gap-2">
              <h3 className="text-sm font-bold flex items-center gap-2"><span>{GUIDE_SECTIONS[active].icon}</span>{GUIDE_SECTIONS[active].title}</h3>
              {GUIDE_SECTIONS[active].lines.map((ln, i) => (
                <p key={i} className="text-[11px] leading-relaxed text-[var(--text-muted)]">{ln}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
