import { useState, useEffect } from 'react'
import { FileText, ClipboardList, Wrench, Stethoscope, Send, Loader2, X, Pencil } from 'lucide-react'
import { renderMd } from '../lib/mdRenderer'
import { api } from '../api'
import { LS, lsGet, lsGetJSON } from '../storage'
import { resolveAuxCall } from '../models'
import QuizViewer from './quiz/QuizViewer'
import KbReaderModal from './KbReaderModal'
import ResourceChatPage from './resource/ResourceChatPage'

const ICONS: Record<string, any> = {
  report: FileText,
  quiz: ClipboardList,
  guide: Wrench,
  diagnosis: Stethoscope,
}

interface Capability { key: string; label: string; desc: string; output: string }
interface GenResult { key: string; label: string; output: string; content: string }
interface GenItem { id: string; name: string; content: string; created_at?: string }

/** 资源生成：能力注册表驱动的生成器（从后端 /api/resources/capabilities 拉取能力清单） */
export default function SpecialOutputPane({ projectId, dialogueId }: { projectId?: string | null; dialogueId?: string | null }) {
  const [caps, setCaps] = useState<Capability[]>([])
  const [form, setForm] = useState('report')
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenResult | null>(null)
  const [history, setHistory] = useState<GenItem[]>([])
  // 闭环六：AI 修改会话（编辑界面唤起——携带资源 id 与名称）
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  // 闭环七：AI 对话生成会话（生成模式——携带能力 key 与提示词，done 后收养资源）
  const [genSession, setGenSession] = useState<{ key: string; label: string; prompt: string } | null>(null)
  /** 当前预览内容对应的资源行（历史按钮/新生成都会更新；AI 修改入口按此定位资源行） */
  const [resultMeta, setResultMeta] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    api.listCapabilities().then(d => {
      const list: Capability[] = (d.capabilities || [])
      setCaps(list)
      if (list.length && !list.some(c => c.key === form)) setForm(list[0].key)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!projectId) { setHistory([]); return }
    api.listResources(projectId).then(d => {
      const rows: GenItem[] = (d.resources || []).filter(r => (r.type || '') === ('gen:' + form)).map(r => ({ id: r.id, name: r.name, content: r.content || '', created_at: r.created_at }))
      setHistory(rows)
    }).catch(() => setHistory([]))
  }, [form, projectId])

  const generate = async () => {
    if (!source.trim()) { alert('请先粘贴或输入源内容'); return }
    const prov = lsGet(LS.provider, 'deepseek')
    const keys = lsGetJSON<Record<string, string>>(LS.providerKeys, {})
    const apiKey = keys[prov] || lsGet(LS.apiKey, '')
    if (!apiKey) { alert('请先在设置中填写主模型 API Key'); return }
    // R-D S5：前端硬编码 base_url 二值改走注册表镜像（owner 修正 B 前端半；后端 S3 起不再采信）
    const aux = resolveAuxCall(prov, lsGet(LS.zenBaseUrl, ''), lsGet(LS.goBaseUrl, ''))
    setLoading(true)
    try {
      const r = await api.generateResource({ key: form, content: source, api_key: apiKey, base_url: aux.base_url, model: aux.model })
      if (r?.status === 'ok') {
        setResult(r)
        if (projectId) {
          try {
            const saved = await api.saveResource({ name: `生成·${r.label}`, content: r.content, project_id: projectId, type: 'gen:' + form, append: true })
            setResultMeta({ id: saved?.id || '', name: `生成·${r.label}` })
            api.listResources(projectId).then(d => {
              const rows: GenItem[] = (d.resources || []).filter(x => (x.type || '') === ('gen:' + form)).map(x => ({ id: x.id, name: x.name, content: x.content || '', created_at: x.created_at }))
              setHistory(rows)
            }).catch(() => {})
          } catch {}
        }
      } else {
        alert('生成失败：' + (r?.msg || '未知'))
      }
    } catch {
      alert('生成失败，请检查后端服务')
    } finally {
      setLoading(false)
    }
  }

  const Icon = ICONS[form] || FileText
  const cur = caps.find(c => c.key === form)

  /** 闭环七：对话生成——源输入框内容即需求提示词，打开生成分支会话（研究档级管线） */
  const openGenChat = () => {
    if (!source.trim()) { alert('请先输入生成提示词（想让 AI 生成什么）'); return }
    if (!projectId) { alert('请先选择项目'); return }
    setGenSession({ key: form, label: cur?.label || form, prompt: source.trim() })
    setSource('')
  }

  // 交互式测验优先组件渲染；组件解析失败（null）时回退 Markdown（兼容存量静态测试题）。
  // key=result.id：换题即重挂载——作答收集器随新测验重置，防跨题串档
  const quizEl = result && form === 'quiz'
    ? <QuizViewer key={result.key + ':' + result.content.slice(0, 40)}
                  content={result.content}
                  dialogueId={dialogueId}
                  projectId={projectId} />
    : null

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      <div className="grid grid-cols-3 gap-1.5 px-3 pt-2.5 flex-shrink-0">
        {caps.map(c => {
          const CIcon = ICONS[c.key] || FileText
          return (
            <button key={c.key} onClick={() => { setForm(c.key); setResult(null) }} title={c.desc}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-xl aspect-[5/4] transition-colors ${form === c.key ? 'bg-[#1a1a1a] text-white shadow-soft' : 'bg-[var(--bg-hover)] text-dim hover:opacity-80'}`}>
              <CIcon size={18} strokeWidth={1.8} />
              <span className="text-[9px] leading-none">{c.label}</span>
            </button>
          )
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
        <textarea
          value={source}
          onChange={e => setSource(e.target.value)}
          placeholder="粘贴或输入源内容（对话生成时作为你的需求提示词，AI 结合知识库与学情自主生成）…"
          rows={4}
          className="w-full px-2.5 py-2 input-surface rounded-xl text-xs outline-none resize-none"
        />
        <div className="flex items-center justify-end gap-2">
          <button onClick={openGenChat} disabled={loading}
            title="不走同步转换，由多智能体管线检索知识库+评估学情后自主生成（较慢，质量更高）"
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border hairline row-hover disabled:opacity-50 flex items-center gap-1.5">
            对话生成
          </button>
          <button onClick={generate} disabled={loading}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#1a1a1a] text-white disabled:opacity-50 flex items-center gap-1.5">
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            生成 {cur?.label || ''}
          </button>
        </div>

        {history.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-semibold text-dim">已生成 · {cur?.label || ''}（{history.length}）</p>
            {history.map(h => (
              <button key={h.id}
                onClick={() => { setResult({ key: form, label: cur?.label || form, output: cur?.output || 'markdown', content: h.content }); setResultMeta({ id: h.id, name: h.name }) }}
                className="text-left px-2.5 py-1.5 rounded-lg border hairline text-[11px] hover:bg-[var(--bg-hover)] truncate">
                {h.name}
                {h.created_at ? <span className="text-[9px] text-dim ml-1.5">{(h.created_at || '').slice(0, 10)}</span> : null}
              </button>
            ))}
          </div>
        )}

        {/* 虚线占位常驻：结果改居中弹窗展示（见下方 result 弹窗），不再内联 */}
        <div className="flex-1 min-h-[120px] border-2 border-dashed hairline rounded-2xl flex flex-col items-center justify-center gap-2 text-dim">
          <Icon size={28} strokeWidth={1.5} />
          <p className="text-xs font-semibold text-[var(--text)]">{cur?.label || '资源生成'}</p>
          <p className="text-[10px] text-center px-6 leading-relaxed">{cur?.desc || '从后端能力注册表加载…'}</p>
        </div>
      </div>

      {/* 生成结果弹窗：测验用模态壳包 QuizViewer（可交互）；其余走阅读器，非 quiz 带「AI 修改」入口 */}
      {result && (form === 'quiz' ? (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setResult(null)}>
          <div className="bg-[var(--bg-panel)] rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)] flex-shrink-0">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Icon size={16} /> {result.label}
              </h3>
              <button onClick={() => setResult(null)} className="p-1 hover:bg-[var(--bg-hover)] rounded"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {quizEl ?? <div className="md-answer-body text-[12px] leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMd(result.content) }} />}
            </div>
          </div>
        </div>
      ) : (
        <KbReaderModal title={result.label} content={result.content} onClose={() => setResult(null)}
                       extraAction={resultMeta?.id && projectId ? {
                         label: 'AI 修改', icon: Pencil,
                         onClick: () => { setResult(null); setEditing(resultMeta) },
                       } : undefined} />
      ))}

      {/* 闭环七：资源生成管线会话（plan→学情∥检索→蒸馏→生成→断言审核→落库）；返回后静默刷新列表 */}
      {genSession && (
        <ResourceChatPage genKey={genSession.key} genLabel={genSession.label} genPrompt={genSession.prompt}
                          projectId={projectId}
                          onBack={() => {
                            setGenSession(null)
                            if (projectId) api.listResources(projectId).then(d => {
                              const rows: GenItem[] = (d.resources || []).filter(r => (r.type || '') === ('gen:' + form)).map(r => ({ id: r.id, name: r.name, content: r.content || '', created_at: r.created_at }))
                              setHistory(rows)
                            }).catch(() => {})
                          }} />
      )}

      {/* 闭环六：资源编辑独立会话（左对话右预览，kind='resource' 隔离）；返回后静默刷新版本列表 */}
      {editing && (
        <ResourceChatPage resourceId={editing.id} resourceName={editing.name}
                          projectId={projectId}
                          onBack={() => {
                            setEditing(null)
                            if (projectId) api.listResources(projectId).then(d => {
                              const rows: GenItem[] = (d.resources || []).filter(r => (r.type || '') === ('gen:' + form)).map(r => ({ id: r.id, name: r.name, content: r.content || '', created_at: r.created_at }))
                              setHistory(rows)
                            }).catch(() => {})
                          }} />
      )}

      <style>{`
        .md-answer-body img { max-width: 100%; border-radius: 10px; margin: 6px 0; }
      `}</style>
    </div>
  )
}
