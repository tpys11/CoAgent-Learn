import { useState, useEffect, useCallback } from 'react'
import { BookOpen, Sparkles, Upload, FileText, Trash2, Wrench, PenLine, ExternalLink, Plus } from 'lucide-react'

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

interface KbDoc {
  source: string
  chunks: number
  preview: string
}

interface Tutorial {
  id: string
  title: string
  url: string
  desc: string
  preset?: boolean
}

type Tab = 'tutorials' | 'generated' | 'uploads'

const TYPE_ICONS: Record<string, any> = {
  '定制讲义': BookOpen, '讲义': BookOpen,
  '实操指南': Wrench,
  '分阶测试题': FileText, '测试题': FileText,
}

/** 预置第三方教程 */
const PRESET_TUTORIALS: Tutorial[] = [
  { id: 'preset-langgraph', title: 'LangGraph 官方文档', url: 'https://langchain-ai.github.io/langgraph/', desc: '多智能体工作流编排框架官方文档：StateGraph、节点、条件边', preset: true },
  { id: 'preset-mcp', title: 'MCP 官方文档', url: 'https://modelcontextprotocol.io/', desc: 'Model Context Protocol：Agent 与外部工具连接的标准协议', preset: true },
  { id: 'preset-deepseek', title: 'DeepSeek API 文档', url: 'https://api-docs.deepseek.com/', desc: 'DeepSeek 大模型 API 调用指南（对话补全、流式输出）', preset: true },
  { id: 'preset-python', title: 'Python 官方教程', url: 'https://docs.python.org/zh-cn/3/tutorial/', desc: 'Python 入门到进阶的官方教程（中文）', preset: true },
]

const TUTORIALS_KEY = 'coagent-tutorials'

/** 资源界面：第三方教程 / 我的生成 / 我的上传 三类资源仓库 */
export default function ResourceView({ projectId }: { projectId: string | null }) {
  const [tab, setTab] = useState<Tab>('tutorials')
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [kbDocs, setKbDocs] = useState<KbDoc[]>([])
  const [tutorials, setTutorials] = useState<Tutorial[]>(() => {
    try { return JSON.parse(localStorage.getItem(TUTORIALS_KEY) || '[]') } catch { return [] }
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // 添加教程表单
  const [showAddTutorial, setShowAddTutorial] = useState(false)
  const [tTitle, setTTitle] = useState('')
  const [tUrl, setTUrl] = useState('')
  const [tDesc, setTDesc] = useState('')

  const load = useCallback(() => {
    if (!projectId) return
    setLoading(true)
    fetch('/api/artifacts?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json()).then(d => setArtifacts(d.artifacts || [])).catch(() => {})
    fetch('/api/resources?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json()).then(d => setResources(d.resources || [])).catch(() => {})
    fetch('/api/knowledge/list?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json()).then(d => setKbDocs(d.docs || [])).catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => { setSelectedId(null); load() }, [load])

  // ---------- 第三方教程 ----------
  const allTutorials = [...PRESET_TUTORIALS, ...tutorials]
  const saveTutorials = (next: Tutorial[]) => {
    setTutorials(next)
    localStorage.setItem(TUTORIALS_KEY, JSON.stringify(next))
  }
  const addTutorial = () => {
    if (!tTitle.trim() || !tUrl.trim()) return
    const url = tUrl.trim().startsWith('http') ? tUrl.trim() : 'https://' + tUrl.trim()
    saveTutorials([...tutorials, { id: 't-' + Date.now(), title: tTitle.trim(), url, desc: tDesc.trim() }])
    setTTitle(''); setTUrl(''); setTDesc(''); setShowAddTutorial(false)
  }
  const removeTutorial = (id: string) => saveTutorials(tutorials.filter(t => t.id !== id))

  // ---------- 我的上传（知识库文档 + 手动保存文本） ----------
  const deleteResource = (id: string) => {
    if (!window.confirm('确定删除该资料？')) return
    fetch('/api/resources/' + id, { method: 'DELETE' }).then(() => {
      setResources(prev => prev.filter(r => r.id !== id))
      if (selectedId === id) setSelectedId(null)
    })
  }
  const deleteKbDoc = (source: string) => {
    if (!window.confirm(`确定删除知识库文档「${source}」？`)) return
    const key = 'kb:' + source
    fetch('/api/knowledge/delete?project_id=' + encodeURIComponent(projectId || 'default') + '&source=' + encodeURIComponent(source), { method: 'DELETE' })
      .then(() => {
        setKbDocs(prev => prev.filter(d => d.source !== source))
        if (selectedId === key) setSelectedId(null)
      })
  }

  // ---------- 列表组装 ----------
  type ListItem = { id: string; title: string; sub: string; body: string; icon: any; kind: 'tutorial' | 'artifact' | 'resource' | 'kb'; url?: string }
  let list: ListItem[] = []
  if (tab === 'tutorials') {
    list = allTutorials.map(t => ({ id: t.id, title: t.title, sub: t.preset ? '预置教程' : '手动添加', body: t.desc || '暂无简介', icon: BookOpen, kind: 'tutorial' as const, url: t.url }))
  } else if (tab === 'generated') {
    list = artifacts.map(a => ({ id: a.id, title: a.title, sub: a.dialogue_name || a.created_at || '', body: a.content, icon: TYPE_ICONS[a.type] || FileText, kind: 'artifact' as const }))
  } else {
    list = [
      ...kbDocs.map(d => ({ id: 'kb:' + d.source, title: d.source, sub: `知识库文档 · ${d.chunks} 块`, body: d.preview || '（无预览内容）', icon: Upload, kind: 'kb' as const })),
      ...resources.map(r => ({ id: r.id, title: r.name, sub: '保存的资料', body: r.content || '', icon: FileText, kind: 'resource' as const })),
    ]
  }

  const selected = list.find(i => i.id === selectedId) || null

  return (
    <div className="flex-1 h-full min-w-0 flex panel rounded-3xl overflow-hidden">
      {/* 左：分类 + 列表 */}
      <div className="w-72 flex-shrink-0 border-r border-[#e5e5e5] bg-[#f5f5f5] flex flex-col">
        <div className="p-2 flex flex-col gap-1 border-b border-[#e5e5e5]">
          {([
            { key: 'tutorials', icon: BookOpen, label: '第三方教程' },
            { key: 'generated', icon: Sparkles, label: '我的生成' },
            { key: 'uploads', icon: Upload, label: '我的上传' },
          ] as Array<{ key: Tab; icon: any; label: string }>).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => { setTab(key); setSelectedId(null) }}
              className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === key ? 'bg-[#1a1a1a] text-white' : 'text-gray-500 hover:bg-[#ededed]'
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
          {tab === 'tutorials' && (
            <button
              onClick={() => setShowAddTutorial(true)}
              className="flex items-center justify-center gap-1.5 px-2 py-2 mb-1 rounded-lg text-xs font-semibold border border-dashed border-[#d0d0d0] text-gray-500 hover:bg-[#ededed] transition-colors"
            >
              <Plus size={13} /> 添加教程
            </button>
          )}
          {showAddTutorial && (
            <div className="border border-[#d0d0d0] rounded-xl p-2 mb-1 flex flex-col gap-1.5 bg-white">
              <input autoFocus value={tTitle} onChange={e => setTTitle(e.target.value)} placeholder="教程标题"
                className="px-2 py-1 text-[11px] input-surface rounded-lg outline-none" />
              <input value={tUrl} onChange={e => setTUrl(e.target.value)} placeholder="链接 URL"
                className="px-2 py-1 text-[11px] input-surface rounded-lg outline-none" />
              <input value={tDesc} onChange={e => setTDesc(e.target.value)} placeholder="简介（可选）"
                className="px-2 py-1 text-[11px] input-surface rounded-lg outline-none" />
              <div className="flex gap-1.5 justify-end">
                <button onClick={() => setShowAddTutorial(false)} className="px-2.5 py-1 text-[10px] text-gray-500 rounded-lg row-hover">取消</button>
                <button onClick={addTutorial} className="px-2.5 py-1 text-[10px] btn-primary font-semibold rounded-lg">保存</button>
              </div>
            </div>
          )}
          {loading && <p className="text-[11px] text-gray-400 text-center py-4">加载中…</p>}
          {!loading && list.length === 0 && (
            <p className="text-[11px] text-gray-400 text-center py-6">
              {tab === 'tutorials' ? '暂无教程，点击上方"添加教程"' : tab === 'generated' ? '暂无生成物（对话生成讲义/指南/测试题后自动收录）' : '暂无上传内容'}
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
                {item.kind === 'tutorial' && !(item.id.startsWith('preset-')) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeTutorial(item.id) }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 flex-shrink-0" title="删除教程"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
                {item.kind === 'resource' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteResource(item.id) }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 flex-shrink-0" title="删除"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
                {item.kind === 'kb' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteKbDoc(item.title) }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 flex-shrink-0" title="删除知识库文档"
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
            {selected.kind === 'tutorial' && selected.url && (
              <a
                href={selected.url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 mb-5 bg-[#1a1a1a] text-white text-sm font-semibold rounded-xl hover:bg-[#333] transition-colors"
              >
                <ExternalLink size={14} /> 打开教程
              </a>
            )}
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
