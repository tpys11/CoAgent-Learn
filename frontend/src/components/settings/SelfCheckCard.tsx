import { useState } from 'react'
import { Activity, Check, AlertTriangle, X, Loader2 } from 'lucide-react'
import { api } from '../../api'
import { lsGetJSON } from '../../storage'
import { LS } from '../../storage'
import { computeSelfCheckRows } from './selfCheck'

const inputCls = 'w-full px-3 py-2 input-surface rounded-lg text-xs outline-none focus:border-[var(--accent)]'

interface Props {
  settings: any
  onSaved: (msg: string) => void
}

const STATE_ICON: Record<string, { icon: any; color: string }> = {
  ok: { icon: Check, color: 'text-green-600' },
  warn: { icon: AlertTriangle, color: 'text-amber-600' },
  missing: { icon: X, color: 'text-red-500' },
  off: { icon: X, color: 'text-dim' },
}

/** F14-S3c：自检卡——配置态探测+手动检测按钮 */
export default function SelfCheckCard({ settings, onSaved }: Props) {
  const [testing, setTesting] = useState(false)
  const [probeResult, setProbeResult] = useState<Record<string, { ok: boolean; msg: string }> | null>(null)

  const providerKeySet = !!lsGetJSON(LS.providerKeys, {} as Record<string, string>)['deepseek']
    || !!lsGetJSON(LS.providerKeys, {} as Record<string, string>)['']

  const rows = computeSelfCheckRows({
    providerKeySet,
    zenKeySet: !!settings?.zen?.api_key_set,
    embeddingKeySet: !!settings?.embedding?.api_key_set,
    parseEngine: settings?.parse?.engine,
    mineruKeySet: !!settings?.parse?.mineru_key_set,
    kbMode: settings?.kb_mode,
    vlKeySet: !!settings?.vl?.api_key_set,
    reviewResearchModel: settings?.review?.model_research,
  })

  const runProbe = async () => {
    setTesting(true)
    setProbeResult(null)
    try {
      const res = await api.testSettings({})
      if (res?.results) setProbeResult(res.results)
      onSaved('探测完成')
    } catch {
      onSaved('探测失败')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-dim" />
          <p className="text-sm font-semibold">自检</p>
        </div>
        <button onClick={runProbe} disabled={testing}
          className={`px-3 py-1 text-[10px] rounded-lg font-semibold ${
            testing ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#1a1a1a] text-white hover:opacity-85'
          }`}>
          {testing ? <Loader2 size={11} className="animate-spin inline mr-1" /> : null}
          立即检测
        </button>
      </div>
      <p className="text-[10px] text-dim">检测各服务配置状态（点击按钮发起真实探测）</p>

      <div className="flex flex-col gap-1.5">
        {rows.map(r => {
          const s = STATE_ICON[r.state] || STATE_ICON.missing
          const Icon = s.icon
          const probe = probeResult?.[r.id]
          return (
            <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-hover)]">
              <Icon size={12} className={s.color} />
              <span className="text-[11px] font-medium flex-1">{r.text}</span>
              {probe && (
                <span className={`text-[10px] ${probe.ok ? 'text-green-600' : 'text-red-500'}`}>
                  {probe.ok ? '✓ 可用' : probe.msg || '不可用'}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
