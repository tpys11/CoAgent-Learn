import { useState } from 'react'

interface Props {
  mode: 'project' | 'dialogue'
  projectName?: string
  inheritedProfile?: Record<string, any>
  onClose: () => void
  onSave: (profile: Record<string, any>) => void
}

const DOMAINS = ['智能制造', '人工智能', '软件开发', '工业互联网', '其他']
const LEVELS = ['零基础', '有基础', '熟练', '精通']
const PREFER = ['讲义讲解', '实操练习', '刷题巩固', '混合']

export default function ProfileWizard({ mode, projectName, inheritedProfile, onClose, onSave }: Props) {
  const [domain, setDomain] = useState(inheritedProfile?.domain || DOMAINS[0])
  const [background, setBackground] = useState(inheritedProfile?.background || LEVELS[0])
  const [goal, setGoal] = useState(inheritedProfile?.goal || '')
  const [prefer, setPrefer] = useState(inheritedProfile?.prefer || PREFER[3])
  const [topic, setTopic] = useState(inheritedProfile?.topic || '')
  const [selfLevel, setSelfLevel] = useState(inheritedProfile?.selfLevel || '')
  const [target, setTarget] = useState(inheritedProfile?.target || '')
  const [questionType, setQuestionType] = useState(inheritedProfile?.questionType || '基础')

  const isProject = mode === 'project'

  const save = () => {
    const p: Record<string, any> = { domain, background, prefer }
    if (isProject) { p.goal = goal } else { p.topic = topic; p.selfLevel = selfLevel || background; p.target = target; p.questionType = questionType }
    onSave(p)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-base font-bold mb-1">{isProject ? '📋 项目画像向导' : '📝 对话画像向导'}</h2>
        <p className="text-[11px] text-gray-400 mb-4">
          {isProject ? `为项目「${projectName || ''}」建立学情画像，AI 将据此调整学习内容` : '补充本次学习画像（已继承项目画像）'}
        </p>
        <div className="flex flex-col gap-3">
          {isProject && (
            <>
              <div>
                <label className="text-xs font-medium text-gray-600">① 选择领域</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {DOMAINS.map(d => (
                    <button key={d} onClick={() => setDomain(d)} className={`text-[11px] px-2.5 py-1 rounded-lg border ${domain === d ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-gray-600 border-gray-200'}`}>{d}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">② 学习背景</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {LEVELS.map(l => (
                    <button key={l} onClick={() => setBackground(l)} className={`text-[11px] px-2.5 py-1 rounded-lg border ${background === l ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-gray-600 border-gray-200'}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">③ 项目学习目标</label>
                <input value={goal} onChange={e => setGoal(e.target.value)} placeholder="如：掌握 PLC 编程，能独立完成小项目" className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1a1a1a]" />
              </div>
            </>
          )}
          {!isProject && (
            <>
              <div>
                <label className="text-xs font-medium text-gray-600">① 本次学什么</label>
                <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="如：梯形图编程" className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1a1a1a]" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">② 本次水平自评</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {LEVELS.map(l => (
                    <button key={l} onClick={() => setSelfLevel(l)} className={`text-[11px] px-2.5 py-1 rounded-lg border ${selfLevel === l ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-gray-600 border-gray-200'}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">③ 本次目标</label>
                <input value={target} onChange={e => setTarget(e.target.value)} placeholder="如：理解梯形图基本指令" className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1a1a1a]" />
              </div>
            </>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600">{isProject ? '④' : '④'} 偏好学习方式</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {PREFER.map(p => (
                <button key={p} onClick={() => setPrefer(p)} className={`text-[11px] px-2.5 py-1 rounded-lg border ${prefer === p ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-gray-600 border-gray-200'}`}>{p}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="text-xs px-3 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg">跳过</button>
          <button onClick={save} className="text-xs px-4 py-1.5 bg-[#1a1a1a] text-white font-semibold rounded-lg hover:bg-[#333333]">保存画像</button>
        </div>
      </div>
    </div>
  )
}
