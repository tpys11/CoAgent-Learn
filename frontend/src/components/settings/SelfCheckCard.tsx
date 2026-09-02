import { useState } from 'react'
import { Activity, Check, AlertTriangle, X, Loader2 } from 'lucide-react'
import { api } from '../../api'
import { LS, lsGet, lsGetJSON } from '../../storage'
import { resolveChatModel } from '../../hooks/useChatStream'
import { computeSelfCheckRows } from './selfCheck'

const inputCls = 'w-full px-3 py-2 input-surface rounded-lg text-xs outline-none focus:border-[var(--accent)]'

/** RA3-S2：自检探测键的档位感知（纯函数供 vitest）——chat 行在测试档吃后端 chat_zen 探测键
 * （/test 两键都返回，settings.py:245-248，零后端改动）；review 行不条件化：后端探测已按
 * review_model_research（zen: 前缀）自路由，重复条件化=双重处理；parse/embedding 键不变。 */
export function selfCheckProbeKey(rowId: string, isZen: boolean): string {
    if (rowId === 'embedding') return 'text_embedding' // RA5 冒烟：后端探测键名错位修复
  return rowId === 'chat' && isZen ? 'chat_zen' : rowId
}

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

  // RA-S4：svc 为扁平结构（预置缺陷修正：原读嵌套路径恒 undefined）+ 模型名三源
  // RA3-S1：chat 行模型名与 useChatStream 发送路径同源（同函数同取参表达式）——
  // 标准档经 resolveChatModel 钉死 dsv4f，不再直读 LS.model（owner 反馈①根因行）
  const provider = lsGet(LS.provider, 'deepseek')
  // RA3-S2：档位判据=LS.provider（'zen'=测试档，否则标准档；LS.preset 仅徽章展示不作逻辑判据）
  const isZen = provider === 'zen'
  const rows = computeSelfCheckRows({
    providerKeySet,
    zenKeySet: !!settings?.zen_key_set,
    embeddingKeySet: !!settings?.embedding_key_set,
    parseEngine: settings?.parse_engine,
    mineruKeySet: !!settings?.mineru_key_set,
    reviewResearchModel: settings?.review_model_research,
    reviewEffectiveModel: settings?.review_effective_model,  // RA5-S3：后端 effective_model 权威模型名
    followMain: !!settings?.review_follow_main,
    chatModel: resolveChatModel(provider, lsGet(LS.model, 'deepseek-v4-flash-vision-exp')),
    embeddingModel: settings?.embedding_model,
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
          const probe = probeResult?.[selfCheckProbeKey(r.id, isZen)]
          return (
            <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-hover)]">
              <Icon size={12} className={s.color} />
              <span className="text-[11px] font-medium flex-1">{r.text}</span>
              {r.model && <span className="text-[10px] text-dim font-mono flex-shrink-0 max-w-[45%] truncate">{r.model}</span>}
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
