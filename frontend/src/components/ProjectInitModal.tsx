import { useState } from 'react'
import { X, Upload, BookOpen, Check, FileText } from 'lucide-react'

interface Props {
  projectName: string
  onConfirm: (settings: InitSettings) => void
  onCancel: () => void
}

export interface InitSettings {
  selectedResources: string[]
  uploadedFiles: File[]
  systemMemory: string
}

const DEFAULT_RESOURCES = [
  { id: 'books', name: '书籍' },
  { id: 'encyclopedia', name: '百科' },
  { id: 'papers', name: '论文' },
  { id: 'docs', name: '官方文档' },
  { id: 'tutorials', name: '教程' },
  { id: 'videos', name: '视频' },
]

export function ProjectInitModal({ projectName, onConfirm, onCancel }: Props) {
  const [step, setStep] = useState<'select' | 'memory'>('select')
  const [selectedResources, setSelectedResources] = useState<Set<string>>(new Set())
  const [customResource, setCustomResource] = useState('')
  const [customResources, setCustomResources] = useState<string[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [systemMemory, setSystemMemory] = useState('')

  const toggleResource = (id: string) => {
    setSelectedResources(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const addCustomResource = () => {
    if (!customResource.trim()) return
    setCustomResources(prev => [...prev, customResource.trim()])
    setCustomResource('')
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setUploadedFiles(prev => [...prev, ...files])
  }

  const handleConfirm = () => {
    onConfirm({
      selectedResources: [...selectedResources, ...customResources],
      uploadedFiles,
      systemMemory,
    })
  }

  if (step === 'memory') {
    return (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl mx-4 p-6" onMouseDown={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Agent 系统记忆</h2>
            <button onClick={onCancel} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
          </div>
          <p className="text-sm text-gray-500 mb-4">为「{projectName}」设定 Agent 的系统级记忆，用于后续对话。</p>
          <textarea value={systemMemory} onChange={e => setSystemMemory(e.target.value)}
            placeholder="输入系统记忆内容，例如：这是一个面向多智能体系统开发的学习项目，用户需要掌握LangGraph、MCP等框架..."
            rows={6}
            className="w-full px-3 py-2 border border-[#d0d0d0] rounded-lg text-sm outline-none resize-none focus:border-[#1a1a1a] bg-[#fafafa]" />
          <div className="flex gap-2 justify-end mt-4">
            <button onClick={() => setStep('select')} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">上一步</button>
            <button onClick={handleConfirm} className="px-5 py-2 bg-[#1a1a1a] text-white text-sm font-semibold rounded-lg hover:bg-[#333333]">
              <span className="flex items-center gap-1.5"><Check size={15} /> 确认并初始化</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl mx-4" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e5e5]">
          <h2 className="text-base font-bold flex items-center gap-2"><BookOpen size={18} /> 项目初始化 — {projectName}</h2>
          <button onClick={onCancel} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Upload size={13} /> 选择资源类型
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {DEFAULT_RESOURCES.map(r => {
                const sel = selectedResources.has(r.id)
                return (
                  <button key={r.id} onClick={() => toggleResource(r.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      sel ? 'bg-[#f0f0f0] text-[#1a1a1a] border border-[#1a1a1a]/30' : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                    }`}>{r.name}</button>
                )
              })}
            </div>
            {/* Custom resource add */}
            <div className="flex gap-1.5 mb-2">
              <input value={customResource} onChange={e => setCustomResource(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustomResource()}
                placeholder="自定义资源名称" className="flex-1 px-2 py-1 text-[11px] border border-[#d0d0d0] rounded outline-none focus:border-[#1a1a1a]" />
              <button onClick={addCustomResource} className="px-2 py-1 text-[11px] bg-[#1a1a1a] text-white rounded font-medium">添加</button>
            </div>
            {customResources.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {customResources.map(name => (
                  <span key={name} className="inline-flex items-center gap-1 text-[11px] bg-[#f0f0f0] border border-[#1a1a1a]/20 rounded px-2 py-0.5">
                    {name}
                    <button onClick={() => setCustomResources(prev => prev.filter(n => n !== name))} className="hover:text-red-500"><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <FileText size={13} /> 上传资源文件
            </label>
            <input type="file" multiple onChange={handleFileUpload}
              className="text-xs" />
            {uploadedFiles.length > 0 && (
              <div className="mt-2 text-[11px] text-gray-500">
                已选择 {uploadedFiles.length} 个文件：{uploadedFiles.map(f => f.name).join(', ')}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-[#e5e5e5] flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">取消</button>
          <button onClick={() => setStep('memory')} className="px-5 py-2 bg-[#1a1a1a] text-white text-sm font-semibold rounded-lg hover:bg-[#333333]">下一步：系统记忆</button>
        </div>
      </div>
    </div>
  )
}

/** 项目初始化完整页面 — 确认后进入 */
export function ProjectInitPage({ projectName, settings, onComplete }: {
  projectName: string
  settings: InitSettings
  onComplete: () => void
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check size={32} className="text-green-500" />
        </div>
        <h2 className="text-xl font-bold mb-2">{projectName} — 项目初始化</h2>
        <p className="text-sm text-gray-500 mb-6">项目已成功初始化。以下资源已配置：</p>

        <div className="bg-[#f5f5f5] rounded-xl p-4 text-left text-sm mb-6 space-y-3">
          {settings.selectedResources.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-gray-500">资源类型：</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {settings.selectedResources.map(r => (
                  <span key={r} className="text-xs bg-white border border-[#e5e5e5] rounded px-2 py-0.5">{r}</span>
                ))}
              </div>
            </div>
          )}
          {settings.uploadedFiles.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-gray-500">上传文件：</span>
              <span className="text-xs text-gray-600 ml-1">{settings.uploadedFiles.length} 个文件</span>
            </div>
          )}
          {settings.systemMemory && (
            <div>
              <span className="text-xs font-semibold text-gray-500">系统记忆：</span>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">{settings.systemMemory}</p>
            </div>
          )}
        </div>

        <button onClick={onComplete}
          className="px-6 py-3 bg-[#1a1a1a] text-white font-semibold rounded-lg hover:bg-[#333333] transition-colors">
          开始对话
        </button>
      </div>
    </div>
  )
}
