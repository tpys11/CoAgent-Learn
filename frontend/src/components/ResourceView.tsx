import { useState, useEffect, useCallback } from 'react'
import { BookOpen, Sparkles, Upload, FileText, Trash2, Wrench, Plus, FolderTree, Library, ExternalLink, Download } from 'lucide-react'
import { LS, lsGet, lsGetJSON, lsSetJSON } from '../storage'
import { api } from '../api'
import { WIKI_ENTRIES, WikiEntry } from '../data/wikiEntries'
import { Tab, ListItem, TYPE_ICONS, fmtTime, exportItem } from './resource/commons'
import { ResourceCardGrid, ResourceEmpty } from './resource/ResourceCardGrid'
import { ResourceDetailModal } from './resource/ResourceDetailModal'
import { UploadPanel } from './resource/UploadPanel'

interface Artifact {
  id: string
  dialogue_id: string
  dialogue_name: string
  type: string
  title: string
  content: string
  created_at: string
}

interface Tutorial {
  id: string
  title: string
  url: string
  desc: string
  category: string
  domain?: string
  preset?: boolean
}

/** 领域：系统预设，不可增删（教程资源为预设内容，手动添加仅限我的上传） */
const DEFAULT_DOMAINS = ['Agent 应用与开发', 'Python 编程']

/** 领域小方框配色：按名称稳定取一组柔和色调（浅底 + 彩色文字 + 彩色边框） */
const DOMAIN_PALETTE = [
  { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', hover: 'hover:bg-blue-100', active: 'bg-blue-600' },
  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', hover: 'hover:bg-emerald-100', active: 'bg-emerald-600' },
  { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', hover: 'hover:bg-amber-100', active: 'bg-amber-500' },
  { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', hover: 'hover:bg-violet-100', active: 'bg-violet-600' },
  { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', hover: 'hover:bg-rose-100', active: 'bg-rose-600' },
  { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', hover: 'hover:bg-cyan-100', active: 'bg-cyan-600' },
  { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', hover: 'hover:bg-orange-100', active: 'bg-orange-500' },
  { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', hover: 'hover:bg-teal-100', active: 'bg-teal-600' },
]
const domainColor = (name: string) => {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return DOMAIN_PALETTE[h % DOMAIN_PALETTE.length]
}

/** 分类：固定三类 */
const CATEGORIES: Array<{ key: string; desc: string }> = [
  { key: '系统学习', desc: '入门路线与系统性教程' },
  { key: '技术工具', desc: '框架、协议与 API 文档' },
  { key: '百科词条', desc: '名词速览与深入介绍' },
]
const WIKI_CAT = '百科词条'

/** 分类图标（竖向展开列表用） */
const CAT_ICONS: Record<string, any> = { '系统学习': BookOpen, '技术工具': Wrench, '百科词条': Library }

/** 旧数据分类名 → 新三类 */
const LEGACY_CAT_MAP: Record<string, string> = {
  '系统教程': '系统学习', '技术教程': '系统学习', '实践案例': '系统学习',
  '工具与框架': '技术工具',
}
const normalizeCat = (c?: string) => (c && LEGACY_CAT_MAP[c]) || c || CATEGORIES[0].key

/** 预置第三方教程（领域 + 分类归位） */
const PRESET_TUTORIALS: Tutorial[] = [
  { id: 'preset-hello-agent', title: 'Hello Agent 入门教程', url: '', desc: 'GitHub 上的 Hello Agent 经典入门课程：从零理解并搭建一个 Agent 的最小实现（链接待补充）', category: '系统学习', domain: 'Agent 应用与开发', preset: true },
  { id: 'preset-libo-jie', title: '李博杰的教程', url: 'https://bojieli.github.io/ai-agent-book/#_3', desc: '系统性 AI / 智能体学习教程（李博杰 · AI Agent 实战课），覆盖从基础到实践的学习路线', category: '系统学习', domain: 'Agent 应用与开发', preset: true },
  { id: 'preset-langgraph', title: 'LangGraph 官方文档', url: 'https://langchain-ai.github.io/langgraph/', desc: '多智能体工作流编排框架官方文档：StateGraph、节点、条件边', category: '技术工具', domain: 'Agent 应用与开发', preset: true },
  { id: 'preset-mcp', title: 'MCP 官方文档', url: 'https://modelcontextprotocol.io/', desc: 'Model Context Protocol：Agent 与外部工具连接的标准协议', category: '技术工具', domain: 'Agent 应用与开发', preset: true },
  { id: 'preset-deepseek', title: 'DeepSeek API 文档', url: 'https://api-docs.deepseek.com/', desc: 'DeepSeek 大模型 API 调用指南（对话补全、流式输出）', category: '技术工具', domain: 'Agent 应用与开发', preset: true },
  { id: 'preset-python', title: 'Python 官方教程', url: 'https://docs.python.org/zh-cn/3/tutorial/', desc: 'Python 入门到进阶的官方教程（中文）', category: '系统学习', domain: 'Python 编程', preset: true },
  { id: 'preset-fastapi', title: 'FastAPI 官方文档', url: 'https://fastapi.tiangolo.com/zh/', desc: 'Python 异步 Web 框架官方文档：构建 API 与后端服务', category: '技术工具', domain: 'Python 编程', preset: true },
]

/** 我的生成：预设分类（按生成物类型匹配） */
const GEN_CATS = [
  { key: 'all', label: '全部' },
  { key: '讲义', label: '讲义' },
  { key: '实操指南', label: '实操指南' },
  { key: '测试题', label: '测试题' },
]
const GEN_MATCH: Record<string, string[]> = { '讲义': ['讲义'], '实操指南': ['实操指南'], '测试题': ['测试题'] }

/** 资源界面：hyper.ai 风格——顶部 Hero + 领域/分类选择 + 分区卡片流（配色跟随主题变量） */
export default function ResourceView({ projectId, onUseItem, refreshSignal }: { projectId: string | null; onUseItem?: (title: string, body: string, url?: string) => void; refreshSignal?: number }) {
  const [tab, setTab] = useState<Tab>('tutorials')
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [genProjects, setGenProjects] = useState<Array<{ id: string; name: string }>>([])
  const [selGenProject, setSelGenProject] = useState<string>('')
  const [tutorials, setTutorials] = useState<Tutorial[]>(() => {
    return lsGetJSON<Tutorial[]>(LS.tutorials, [])
  })
  // 领域：系统预设 + 自定义（localStorage 持久化）
  const [customDomains, setCustomDomains] = useState<string[]>(() => {
    return lsGetJSON<string[]>(LS.domains, [])
  })
  const domains = [...DEFAULT_DOMAINS, ...customDomains]
  const [selectedDomain, setSelectedDomain] = useState(DEFAULT_DOMAINS[0])
  // 自定义百科词条（新建领域 AI 生成后存 localStorage）
  const [customWiki, setCustomWiki] = useState<WikiEntry[]>(() => {
    return lsGetJSON<WikiEntry[]>(LS.customWiki, [])
  })
  // 新建领域
  const [showNewDomain, setShowNewDomain] = useState(false)
  const [newDomainName, setNewDomainName] = useState('')
  const [newDomainLoading, setNewDomainLoading] = useState(false)
  // 分类（固定三类）
  const [selectedCat, setSelectedCat] = useState(CATEGORIES[0].key)
  // 百科：主题筛选（顶部按钮）
  const [wikiTheme, setWikiTheme] = useState('all')
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<ListItem | null>(null)
  // 我的生成：分类
  const [genCat, setGenCat] = useState('all')

  const load = useCallback(() => {
    setLoading(true)
    // 我的生成：按选中项目加载
    const gpid = selGenProject || projectId || ''
    if (gpid) {
      api.listArtifacts(gpid)
        .then(d => setArtifacts(d.artifacts || [])).catch(() => {})
    }
    setTimeout(() => setLoading(false), 200)
  }, [projectId, selGenProject])

  useEffect(() => { setDetail(null); load() }, [load])
  useEffect(() => { if (refreshSignal) load() }, [refreshSignal])

  useEffect(() => {
    api.listProjects().then(d => {
      const ps = (d.projects || []).map((p: any) => ({ id: p.id, name: p.name }))
      setGenProjects(ps)
      if (!selGenProject && ps.length) setSelGenProject(projectId || ps[0].id)
    }).catch(() => {})
  }, [])

  // 教程资源
  const allTutorials = [...PRESET_TUTORIALS, ...tutorials]
  const saveTutorials = (next: Tutorial[]) => {
    setTutorials(next)
    lsSetJSON(LS.tutorials, next)
  }
  const removeTutorial = (id: string) => {
    setDetail(null)
    saveTutorials(tutorials.filter(t => t.id !== id))
  }

  // 新建领域：调后端 AI 生成该领域的教程 + 百科词条，存 localStorage
  const createDomain = async () => {
    const name = newDomainName.trim()
    if (!name) return
    if (domains.includes(name)) { alert('该领域已存在'); return }
    setNewDomainLoading(true)
    try {
      const d = await api.generateDomain({ domain: name, api_key: lsGet(LS.apiKey, '') })
      if (d.status === 'ok') {
        const nt = (d.tutorials || []).map((t: any) => ({ ...t, id: 'dom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), domain: name, preset: false }))
        const nw = (d.wiki || []).map((w: any) => ({ ...w, domain: name }))
        const nextT = [...tutorials, ...nt]
        const nextW = [...customWiki, ...nw]
        saveTutorials(nextT)
        setCustomWiki(nextW)
        lsSetJSON(LS.customWiki, nextW)
        const nextDomains = [...customDomains, name]
        setCustomDomains(nextDomains)
        lsSetJSON(LS.domains, nextDomains)
        setSelectedDomain(name)
        setSelectedCat(CATEGORIES[0].key)
        setNewDomainName('')
        setShowNewDomain(false)
      } else {
        alert('生成失败：' + (d.msg || '请检查 API Key'))
      }
    } catch (e) {
      alert('生成失败：' + e)
    } finally {
      setNewDomainLoading(false)
    }
  }

  // ---------- 列表组装 ----------
  // 当前领域 + 当前分类下的教程
  const domainTutorials = allTutorials.filter(t => (t.domain || DEFAULT_DOMAINS[0]) === selectedDomain)
  const catTutorials = domainTutorials.filter(t => normalizeCat(t.category) === selectedCat)
  const tutorialList: ListItem[] = catTutorials.map(t => ({
    id: t.id, title: t.title,
    sub: '',
    time: '',
    body: t.desc || '暂无简介', icon: BookOpen,
    kind: 'tutorial' as const, url: t.url,
    deletable: !t.id.startsWith('preset-'),
  }))

  // 百科词条（当前领域）
  const wikiEntries = [...WIKI_ENTRIES, ...customWiki].filter(w => w.domain === selectedDomain)
  const wikiThemes = Array.from(new Set(wikiEntries.map(w => w.theme)))
  const filteredWiki = wikiTheme === 'all' ? wikiEntries : wikiEntries.filter(w => w.theme === wikiTheme)

  let list: ListItem[] = []
  if (tab === 'generated') {
    const matched = artifacts.filter(a => {
      if (genCat === 'all') return true
      const keys = GEN_MATCH[genCat] || []
      return keys.some(k => String(a.type).includes(k))
    })
    list = matched.map(a => ({
      id: a.id, title: a.title, sub: a.dialogue_name ? `来自「${a.dialogue_name}」` : '对话生成',
      body: a.content, icon: TYPE_ICONS[a.type] || FileText,
      kind: 'artifact' as const, deletable: false, time: fmtTime(a.created_at),
    }))
  }

  const removeItem = (item: ListItem) => {
    if (item.kind === 'tutorial') removeTutorial(item.id)
  }

  /** 教程资源区（系统学习 / 技术工具） */
  const tutorialSection = (
    <>
      <div className="flex items-end justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FolderTree size={18} /> {selectedDomain} · {selectedCat}
          </h2>
        </div>
      </div>

      {loading && <p className="text-xs text-dim text-center py-16">加载中…</p>}
      {!loading && tutorialList.length === 0 && <ResourceEmpty title={`「${selectedCat}」暂无教程`} hint="教程资源为系统预设内容" />}
      {!loading && tutorialList.length > 0 && (
        <ResourceCardGrid items={tutorialList} onOpen={setDetail} onUseItem={onUseItem}
          onDelete={removeItem} onExport={exportItem} />
      )}
    </>
  )

  /** 百科区：顶部主题筛选按钮 + 词条卡片（带百度百科链接） */
  const wikiSection = (
    <>
      <div className="flex items-end justify-between mb-5">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Library size={18} /> {selectedDomain} · 百科词条
        </h2>
      </div>
      {/* 主题筛选按钮（顶部排开） */}
      <div className="flex gap-2 flex-wrap mb-6">
        <button onClick={() => setWikiTheme('all')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
            wikiTheme === 'all' ? 'bg-[#1a1a1a] text-white shadow-soft' : 'bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)]'
          }`}>全部</button>
        {wikiThemes.map(theme => (
          <button key={theme} onClick={() => setWikiTheme(theme)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
              wikiTheme === theme ? 'bg-[#1a1a1a] text-white shadow-soft' : 'bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)]'
            }`}>{theme}</button>
        ))}
      </div>
      {filteredWiki.length === 0 ? (
        <ResourceEmpty title="该领域暂无百科词条" hint="" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredWiki.map(w => (
            <div
              key={w.name}
              onClick={() => setDetail({ id: 'wiki:' + w.name, title: w.name, sub: `${w.theme} · ${w.domain}`, body: w.detail, icon: Library, kind: 'wiki', deletable: false })}
              className="group card-surface rounded-2xl p-6 flex flex-col gap-4 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-[var(--border-strong)]"
            >
              <div className="flex items-start justify-between">
                <span className="w-12 h-12 rounded-xl bg-[#1a1a1a] text-white flex items-center justify-center">
                  <Library size={20} />
                </span>
                <div className="flex items-center gap-1.5">
                  <a href={'https://baike.baidu.com/item/' + encodeURIComponent(w.name)} target="_blank" rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)] hover:text-[var(--accent)] transition-colors" title="百度百科">
                    <ExternalLink size={15} />
                  </a>
                  <button onClick={(e) => { e.stopPropagation(); exportItem({ id: 'wiki:' + w.name, title: w.name, sub: w.theme, body: w.detail, icon: Library, kind: 'wiki', deletable: false }) }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)] hover:text-[var(--accent)] transition-colors" title="导出为文件">
                    <Download size={15} />
                  </button>
                </div>
              </div>
              <p className="text-base font-semibold leading-snug">{w.name}</p>
            </div>
          ))}
        </div>
      )}
    </>
  )

  return (
    <div className="flex-1 h-full min-w-0 flex flex-col panel rounded-3xl overflow-hidden">
      {/* 顶部 Hero：主题化配色（跟随 light/dark/warm） */}
      <div className="flex-shrink-0 px-8 pt-6 pb-6 bg-[var(--bg-panel)] border-b border-[var(--border-color)]">
          {/* 三个区域选择（系统教程 / 我的生成 / 其他） */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            {([
              { key: 'tutorials' as Tab, icon: BookOpen, label: '系统教程', desc: '系统整理的学习教程与主题词条', color: 'bg-blue-600' },
              { key: 'generated' as Tab, icon: Sparkles, label: '我的生成', desc: 'AI 生成的内容，可查看与导出', color: 'bg-violet-600' },
              { key: 'uploads' as Tab, icon: Upload, label: '其他', desc: '', color: 'bg-emerald-600' },
            ]).map(({ key, icon: Icon, label, desc, color }) => (
              <button
                key={key}
                onClick={() => { setTab(key); setDetail(null) }}
                className={`card-surface rounded-2xl p-5 flex flex-col gap-2 text-left transition-all hover:shadow-soft border ${
                  tab === key ? 'border-[#1a1a1a] bg-[var(--bg-hover)] shadow-soft' : 'border-transparent'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-white ${color}`}>
                    <Icon size={14} />
                  </span>
                  <span className="text-sm font-semibold">{label}</span>
                </span>
                {desc && <span className="text-[11px] text-dim leading-relaxed">{desc}</span>}
              </button>
            ))}
          </div>
      </div>

      {/* 主体：左侧分类栏 + 内容区 */}
      <div className="flex-1 flex min-h-0">
        {tab === 'tutorials' && (
          <div className="w-40 flex-shrink-0 border-r hairline bg-[var(--bg-sidebar)] p-2.5 flex flex-col gap-1 overflow-y-auto">
            <p className="text-[10px] font-bold text-dim uppercase tracking-wider px-2.5 mt-1 mb-0.5">领域</p>
            {domains.map(d => {
              const c = domainColor(d)
              const active = selectedDomain === d
              return (
                <button
                  key={d}
                  onClick={() => { setSelectedDomain(d); setSelectedCat(CATEGORIES[0].key); setDetail(null) }}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-colors ${
                    active ? 'bg-[#1a1a1a] text-white shadow-soft' : 'text-dim hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.active}`} />
                  <span className="font-semibold truncate">{d}</span>
                </button>
              )
            })}
            <button onClick={() => setShowNewDomain(true)}
              className="flex items-center gap-2 px-3 py-2 mt-1 rounded-xl text-xs text-dim hover:bg-[var(--bg-hover)] transition-colors">
              <Plus size={13} /> 新建领域
            </button>
          </div>
        )}
        {tab === 'generated' && (
          <div className="w-40 flex-shrink-0 border-r hairline bg-[var(--bg-sidebar)] p-2.5 flex flex-col gap-1 overflow-y-auto">
            <p className="text-[10px] font-bold text-dim uppercase tracking-wider px-2.5 mt-1 mb-0.5">项目</p>
            {genProjects.length === 0 && (
              <p className="text-[11px] text-dim px-2.5 py-1">暂无项目</p>
            )}
            {genProjects.map(p => (
              <button key={p.id} onClick={() => { setSelGenProject(p.id); setGenCat('all'); setDetail(null) }}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors ${
                  (selGenProject || projectId) === p.id ? 'bg-[#1a1a1a] text-white shadow-soft' : 'text-dim hover:bg-[var(--bg-hover)]'
                }`}>
                <span className="font-semibold truncate">{p.name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-10 py-8">
          <div className="max-w-6xl mx-auto">
          {tab === 'tutorials' && (
            <>
              {showNewDomain && (
                <div className="border border-[var(--border-color)] rounded-2xl p-4 mb-5 flex flex-col gap-2 bg-[var(--bg-panel)] shadow-soft">
                  <p className="text-sm font-semibold">新建领域</p>
                  <input autoFocus value={newDomainName} onChange={e => setNewDomainName(e.target.value)} placeholder="领域名称（如：机器学习 / 前端开发）"
                    className="px-3 py-2 text-xs input-surface rounded-xl outline-none" />
                  <p className="text-[11px] text-dim">将由 AI 自动生成该领域的系统学习教程与百科词条</p>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setShowNewDomain(false); setNewDomainName('') }} className="px-3 py-1.5 text-[11px] text-dim rounded-xl row-hover">取消</button>
                    <button onClick={createDomain} disabled={newDomainLoading}
                      className="px-3 py-1.5 text-[11px] bg-[#1a1a1a] text-white font-semibold rounded-xl disabled:opacity-50">
                      {newDomainLoading ? '生成中…' : '生成领域内容'}
                    </button>
                  </div>
                </div>
              )}
              <div className="flex gap-2 flex-wrap mb-6">
                {CATEGORIES.map(c => (
                  <button key={c.key} onClick={() => { setSelectedCat(c.key); setDetail(null) }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      selectedCat === c.key ? 'bg-[#1a1a1a] text-white shadow-soft' : 'bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)]'
                    }`}>
                    {c.key}
                  </button>
                ))}
              </div>
              {selectedCat === WIKI_CAT ? wikiSection : tutorialSection}
            </>
          )}
          {tab === 'generated' && (
            <>
              <div className="flex items-end justify-between mb-5">
                <h2 className="text-lg font-bold flex items-center gap-2"><Sparkles size={18} /> 我的生成</h2>
              </div>
              <div className="flex gap-2 flex-wrap mb-6">
                {GEN_CATS.map(c => (
                  <button key={c.key} onClick={() => { setGenCat(c.key); setDetail(null) }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      genCat === c.key ? 'bg-[#1a1a1a] text-white shadow-soft' : 'bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)]'
                    }`}>
                    {c.label}
                  </button>
                ))}
              </div>
              {loading && <p className="text-xs text-dim text-center py-16">加载中…</p>}
              {!loading && list.length === 0 && <ResourceEmpty title="暂无生成物" hint="对话生成讲义 / 指南 / 测试题后自动收录到这里" />}
              {!loading && list.length > 0 && (
                <ResourceCardGrid items={list} onOpen={setDetail} onUseItem={onUseItem}
                  onDelete={removeItem} onExport={exportItem} />
              )}
            </>
          )}
          {tab === 'uploads' && (
            <>
              <UploadPanel projectId={projectId} onUploaded={load} />
            </>
          )}
          </div>
        </div>
      </div>

      {/* 详情模态 */}
      {detail && (
        <ResourceDetailModal detail={detail} onClose={() => setDetail(null)} onUseItem={onUseItem} onDelete={removeItem} />
      )}
    </div>
  )
}