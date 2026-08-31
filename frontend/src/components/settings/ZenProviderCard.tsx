import { useState, useEffect } from 'react'
import { Key, AlertTriangle, RefreshCw } from 'lucide-react'
import { api } from '../../api'
import { lsGetJSON, lsSetJSON } from '../../storage'
import { LS } from '../../storage'

const inputCls = 'w-full px-3 py-2 input-surface rounded-lg text-xs outline-none focus:border-[var(--accent)]'

/** F14-S4f：免费模型名单兜底——api.zenModels() 失败或空时使用 */
const FALLBACK_ZEN_MODELS = [
  { id: 'big-pickle', label: 'Big Pickle' },
  { id: 'deepseek-v4-flash-free', label: 'DeepSeek V4 Flash (Free)' },
  { id: 'mimo-v2.5-free', label: 'MiMo V2.5 (Free)' },
  { id: 'nemotron-3-ultra-free', label: 'Nemotron 3 Ultra (Free)' },
]

interface Props {
  settings: any
  onSaved: (msg: string) => void
}

/** F14-S4f：OpenCode Zen 免费通道配置卡（对话组） */
export default function ZenProviderCard({ settings, onSaved }: Props) {
  const [zenKey, setZenKey] = useState('')
  const [keySet, setKeySet] = useState(false)
  const [keyHint, setKeyHint] = useState('')
  const [models, setModels] = useState<{ id: string; label: string }[]>(FALLBACK_ZEN_MODELS)
  const [selectedModel, setSelectedModel] = useState('')
  const [reviewModel, setReviewModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')

  // 初始化：从 settings 回显
  useEffect(() => {
    if (!settings?.zen) return
    const z = settings.zen
    setKeySet(!!z.api_key_set)
    setKeyHint(z.api_key_hint || '')
    setSelectedModel(z.model_main || 'deepseek-v4-flash-free')
    setReviewModel(settings.review?.model_research || '')
  }, [settings])

  // 拉取 Zen /models 名单
  useEffect(() => {
    let cancelled = false
    api.zenModels().then(d => {
      if (cancelled) return
      if (d?.status === 'ok' && Array.isArray(d.models) && d.models.length > 0) {
        setModels(d.models.map(id => ({ id, label: id })))
      }
    }).catch(() => {}) // 失败用 FALLBACK_ZEN_MODELS
    return () => { cancelled = true }
  }, [])

  /** 保存 Zen Key（双写：settings DB + LS.providerKeys.zen） */
  const saveZenKey = async () => {
    if (!zenKey.trim()) return
    setSaving(true)
    try {
      await api.saveSettings({ zen_api_key: zenKey.trim() })
      // 双写 LS（useChatStream 携带）
      const keys = lsGetJSON(LS.providerKeys, {} as Record<string, string>)
      lsSetJSON(LS.providerKeys, { ...keys, zen: zenKey.trim() })
      const g = await api.getSettings()
      setKeySet(!!g.zen?.api_key_set)
      setKeyHint(g.zen?.api_key_hint || '')
      setZenKey('')
      onSaved('Zen Key 已保存')
    } catch {
      onSaved('保存失败')
    } finally {
      setSaving(false)
    }
  }

  /** 选择模型 → 保存 review_model_research: 'zen:xxx' */
  const selectModel = async (modelId: string) => {
    setSelectedModel(modelId)
    const body: Record<string, unknown> = { review_model_research: `zen:${modelId}` }
    try {
      await api.saveSettings(body)
      setReviewModel(`zen:${modelId}`)
      onSaved(`研究档判卷模型已切换为 Zen:${modelId}`)
    } catch {
      onSaved('切换失败')
    }
  }

  return (
    <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Key size={14} className="text-dim" />
        <p className="text-sm font-semibold">OpenCode Zen（免费通道）</p>
      </div>
      <p className="text-[10px] text-dim">
        OpenAI 兼容网关，免费模型限时轮换。对话与审核共用，embedding 仍走硅基流动。
      </p>

      {/* Zen Key */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium text-dim">Zen API Key</p>
        {keySet && !zenKey ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs font-medium text-green-700">✓ 已配置：{keyHint}</span>
            <button onClick={() => setZenKey(' ')}
              className="text-[10px] text-dim hover:text-[var(--text)]">修改</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input type="password" autoComplete="new-password" value={zenKey}
              placeholder="sk-...（OpenCode Zen Key）"
              onChange={e => setZenKey(e.target.value)} className={inputCls} />
            <button onClick={saveZenKey} disabled={saving || !zenKey.trim()}
              className={`px-4 py-1.5 text-[11px] rounded-lg font-semibold flex-shrink-0 ${saving ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#1a1a1a] text-white'}`}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        )}
      </div>

      {/* 模型选择 */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium text-dim">研究档判卷模型（zen: 前缀自动路由）</p>
        <div className="relative">
          <input
            list="zen-model-list"
            value={selectedModel}
            onChange={e => selectModel(e.target.value)}
            placeholder="选择或输入模型名"
            className={inputCls}
          />
          <datalist id="zen-model-list">
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </datalist>
        </div>
        {reviewModel && (
          <p className="text-[10px] text-dim">当前生效：{reviewModel}</p>
        )}
      </div>

      {/* 免费模型隐私提示 */}
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <AlertTriangle size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-amber-700 dark:text-amber-400">
          ⚠️ OpenCode Zen 免费模型限时轮换（模型可能被替换或下线，官方说明以提交时为准）。免费期内部分模型数据可能被用于模型改进。
        </p>
      </div>
    </div>
  )
}
