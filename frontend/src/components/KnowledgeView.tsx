import { useState, useEffect } from 'react'
import { Database, Clock, X } from 'lucide-react'
import DragDropInput from './DragDropInput'

/** 课程配置（知识库 + 课程记忆）：居中显示、占主区域 90%、左侧列表导航，右上角可关闭 */
export default function KnowledgeView({ projectId, onClose }: { projectId: string | null; onClose: () => void }) {
  const [tab, setTab] = useState<'knowledge' | 'memory'>('knowledge')
  const [kbInput, setKbInput] = useState('')
  const [showGuide, setShowGuide] = useState(false)
  const [projectMemory, setProjectMemory] = useState('')
  const [episodicMemory, setEpisodicMemory] = useState('')
  const [dialogueSummaries, setDialogueSummaries] = useState<Array<{dialogue_id?: string; name?: string; 概要?: any}>>([])
  const defaultResources = ['书籍', '百科', '论文', '官方文档', '教程', '视频', '代码仓库', '课件/PPT']
  const [selectedResources, setSelectedResources] = useState<Set<string>>(new Set(['书籍', '官方文档']))

  // 加载课程记忆（永久化：按课程取最新一条）并解析对话概要列表
  useEffect(() => {
    if (!projectId) return
    fetch('/api/project-memory/' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json())
      .then((d) => {
        if (d && d.memory) {
          const NL = String.fromCharCode(10)
          const mem = d.memory
          let txt = ''
          if (mem.课程概述) txt += '课程概述: ' + mem.课程概述 + NL
          if (mem.当前进度) txt += '当前进度: ' + mem.当前进度 + NL
          if (mem.领域) txt += '领域: ' + mem.领域 + NL
          if (mem.背景) txt += '背景: ' + mem.背景 + NL
          if (mem.水平) txt += '水平: ' + mem.水平 + NL
          if (mem.学习目标) txt += '学习目标: ' + mem.学习目标 + NL
          if (mem.偏好 && mem.偏好.length) txt += '偏好: ' + mem.偏好.join(', ') + NL
          else if (mem.偏好 && typeof mem.偏好 === 'string') txt += '偏好: ' + mem.偏好 + NL
          if (mem.薄弱点 && mem.薄弱点.length) txt += '薄弱点: ' + mem.薄弱点.join(', ') + NL
          if (mem.兴趣 && mem.兴趣.length) txt += '兴趣: ' + mem.兴趣.join(', ') + NL
          if (txt) setEpisodicMemory(txt.trim())
          let txt2 = ''
          if (mem.知识点 && mem.知识点.length) txt2 += '知识点: ' + mem.知识点.join(', ') + NL
          if (mem.难点 && mem.难点.length) txt2 += '难点: ' + mem.难点.join(', ') + NL
          if (mem.对话摘要 && mem.对话摘要.length) {
            txt2 += '对话摘要:' + NL
            for (let i = 0; i < mem.对话摘要.length; i++) {
              txt2 += '  ' + (i + 1) + '. ' + (mem.对话摘要[i].摘要 || '') + NL
            }
          }
          // 对话概要：本课程各对话的记忆，区分显示（挂课程记忆下）
          setDialogueSummaries(mem.对话概要 || [])
          if (txt2) setProjectMemory(txt2.trim())
        }
      })
      .catch(() => {})
  }, [projectId])

  const NAV = [
    { key: 'knowledge', icon: Database, label: '知识库' },
    { key: 'memory', icon: Clock, label: '课程记忆' },
  ] as const

  return (
    <div className="flex-1 h-full min-w-0 flex items-center justify-center p-8">
      <div className="w-[90%] h-[90%] flex flex-col panel rounded-3xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#e5e5e5] flex-shrink-0">
          <h2 className="text-base font-bold flex items-center gap-2"><Database size={18} className="text-green-500" /> 课程配置</h2>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-400">{projectId ? `课程 ID: ${projectId}` : '未选择课程'}</span>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#ededed] text-gray-400 hover:text-[#1a1a1a] transition-colors" title="关闭">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex flex-1 min-h-0">
          {/* 左侧列表导航 */}
          <div className="w-44 flex-shrink-0 border-r border-[#e5e5e5] bg-[#f5f5f5] p-2 flex flex-col gap-1">
            {NAV.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-colors ${
                  tab === key ? 'bg-[#1a1a1a] text-white shadow-soft' : 'text-gray-500 hover:bg-[#ededed]'
                }`}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
          {/* 右侧内容区 */}
          <div className="flex-1 overflow-y-auto p-5">
            {tab === 'knowledge' && (
              <div className="flex flex-col gap-5">
                {/* 系统资源选择 */}
                <div className="border border-[#e5e5e5] rounded-xl p-4">
                  <h3 className="text-sm font-bold mb-2">选择系统资源</h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {defaultResources.map(r => (
                      <button key={r} onClick={() => setSelectedResources(prev => { const n = new Set(prev); n.has(r) ? n.delete(r) : n.add(r); return n })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                          selectedResources.has(r) ? 'bg-[#f0f0f0] text-[#1a1a1a] border border-[#1a1a1a]/30' : 'bg-gray-50 text-gray-500 border border-gray-200'
                        }`}>{r}</button>
                    ))}
                  </div>
                </div>
                {/* 上传资源 */}
                <div className="border border-[#e5e5e5] rounded-xl p-4">
                  <h3 className="text-sm font-bold mb-2">上传资源</h3>
                  <DragDropInput value="" onChange={() => {}} placeholder="拖拽文件到此处或点击上传" rows={1} />
                </div>
                {/* 知识库内容 */}
                <div className="border border-[#e5e5e5] rounded-xl p-4">
                  <h3 className="text-sm font-bold mb-3">输入内容</h3>
                  <DragDropInput value={kbInput} onChange={setKbInput} placeholder="输入知识库内容，或拖拽文件上传" rows={5} />
                  <div className="flex items-center gap-3 mt-3">
                    <p className="text-[11px] text-gray-400 cursor-pointer hover:text-[#1a1a1a]" onClick={() => setShowGuide(!showGuide)}>💡 我需要引导</p>
                    <button className="text-[11px] px-3 py-1.5 bg-[#1a1a1a] text-white font-semibold rounded-lg hover:bg-[#333333] transition-colors">进入知识库建立模式</button>
                  </div>
                </div>
              </div>
            )}
            {tab === 'memory' && (
              <div className="flex flex-col gap-5">
                <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50/20">
                  <h3 className="text-sm font-bold flex items-center gap-1.5 text-indigo-700 mb-2"><Clock size={14} /> 课程记忆</h3>
                  <p className="text-[10px] text-gray-400 mb-2">基于用户与AI对话内容的简要概述（≤1000字）。</p>
                  <textarea value={episodicMemory} onChange={e => setEpisodicMemory(e.target.value)}
                    placeholder="例：用户询问了LangGraph的状态管理机制……"
                    rows={8}
                    className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-xs outline-none resize-none focus:border-indigo-400 bg-white" />
                </div>
                <div className="border border-[#e5e5e5] rounded-xl p-4">
                  <h3 className="text-sm font-bold mb-2">课程上下文记忆</h3>
                  <textarea value={projectMemory} onChange={e => setProjectMemory(e.target.value)}
                    placeholder="例：本课程聚焦多智能体系统开发……"
                    rows={4}
                    className="w-full px-3 py-2 border border-[#d0d0d0] rounded-lg text-xs outline-none resize-none focus:border-[#1a1a1a] bg-[#fafafa]" />
                </div>
                {/* 对话记忆：每个对话一条，区分显示在下方 */}
                <div className="border border-[#e5e5e5] rounded-xl p-4">
                  <h3 className="text-sm font-bold mb-2">对话记忆（{dialogueSummaries.length}）</h3>
                  {dialogueSummaries.length === 0 ? (
                    <p className="text-xs text-gray-400">暂无对话记忆，新建对话并填写对话画像后生成</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {dialogueSummaries.map((ds, i) => (
                        <div key={i} className="border border-[#e5e5e5] rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold">💬 {ds.name || '对话'}</span>
                          </div>
                          {ds.概要 && (
                            <div className="text-[11px] text-gray-600 flex flex-col gap-0.5">
                              {ds.概要.topic && <span>主题：{ds.概要.topic}</span>}
                              {ds.概要.selfLevel && <span>水平：{ds.概要.selfLevel}</span>}
                              {ds.概要.target && <span>目标：{ds.概要.target}</span>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
