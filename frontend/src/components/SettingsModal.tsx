import { useState, useEffect } from 'react'
import { X, Sun, Moon, Monitor, Type, LampDesk, Sliders, Zap, MessageSquare, Key, Timer, Database, Plug, Bug, Check, Trash2, Plus, Download, Github, ChevronRight } from 'lucide-react'
import { getThemePref, setThemePref, type ThemePref } from '../theme'

interface Props {
  onClose: () => void
  projectId: string | null
}

/** 多厂家 API Key 管理 */
const PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'zhipu', name: '智谱 GLM' },
]

interface McpServer { id: string; name: string; type: 'stdio' | 'http' | 'sse'; target: string }

const get = (k: string, d: string) => { try { return localStorage.getItem(k) || d } catch { return d } }
const getJSON = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d } catch { return d } }

/** 当前版本号（与 package.json 同步） */
const APP_VERSION = '0.2.0'

/** 设置分组（左侧只排 4 个大按钮，点开后右侧展示该组全部内容） */
const GROUPS: Array<{ key: string; label: string; icon: any }> = [
  { key: 'base', label: '基础', icon: Sliders },
  { key: 'services', label: 'AI 服务', icon: Database },
  { key: 'chat', label: '对话', icon: MessageSquare },
  { key: 'advanced', label: '高级', icon: Plug },
  { key: 'other', label: '其他', icon: LampDesk },
]

/** 分组 → 其下设置项 */
const GROUP_TABS: Record<string, string[]> = {
  base: ['font', 'theme', 'keys', 'timeout', 'data', 'reset'],
  services: ['service'],
  chat: ['actions', 'cleanup'],
  advanced: ['mcp', 'debug'],
  other: ['about'],
}

function Section({ icon: Icon, title, desc, children }: { icon: any; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold text-dim uppercase tracking-wider flex items-center gap-1.5"><Icon size={13} /> {title}</p>
        {desc && <p className="text-[10px] text-dim mt-1">{desc}</p>}
      </div>
      {children}
    </div>
  )
}

function PillGroup({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            value === o ? 'bg-[#1a1a1a] text-white' : 'bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)]'
          }`}>{o}</button>
      ))}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${
        checked ? 'bg-[#1a1a1a] justify-end' : 'bg-[var(--bg-active)] justify-start'
      }`}>
      <span className="w-4 h-4 rounded-full bg-white shadow" />
    </button>
  )
}

function SwitchRow({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between border hairline rounded-xl p-4 bg-[var(--bg-panel)]">
      <div>
        <p className="text-xs font-semibold">{label}</p>
        {desc && <p className="text-[10px] text-dim mt-0.5">{desc}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

export default function SettingsModal({ onClose, projectId }: Props) {
  const [fontSize, setFontSize] = useState(() => parseInt(get('coagent-fontSize', '15')))
  const [theme, setTheme] = useState<ThemePref>(() => getThemePref())
  const [feedback, setFeedback] = useState('')
  const [settingsGroup, setSettingsGroup] = useState('base')

  // 生成后动作
  const [postActions, setPostActions] = useState(() => getJSON('coagent-post-actions', { autoFollowups: true }))
  // 模型与 Key
  const [provider, setProvider] = useState(() => get('coagent-provider', 'deepseek'))
  const [provKeys, setProvKeys] = useState<Record<string, string>>(() => getJSON('coagent-provider-keys', {}))
  const [mainKey, setMainKey] = useState(() => get('coagent-apikey', ''))
  // 超时（1-30s）
  const [timeoutSec, setTimeoutSec] = useState(() => Math.min(30, Math.max(1, parseInt(get('coagent-timeout', '30')) || 30)))
  // MCP 配置
  const [mcpServers, setMcpServers] = useState<McpServer[]>(() => getJSON('coagent-mcp-servers', []))
  const [mcpShow, setMcpShow] = useState(false)
  const [mcpName, setMcpName] = useState('')
  const [mcpType, setMcpType] = useState<'stdio' | 'http' | 'sse'>('http')
  const [mcpTarget, setMcpTarget] = useState('')
  // 调试
  const [debug, setDebug] = useState(() => get('coagent-debug', '0') === '1')
  // 对话自动清理（0 = 关闭）
  const [dialogueLimit, setDialogueLimit] = useState(() => parseInt(get('coagent-dialogue-limit', '0')))
  // 检查更新
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'latest' | 'new' | 'error'>('idle')
  const [latestVersion, setLatestVersion] = useState('')

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-font', `${fontSize}px`)
    localStorage.setItem('coagent-fontSize', String(fontSize))
  }, [fontSize])
  useEffect(() => { setThemePref(theme) }, [theme])
  useEffect(() => { localStorage.setItem('coagent-post-actions', JSON.stringify(postActions)) }, [postActions])
  useEffect(() => { localStorage.setItem('coagent-provider', provider) }, [provider])
  useEffect(() => { localStorage.setItem('coagent-provider-keys', JSON.stringify(provKeys)) }, [provKeys])
  useEffect(() => {
    if (mainKey.trim()) localStorage.setItem('coagent-apikey', mainKey.trim())
  }, [mainKey])
  useEffect(() => { localStorage.setItem('coagent-timeout', String(timeoutSec)) }, [timeoutSec])
  useEffect(() => { localStorage.setItem('coagent-debug', debug ? '1' : '0') }, [debug])
  useEffect(() => { localStorage.setItem('coagent-dialogue-limit', String(dialogueLimit)) }, [dialogueLimit])

  /** 恢复默认设置：清除设置类键（保留 API Key / 模型 / 数据）后刷新 */
  const resetSettings = () => {
    if (!window.confirm('确定恢复默认设置？字体、主题、默认参数等将还原（API Key、对话与记忆数据不受影响）。')) return
    ;['coagent-fontSize', 'coagent-post-actions', 'coagent-context-settings',
      'coagent-timeout', 'coagent-debug', 'coagent-provider', 'coagent-mcp-servers', 'coagent-dialogue-limit',
      'coagent-last-settings', 'coagent-tutorial-cats', 'coagent-tutorials'].forEach(k => localStorage.removeItem(k))
    window.location.reload()
  }

  const flash = (msg: string) => { setFeedback(msg); setTimeout(() => setFeedback(''), 2000) }

  // ---- AI 服务配置（后端动态生效，存 SQLite settings 表）----
  const [svc, setSvc] = useState({
    vectorModel: 'bge',
    embedding_backend: 'api', embedding_base_url: '', embedding_model: 'BAAI/bge-m3', embedding_local_model: 'BAAI/bge-small-zh-v1.5', embedding_dim: 1024, embedding_key_set: false,
    rerank_backend: 'api', rerank_base_url: '', rerank_model: 'BAAI/bge-reranker-v2-m3', rerank_local_model: 'BAAI/bge-reranker-base', rerank_key_set: false,
    image_backend: 'none', image_base_url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', image_model: 'glm-4v-flash', image_key_set: false,
    vl_key_set: false,
  })
  // key 输入框（不回显已存 key，只显示"已配置"状态）
  const [svcKeys, setSvcKeys] = useState({ embedding_api_key: '', rerank_api_key: '', image_api_key: '', vl_api_key: '', zhipu_api_key: '' })
  const [svcTest, setSvcTest] = useState('')
  // 其他选择折叠
  const [showOther, setShowOther] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      // 旧值兼容：zhipu/siliconflow → api（通用视觉接口）
      const img = d.image?.backend === 'zhipu' || d.image?.backend === 'siliconflow' ? 'api' : (d.image?.backend ?? 'none')
      setSvc({
        vectorModel: d.vector_model === 'qwen' ? 'qwen' : 'bge',
        embedding_backend: d.embedding?.backend ?? 'api',
        embedding_base_url: d.embedding?.base_url || 'https://api.siliconflow.cn/v1',
        embedding_model: d.embedding?.model ?? 'BAAI/bge-m3',
        embedding_local_model: d.embedding?.local_model ?? 'BAAI/bge-small-zh-v1.5',
        embedding_dim: d.embedding?.dim ?? 1024,
        embedding_key_set: !!d.embedding?.api_key_set,
        rerank_backend: d.rerank?.backend ?? 'api', rerank_base_url: d.rerank?.base_url ?? '',
        rerank_model: d.rerank?.model ?? 'BAAI/bge-reranker-v2-m3',
        rerank_local_model: d.rerank?.local_model ?? 'BAAI/bge-reranker-base',
        rerank_key_set: !!d.rerank?.api_key_set,
        image_backend: img,
        image_base_url: d.image?.base_url ?? 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        image_model: d.image?.model ?? 'glm-4v-flash',
        image_key_set: !!d.image?.api_key_set,
        vl_key_set: !!d.vl?.api_key_set,
      })
    }).catch(() => {})
  }, [])

  const saveService = async () => {
    try {
      const r = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...svc, ...svcKeys }),
      })
      const d = await r.json()
      flash(d.msg || (r.ok ? '配置已保存' : '保存失败'))
      // 刷新已配置状态
      const g = await fetch('/api/settings').then(x => x.json())
      setSvc(s => ({ ...s,
        embedding_key_set: !!g.embedding?.api_key_set, rerank_key_set: !!g.rerank?.api_key_set,
        image_key_set: !!g.image?.api_key_set, vl_key_set: !!g.vl?.api_key_set }))
    } catch { flash('保存失败（后端不可达）') }
  }

  const testService = async () => {
    setSvcTest('测试中…')
    try {
      const r = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...svc, ...svcKeys }),
      })
      const d = await r.json()
      const rs = d.results || {}
      const lines = [
        rs.embedding ? `向量化：${rs.embedding.ok ? (rs.embedding.msg || `OK${rs.embedding.dim ? '（' + rs.embedding.dim + ' 维）' : ''}`) : '失败 ' + (rs.embedding.msg || '')}` : '',
        rs.rerank ? `重排：${rs.rerank.ok ? (rs.rerank.msg || 'OK') : '失败 ' + (rs.rerank.msg || '')}` : '',
        rs.vl ? `视觉向量：${rs.vl.ok ? (rs.vl.msg || `OK${rs.vl.dim ? '（' + rs.vl.dim + ' 维）' : ''}`) : '失败 ' + (rs.vl.msg || '')}` : '',
        rs.zhipu ? `图片描述：${rs.zhipu.ok ? (rs.zhipu.msg || 'OK') : '失败 ' + (rs.zhipu.msg || '')}` : '',
      ].filter(Boolean).join(' ｜ ')
      setSvcTest(lines || '无测试项')
    } catch { setSvcTest('测试失败（后端不可达）') }
  }

  const doClearDialogues = async () => {
    if (!projectId) { flash('暂无课程'); return }
    if (!window.confirm('确定清空当前课程的全部对话？消息将不可恢复（课程与记忆保留）。')) return
    const r = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/dialogues', { method: 'DELETE' })
    if (r.ok) flash('对话已清空') ; else flash('清空失败')
  }
  const doClearMemories = async () => {
    if (!window.confirm('确定清空全部记忆（个人全局 / 课程 / 对话记忆）？')) return
    const r = await fetch('/api/memories', { method: 'DELETE' })
    if (r.ok) flash('记忆已清空') ; else flash('清空失败')
  }
  const doExport = async () => {
    try {
      const r = await fetch('/api/export?project_id=' + encodeURIComponent(projectId || 'default'), { cache: 'no-store' })
      const j = await r.json()
      const blob = new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'coagent-data-export.json'; a.click()
      URL.revokeObjectURL(url)
      flash('已导出 JSON 备份')
    } catch { flash('导出失败') }
  }

  const addMcp = () => {
    if (!mcpName.trim() || !mcpTarget.trim()) return
    const next = [...mcpServers, { id: 'mcp-' + Date.now(), name: mcpName.trim(), type: mcpType, target: mcpTarget.trim() }]
    setMcpServers(next)
    localStorage.setItem('coagent-mcp-servers', JSON.stringify(next))
    setMcpName(''); setMcpTarget(''); setMcpShow(false)
  }
  const removeMcp = (id: string) => {
    const next = mcpServers.filter(s => s.id !== id)
    setMcpServers(next)
    localStorage.setItem('coagent-mcp-servers', JSON.stringify(next))
  }

  const inputCls = 'w-full px-3 py-2 input-surface rounded-lg text-xs outline-none focus:border-[var(--accent)]'
  /** 当前分组是否包含某设置项 */
  const show = (k: string) => (GROUP_TABS[settingsGroup] || []).includes(k)

  /** 检查更新：对比 GitHub 最新 Release 版本号 */
  const checkUpdate = async () => {
    setUpdateState('checking')
    try {
      const r = await fetch('https://api.github.com/repos/tpys11/CoAgent-Learn/releases/latest')
      if (!r.ok) throw new Error('bad status')
      const d = await r.json()
      const tag = String(d.tag_name || '').replace(/^v/, '')
      if (!tag) throw new Error('no tag')
      setLatestVersion(tag)
      const cur = APP_VERSION.split('.').map(Number)
      const lat = tag.split('.').map(Number)
      const newer = lat.some((n, i) => n > (cur[i] || 0))
      setUpdateState(newer ? 'new' : 'latest')
    } catch {
      setUpdateState('error')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card-lift w-full max-w-4xl mx-4 h-[88vh] flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b hairline flex-shrink-0">
          <h2 className="font-display text-lg">设置</h2>
          <div className="flex items-center gap-2">
            {feedback && <span className="text-[11px] text-green-600 flex items-center gap-1"><Check size={11} /> {feedback}</span>}
            <button onClick={onClose} className="p-1 rounded-lg row-hover text-dim"><X size={18} /></button>
          </div>
        </div>

        {/* 左侧分类栏 + 右侧内容（Claude 风格） */}
        <div className="flex-1 flex min-h-0">
          <div className="w-44 flex-shrink-0 border-r hairline bg-[var(--bg-sidebar)] p-3 flex flex-col gap-1.5 overflow-y-auto">
            {GROUPS.map(g => (
              <button key={g.key} onClick={() => setSettingsGroup(g.key)}
                className={`w-full flex items-center gap-2 px-2.5 py-2.5 rounded-lg text-sm font-medium text-left transition-colors active:transform-none ${
                  settingsGroup === g.key ? 'bg-[#1a1a1a] text-white shadow-soft' : 'text-dim hover:bg-[var(--bg-hover)]'
                }`}>
                <g.icon size={14} /> {g.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8">
            {/* 字体大小 */}
            {show('font') && (
              <Section icon={Type} title="字体大小">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-dim">12</span>
                  <input type="range" min="12" max="20" value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="flex-1 accent-[var(--accent)]" />
                  <span className="text-xs text-dim">20</span>
                  <span className="text-xs font-semibold text-[var(--text)] w-8 text-right">{fontSize}px</span>
                </div>
              </Section>
            )}

            {/* 页面主题 */}
            {show('theme') && (
              <Section icon={Monitor} title="页面主题">
                <div className="flex gap-2">
                  {[
                    { value: 'light', icon: Sun, swatch: 'bg-white border border-gray-300', iconColor: 'text-gray-700' },
                    { value: 'dark', icon: Moon, swatch: 'bg-gray-900 border border-gray-700', iconColor: 'text-gray-200' },
                    { value: 'warm', icon: LampDesk, swatch: 'bg-[#fdf3e3] border border-amber-200', iconColor: 'text-amber-700' },
                    { value: 'system', icon: Monitor, swatch: 'bg-gradient-to-r from-white via-gray-400 to-gray-900 border border-gray-300', iconColor: 'text-gray-700' },
                  ].map(({ value, icon: Icon, swatch, iconColor }) => (
                    <button key={value} onClick={() => setTheme(value as ThemePref)} title={value}
                      className={`flex-1 flex items-center justify-center aspect-[4/3] rounded-xl transition-all ${swatch} ${
                        theme === value ? 'ring-2 ring-[var(--accent)] shadow-sm' : 'hover:brightness-95'
                      }`}>
                      <Icon size={18} strokeWidth={theme === value ? 2.2 : 1.8} className={iconColor} />
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {/* 生成后动作 */}
            {show('actions') && (
              <Section icon={Zap} title="生成后动作">
                <div className="flex flex-col gap-4">
                  <SwitchRow label="自动生成追问" desc="对话结束后生成推荐追问（右侧栏展示）" checked={postActions.autoFollowups}
                    onChange={v => setPostActions({ ...postActions, autoFollowups: v })} />
                </div>
              </Section>
            )}

            {/* 模型与 API Key */}
            {show('keys') && (
              <Section icon={Key} title="模型与 API Key" desc="与模型卡共用同一份配置（localStorage）">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-dim w-20 flex-shrink-0">默认厂家</span>
                    <select value={provider} onChange={e => setProvider(e.target.value)} className={inputCls}>
                      {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-4">
                    {PROVIDERS.map(p => (
                      <div key={p.id} className="flex items-center gap-2">
                        <span className="text-[11px] text-dim w-20 flex-shrink-0">{p.name}</span>
                        <input type="password" value={provKeys[p.id] || ''} placeholder={p.id === 'deepseek' ? 'sk-...' : '可选'}
                          onChange={e => setProvKeys({ ...provKeys, [p.id]: e.target.value })}
                          className={inputCls} />
                        {(provKeys[p.id] || '').length > 8 && <span className="text-[10px] text-green-600 flex-shrink-0">✓ 已配置</span>}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-dim w-20 flex-shrink-0">主 Key</span>
                    <input type="password" value={mainKey} placeholder="coagent-apikey（兼容旧配置）"
                      onChange={e => setMainKey(e.target.value)} className={inputCls} />
                  </div>
                </div>
              </Section>
            )}

            {/* AI 服务配置（embedding / rerank / 视觉，后端即时生效） */}
            {show('service') && (
              <Section icon={Database} title="AI 服务配置" desc="知识库向量化服务，保存后即时生效，无需重启">
                <div className="flex flex-col gap-5">
                  {/* 知识库向量化服务：一个 Key + 模型单选 */}
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-semibold">知识库向量化服务</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-dim w-20 flex-shrink-0">API Key</span>
                      <input type="password" value={svc.vectorModel === 'bge' ? svcKeys.embedding_api_key : svcKeys.vl_api_key}
                        placeholder={(svc.vectorModel === 'bge' ? svc.embedding_key_set : svc.vl_key_set) ? '已配置，留空保持不变' : 'sk-...（硅基流动）'}
                        onChange={e => setSvcKeys(k => svc.vectorModel === 'bge' ? { ...k, embedding_api_key: e.target.value } : { ...k, vl_api_key: e.target.value })}
                        className={inputCls} />
                      {(svc.vectorModel === 'bge' ? svc.embedding_key_set : svc.vl_key_set) && <span className="text-[10px] text-green-600 flex-shrink-0">✓ 已配置</span>}
                    </div>
                    <div className="flex flex-col gap-2">
                      {[
                        { v: 'bge', name: 'BGE（bge-m3）', desc: '实现文字向量化与重排，无图片向量化能力，模型小、快、便宜。' },
                        { v: 'qwen', name: 'Qwen/Qwen3-VL-Embedding-8B', desc: '实现文字向量化 + 重排 + 视觉能力（图片向量化、跨模态检索），模型大、语义更强，但 API 成本/延迟更高。' },
                      ].map(o => (
                        <button key={o.v} onClick={() => setSvc(s => ({ ...s, vectorModel: o.v }))}
                          className={`flex flex-col gap-0.5 text-left px-3 py-2.5 rounded-xl transition-colors ${svc.vectorModel === o.v ? 'bg-[#1a1a1a] text-white shadow-soft' : 'bg-[var(--bg-hover)] hover:bg-[var(--bg-panel)]'}`}>
                          <span className="text-[12px] font-semibold flex items-center gap-1.5">
                            <span className={`w-3 h-3 rounded-full border flex items-center justify-center flex-shrink-0 ${svc.vectorModel === o.v ? 'border-white' : 'border-[var(--text)]/40'}`}>
                              {svc.vectorModel === o.v && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </span>
                            {o.name}
                          </span>
                          <span className={`text-[10px] pl-[18px] ${svc.vectorModel === o.v ? 'text-white/70' : 'text-dim'}`}>{o.desc}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-dim">两个模型共用同一个硅基流动 API Key（接口统一 https://api.siliconflow.cn/v1），按所选模型计费。</p>
                  </div>
                  {/* 其他选择：向量化 / 重排 / 图片 分开自由配置（厂商 API 或本地部署，模型名自填），可折叠 */}
                  <div className="flex flex-col gap-4 border-t hairline pt-4">
                    <button onClick={() => setShowOther(o => !o)} className="text-sm font-semibold flex items-center gap-1.5 hover:text-[var(--text)] transition-colors">
                      其他选择
                      <ChevronRight size={14} className={`transition-transform text-dim ${showOther ? 'rotate-90' : ''}`} />
                    </button>
                    {showOther && (<div className="flex flex-col gap-4 pt-3">
                    {/* 向量化 */}
                    <div className="flex flex-col gap-2">
                      <p className="text-[11px] font-semibold text-dim">向量化（Embedding）</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-dim w-20 flex-shrink-0">方式</span>
                        <div className="flex gap-1.5">
                          {[
                            { v: 'api', l: '厂商 API' },
                            { v: 'local', l: '本地部署' },
                          ].map(o => (
                            <button key={o.v} onClick={() => setSvc(s => ({ ...s, embedding_backend: o.v }))}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${svc.embedding_backend === o.v ? 'bg-[#1a1a1a] text-white' : 'bg-[var(--bg-hover)] text-dim'}`}>
                              {o.l}
                            </button>
                          ))}
                        </div>
                        {svc.embedding_key_set && <span className="text-[10px] text-green-600 flex-shrink-0">✓ Key 已配置</span>}
                      </div>
                      {svc.embedding_backend === 'api' && (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-dim w-20 flex-shrink-0">接口地址</span>
                            <input value={svc.embedding_base_url} placeholder="https://api.siliconflow.cn/v1" onChange={e => setSvc(s => ({ ...s, embedding_base_url: e.target.value }))} className={inputCls} />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-dim w-20 flex-shrink-0">API Key</span>
                            <input type="password" value={svcKeys.embedding_api_key} placeholder={svc.embedding_key_set ? '已配置，留空保持不变' : 'sk-...'} onChange={e => setSvcKeys(k => ({ ...k, embedding_api_key: e.target.value }))} className={inputCls} />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-dim w-20 flex-shrink-0">模型名</span>
                            <input value={svc.embedding_model} placeholder="BAAI/bge-m3（任意 OpenAI 兼容 embedding 模型）" onChange={e => setSvc(s => ({ ...s, embedding_model: e.target.value }))} className={inputCls} />
                          </div>
                        </>
                      )}
                      {svc.embedding_backend === 'local' && (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-dim w-20 flex-shrink-0">模型名</span>
                          <input value={svc.embedding_local_model} placeholder="本地部署的 embedding 模型（HuggingFace 名或本地路径），如 BAAI/bge-large-zh-v1.5" onChange={e => setSvc(s => ({ ...s, embedding_local_model: e.target.value }))} className={inputCls} />
                        </div>
                      )}
                    </div>
                    {/* 重排 */}
                    <div className="flex flex-col gap-2">
                      <p className="text-[11px] font-semibold text-dim">重排（Rerank）</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-dim w-20 flex-shrink-0">方式</span>
                        <div className="flex gap-1.5">
                          {[
                            { v: 'api', l: '厂商 API' },
                            { v: 'local', l: '本地部署' },
                            { v: 'none', l: '关闭' },
                          ].map(o => (
                            <button key={o.v} onClick={() => setSvc(s => ({ ...s, rerank_backend: o.v }))}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${svc.rerank_backend === o.v ? 'bg-[#1a1a1a] text-white' : 'bg-[var(--bg-hover)] text-dim'}`}>
                              {o.l}
                            </button>
                          ))}
                        </div>
                        {svc.rerank_key_set && <span className="text-[10px] text-green-600 flex-shrink-0">✓ Key 已配置</span>}
                      </div>
                      {svc.rerank_backend === 'api' && (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-dim w-20 flex-shrink-0">接口地址</span>
                            <input value={svc.rerank_base_url} placeholder="https://api.siliconflow.cn/v1（留空复用向量化地址）" onChange={e => setSvc(s => ({ ...s, rerank_base_url: e.target.value }))} className={inputCls} />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-dim w-20 flex-shrink-0">API Key</span>
                            <input type="password" value={svcKeys.rerank_api_key} placeholder={svc.rerank_key_set ? '已配置，留空保持不变' : '留空复用向量化 Key'} onChange={e => setSvcKeys(k => ({ ...k, rerank_api_key: e.target.value }))} className={inputCls} />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-dim w-20 flex-shrink-0">模型名</span>
                            <input value={svc.rerank_model} placeholder="BAAI/bge-reranker-v2-m3" onChange={e => setSvc(s => ({ ...s, rerank_model: e.target.value }))} className={inputCls} />
                          </div>
                        </>
                      )}
                      {svc.rerank_backend === 'local' && (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-dim w-20 flex-shrink-0">模型名</span>
                          <input value={svc.rerank_local_model} placeholder="本地部署的 rerank 模型（HuggingFace 名或本地路径），如 BAAI/bge-reranker-base" onChange={e => setSvc(s => ({ ...s, rerank_local_model: e.target.value }))} className={inputCls} />
                        </div>
                      )}
                    </div>
                    {/* 图片 */}
                    <div className="flex flex-col gap-2">
                      <p className="text-[11px] font-semibold text-dim">图片处理（多模态，图片上传时生效）</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-dim w-20 flex-shrink-0">方式</span>
                        <div className="flex gap-1.5">
                          {[
                            { v: 'api', l: '厂商 API（视觉识别）' },
                            { v: 'none', l: '关闭' },
                          ].map(o => (
                            <button key={o.v} onClick={() => setSvc(s => ({ ...s, image_backend: o.v }))}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${svc.image_backend === o.v ? 'bg-[#1a1a1a] text-white' : 'bg-[var(--bg-hover)] text-dim'}`}>
                              {o.l}
                            </button>
                          ))}
                        </div>
                        {svc.image_key_set && <span className="text-[10px] text-green-600 flex-shrink-0">✓ Key 已配置</span>}
                      </div>
                      {svc.image_backend === 'api' && (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-dim w-20 flex-shrink-0">接口地址</span>
                            <input value={svc.image_base_url} placeholder="OpenAI 兼容视觉接口，默认智谱 glm-4v" onChange={e => setSvc(s => ({ ...s, image_base_url: e.target.value }))} className={inputCls} />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-dim w-20 flex-shrink-0">API Key</span>
                            <input type="password" value={svcKeys.image_api_key} placeholder={svc.image_key_set ? '已配置，留空保持不变' : 'sk-...'} onChange={e => setSvcKeys(k => ({ ...k, image_api_key: e.target.value }))} className={inputCls} />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-dim w-20 flex-shrink-0">模型名</span>
                            <input value={svc.image_model} placeholder="glm-4v-flash" onChange={e => setSvc(s => ({ ...s, image_model: e.target.value }))} className={inputCls} />
                          </div>
                        </>
                      )}
                    </div>
                    </div>)}
                  </div>
                  {/* 操作按钮 */}
                  <div className="flex items-center gap-3 border-t hairline pt-4">
                    <button onClick={saveService} className="px-4 py-1.5 text-[11px] bg-[#1a1a1a] text-white rounded-lg font-semibold">保存配置</button>
                    <button onClick={testService} className="px-4 py-1.5 text-[11px] border hairline rounded-lg font-semibold text-dim hover:text-[var(--text)] transition-colors">测试连接</button>
                  </div>
                  {/* 测试结果（按钮下方） */}
                  {svcTest && <p className={`text-[11px] ${svcTest.includes('失败') ? 'text-red-500' : 'text-green-600'}`}>{svcTest}</p>}
                </div>
              </Section>
            )}

            {/* 请求超时 */}
            {show('timeout') && (
              <Section icon={Timer} title="请求超时" desc="发送消息后无响应自动中止，避免一直转圈">
                <div className="flex items-center gap-3 border hairline rounded-xl p-4 bg-[var(--bg-panel)]">
                  <span className="text-xs text-dim">1s</span>
                  <input type="range" min="1" max="30" step="1" value={timeoutSec}
                    onChange={e => setTimeoutSec(Number(e.target.value))}
                    className="flex-1 accent-[var(--accent)]" />
                  <span className="text-xs text-dim">30s</span>
                  <span className="text-xs font-semibold w-10 text-right">{timeoutSec}s</span>
                </div>
              </Section>
            )}

            {/* 数据管理 */}
            {show('data') && (
              <Section icon={Database} title="数据管理">
                <div className="flex gap-2">
                  <button onClick={doClearDialogues} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] border hairline text-dim hover:bg-[var(--bg-hover)] transition-colors">
                    <Trash2 size={12} /> 清空对话
                  </button>
                  <button onClick={doClearMemories} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] border hairline text-dim hover:bg-[var(--bg-hover)] transition-colors">
                    <Trash2 size={12} /> 清空记忆
                  </button>
                  <button onClick={doExport} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] border hairline text-dim hover:bg-[var(--bg-hover)] transition-colors">
                    <Download size={12} /> 导出数据
                  </button>
                </div>
              </Section>
            )}

            {/* MCP 配置 */}
            {show('mcp') && (
              <Section icon={Plug} title="MCP 配置" desc="连接配置已保存；实际连接与工具调用能力正在开发中">
                <div className="flex flex-col gap-4">
                  {mcpServers.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {mcpServers.map(s => (
                        <div key={s.id} className="flex items-center gap-2 border hairline rounded-lg px-3 py-2 bg-[var(--bg-panel)]">
                          <span className="text-[11px] font-semibold flex-shrink-0">{s.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-dim flex-shrink-0">{s.type}</span>
                          <span className="text-[10px] text-dim truncate flex-1 font-mono">{s.target}</span>
                          <button onClick={() => removeMcp(s.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  {mcpShow ? (
                    <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-4">
                      <input autoFocus value={mcpName} onChange={e => setMcpName(e.target.value)} placeholder="名称（如 my-tools）" className={inputCls} />
                      <div className="flex gap-1.5">
                        {(['stdio', 'http', 'sse'] as const).map(t => (
                          <button key={t} onClick={() => setMcpType(t)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${mcpType === t ? 'bg-[#1a1a1a] text-white' : 'bg-[var(--bg-hover)] text-dim'}`}>{t.toUpperCase()}</button>
                        ))}
                      </div>
                      <input value={mcpTarget} onChange={e => setMcpTarget(e.target.value)} placeholder={mcpType === 'stdio' ? '命令（如 npx @modelcontextprotocol/server-xxx）' : 'URL（如 http://localhost:8080/mcp）'} className={inputCls} />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setMcpShow(false)} className="px-3 py-1.5 text-[11px] text-dim row-hover rounded-lg">取消</button>
                        <button onClick={addMcp} className="px-3 py-1.5 text-[11px] bg-[#1a1a1a] text-white rounded-lg font-semibold">保存</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setMcpShow(true)} className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-dim hover:bg-[var(--bg-hover)] rounded-xl self-start transition-colors">
                      <Plus size={12} /> 添加 MCP Server
                    </button>
                  )}
                </div>
              </Section>
            )}

            {/* 调试模式 */}
            {show('debug') && (
              <Section icon={Bug} title="调试模式">
                <SwitchRow label="调试模式" checked={debug} onChange={setDebug} />
              </Section>
            )}

            {/* 对话自动清理 */}
            {show('cleanup') && (
              <Section icon={Trash2} title="对话自动清理" desc="保留最近 N 条对话，更早的对话自动归档（0 = 不清理）">
                <div className="flex items-center gap-3 border hairline rounded-xl p-4 bg-[var(--bg-panel)]">
                  <span className="text-xs text-dim flex-shrink-0">不清理</span>
                  <input type="range" min="0" max="100" step="5" value={dialogueLimit}
                    onChange={e => setDialogueLimit(Number(e.target.value))}
                    className="flex-1 accent-[var(--accent)]" />
                  <span className="text-xs text-dim flex-shrink-0">100</span>
                  <span className="text-xs font-semibold w-16 text-right">{dialogueLimit === 0 ? '关闭' : `${dialogueLimit} 条`}</span>
                </div>
              </Section>
            )}

            {/* 恢复默认设置 */}
            {show('reset') && (
              <Section icon={Database} title="恢复默认设置" desc="还原字体、主题、默认参数等设置（保留 API Key 与数据）">
                <button onClick={resetSettings}
                  className="px-4 py-2 rounded-xl text-xs border hairline text-dim hover:bg-[var(--bg-hover)] transition-colors self-start">
                  恢复默认设置
                </button>
              </Section>
            )}

            {/* 关于：只显示名字与版本号，可检查更新 */}
            {show('about') && (
              <Section icon={LampDesk} title="关于">
                <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold">CoAgent-Learn <span className="text-dim font-normal text-xs">v{APP_VERSION}</span></p>
                    <a href="https://github.com/tpys11/CoAgent-Learn" target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-[11px] text-[var(--accent)] hover:underline">
                      <Github size={12} /> GitHub
                    </a>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button onClick={checkUpdate} disabled={updateState === 'checking'}
                      className="px-3 py-1.5 rounded-lg text-xs border hairline text-dim hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-colors">
                      {updateState === 'checking' ? '检查中…' : '检查更新'}
                    </button>
                    {updateState === 'latest' && <span className="text-[11px] text-green-600">已是最新版本</span>}
                    {updateState === 'new' && (
                      <a href="https://github.com/tpys11/CoAgent-Learn/releases" target="_blank" rel="noreferrer"
                        className="text-[11px] text-[var(--accent)] hover:underline">
                        发现新版本 v{latestVersion} →
                      </a>
                    )}
                    {updateState === 'error' && <span className="text-[11px] text-red-500">检查失败，请检查网络</span>}
                  </div>
                </div>
              </Section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ApiKeyPrompt({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState('')

  const handleSave = () => {
    if (key.trim()) {
      localStorage.setItem('coagent-apikey', key.trim())
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="card-lift w-full max-w-md mx-4 p-6">
        <h2 className="font-display text-lg mb-2">配置 API Key</h2>
        <p className="text-sm text-dim mb-4">请输入 DeepSeek API Key 以启用 Agent 功能。后续可在设置中修改。</p>
        <input
          autoFocus
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="sk-..."
          className="w-full px-3 py-2.5 input-surface rounded-lg text-sm outline-none focus:border-[var(--accent)] mb-4"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-dim row-hover rounded-lg">跳过</button>
          <button onClick={handleSave} className="px-4 py-2 btn-primary text-sm font-semibold">确认</button>
        </div>
      </div>
    </div>
  )
}
