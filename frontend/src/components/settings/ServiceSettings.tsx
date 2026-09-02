import { useState, useEffect } from 'react'
import { Database, Check, X } from 'lucide-react'
import { api } from '../../api'
import type { SettingsData } from '../../types'
import { LS, lsGet, lsSet, lsRemove, lsGetJSON, lsSetJSON } from '../../storage'
import { SERVICE_GROUPS, TEST_PRESET_NOTE, KB_MERGE_NOTE, TEST_PRESET_ZEN_GUARD_NOTE, TEST_PRESET_ON_NOTE, TEST_PRESET_OFF_NOTE, REVIEW_BUBBLE_NOTE, reviewSubSwitchPutBody } from './serviceGroups'
import { buildSvcBody } from './settingsPayload'
import { testPresetLsWrites, testPresetPutBody, standardPresetPutBody } from './presets'
import SelfCheckCard from './SelfCheckCard'

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

const inputCls = 'w-full px-3 py-2 input-surface rounded-lg text-xs outline-none focus:border-[var(--accent)]'

/** RA2-S2：Zen key 保存成功后的 UI 状态收敛（纯函数直调——repo 无 jsdom，组件测试不可行，serviceGroups.ts 头注先例）。
 *  owner 反馈③：保存后输入保留（旧卡保存成功即清空输入=「以为没存上」），zen_key_set/hint 供尾号提示。 */
export function zenSaveUiState(zenKey: string, g: SettingsData): { zenKey: string; zenKeySet: boolean; zenKeyHint: string } {
  return { zenKey, zenKeySet: !!g.zen?.api_key_set, zenKeyHint: g.zen?.api_key_hint || '' }
}

/** RA4-S1：Zen 卡持久配置态徽标——关键状态一律持久渲染，flash 只做动作回执（总领定性①）。
 *  陷阱：hint 可能空串（GET zen.api_key_hint 缺省）——空时只显「已配置」，
 *  不让 `set && hint` && 链把整条提示吞掉（现版「没反馈」的候选机理）。 */
export function zenKeyConfigText(zenKeySet: boolean, hint: string): string {
  if (!zenKeySet) return '未配置'
  return hint ? `已配置：${hint}` : '已配置'
}

/** RA4-S1：保存失败持久红字——不清到下次成功（flash 会消失，失败状态必须常驻可见）。 */
export function zenSaveFailPersistText(): string {
  return '保存失败，请检查网络后重试'
}

/** RA3-S2：Zen key 保存成功 flash（纯函数直调钉逐字）——owner 反馈②「保存反馈弱」：
 * 成功后引导立即检测验证连通性（key 刚保存→GET 刷新链路 RA2-S2 已保证，检测即验真）。 */
export function zenSavedFlashText(): string {
  return 'Zen Key 已保存——点击上方立即检测验证连通性'
}

/** RA3-S2：Zen key 保存失败 flash——旧 catch 只闪绿色成功样式（text-green-600+✓），
 * 失败与成功视觉不可辨=「不可见」；文案含原因+怎么办（CONVENTIONS §6，saveService 同款先例）。 */
export function zenSaveFailFlashText(): string {
  return '保存失败（后端不可达），请重试'
}

/** RA2-S3：合并栏双气泡数据模型（纯函数直调钉行为——无 jsdom 先例）。
 *  气泡 A「知识库服务」= owner 指定文案：向量化侧带全名 Qwen/Qwen3-VL-Embedding-8B（1024 维，文字与图片同一
 *  向量空间）、重排侧 BAAI/bge-reranker-v2-m3——重排器不是向量化模型，必须分开表述（owner 质疑原委）；
 *  模型组固定且所在文件禁改，故 A 写死。气泡 B「独立审核模型」= GET review.model 动态值——写死会在改
 *  REVIEW_MODEL 时再次说谎（派发单陷阱），故经入参透传。 */
export function kbServiceBubbles(reviewModel: string): Array<{ title: string; lines: string[] }> {
  return [
    {
      title: '知识库服务',
      lines: [
        '向量化：Qwen/Qwen3-VL-Embedding-8B（1024 维，文字与图片同一向量空间）· 重排：BAAI/bge-reranker-v2-m3',
        '（上传自动切块向量化 + 重排 + 跨模态检索）',
      ],
    },
    { title: '独立审核模型', lines: [reviewModel] },
  ]
}

/** RA-S3：AI 服务配置 v2——分组渲染（SERVICE_GROUPS 单一事实源）：
 *  对话与审核=测试档卡（Zen key+总开关+审核子开关）；知识库检索=合并栏（一把硅基流动 key
 *  同值写 embedding/vl 两键）；文档解析=解析引擎卡。自检卡置顶不属组。 */
export default function ServiceSettings() {
  const [svc, setSvc] = useState({
    embedding_base_url: '', embedding_model: 'Qwen/Qwen3-VL-Embedding-8B',
    embedding_key_set: false, embedding_key_hint: '',
    review_enabled: false, review_follow_main: false,
    review_model: 'Qwen/Qwen2.5-72B-Instruct',
    review_model_research: '',
    parse_engine: 'pymupdf4llm',
    mineru_key_set: false,
    mathpix_key_set: false,
    zen_key_set: false, zen_key_hint: '',
    chunk_mode: 'auto',
    chunk_size: 512,
    chunk_overlap: 50,
    rrf_k: 60,
    fetch_mult: 3,
  })
  // key 输入框（不回显已存 key，只显示"已配置"状态）
  const [svcKeys, setSvcKeys] = useState({
    embedding_api_key: '',
    mineru_api_token: '', mathpix_app_id: '', mathpix_app_key: '',
  })
  // Zen key 输入（RA-S3：原 ZenProviderCard 双写逻辑内联至此）
  const [zenKey, setZenKey] = useState('')
  const [zenSaving, setZenSaving] = useState(false)
  // RA4-S1：保存失败持久红字态——不清到下次成功
  const [zenSaveErr, setZenSaveErr] = useState(false)
  // 测试档总开关态（LS.preset 单一事实源）
  const [testPresetOn, setTestPresetOn] = useState(() => lsGet(LS.preset, 'standard') === 'test')
  // RA4-S2：依赖链持久反馈——zenBaseUrl 空守卫 amber 常驻 + PUT 失败红字常驻（flash 只做动作回执）
  const [presetGuardHint, setPresetGuardHint] = useState(false)
  const [presetFailMsg, setPresetFailMsg] = useState('')
  const [svcSaved, setSvcSaved] = useState(false)
  const [keyEditing, setKeyEditing] = useState(false)
  const [feedback, setFeedback] = useState('')
  // RA3-S2：反馈双态——失败走红色（旧实现所有反馈一律绿色+✓，失败视觉不可辨）
  const [feedbackErr, setFeedbackErr] = useState(false)

  useEffect(() => {
    api.getSettings().then(d => {
      setSvc(s => ({
        ...s,
        embedding_base_url: d.embedding?.base_url || '',
        embedding_model: d.embedding?.model || 'Qwen/Qwen3-VL-Embedding-8B',
        embedding_key_set: !!d.embedding?.api_key_set,
        embedding_key_hint: d.embedding?.api_key_hint || '',
        review_enabled: !!d.review?.enabled,
        review_follow_main: !!d.review?.follow_main,
        review_model: d.review?.model || 'Qwen/Qwen2.5-72B-Instruct',
        review_model_research: d.review?.model_research || '',
        chunk_mode: d.chunking?.mode || 'auto',
        parse_engine: d.parse?.engine || 'pymupdf4llm',
        mineru_key_set: !!d.parse?.mineru_key_set,
        mathpix_key_set: !!d.parse?.mathpix_key_set,
        zen_key_set: !!d.zen?.api_key_set,
        zen_key_hint: d.zen?.api_key_hint || '',
        chunk_size: d.chunking?.chunk_size ?? 512,
        chunk_overlap: d.chunking?.chunk_overlap ?? 50,
        rrf_k: d.chunking?.rrf_k ?? 60,
        fetch_mult: d.chunking?.fetch_mult ?? 3,
      }))
    }).catch(() => {})
  }, [])

  const flash = (msg: string) => { setFeedbackErr(false); setFeedback(msg); setTimeout(() => setFeedback(''), 2000) }
  const flashErr = (msg: string) => { setFeedbackErr(true); setFeedback(msg); setTimeout(() => setFeedback(''), 2000) }

  const saveService = async () => {
    try {
      await api.saveSettings(buildSvcBody(svc, svcKeys))
      const g = await api.getSettings()
      setSvc(s => ({ ...s,
        embedding_key_set: !!g.embedding?.api_key_set,
        embedding_key_hint: g.embedding?.api_key_hint || '',
        review_enabled: !!g.review?.enabled,
        review_follow_main: !!g.review?.follow_main,
        chunk_mode: g.chunking?.mode || s.chunk_mode,
        parse_engine: g.parse?.engine || s.parse_engine,
        mineru_key_set: !!g.parse?.mineru_key_set,
        mathpix_key_set: !!g.parse?.mathpix_key_set,
        chunk_size: g.chunking?.chunk_size ?? s.chunk_size,
        chunk_overlap: g.chunking?.chunk_overlap ?? s.chunk_overlap,
        rrf_k: g.chunking?.rrf_k ?? s.rrf_k,
        fetch_mult: g.chunking?.fetch_mult ?? s.fetch_mult }))
      setSvcSaved(true)
      setKeyEditing(false)
      setSvcKeys(k => ({ ...k, embedding_api_key: '', mineru_api_token: '', mathpix_app_id: '', mathpix_app_key: '' }))
      flash('已保存')
    } catch {
      setSvcSaved(false)
      flash('保存失败（后端不可达）')
    }
  }

  /** RA-S3：保存 Zen Key（原 ZenProviderCard 双写逻辑内联：settings DB + LS.providerKeys.zen）；
   *  顺带把 zen.base_url 落 LS.zenBaseUrl——测试档 LS 写集与 S5 主链路 zen 路由都读它。 */
  const saveZenKey = async () => {
    if (!zenKey.trim()) return
    setZenSaving(true)
    try {
      // RA5-S2：改调专用通道 saveZenKey（不再经通用 saveSettings）——E-40 教训：字段存活不靠约定靠通道
      await api.saveZenKey(zenKey.trim())
      const keys = lsGetJSON(LS.providerKeys, {} as Record<string, string>)
      lsSetJSON(LS.providerKeys, { ...keys, zen: zenKey.trim() })
      const g = await api.getSettings()
      lsSet(LS.zenBaseUrl, g.zen?.base_url || '')
      // RA2-S2：保存后状态收敛走纯函数——输入保留（旧卡保存即清空输入的交互已删，owner 反馈③）
      const next = zenSaveUiState(zenKey, g)
      setZenKey(next.zenKey)
      setSvc(s => ({ ...s, zen_key_set: next.zenKeySet, zen_key_hint: next.zenKeyHint }))
      setZenSaveErr(false)
      flash(zenSavedFlashText())
    } catch {
      // RA4-S1：失败持久红字（flash 降级为动作回执，状态本体走 zenSaveErr 常驻渲染）
      setZenSaveErr(true)
      flashErr(zenSaveFailFlashText())
    } finally {
      setZenSaving(false)
    }
  }

  /** RA4-S2：进入测试档——owner 拍板取消确认框，点击直接转换；
   *  先 PUT（失败回弹不写 LS，防 DB/LS 两端漂移）→ 再写 LS 写集。
   *  zenBaseUrl 空串禁走（S5：zen 路由 base_url 取 LS.zenBaseUrl，空=回落 DeepSeek 端点）——
   *  守卫从瞬时 flash 改为持久内联 amber（旧版只闪一下即 return=开关不亮无反馈根因）。 */
  const enableTestPreset = async () => {
    const zenBaseUrl = lsGet(LS.zenBaseUrl, '')
    if (!zenBaseUrl) { setPresetGuardHint(true); return }
    try {
      await api.saveSettings(testPresetPutBody())
      const ls = testPresetLsWrites(zenBaseUrl)
      lsSet(LS.preset, 'test')
      lsSet(LS.provider, ls.provider)
      lsSet(LS.model, ls.model)
      lsSet(LS.zenBaseUrl, ls.zenBaseUrl)
      setPresetGuardHint(false)
      setPresetFailMsg('')
      setTestPresetOn(true)
      flash('已进入测试档')
    } catch {
      // owner 语义「点击直接转换」含失败情形——开关回弹+持久红字，不做半开状态
      setPresetFailMsg('切换失败（后端不可达），请重试')
      flashErr('保存失败（后端不可达），未进入测试档')
    }
  }

  /** RA-S3：退出测试档——PUT 标准档 body（审核回主模型 follow_main + 本地解析）→
   *  LS 回默认：provider=deepseek、model 移除（唯一读点 useChatStream 回落默认值）。 */
  const disableTestPreset = async () => {
    try {
      await api.saveSettings(standardPresetPutBody())
      lsSet(LS.preset, 'standard')
      lsSet(LS.provider, 'deepseek')
      lsRemove(LS.model)
      setPresetFailMsg('')
      setTestPresetOn(false)
      flash('已退出测试档')
    } catch {
      setPresetFailMsg('退出失败（后端不可达），请重试')
      flashErr('保存失败（后端不可达）')
    }
  }

  const onTestPresetToggle = (v: boolean) => { if (v) void enableTestPreset(); else void disableTestPreset() }

  // RA4-S3：审核开关处理器从测试档卡搬迁至合并栏气泡 B——PUT 写法照旧（reviewSubSwitchPutBody），
  // ON=独立审核模型（follow_main=false）；OFF=主模型审核（follow_main=true）。失败持久红字。
  const [reviewToggleErr, setReviewToggleErr] = useState(false)
  const onReviewBubbleToggle = async (v: boolean) => {
    try {
      await api.saveSettings(reviewSubSwitchPutBody(v))
      setSvc(s => ({ ...s, review_follow_main: !v }))
      setReviewToggleErr(false)
      flash(v ? '审核使用独立模型' : '审核使用主模型')
    } catch {
      setReviewToggleErr(true)
      flashErr('保存失败（后端不可达），请重试')
    }
  }

  return (
    <Section icon={Database} title="AI 服务配置" desc="各能力独立配置，保存后即时生效，无需重启">
      <div className="flex flex-col gap-4">
        {/* F14-S3c：自检卡（RA-S4 改四行） */}
        <SelfCheckCard settings={svc} onSaved={flash} />

        {SERVICE_GROUPS.map(grp => (
          <div key={grp.id} className="flex flex-col gap-2.5">
            <div>
              <p className="text-xs font-semibold text-dim uppercase tracking-wider">{grp.title}</p>
              <p className="text-[10px] text-dim mt-0.5">{grp.desc}</p>
            </div>

            {grp.id === 'chat' && (
              /* RA-S3：测试档卡（原预设档卡） */
              <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">测试档</p>
                  <Toggle checked={testPresetOn} onChange={onTestPresetToggle} />
                </div>
                {/* RA4-S2：三态持久指示——启用绿字/未启用灰字/守卫 amber/失败红字（flash 只做动作回执） */}
                {testPresetOn ? (
                  <p className="text-[10px] text-green-700">{TEST_PRESET_ON_NOTE}</p>
                ) : (
                  <p className="text-[10px] text-dim">{TEST_PRESET_OFF_NOTE}</p>
                )}
                {presetGuardHint && !testPresetOn && (
                  <p className="text-[10px] text-amber-600">{TEST_PRESET_ZEN_GUARD_NOTE}</p>
                )}
                {presetFailMsg && <p className="text-[10px] text-red-500">{presetFailMsg}</p>}
                <div className="flex flex-col gap-1.5">
                  <p className="text-[11px] font-medium text-dim">Zen API Key</p>
                  {/* RA2-S2：输入框常驻不再被「已配置」分支替换——保存后输入保留，尾号提示在其下方（不依赖清空触发） */}
                  <div className="flex items-center gap-2">
                    <input type="password" autoComplete="new-password" value={zenKey}
                      placeholder="sk-...（OpenCode Zen Key）"
                      onChange={e => setZenKey(e.target.value)} className={inputCls} />
                    <button onClick={saveZenKey} disabled={zenSaving || !zenKey.trim()}
                      className={`px-4 py-1.5 text-[11px] rounded-lg font-semibold flex-shrink-0 ${zenSaving ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#1a1a1a] text-white'}`}>
                      {zenSaving ? '保存中…' : '保存'}
                    </button>
                  </div>
                  {/* RA4-S1：持久配置态徽标（绿=已配置+尾号，灰=未配置）——不再依赖 flash；hint 空串仍显「已配置」 */}
                  <p className={`text-[10px] ${svc.zen_key_set ? 'text-green-700' : 'text-dim'}`}>
                    {zenKeyConfigText(svc.zen_key_set, svc.zen_key_hint)}
                  </p>
                  {zenSaveErr && (
                    <p className="text-[10px] text-red-500">{zenSaveFailPersistText()}</p>
                  )}
                </div>
                <p className="text-[10px] text-dim">{TEST_PRESET_NOTE}</p>
              </div>
            )}

            {grp.id === 'kb' && (
              /* RA-S3：合并栏（知识库服务 + 独立审核模型，一把硅基流动 key 同值写 embedding/vl 两键） */
              <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-2.5">
                <p className="text-sm font-semibold">知识库服务与独立审核模型</p>
                <div className="flex items-center gap-2">
                  {svc.embedding_key_set && !keyEditing ? (
                    <>
                      <span className="flex-1 text-xs font-medium text-green-700">✓ 已配置：{svc.embedding_key_hint}</span>
                      <button onClick={() => { setKeyEditing(true); setSvcKeys(k => ({ ...k, embedding_api_key: '' })); setSvcSaved(false) }}
                        className="text-[10px] text-dim hover:text-[var(--text)] flex-shrink-0">修改</button>
                    </>
                  ) : (
                    <input type="password" name="siliconflow-api-key" autoComplete="new-password" value={svcKeys.embedding_api_key} placeholder="sk-...（硅基流动）"
                      onChange={e => { setSvcKeys(k => ({ ...k, embedding_api_key: e.target.value })); setSvcSaved(false) }} className={inputCls} />
                  )}
                  {(!svc.embedding_key_set || keyEditing) && (
                    <button onClick={saveService}
                      className={`px-4 py-1.5 text-[11px] rounded-lg font-semibold flex-shrink-0 ${svcSaved ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#1a1a1a] text-white'}`}>保存</button>
                  )}
                </div>
                <p className="text-[10px] text-dim">{KB_MERGE_NOTE}</p>
                {/* RA2-S3：单气泡改双联——A=知识库服务（向量化/重排分开表述，owner 指定文案）、B=独立审核模型（GET review.model 动态值）
                    RA4-S3：气泡 B 右端审核开关（S2 自测试档卡搬迁至此）+ 下方小字 owner 原文 */}
                <div className="flex flex-col sm:flex-row gap-2">
                  {kbServiceBubbles(svc.review_model).map(b => (
                    <div key={b.title} className="flex-1 flex flex-col gap-0.5 px-3 py-2.5 rounded-xl bg-[var(--bg-hover)]">
                      <span className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold">{b.title}</span>
                        {b.title === '独立审核模型' && (
                          <Toggle checked={!svc.review_follow_main} onChange={onReviewBubbleToggle} />
                        )}
                      </span>
                      {b.lines.map((line, idx) => (
                        <span key={idx} className="text-[10px] text-dim">{line}</span>
                      ))}
                      {b.title === '独立审核模型' && (
                        <p className="text-[10px] text-dim">{REVIEW_BUBBLE_NOTE}</p>
                      )}
                    </div>
                  ))}
                </div>
                {reviewToggleErr && <p className="text-[10px] text-red-500">保存失败（后端不可达），请重试</p>}
              </div>
            )}

            {grp.id === 'parse' && (
              /* 文档解析引擎（ParsePort） */
              <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-2.5">
                <p className="text-sm font-semibold">文档解析引擎</p>
                <p className="text-[10px] text-dim">教材 PDF 的版面/表格/公式解析质量由它决定；失败自动降级到本地快道</p>
                {([
                  { id: 'pymupdf4llm', name: 'PyMuPDF4LLM', tag: '本地快道', desc: '原生文字层 PDF 秒出，零依赖离线可用' },
                  { id: 'mineru', name: 'MinerU', tag: '高保真云解析', desc: '版面/表格/公式 SOTA，每日免费额度（mineru.net 申请 Token）' },
                  { id: 'mathpix', name: 'Mathpix', tag: '公式专家', desc: '英文原版书与手写公式金标准（按页计费，mathpix.com 开通）' },
                ] as const).map(opt => (
                  svc.parse_engine === opt.id ? (
                    <div key={opt.id} className="flex flex-col gap-2 px-3 py-2.5 rounded-xl bg-[var(--bg-hover)] border border-[var(--accent)]">
                      <button className="flex items-center justify-between text-left" onClick={() => setSvc(s => ({ ...s, parse_engine: opt.id }))}>
                        <span className="text-[12px] font-semibold">{opt.name}</span>
                        <span className="text-[10px] text-dim">{opt.tag}</span>
                      </button>
                      <span className="text-[10px] text-dim">{opt.desc}</span>
                      {opt.id === 'mineru' && (
                        <div className="flex items-center gap-2 pt-1">
                          {svc.mineru_key_set ? (
                            <span className="flex-1 text-xs font-medium text-green-700">✓ Token 已配置</span>
                          ) : (
                            <input type="password" autoComplete="new-password" value={svcKeys.mineru_api_token} placeholder="粘贴 MinerU API Token"
                              onChange={e => { setSvcKeys(k => ({ ...k, mineru_api_token: e.target.value })); setSvcSaved(false) }} className={inputCls} />
                          )}
                        </div>
                      )}
                      {opt.id === 'mathpix' && (
                        <div className="flex flex-col gap-2 pt-1">
                          {svc.mathpix_key_set ? (
                            <span className="text-xs font-medium text-green-700">✓ App 凭据已配置</span>
                          ) : (
                            <>
                              <input type="text" autoComplete="off" value={svcKeys.mathpix_app_id} placeholder="App ID"
                                onChange={e => { setSvcKeys(k => ({ ...k, mathpix_app_id: e.target.value })); setSvcSaved(false) }} className={inputCls} />
                              <input type="password" autoComplete="new-password" value={svcKeys.mathpix_app_key} placeholder="App Key"
                                onChange={e => { setSvcKeys(k => ({ ...k, mathpix_app_key: e.target.value })); setSvcSaved(false) }} className={inputCls} />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button key={opt.id}
                      className="flex items-center justify-between px-3 py-2 rounded-xl border hairline bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] text-left"
                      onClick={() => { setSvc(s => ({ ...s, parse_engine: opt.id })); setSvcSaved(false) }}>
                      <span className="text-[12px] font-medium">{opt.name}</span>
                      <span className="text-[10px] text-dim">{opt.tag}</span>
                    </button>
                  )
                ))}
                <button onClick={saveService}
                  className={`self-start px-4 py-1.5 text-[11px] rounded-lg font-semibold ${svcSaved ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#1a1a1a] text-white'}`}>保存解析设置</button>
              </div>
            )}
          </div>
        ))}

        {/* T54：切块/检索参数 UI 节已移除——后端 KB_CHUNK / KB_RRF 系列键契约不动，保存时按 svc 现值原样回传 */}

        {feedback && <span className={`text-[11px] flex items-center gap-1 ${feedbackErr ? 'text-red-500' : 'text-green-600'}`}>{feedbackErr ? <X size={11} /> : <Check size={11} />} {feedback}</span>}
      </div>
    </Section>
  )
}
