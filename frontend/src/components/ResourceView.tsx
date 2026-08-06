import { useState, useEffect, useCallback } from 'react'
import { Library, Sparkles, FileText, Trash2, BookOpen, Wrench, PenLine } from 'lucide-react'

interface Artifact {
  id: string
  dialogue_id: string
  dialogue_name: string
  type: string
  title: string
  content: string
  created_at: string
}

interface Resource {
  id: string
  name: string
  content?: string
}

type Tab = 'artifacts' | 'resources'

const TYPE_ICONS: Record<string, any> = {
  '定制讲义': BookOpen, '讲义': BookOpen,
  '实操指南': Wrench,
  '分阶测试题': PenLine, '测试题': PenLine,
}

/** 资源界面：生成物（讲义/实操指南/测试题）+ 已保存资料 的统一仓库 */
export default function ResourceView({ projectId }: { projectId: string | null }) {
  const [tab, setTab] = useState<Tab>('artifacts')
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    if (!projectId) return
    setLoading(true)
    fetch('/api/artifacts?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setArtifacts(d.artifacts || []))
      .catch(() => {})
      .finally(() => setLoading(false))
    fetch('/api/resources?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setResources(d.resources || []))
      .catch(() => {})
  }, [projectId])

  useEffect(() => { setSelectedId(null); load() }, [load])

  const deleteResource = (id: string) => {
    if (!window.confirm('确定删除该资料？')) return
    fetch('/api/resources/' + id, { method: 'DELETE' }).then(() => {
      setResources(prev => prev.filter(r => r.id !== id))
      if (selectedId === id) setSelectedId(null)
    })
  }

  const list: Array<{ id: string; title: string; sub: string; body: string; icon: any }> =
    tab === 'artifacts'
      ? artifacts.map(a => ({ id: a.id, title: a.title, sub: a.dialogue_name || a.created_at || '', body: a.content, icon: TYPE_ICONS[a.type] || FileText }))
      : resources.map(r => ({ id: r.id, title: r.name, sub: '保存的资料', body: r.content || '', icon: FileText }))

  const selected = list.find(i => i.id === selectedId) || null

  return (
    <div className="flex-1 h-full min-w-0 flex bg-[#ffffff] border border-[#e5e5e5] rounded-lg overflow-hidden">
      {/* 左：分类 + 列表 */}
      <div className="w-72 flex-shrink-0 border-r border-[#e5e5e5] bg-[#f5f5f5] flex flex-col">
        <div className="p-2 flex gap-1 border-b border-[#e5e5e5]">
          <button
            onClick={() => { setTab('artifacts'); setSelectedId(null) }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'artifacts' ? 'bg-[#1a1a1a] text-white' : 'text-gray-500 hover:bg-[#ededed]'
            }`}
          >
            <Sparkles size={13} /> 生成物
          </button>
          <button
            onClick={() => { setTab('resources'); setSelectedId(null) }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'resources' ? 'bg-[#1a1a1a] text-white' : 'text-gray-500 hover:bg-[#ededed]'
            }`}
          >
            <Library size={13} /> 保存的资料
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
          {loading && <p className="text-[11px] text-gray-400 text-center py-4">加载中…</p>}
          {!loading && list.length === 0 && (
            <p className="text-[11px] text-gray-400 text-center py-6">
              {tab === 'artifacts' ? '暂无生成物（对话生成讲义/指南/测试题后自动收录）' : '暂无保存的资料'}
            </p>
          )}
          {list.map(item => {
            const Icon = item.icon
            const active = item.id === selectedId
            return (
              <div
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  active ? 'bg-[#f0f0f0] text-[#1a1a1a] shadow-soft' : 'text-gray-600 hover:bg-[#ededed]'
                }`}
              >
                <Icon size={14} className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{item.title}</p>
                  <p className="text-[10px] text-gray-400 truncate">{item.sub}</p>
                </div>
                {tab === 'resources' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteResource(item.id) }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 flex-shrink-0"
                    title="删除"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
      {/* 右：预览 */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {selected ? (
          <div className="max-w-2xl mx-auto">
            <h2 className="font-display text-xl mb-1">{selected.title}</h2>
            <p className="text-[11px] text-gray-400 mb-4">{selected.sub}</p>
            <div className="text-sm leading-relaxed whitespace-pre-wrap text-gray-700">{selected.body}</div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs text-gray-400">选择左侧条目查看内容</p>
          </div>
        )}
      </div>
    </div>
  )
}
