import { useState, useEffect } from 'react'
import { X, Sun, Moon, Monitor, Type, LampDesk, Sliders, Zap, MessageSquare, Key, Timer, Database, Plug, Bug, Check, Trash2, Plus, Download, Github } from 'lucide-react'
import { getThemePref, setThemePref, type ThemePref } from '../theme'
import { LS, lsGet, lsSet, lsGetJSON, lsSetJSON, lsRemove } from '../storage'
import { api } from '../api'
import ServiceSettings from './settings/ServiceSettings'

interface Props {
  onClose: () => void
  projectId: string | null
}

interface McpServer { id: string; name: string; type: 'stdio' | 'http' | 'sse'; target: string }

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
  const [fontSize, setFontSize] = useState(() => parseInt(lsGet(LS.fontSize, '15')))
  const [theme, setTheme] = useState<ThemePref>(() => getThemePref())
  const [feedback, setFeedback] = useState('')
  const [settingsGroup, setSettingsGroup] = useState('base')

  // 生成后动作
  const [postActions, setPostActions] = useState(() => lsGetJSON(LS.postActions, { autoFollowups: true }))
// 模型与 Key（仅 DeepSeek，localStorage 单一配置）
  const [savedDsKey, setSavedDsKey] = useState(() => {
    const keys = lsGetJSON<Record<string, string>>(LS.providerKeys, {})
    return keys['deepseek'] || lsGet(LS.apiKey, '')
  })
  const [dsKey, setDsKey] = useState('')
  const [dsEditing, setDsEditing] = useState(false)
  const [dsSaved, setDsSaved] = useState(false)
  // 超时（1-30s）
  const [timeoutSec, setTimeoutSec] = useState(() => Math.min(30, Math.max(1, parseInt(lsGet(LS.timeout, '30')) || 30)))
  // MCP 配置
  const [mcpServers, setMcpServers] = useState<McpServer[]>(() => lsGetJSON(LS.mcpServers, []))
  const [mcpShow, setMcpShow] = useState(false)
  const [mcpName, setMcpName] = useState('')
  const [mcpType, setMcpType] = useState<'stdio' | 'http' | 'sse'>('http')
  const [mcpTarget, setMcpTarget] = useState('')
  // 调试
  const [debug, setDebug] = useState(() => lsGet(LS.debug, '0') === '1')
  // 对话自动清理（0 = 关闭）
  const [dialogueLimit, setDialogueLimit] = useState(() => parseInt(lsGet(LS.dialogueLimit, '0')))
  // 检查更新
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'latest' | 'new' | 'error'>('idle')
  const [latestVersion, setLatestVersion] = useState('')

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-font', `${fontSize}px`)
    lsSet(LS.fontSize, String(fontSize))
  }, [fontSize])
  useEffect(() => { setThemePref(theme) }, [theme])
useEffect(() => { lsSetJSON(LS.postActions, postActions) }, [postActions])
  // 仅保留 DeepSeek：清理历史遗留的厂家选择（CenterPanel / SpecialOutputPane 仍读取 LS.provider）
  useEffect(() => { lsRemove(LS.provider) }, [])
  useEffect(() => { lsSet(LS.timeout, String(timeoutSec)) }, [timeoutSec])
  useEffect(() => { lsSet(LS.debug, debug ? '1' : '0') }, [debug])
  useEffect(() => { lsSet(LS.dialogueLimit, String(dialogueLimit)) }, [dialogueLimit])

  /** 恢复默认设置：清除设置类键（保留 API Key / 模型 / 数据）后刷新 */
  const resetSettings = () => {
    if (!window.confirm('确定恢复默认设置？字体、主题、默认参数等将还原（API Key、对话与记忆数据不受影响）。')) return
    ;[LS.fontSize, LS.postActions, LS.contextSettings, LS.timeout, LS.debug, LS.provider,
      LS.mcpServers, LS.dialogueLimit, LS.lastSettings, LS.tutorialCats, LS.tutorials].forEach(lsRemove)
    window.location.reload()
  }

  const flash = (msg: string) => { setFeedback(msg); setTimeout(() => setFeedback(''), 2000) }

  /** DeepSeek key 部分展示（sk-****后4位） */
  const maskKey = (k: string) => (k.length > 8 ? k.slice(0, 3) + '****' + k.slice(-4) : 'sk-****')

  /** 保存 DeepSeek key：写 providerKeys.deepseek（主存储）+ apiKey（兼容旧读取点） */
  const saveDsKey = () => {
    const k = dsKey.trim()
    if (!k) return
    const keys = lsGetJSON<Record<string, string>>(LS.providerKeys, {})
    keys['deepseek'] = k
    lsSetJSON(LS.providerKeys, keys)
    lsSet(LS.apiKey, k)
    setSavedDsKey(k)
    setDsSaved(true)
    setDsEditing(false)
  }

  const doClearDialogues = async () => {
    if (!projectId) { flash('暂无课程'); return }
    if (!window.confirm('确定清空当前课程的全部对话？消息将不可恢复（课程与记忆保留）。')) return
    await api.clearProjectDialogues(projectId)
    flash('对话已清空')
  }
  const doClearMemories = async () => {
    if (!window.confirm('确定清空全部记忆（个人全局 / 课程 / 对话记忆）？')) return
    await api.clearMemories()
    flash('记忆已清空')
  }
  const doExport = async () => {
    try {
      const j = await api.exportData(projectId || 'default')
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
    lsSetJSON(LS.mcpServers, next)
    setMcpName(''); setMcpTarget(''); setMcpShow(false)
  }
  const removeMcp = (id: string) => {
    const next = mcpServers.filter(s => s.id !== id)
    setMcpServers(next)
    lsSetJSON(LS.mcpServers, next)
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

            {/* 模型与 API Key（仅 DeepSeek） */}
            {show('keys') && (
              <Section icon={Key} title="模型与 API Key">
                <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-2.5">
                  <p className="text-sm font-semibold">DeepSeek API Key</p>
                  <div className="flex items-center gap-2">
                    {savedDsKey && !dsEditing ? (
                      <>
                        <span className="flex-1 text-xs font-medium text-green-700">✓ 已配置：{maskKey(savedDsKey)}</span>
                        <button onClick={() => { setDsEditing(true); setDsKey(''); setDsSaved(false) }}
                          className="text-[10px] text-dim hover:text-[var(--text)] flex-shrink-0">修改</button>
                      </>
                    ) : (
                      <input type="password" name="deepseek-api-key" autoComplete="new-password" value={dsKey} placeholder="sk-...（DeepSeek）"
                        onChange={e => { setDsKey(e.target.value); setDsSaved(false) }} className={inputCls} />
                    )}
                    {(!savedDsKey || dsEditing) && (
                      <button onClick={saveDsKey}
                        className={`px-4 py-1.5 text-[11px] rounded-lg font-semibold flex-shrink-0 ${dsSaved ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#1a1a1a] text-white'}`}>保存</button>
                    )}
                  </div>
                  <p className="text-[10px] text-dim">该 key 用于对话与全部模型调用</p>
                </div>
              </Section>
            )}

            {/* AI 服务配置（已拆至 settings/ServiceSettings.tsx） */}
            {show('service') && <ServiceSettings />}

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

export function ApiKeyPrompt({ onClose, provider = 'deepseek' }: { onClose: () => void; provider?: string }) {
  const [key, setKey] = useState('')
  const label = provider === 'zhipu' ? '智谱 GLM' : 'DeepSeek'

  const handleSave = () => {
    if (key.trim()) {
      const keys = lsGetJSON<Record<string, string>>(LS.providerKeys, {})
      keys[provider] = key.trim()
      lsSetJSON(LS.providerKeys, keys)
      lsSet(LS.apiKey, key.trim())
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="card-lift w-full max-w-md mx-4 p-6">
        <h2 className="font-display text-lg mb-2">配置 API Key</h2>
        <p className="text-sm text-dim mb-4">请输入 {label} API Key 以启用 Agent 功能。后续可在设置中修改。</p>
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
