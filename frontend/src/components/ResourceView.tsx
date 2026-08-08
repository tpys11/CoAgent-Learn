import { useState, useEffect, useCallback } from 'react'
import { BookOpen, Sparkles, Upload, FileText, Trash2, Wrench, ExternalLink, Plus, X, FolderTree, FolderOpen } from 'lucide-react'

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
  category: string
  preset?: boolean
}

type Tab = 'tutorials' | 'generated' | 'uploads'

type ListItem = {
  id: string; title: string; sub: string; body: string; icon: any
  kind: 'tutorial' | 'artifact' | 'resource' | 'kb'; url?: string
  deletable: boolean
}

const TYPE_ICONS: Record<string, any> = {
  '定制讲义': BookOpen, '讲义': BookOpen,
  '实操指南': Wrench,
  '分阶测试题': FileText, '测试题': FileText,
}

/** 领域（当前仅一个）：Agent 应用与开发 */
const DOMAIN = { key: 'agent-dev', label: 'Agent 应用与开发' }

/** 预置子分类 */
const DEFAULT_CATS = ['系统教程', '技术教程', '实践案例', '工具与框架']

/** 预置第三方教程（按子分类归位） */
const PRESET_TUTORIALS: Tutorial[] = [
  { id: 'preset-langgraph', title: 'LangGraph 官方文档', url: 'https://langchain-ai.github.io/langgraph/', desc: '多智能体工作流编排框架官方文档：StateGraph、节点、条件边', category: '工具与框架', preset: true },
  { id: 'preset-mcp', title: 'MCP 官方文档', url: 'https://modelcontextprotocol.io/', desc: 'Model Context Protocol：Agent 与外部工具连接的标准协议', category: '工具与框架', preset: true },
  { id: 'preset-deepseek', title: 'DeepSeek API 文档', url: 'https://api-docs.deepseek.com/', desc: 'DeepSeek 大模型 API 调用指南（对话补全、流式输出）', category: '技术教程', preset: true },
  { id: 'preset-python', title: 'Python 官方教程', url: 'https://docs.python.org/zh-cn/3/tutorial/', desc: 'Python 入门到进阶的官方教程（中文）', category: '系统教程', preset: true },
]

const TUTORIALS_KEY = 'coagent-tutorials'
const CATS_KEY = 'coagent-tutorial-cats'

const NAV: Array<{ key: Tab; icon: any; label: string; desc: string }> = [
  { key: 'tutorials', icon: BookOpen, label: '第三方教程', desc: '按领域与分类组织的外部学习资料' },
  { key: 'generated', icon: Sparkles, label: '我的生成', desc: 'AI 生成的讲义 / 实操指南 / 测试题' },
  { key: 'uploads', icon: Upload, label: '我的上传', desc: '知识库文档与保存的资料' },
]

/** 资源界面：hyper.ai 风格——顶部 Hero + 功能入口大按钮 + 分区卡片流（无左侧导航） */
export default function ResourceView({ projectId }: { projectId: string | null }) {
  const [tab, setTab] = useState<Tab>('tutorials')
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [kbDocs, setKbDocs] = useState<KbDoc[]>([])
  const [tutorials, setTutorials] = useState<Tutorial[]>(() => {
    try { return JSON.parse(localStorage.getItem(TUTORIALS_KEY) || '[]') } catch { return [] }
  })
  const [customCats, setCustomCats] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(CATS_KEY) || '[]') } catch { return [] }
  })
  const [selectedCat, setSelectedCat] = useState(DEFAULT_CATS[0])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<ListItem | null>(null)
  // 添加教程表单
  const [showAddTutorial, setShowAddTutorial] = useState(false)
  const [tTitle, setTTitle] = useState('')
  const [tUrl, setTUrl] = useState('')
  const [tDesc, setTDesc] = useState('')
  const [tCat, setTCat] = useState(DEFAULT_CATS[0])
  // 添加子分类
  const [showAddCat, setShowAddCat] = useState(false)
  const [newCat, setNewCat] = useState('')

  const cats = [...DEFAULT_CATS, ...customCats]

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

  useEffect(() => { setDetail(null); load() }, [load])

  // ---------- 第三方教程 ----------
  const allTutorials = [...PRESET_TUTORIALS, ...tutorials]
  const saveTutorials = (next: Tutorial[]) => {
    setTutorials(next)
    localStorage.setItem(TUTORIALS_KEY, JSON.stringify(next))
  }
  const addTutorial = () => {
    if (!tTitle.trim() || !tUrl.trim()) return
    const url = tUrl.trim().startsWith('http') ? tUrl.trim() : 'https://' + tUrl.trim()
    saveTutorials([...tutorials, { id: 't-' + Date.now(), title: tTitle.trim(), url, desc: tDesc.trim(), category: tCat }])
    setTTitle(''); setTUrl(''); setTDesc(''); setShowAddTutorial(false)
  }
  const removeTutorial = (id: string) => {
    setDetail(null)
    saveTutorials(tutorials.filter(t => t.id !== id))
  }
  const addCat = () => {
    const name = newCat.trim()
    if (!name || cats.includes(name)) return
    const next = [...customCats, name]
    setCustomCats(next)
    localStorage.setItem(CATS_KEY, JSON.stringify(next))
    setSelectedCat(name)
    setNewCat(''); setShowAddCat(false)
  }
  const removeCat = (name: string) => {
    if (!window.confirm(`确定删除分类「${name}」？该分类下的手动教程将不再显示（数据保留）。`)) return
    const next = customCats.filter(c => c !== name)
    setCustomCats(next)
    localStorage.setItem(CATS_KEY, JSON.stringify(next))
    if (selectedCat === name) setSelectedCat(DEFAULT_CATS[0])
  }

  // ---------- 我的上传 ----------
  const deleteResource = (id: string) => {
    if (!window.confirm('确定删除该资料？')) return
    fetch('/api/resources/' + id, { method: 'DELETE' }).then(() => {
      setResources(prev => prev.filter(r => r.id !== id))
      setDetail(null)
    })
  }
  const deleteKbDoc = (source: string) => {
    if (!window.confirm(`确定删除知识库文档「${source}」？`)) return
    fetch('/api/knowledge/delete?project_id=' + encodeURIComponent(projectId || 'default') + '&source=' + encodeURIComponent(source), { method: 'DELETE' })
      .then(() => {
        setKbDocs(prev => prev.filter(d => d.source !== source))
        setDetail(null)
      })
  }

  // ---------- 列表组装 ----------
  let list: ListItem[] = []
  if (tab === 'tutorials') {
    // 三级：领域 → 子分类 → 教程（旧数据无 category 时归入第一个分类）
    list = allTutorials
      .filter(t => (t.category || DEFAULT_CATS[0]) === selectedCat)
      .map(t => ({
        id: t.id, title: t.title,
        sub: t.preset ? `预置 · ${t.category}` : `手动添加 · ${t.category}`,
        body: t.desc || '暂无简介', icon: BookOpen,
        kind: 'tutorial' as const, url: t.url,
        deletable: !t.id.startsWith('preset-'),
      }))
  } else if (tab === 'generated') {
    list = artifacts.map(a => ({
      id: a.id, title: a.title, sub: a.dialogue_name || a.created_at || '',
      body: a.content, icon: TYPE_ICONS[a.type] || FileText,
      kind: 'artifact' as const, deletable: false,
    }))
  } else {
    list = [
      ...kbDocs.map(d => ({ id: 'kb:' + d.source, title: d.source, sub: `知识库文档 · ${d.chunks} 块`, body: d.preview || '（无预览内容）', icon: Upload, kind: 'kb' as const, deletable: true })),
      ...resources.map(r => ({ id: r.id, title: r.name, sub: '保存的资料', body: r.content || '', icon: FileText, kind: 'resource' as const, deletable: true })),
    ]
  }

  const removeItem = (item: ListItem) => {
    if (item.kind === 'tutorial') removeTutorial(item.id)
    else if (item.kind === 'resource') deleteResource(item.id)
    else if (item.kind === 'kb') deleteKbDoc(item.title)
  }

  /** 卡片网格（含空状态） */
  const cards = (
    <>
      {/* 区块标题行 */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            {(() => { const n = NAV.find(x => x.key === tab)!; const I = n.icon; return <><I size={18} /> {n.label}</> })()}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {tab === 'tutorials' ? `${DOMAIN.label} · ${selectedCat} · 共 ${list.length} 条` : `${NAV.find(x => x.key === tab)!.desc} · 共 ${list.length} 条`}
          </p>
        </div>
        {tab === 'tutorials' && !showAddTutorial && (
          <button
            onClick={() => { setTCat(selectedCat); setShowAddTutorial(true) }}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl hover:bg-[#333] transition-colors"
          >
            <Plus size={13} /> 添加教程
          </button>
        )}
      </div>

      {/* 添加教程表单 */}
      {showAddTutorial && (
        <div className="border border-[#d0d0d0] rounded-2xl p-3 mb-5 flex flex-col gap-2 bg-white shadow-soft">
          <input autoFocus value={tTitle} onChange={e => setTTitle(e.target.value)} placeholder="教程标题"
            className="px-3 py-2 text-xs input-surface rounded-xl outline-none" />
          <input value={tUrl} onChange={e => setTUrl(e.target.value)} placeholder="链接 URL"
            className="px-3 py-2 text-xs input-surface rounded-xl outline-none" />
          <input value={tDesc} onChange={e => setTDesc(e.target.value)} placeholder="简介（可选）"
            className="px-3 py-2 text-xs input-surface rounded-xl outline-none" />
          <select value={tCat} onChange={e => setTCat(e.target.value)}
            className="px-3 py-2 text-xs input-surface rounded-xl outline-none">
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAddTutorial(false)} className="px-3 py-1.5 text-[11px] text-gray-500 rounded-xl row-hover">取消</button>
            <button onClick={addTutorial} className="px-3 py-1.5 text-[11px] bg-[#1a1a1a] text-white font-semibold rounded-xl">保存</button>
          </div>
        </div>
      )}

      {/* 加载 / 空状态 / 卡片网格 */}
      {loading && <p className="text-xs text-gray-400 text-center py-16">加载中…</p>}
      {!loading && list.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#f2f2f2] flex items-center justify-center mb-4">
            <FolderOpen size={22} className="text-gray-400" />
          </div>
          <p className="text-sm font-semibold text-gray-500">
            {tab === 'tutorials' ? `「${selectedCat}」分类暂无教程` : tab === 'generated' ? '暂无生成物' : '暂无上传内容'}
          </p>
          <p className="text-xs text-gray-400 mt-1.5">
            {tab === 'tutorials' ? '点击右上角「添加教程」收录外部学习资料' : tab === 'generated' ? '对话生成讲义 / 指南 / 测试题后自动收录到这里' : '上传知识库文档或保存资料后将展示在这里'}
          </p>
        </div>
      )}
      {!loading && list.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {list.map(item => {
            const Icon = item.icon
            return (
              <div
                key={item.id}
                onClick={() => setDetail(item)}
                className="group card-surface rounded-2xl p-5 flex flex-col gap-3 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-[#1a1a1a]/10"
              >
                <div className="flex items-start justify-between">
                  <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1a1a1a] to-[#4a4a4a] text-white flex items-center justify-center">
                    <Icon size={17} />
                  </span>
                  <div className="flex items-center gap-1.5">
                    {item.kind === 'tutorial' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#f2f2f2] text-gray-500 flex-shrink-0">
                        {item.sub.split(' · ')[0]}
                      </span>
                    )}
                    {item.deletable && (
                      <button
                        onClick={(e) => { e.stopPropagation(); removeItem(item) }}
                        className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="删除"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm font-semibold truncate">{item.title}</p>
                <p className="text-xs text-gray-400 line-clamp-2 min-h-[2.5em]">{item.body}</p>
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-[#f2f2f2]">
                  <span className="text-[10px] text-gray-400 truncate">{item.sub.split(' · ')[1] || item.sub}</span>
                  {item.kind === 'tutorial' && item.url && (
                    <ExternalLink size={12} className="text-gray-300 group-hover:text-[#1a1a1a] transition-colors flex-shrink-0" />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )

  return (
    <div className="flex-1 h-full min-w-0 flex flex-col panel rounded-3xl overflow-hidden">
      {/* 顶部 Hero：hyper.ai 首页风格大标题 + 功能入口 */}
      <div className="flex-shrink-0 px-8 pt-7 pb-5 bg-gradient-to-br from-[#fafafc] via-white to-[#f3f4fa] border-b border-[#eef0f4]">
        <div className="max-w-6xl mx-auto">
          <p className="text-[11px] font-bold text-indigo-500 tracking-widest uppercase mb-2">Resource Center</p>
          <h1 className="text-2xl font-bold text-[#1a1a1a] leading-snug">学习、理解、实践，与社区一起构建人工智能的未来</h1>
          <p className="text-[13px] text-gray-500 mt-2">汇聚第三方教程、AI 生成物与你保存的资料，沉淀每一次学习产出</p>
          {/* 功能入口大按钮 */}
          <div className="flex flex-wrap gap-3 mt-6">
            {NAV.map(({ key, icon: Icon, label, desc }) => (
              <button
                key={key}
                onClick={() => { setTab(key); setDetail(null) }}
                className={`flex items-center gap-3 px-5 py-3 rounded-2xl border text-left transition-all ${
                  tab === key
                    ? 'border-[#1a1a1a] bg-white shadow-soft'
                    : 'border-[#e5e5e5] bg-white/70 hover:bg-white hover:shadow-soft'
                }`}
              >
                <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#1a1a1a] text-white">
                  <Icon size={15} />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block text-[11px] text-gray-400">{desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 子分类胶囊条（仅教程） */}
      {tab === 'tutorials' && (
        <div className="flex-shrink-0 px-8 py-3 border-b border-[#eef0f4] bg-white flex items-center gap-2 overflow-x-auto">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 mr-1 flex-shrink-0">
            <FolderTree size={12} /> 领域 · {DOMAIN.label}
          </span>
          {cats.map(c => (
            <div key={c} className="relative group flex-shrink-0">
              <button
                onClick={() => { setSelectedCat(c); setDetail(null) }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  selectedCat === c ? 'bg-[#1a1a1a] text-white shadow-soft' : 'bg-[#f2f2f2] text-gray-500 hover:bg-[#e8e8e8]'
                }`}
              >
                {c}
              </button>
              {customCats.includes(c) && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeCat(c) }}
                  className="hidden group-hover:flex absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white items-center justify-center shadow" title="删除分类"
                >
                  <X size={9} />
                </button>
              )}
            </div>
          ))}
          {showAddCat ? (
            <div className="flex items-center gap-1 flex-shrink-0">
              <input autoFocus value={newCat} onChange={e => setNewCat(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCat() }}
                placeholder="分类名"
                className="w-24 px-2.5 py-1.5 text-[11px] input-surface rounded-full outline-none" />
              <button onClick={addCat} className="px-2.5 py-1 text-[11px] bg-[#1a1a1a] text-white rounded-full font-semibold">添加</button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddCat(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] text-gray-400 hover:text-[#1a1a1a] rounded-full hover:bg-[#f2f2f2] transition-colors flex-shrink-0"
            >
              <Plus size={12} /> 添加分类
            </button>
          )}
        </div>
      )}

      {/* 内容区：宽卡片流 */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-6xl mx-auto">{cards}</div>
      </div>

      {/* 详情模态 */}
      {detail && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e5e5] flex-shrink-0">
              <h3 className="text-base font-bold flex items-center gap-2">
                <detail.icon size={16} /> {detail.title}
              </h3>
              <button onClick={() => setDetail(null)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-[11px] text-gray-400 mb-3">{detail.sub}</p>
              <div className="text-sm leading-relaxed whitespace-pre-wrap text-gray-700">{detail.body}</div>
            </div>
            <div className="flex gap-2 justify-between items-center px-5 py-3 border-t border-[#e5e5e5] flex-shrink-0">
              {detail.kind === 'tutorial' && detail.url ? (
                <a href={detail.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#1a1a1a] text-white text-sm font-semibold rounded-xl hover:bg-[#333] transition-colors">
                  <ExternalLink size={14} /> 打开教程
                </a>
              ) : <span />}
              {detail.deletable && (
                <button onClick={() => removeItem(detail)}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors">
                  <Trash2 size={14} /> 删除
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
