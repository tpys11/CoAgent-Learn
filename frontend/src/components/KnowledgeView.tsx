import { useState, useEffect } from 'react'
import { Database, Clock, X } from 'lucide-react'
import DragDropInput from './DragDropInput'
import MemoryBox from './memoryView/MemoryBox'
import { api } from '../api'

/** 课程配置（知识库 + 课程记忆）：居中显示、占主区域 90%、左侧列表导航，右上角可关闭 */
export default function KnowledgeView({ projectId, onClose }: { projectId: string | null; onClose: () => void }) {
  const [tab, setTab] = useState<'knowledge' | 'memory'>('knowledge')
  const [kbInput, setKbInput] = useState('')
  const [showGuide, setShowGuide] = useState(false)
  // F12-S3：课程记忆改用与记忆界面/项目配置弹窗同一渲染组件（MemoryBox 单框），废弃本页自拼文本假编辑
  const [mem, setMem] = useState<Record<string, any>>({})
  const [dialogueSummaries, setDialogueSummaries] = useState<Array<{dialogue_id?: string; name?: string; 概要?: any}>>([])
  const defaultResources = ['书籍', '百科', '论文', '官方文档', '教程', '视频', '代码仓库', '课件/PPT']
  const [selectedResources, setSelectedResources] = useState<Set<string>>(new Set(['书籍', '官方文档']))

  // 加载课程记忆（原始 dict 直供 MemoryBox，键值合并保存与记忆界面同一条写路径）
  useEffect(() => {
    if (!projectId) return
    api.getProjectMemory(projectId)
      .then((d) => {
        const m = (d && d.memory) || {}
        setMem(m)
        setDialogueSummaries(m.对话概要 || [])
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
                  <p className="text-[10px] text-gray-400 mb-2">与记忆界面同源的单一记忆框：要点回车即存（键值合并保存）。</p>
                  {/* F12-S3：三处统一——同一 MemoryBox 单框渲染与编辑持久化 */}
                  <MemoryBox memory={mem} onSave={profile => { if (projectId) api.saveProjectMemory(projectId, profile) }} />
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
