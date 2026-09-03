/** 资源界面：展示系统资源（F13 起预设文件资源走 API 数据驱动 + 链接教程 + 百科词条）。
 *  2026-08-24 精简：移除 系统教程/我的生成/其他 三入口切换与上传页签——
 *  「我的生成」产物在对话界面右栏资源生成栏查看；上传走课程弹窗/对话侧栏的上传面板。
 *  F13-S1：预设文件资源（data/preset_library 三级索引）经 GET /api/preset-library 驱动，
 *  原 URL 型教程归入「链接资源」类别；无前端硬编码资源清单。 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { BookOpen, Plus, FolderTree, Library, ExternalLink, Download } from 'lucide-react'
import { LS, lsGet, lsGetJSON, lsSetJSON } from '../storage'
import { api } from '../api'
import { WIKI_ENTRIES, WikiEntry } from '../data/wikiEntries'
import { mergeDomains, groupByDomain, firstPresetDomain, presetSummary, presetDetailBody } from '../lib/presetLibrary'
import { watchUploadProgress } from '../lib/uploadProgressWatcher'
import { reportIngestDone } from '../lib/kbScopeBus'
import { ListItem, exportItem } from './resource/commons'
import { ResourceCardGrid, ResourceEmpty } from './resource/ResourceCardGrid'
import { ResourceDetailModal } from './resource/ResourceDetailModal'
import MyUploads from './MyUploads'
import { PresetResourceCard } from './resource/PresetResourceCard'
import { PresetDetailModal } from './resource/PresetDetailModal'
import KbReaderModal from './KbReaderModal'
import type { PresetFile, PresetResource } from '../api'

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

/** 分类：固定三类（F13-S1：预设资源=API 数据驱动；链接资源=URL 型教程归宿） */
const CATEGORIES: Array<{ key: string; desc: string }> = [
  { key: '预设资源', desc: '系统内置教材与讲义' },
  { key: '链接资源', desc: '外部教程与文档链接' },
  { key: '百科词条', desc: '名词速览与深入介绍' },
]
const WIKI_CAT = '百科词条'
const PRESET_CAT = '预设资源'

/** 旧数据/AI 生成分类名 → 新三类（链接资源承接原系统学习/技术工具） */
const LEGACY_CAT_MAP: Record<string, string> = {
  '系统教程': '链接资源', '技术教程': '链接资源', '实践案例': '链接资源',
  '系统学习': '链接资源', '技术工具': '链接资源', '工具与框架': '链接资源',
}
const normalizeCat = (c?: string) => (c && LEGACY_CAT_MAP[c]) || c || CATEGORIES[0].key

/** 预置第三方教程（领域 + 分类归位） */
const PRESET_TUTORIALS: Tutorial[] = [
  { id: 'preset-hello-agent', title: 'Hello Agent 入门教程', url: '', desc: 'GitHub 上的 Hello Agent 经典入门课程：从零理解并搭建一个 Agent 的最小实现（链接待补充）', category: '链接资源', domain: 'Agent 应用与开发', preset: true },
  { id: 'preset-libo-jie', title: '李博杰的教程', url: 'https://bojieli.github.io/ai-agent-book/#_3', desc: '系统性 AI / 智能体学习教程（李博杰 · AI Agent 实战课），覆盖从基础到实践的学习路线', category: '链接资源', domain: 'Agent 应用与开发', preset: true },
  { id: 'preset-langgraph', title: 'LangGraph 官方文档', url: 'https://langchain-ai.github.io/langgraph/', desc: '多智能体工作流编排框架官方文档：StateGraph、节点、条件边', category: '链接资源', domain: 'Agent 应用与开发', preset: true },
  { id: 'preset-mcp', title: 'MCP 官方文档', url: 'https://modelcontextprotocol.io/', desc: 'Model Context Protocol：Agent 与外部工具连接的标准协议', category: '链接资源', domain: 'Agent 应用与开发', preset: true },
  { id: 'preset-deepseek', title: 'DeepSeek API 文档', url: 'https://api-docs.deepseek.com/', desc: 'DeepSeek 大模型 API 调用指南（对话补全、流式输出）', category: '链接资源', domain: 'Agent 应用与开发', preset: true },
  { id: 'preset-python', title: 'Python 官方教程', url: 'https://docs.python.org/zh-cn/3/tutorial/', desc: 'Python 入门到进阶的官方教程（中文）', category: '链接资源', domain: 'Python 编程', preset: true },
  { id: 'preset-fastapi', title: 'FastAPI 官方文档', url: 'https://fastapi.tiangolo.com/zh/', desc: 'Python 异步 Web 框架官方文档：构建 API 与后端服务', category: '链接资源', domain: 'Python 编程', preset: true },
]

/** 资源界面：只读系统资源（领域/分类选择 + 预设教程卡 + 百科词条） */
export default function ResourceView({ projectId, onUseItem, refreshSignal }: { projectId: string | null; onUseItem?: (title: string, body: string, url?: string) => void; refreshSignal?: number; embedded?: boolean }) {
  const [tutorials, setTutorials] = useState<Tutorial[]>(() => {
    return lsGetJSON<Tutorial[]>(LS.tutorials, [])
  })
  // 领域：系统预设 + 预设库扫描出的领域（F13-S1 API 驱动）+ 自定义（localStorage 持久化）
  const [customDomains, setCustomDomains] = useState<string[]>(() => {
    return lsGetJSON<string[]>(LS.domains, [])
  })
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
  const [activeView, setActiveView] = useState<'domain' | 'mine'>('domain')
  // F13-S1：预设资源库状态（API 数据驱动；失败=结构化可见错误，不阻塞其他页签）
  const [presetByDomain, setPresetByDomain] = useState<Record<string, PresetResource[]>>({})
  const [presetLoaded, setPresetLoaded] = useState(false)
  const [presetError, setPresetError] = useState('')
  // F13-S2：「加入课程」编排态（同 /api/knowledge/upload-file 后台链 + upload-progress 轮询）
  const [adding, setAdding] = useState<{ name: string; stage: string; pct: number } | null>(null)
  const [presetDone, setPresetDone] = useState('')
  // F13-S3：预设详情（元数据占位编辑）+ 文件阅读器
  const [presetDetail, setPresetDetail] = useState<PresetResource | null>(null)
  const [readerFile, setReaderFile] = useState<PresetFile | null>(null)
  // 领域合成：默认（链接教程/百科）→ 预设库扫描领域 → 自定义
  const domains = mergeDomains(DEFAULT_DOMAINS, Object.keys(presetByDomain), customDomains)

  const load = useCallback(() => {
    setLoading(true)
    setTimeout(() => setLoading(false), 200)
  }, [])

  useEffect(() => { setDetail(null) }, [selectedDomain, selectedCat])
  useEffect(() => { if (refreshSignal) setDetail(null) }, [refreshSignal])

  // F13-S1：拉取预设库三级清单（挂载一次 + 元数据保存后刷新；网络失败落可见错误态）
  const loadPreset = useCallback(() => {
    api.getPresetLibrary()
      .then(d => { setPresetByDomain(groupByDomain(d.domains || [])); setPresetError('') })
      .catch(() => setPresetError('预设资源加载失败，请检查后端服务'))
      .finally(() => setPresetLoaded(true))
  }, [])
  useEffect(() => { loadPreset() }, [loadPreset])

  // F13-S1：预设库加载完成后，若默认领域无内容，自动聚焦第一个有预设资源的领域。
  // 仅聚焦一次（autoFocused）；之后用户主动点击任何领域都尊重选择，不再自动跳转（无内容时显示空态）。
  const autoFocused = useRef(false)
  useEffect(() => {
    if (!presetLoaded || autoFocused.current) return
    autoFocused.current = true
    if (selectedCat !== PRESET_CAT) return
    if ((presetByDomain[selectedDomain] || []).length > 0) return
    const target = firstPresetDomain(domains, presetByDomain)
    if (target && target !== selectedDomain) setSelectedDomain(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetLoaded])

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

  const removeItem = (item: ListItem) => {
    if (item.kind === 'tutorial') removeTutorial(item.id)
  }

  /** 教程资源区（链接资源） */
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
      {!loading && tutorialList.length === 0 && <ResourceEmpty title={`「${selectedCat}」暂无教程`} hint="链接资源为系统预设内容" />}
      {!loading && tutorialList.length > 0 && (
        <ResourceCardGrid items={tutorialList} onOpen={setDetail} onUseItem={onUseItem}
          onDelete={removeItem} onExport={exportItem} />
      )}
    </>
  )

  /** F13-S2「加入课程」：预设文件走与手动上传完全相同的解析链——
   *  ①从 /preset-library 回源取文件字节 → ②multipart POST /api/knowledge/upload-file
   *  （wait=0 后台模式，source=文件名）→ ③复用 watchUploadProgress 轮询（单一正确实现）
   *  → ④完成经 kbScopeBus.reportIngestDone 广播：F9 留存选择面板由 App 推进器自动呈现，
   *  与 UploadPanel 同通道零新 UI（衔接点即此 bus，无留桩必要）。 */
  const addPresetFile = async (f: PresetFile) => {
    if (!projectId) { alert('请先进入课程，再添加预设资源'); return }
    if (adding) return
    setPresetDone('')
    setAdding({ name: f.name, stage: '获取文件', pct: 4 })
    try {
      const resp = await fetch(f.url)
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      const blob = await resp.blob()
      const file = new File([blob], f.name, { type: blob.type || 'application/octet-stream' })
      const fd = new FormData()
      fd.append('project_id', projectId); fd.append('session_id', 'project-res')
      fd.append('api_key', lsGet(LS.apiKey, ''))
      fd.append('wait', '0'); fd.append('file', file, f.name)
      setAdding({ name: f.name, stage: '解析文档', pct: 8 })
      const d = await api.uploadKnowledgeFile(fd)
      if (d && d.status === 'processing') {
        const r = await watchUploadProgress(projectId, f.name, {
          onProgress: (stage, pct) => setAdding({ name: f.name, stage, pct }),
        })
        if (r.ok) {
          setPresetDone(`「${f.name}」已加入课程知识库（${r.chunks} 个内容块）`)
          reportIngestDone(projectId, [f.name])
        } else {
          // D3 句式：失败项不会出现在知识库，明确后果与补救
          alert(`「${f.name}」处理失败${r.msg ? `：${r.msg.replace(/。+$/, '')}` : '：处理超时'}。该条未完成向量化，不会出现在知识库；请重新添加`)
        }
      } else if (d && d.status === 'ok') {
        setPresetDone(`「${f.name}」已加入课程知识库（${d.chunks || 0} 个内容块）`)
        reportIngestDone(projectId, [f.name])
      } else if (d && d.duplicate) {
        setPresetDone(`「${f.name}」内容已存在，已跳过重复入库`)
      } else {
        alert(`「${f.name}」加入失败：${(d && d.msg) || '处理失败'}`)
      }
    } catch (e) {
      alert(`「${f.name}」加入失败：${((e as any)?.message as string) || '网络异常'}`)
    } finally {
      setAdding(null)
    }
  }

  /** F13-S2 预设资源区：大卡片（封面占位+元数据+领域徽标）+ 逐文件「加入课程」 */
  const presetSection = (
    <>
      <div className="flex items-end justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FolderTree size={18} /> {selectedDomain} · {PRESET_CAT}
          </h2>
        </div>
      </div>
      {adding && (
        <div className="flex flex-col gap-1 mb-5 border border-[var(--border-color)] rounded-2xl p-3">
          <div className="flex justify-between text-[10px] text-dim">
            <span>「{adding.name}」{adding.stage}</span><span>{adding.pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
            <div className="h-full bg-[#1a1a1a] transition-all duration-300" style={{ width: `${adding.pct}%` }} />
          </div>
        </div>
      )}
      {!adding && presetDone && <p className="text-[11px] text-emerald-600 font-medium mb-5">✓ {presetDone}</p>}
      {presetError && <p className="text-xs text-red-500 text-center py-16">{presetError}</p>}
      {!presetError && !presetLoaded && <p className="text-xs text-dim text-center py-16">加载中…</p>}
      {!presetError && presetLoaded && (presetByDomain[selectedDomain] || []).length === 0 && (
        <ResourceEmpty title="该领域暂无预设资源" hint="预设资源由系统内置，可切换其他领域查看" />
      )}
      {!presetError && presetLoaded && (presetByDomain[selectedDomain] || []).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {(presetByDomain[selectedDomain] || []).map(r => (
            <PresetResourceCard key={r.id} resource={r} domain={selectedDomain}
              adding={adding?.name || null}
              onOpen={() => setPresetDetail(r)}
              onAddFile={addPresetFile} />
          ))}
        </div>
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
      {/* 顶部切换：领域资源 / 我的上传 */}
      <div className="flex gap-1 px-4 pt-3 pb-0 flex-shrink-0">
        {([['domain', '领域资源'], ['mine', '我的上传']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setActiveView(k)}
            className={'px-3.5 py-1.5 rounded-t-lg text-xs font-medium transition-colors ' + (activeView === k ? 'bg-[var(--bg-panel)] border border-b-0 hairline font-semibold text-[var(--text)]' : 'text-dim hover:bg-[var(--bg-hover)]')}>
            {label}
          </button>
        ))}
      </div>
      {activeView === 'mine' ? (
        <MyUploads />
      ) : (
      <div className="flex-1 flex min-h-0">
        <div className="w-[260px] flex-shrink-0 border-r hairline bg-[var(--bg-sidebar)] p-2.5 flex flex-col gap-1 overflow-y-auto">
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
        <div className="flex-1 overflow-y-auto px-10 py-8">
          <div className="max-w-6xl mx-auto">
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
            {selectedCat === WIKI_CAT ? wikiSection : selectedCat === PRESET_CAT ? presetSection : tutorialSection}
          </div>
        </div>
      </div>
      )}

      {/* 详情模态（F13-S2 留桩：预设资源的「加入课程」将走上传解析链，本轮先不给文本插入入口） */}
      {detail && (
        <ResourceDetailModal detail={detail} onClose={() => setDetail(null)}
          onUseItem={detail.id.startsWith('preset:') ? undefined : onUseItem} onDelete={removeItem} />
      )}
      {/* F13-S2/S3 预设详情：元数据占位编辑（持久化）+ 逐文件阅读/加入课程 */}
      {presetDetail && (
        <PresetDetailModal resource={presetDetail} domain={selectedDomain} adding={adding?.name || null}
          onClose={() => setPresetDetail(null)} onAddFile={addPresetFile}
          onRead={f => setReaderFile(f)} onSaved={loadPreset} />
      )}
      {/* F13-S3 文件阅读器（KbReaderModal 文件模式：pdf/md/office 分支 + iframe 兜底） */}
      {readerFile && (
        <KbReaderModal title={readerFile.name} fileUrl={readerFile.url} onClose={() => setReaderFile(null)} />
      )}
    </div>
  )
}
