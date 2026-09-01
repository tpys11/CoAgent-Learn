import { useRef, useState, useCallback, useEffect } from 'react'
import type { Dispatch, SetStateAction, MutableRefObject } from 'react'
import type { AgentConfig, Message, Dialogue, ReviewResult } from '../types'
import { streamChatResponse, type ChatEvent } from '../sse'
import { drainTake, feedThoughtChunk, feedDraftChunk, newFenceState } from '../streaming'
import { LS, lsGet, lsGetJSON, lsSetJSON } from '../storage'
import { api } from '../api'
import { subagentStore } from '../stores/subagentStore'

const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

// B4：断线占位提示与失败终态文案（giveUp 仅替换仍是占位提示的末条）
const NET_INTERRUPT_TEXT = '⚠️ 网络中断，正在后台继续生成并自动取回结果…'
const NET_GIVEUP_TEXT = '⚠️ 网络中断，自动取回未成功（已重试 1 分钟）。请检查网络后重新发送。'

// RB-S1：草稿/重写段在思维链中的 agent 命名——与后端 mindchain_entries 同款
//（done 帧权威替换后 live↔终态同口径的前提）；重写段序号取 SSE 帧 data.attempt。
export const GEN_DRAFT_AGENT = '学习助手·生成'
export const genRewriteAgent = (attempt: number) => `学习助手·生成（重写 #${attempt}）`

// RB-S2：用户停止的正文终态文案（草稿在链内可见，正文不收部分内容——owner 底线）
const STOP_GENERATED_TEXT = '⏹ 已停止生成（草稿见思维链）'

/** RA-S5：主链路 base_url 路由（纯函数供 vitest）——zen 取测试档 LS 写集的 zenBaseUrl；
 * 空则与改动前现状等价回落 undefined（后端回落 DeepSeek 端点）并 console.warn 提示，不炸；
 * deepseek/zhipu 硬编码不变（标准档零回归）。 */
export function resolveChatBaseUrl(provider: string, zenBaseUrl: string): string | undefined {
  if (provider === 'zen') {
    if (!zenBaseUrl) {
      console.warn('[chat] zen provider 缺 LS.zenBaseUrl——base_url 回落 DeepSeek 端点')
      return undefined
    }
    return zenBaseUrl
  }
  const providerBaseUrls: Record<string, string> = {
    deepseek: 'https://api.deepseek.com/v1',
    zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  }
  return providerBaseUrls[provider]
}

/** RA-S5：主链路模型名解析（纯函数供 vitest）。RA3-S1 升级双参——显示（SelfCheckCard）
 * 与发送（fetch body）同源。标准档：legacy alias 迁移映射保留（老存量名→v4 系），其余
 * 一律钉死 MODEL_MAIN 常量——LS.model 历史杂值（旧模型下拉残留，如千问名）与合法值无法
 * 可靠区分，owner 原话「我不是说了要换成 deepseek-v4-flash-vision-exp 吗」，钉死常量才是
 * 钉死；后端 pipeline_v2.py:170 真认 req.model，前端发对值即治本（杂值直发 DeepSeek API
 * 会 400）。zen 测试档：模型名由 LS.model 承载（testPresetLsWrites 写入），轮换免疫是
 * F14 设计原意，空值才兜底 'mimo-V2.5 Free'；zen 分支不吃 alias。 */
export function resolveChatModel(provider: string, lsModel: string): string {
  if (provider === 'zen') return lsModel || 'mimo-V2.5 Free'
  const alias: Record<string, string> = {
    'deepseek-chat': 'deepseek-v4-pro',
    'deepseek-reasoner': 'deepseek-v4-pro',
    'deepseek-pro': 'deepseek-v4-pro',
    'deepseek-flash': 'deepseek-v4-flash-vision-exp',
    'deepseek-v4-flash': 'deepseek-v4-flash-vision-exp',   // 老用户存量 localStorage 迁移到视觉版
  }
  return alias[lsModel] || 'deepseek-v4-flash-vision-exp'
}

/** RB-S2：用户停止的消息终态（纯函数供 vitest）——正文只放停止文案（改道后无
 * 部分内容可拼，正文保持终稿语义）；think 携带当前链快照（草稿可见性落盘）。
 * 末条不是 assistant（异常时序/旧消息残留）则原样返回，绝不误伤。 */
export function applyStoppedGenerationMessage(
  prev: Record<string, Message[]>,
  did: string | null,
  think: Array<{ agent: string; content: string }>,
): Record<string, Message[]> {
  const key = did || ''
  const arr = prev[key] || []
  const last = arr[arr.length - 1]
  if (last && last.role === 'assistant') {
    return { ...prev, [key]: [...arr.slice(0, -1), { ...last, content: STOP_GENERATED_TEXT, think }] }
  }
  return prev
}

/** RB-S2：done/error 的正文内容来源（纯函数供 vitest）——服务端权威终稿优先；
 * 无终稿时 error 落正文（⚠️ 前缀）；两者皆无给「处理完成」兜底。 */
export function resolveFinalContent(reply: string, flowError: string): string {
  return reply || (flowError ? '⚠️ ' + flowError : '处理完成')
}

/** RB-S2：断线取回终稿判定（纯函数供 vitest）——取回不变量：正文内容来源=服务端
 * 落库终稿（服务端只在 done 落库，中断场景取回语义 RB 改道前后不变）；空 content
 * 与「（系统未生成内容）」占位不算取回成功，继续轮询。 */
export function isRecoveredAssistantFinal(msgs: Array<{ role: string; content: string }>): boolean {
  const last = msgs[msgs.length - 1]
  return !!(last && last.role === 'assistant' && last.content && last.content !== '（系统未生成内容）')
}

/** 替换最后一条 assistant 消息：发送时插入的空占位（content=''）被结果替换，避免重复气泡。 */
function upsertLastAssistant(prev: Message[], msg: Message): Message[] {
  const arr = [...prev]
  const last = arr[arr.length - 1]
  if (last && last.role === 'assistant') {
    arr[arr.length - 1] = msg
  } else {
    arr.push(msg)
  }
  return arr
}

/** A2：answer_reset 的消息状态转移（纯函数，便于 vitest 钉住清空时序）。
 * 置空最后一条 assistant 占位的 content（旧稿作废），保留 think/steps 等其余字段；
 * 末条不是 assistant（异常时序）则原样返回，绝不误伤别的消息。 */
export function applyAnswerResetMessage(prev: Record<string, Message[]>, did: string | null): Record<string, Message[]> {
  const key = did || ''
  const arr = prev[key] || []
  const last = arr[arr.length - 1]
  if (last && last.role === 'assistant') {
    return { ...prev, [key]: [...arr.slice(0, -1), { ...last, content: '' }] }
  }
  return prev
}

/** RB-S1：草稿 token 入链（纯函数，供 vitest）——向指定 agent 条目追加文本，无则建。
 * 追加目标取 lastIndexOf（同名多条目时贴最后一节，与 revealTick 既有语义一致）；
 * 空 chunk 原样返回同一引用（调用方 zero-diff）。 */
export function applyAnswerTokenToChain(
  chain: Array<{ agent: string; content: string }>,
  agent: string,
  chunk: string,
): Array<{ agent: string; content: string }> {
  if (!chunk) return chain
  const idx = chain.map(x => x.agent).lastIndexOf(agent)
  const next = chain.slice()
  if (idx >= 0) next[idx] = { agent, content: next[idx].content + chunk }
  else next.push({ agent, content: chunk })
  return next
}

/** RB-S1：answer_reset 入链（纯函数，供 vitest）——追加重写段条目，旧条目原样保留
 * （owner 底线：被拒旧稿不得消失）。插入位置=首个「审核」条目之前（owner 时序要求：
 * 草稿只准出现在思维链审核节点之前），无审核条目则追加末尾；后端 done 权威替换后
 * 由 mindchain_entries 同款命名条目接棒（S4），live↔终态不断链。
 * reason 与 SSE 帧对齐保留（当前段名不含 reason，「审核未通过 · 第 N 稿」分隔文案
 * 由渲染层从段名派生）；同名重写段已存在时不重复建（幂等：重发帧不重复开段）。 */
export function applyAnswerResetToChain(
  chain: Array<{ agent: string; content: string }>,
  attempt: number,
  reason: string,
): Array<{ agent: string; content: string }> {
  void reason
  const agent = genRewriteAgent(attempt)
  if (chain.some(x => x.agent === agent)) return chain
  const entry = { agent, content: '' }
  const ri = chain.findIndex(x => x.agent === '审核')
  if (ri < 0) return [...chain, entry]
  const next = chain.slice()
  next.splice(ri, 0, entry)
  return next
}

// ---------- B4：断线取回轮询（独立函数，vitest 假计时器钉住收敛性） ----------

export interface PollRecoveryOpts {
  maxTimes: number                        // 最大轮询次数（达上限 → giveUp 失败终态）
  firstDelayMs: number                    // 首次轮询延迟
  intervalMs: number                      // 轮询间隔
  fetchOnce: () => Promise<boolean>       // true = 已取回成功（内部完成状态写入）
  giveUp: (times: number) => void         // 达上限回调（替换失败终态文案）
  schedule: (fn: () => void, ms: number) => number
  cancel: (id: number) => void
}

/** B4：断线后轮询取回结果。旧实现（setTimeout 递归 + 无上限 + 句柄不跟踪）
 *  在后端未落库时永久每 3 秒轮询，且 stop()/组件卸载均无法终止。
 *  - 达 maxTimes → giveUp 终态（只回调一次）；
 *  - cancel() 随时可停（stop()/卸载/新一轮发送）；在途 fetchOnce 结果被丢弃；
 *  - 成功即停；
 *  - fetchOnce 抛异常视为未取回，计入次数。 */
export function startPollRecovery(opts: PollRecoveryOpts): { cancel: () => void } {
  let count = 0
  let stopped = false
  let timer: number | null = null
  const finish = () => {
    stopped = true
    if (timer !== null) { opts.cancel(timer); timer = null }
  }
  const tick = async () => {
    timer = null
    if (stopped) return
    count++
    let ok = false
    try { ok = await opts.fetchOnce() } catch { ok = false }
    if (stopped) return
    if (ok) { finish(); return }
    if (count >= opts.maxTimes) { opts.giveUp(count); finish(); return }
    timer = opts.schedule(tick, opts.intervalMs)
  }
  timer = opts.schedule(tick, opts.firstDelayMs)
  return {
    cancel: () => { finish() },
  }
}

interface UseChatStreamArgs {
  agents: AgentConfig[]
  currentProjectId: string | null
  dialogues: Dialogue[]
  currentDialogueId: string | null
  setDialogues: Dispatch<SetStateAction<Dialogue[]>>
  setCurrentDialogueId: Dispatch<SetStateAction<string | null>>
  setAllMessages: Dispatch<SetStateAction<Record<string, Message[]>>>
  setIsLoading: Dispatch<SetStateAction<boolean>>
  setShowApiKeyPrompt: Dispatch<SetStateAction<boolean>>
  sessionId: MutableRefObject<string>
  secondDialogueId: MutableRefObject<string>
}

/** 主对话聊天流：发送消息 + SSE 解析 + 流式渲染节奏（rAF 帧循环）+ 停止/断线取回。 */
export function useChatStream(args: UseChatStreamArgs) {
  const {
    agents, currentProjectId, dialogues, currentDialogueId,
    setDialogues, setCurrentDialogueId, setAllMessages, setIsLoading, setShowApiKeyPrompt,
    sessionId, secondDialogueId,
  } = args

  const [flowAgents, setFlowAgents] = useState<string[]>([])
  const [flowActiveAgent, setFlowActiveAgent] = useState<string | null>(null)
  const [flowStatus, setFlowStatus] = useState('')
  const [flowMindchain, setFlowMindchain] = useState<Array<{ agent: string; content: string }>>([])
  const mindchainRef = useRef<Array<{ agent: string; content: string }>>([])
  const activeDidRef = useRef<string | null>(null)
  const streamedRef = useRef(false)
  const pendingAnswerRef = useRef('')
  const pendingMindRef = useRef<{ agent: string; text: string } | null>(null)
  const revealRunningRef = useRef(false)
  const abortCtrlRef = useRef<AbortController | null>(null)
  const userStoppedRef = useRef(false)
  const requestIdRef = useRef<string | null>(null)
  const fenceRef = useRef(newFenceState())
  // RB-S1：草稿围栏状态独立于 thought 的 fenceRef（围栏互染陷阱：answer 流含代码
  // 围栏，共用状态机会互相吞块）+ 当前草稿段的目标 agent 名（reset 后切到重写段）
  const draftFenceRef = useRef(newFenceState())
  const draftAgentRef = useRef(GEN_DRAFT_AGENT)
  // B4：断线取回轮询句柄——stop()/卸载/新一轮发送时 cancel（旧实现泄漏且无法终止）
  const pollCtlRef = useRef<{ cancel: () => void } | null>(null)
  useEffect(() => () => {
    pollCtlRef.current?.cancel()
    pollCtlRef.current = null
  }, [])

  const revealTick = () => {
    const pa = pendingAnswerRef.current
    if (pa) {
      // 自适应排水（速度修复）：每帧放行量随积压比例增长，≈6帧(约100ms)追平积压——
      // 慢到哪显示到哪（小积压仍逐字平滑），快则贴模型原生速度，不再被固定2-4字/帧掐死
      const take = drainTake(pa.length, 2)
      const out = pa.slice(0, take)
      pendingAnswerRef.current = pa.slice(take)
      setAllMessages(prev => {
        const arr = prev[activeDidRef.current || ''] || []
        const lastMsg = arr[arr.length - 1]
        if (lastMsg && lastMsg.role === 'assistant') {
          return { ...prev, [activeDidRef.current || '']: [...arr.slice(0, -1), { ...lastMsg, content: (lastMsg.content || '') + out }] }
        }
        return prev
      })
    }
    const pm = pendingMindRef.current
    if (pm) {
      // 同款自适应排水：思维链与回答保持一致节奏（100ms 追平）
      const take = drainTake(pm.text.length, 1)
      const out = pm.text.slice(0, take)
      pm.text = pm.text.slice(take)
      if (pm.text.length === 0) pendingMindRef.current = null
      setFlowMindchain(prev => {
        // RB-S1：答案排水目标=思维链生成条目（applyAnswerTokenToChain 与原内联
        // lastIndexOf 追加语义逐字节一致，纯函数抽出供 vitest 直调）
        const next = applyAnswerTokenToChain(prev, pm.agent, out)
        mindchainRef.current = next
        return next
      })
      setAllMessages(prev => {
        const arr = prev[activeDidRef.current || ''] || []
        const lastMsg = arr[arr.length - 1]
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === '') {
          return { ...prev, [activeDidRef.current || '']: [...arr.slice(0, -1), { ...lastMsg, think: mindchainRef.current }] }
        }
        return prev
      })
    }
    if (!pendingAnswerRef.current && !pendingMindRef.current) {
      revealRunningRef.current = false
      return
    }
    requestAnimationFrame(revealTick)
  }
  const ensureRevealLoop = () => {
    if (revealRunningRef.current) return
    revealRunningRef.current = true
    requestAnimationFrame(revealTick)
  }

  const sendMessage = useCallback(async (text: string, settings?: Record<string, any>) => {
    let did = currentDialogueId
    const continuing = false
    // key 检查：没填主模型 key 直接阻止发送并弹框，不回退 .env
    const _prov = lsGet(LS.provider, 'deepseek')
    const _keys = lsGetJSON<Record<string, string>>(LS.providerKeys, {})
    if (!(_keys[_prov] || lsGet(LS.apiKey, ''))) {
      setShowApiKeyPrompt(true)
      return
    }
    if (!did && currentProjectId) {
      const count = dialogues.filter(d => d.projectId === currentProjectId && !d.archived).length
      const d: Dialogue = { id: generateId(), name: `对话 ${count + 1}`, projectId: currentProjectId, createdAt: new Date().toISOString(), archived: false }
      setDialogues(prev => [...prev, d])
      did = d.id
      setCurrentDialogueId(d.id)
      try {
        const lim = parseInt(lsGet(LS.dialogueLimit, '0'), 10)
        if (lim > 0) {
          const active = dialogues.filter(x => x.projectId === currentProjectId && !x.archived)
          const excess = active.length - (lim - 1)
          if (excess > 0) {
            const sorted = [...active].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
            sorted.slice(0, excess).forEach(x => {
              api.updateDialogue(x.id, { archived: true }).catch(() => {})
              setDialogues(prev => prev.map(y => y.id === x.id ? { ...y, archived: true } : y))
            })
          }
        }
      } catch {}
    }
    if (!did) return
    if (!continuing) {
      setAllMessages(prev => ({ ...prev, [did || '']: [...(prev[did || ''] || []), { role: 'user', content: text }] }))
      setAllMessages(prev => ({ ...prev, [did || '']: [...(prev[did || ''] || []), { role: 'assistant', content: '' }] }))
    }
    setIsLoading(true)
    if (!continuing) { setFlowAgents([]); setFlowActiveAgent(null); setFlowMindchain([]); mindchainRef.current = []; subagentStore.reset() }
    setFlowStatus('正在等待模型响应…')
    setFlowActiveAgent(null)
    streamedRef.current = false
    userStoppedRef.current = false
    requestIdRef.current = null
    fenceRef.current = newFenceState()
    // RB-S1：草稿围栏状态与目标段名随新一轮发送重置
    draftFenceRef.current = newFenceState()
    draftAgentRef.current = GEN_DRAFT_AGENT
    pendingAnswerRef.current = ''
    pendingMindRef.current = null
    activeDidRef.current = did || null
    // B4：新一轮发送终止上一轮遗留的取回轮询（cancel 后句柄已失效，无需置空——
    // 置 null 会触发 TS 对 ref.current 的 null 收窄，后续可选链报 never）
    pollCtlRef.current?.cancel()
    const curDlg = dialogues.find(d => d.id === did)
    if (curDlg && /^对话 \d+$/.test(curDlg.name)) {
      const nm = text.trim().slice(0, 14) || curDlg.name
      api.updateDialogue(did, { name: nm }).catch(() => {})
      setDialogues(prev => prev.map(x => x.id === did ? { ...x, name: nm } : x))
    }
    let timeoutTimer: any = null
    try {
      const provKeys = lsGetJSON<Record<string, string>>(LS.providerKeys, {})
      const provider = lsGet(LS.provider, 'deepseek')
      // RA-S5：模型名与 base_url 解析抽纯函数（chatRouting.test 直调）；zen base_url 读 LS 写集。
      // RA3-S1：模型名走双参 resolveChatModel——标准档无视 LS.model 杂值钉死（与 SelfCheckCard 显示同源）
      const model = resolveChatModel(provider, lsGet(LS.model, 'deepseek-v4-flash-vision-exp'))
      const baseUrl = resolveChatBaseUrl(provider, lsGet(LS.zenBaseUrl, ''))
      const apiKey = provKeys[provider] || lsGet(LS.apiKey, '') || undefined
      const ctxSettings = lsGetJSON<Record<string, any>>(LS.contextSettings, {})
      ctxSettings.typing = true
      ctxSettings.historyLimit = 10
      ctxSettings.memoryLayer = 'L2'
      const postActions = lsGetJSON<Record<string, any>>(LS.postActions, {})
      const lastSettings = lsGetJSON<Record<string, any>>(LS.lastSettings, {})
      const mergedSettings = { ...ctxSettings, ...postActions, ...lastSettings, ...(settings || {}) }
      lsSetJSON(LS.lastSettings, mergedSettings)
      const timeoutMs = (Math.min(120, Math.max(1, parseInt(lsGet(LS.timeout, '30'), 10) || 30))) * 1000
      let res: Response | null = null
      let firstByte = true
      // D4 重试幂等：每次「按发送」只生成一次，重试循环内复用同一 client_msg_id——
      // 后端按它去重，重试若换新 ID 幂等即失效（这是幂等成立的关键）
      const clientMsgId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'cmi-' + generateId() + Date.now().toString(36)
      const resetTimer = () => {
        clearTimeout(timeoutTimer)
        timeoutTimer = setTimeout(() => abortCtrlRef.current?.abort(), firstByte ? Math.max(15000, timeoutMs) : 60000)
      }
      for (let _try = 0; _try < 2; _try++) {
        const ctrl = new AbortController()
        abortCtrlRef.current = ctrl
        firstByte = true
        resetTimer()
        try {
          const r = await fetch('/api/chat', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text.trim(), session_id: sessionId.current, client_msg_id: clientMsgId, dialogue_id: did, project_id: currentProjectId, api_key: apiKey, model: model, base_url: baseUrl, settings: mergedSettings, image: (mergedSettings && mergedSettings.image) || undefined, agents: agents, extra_followup_did: secondDialogueId.current, extra_followup_focus: 'expand' }),
            signal: ctrl.signal,
          })
          if (r.ok && r.body) { res = r; break }
          if (r.status >= 500 && _try === 0) { console.error('[chat] HTTP', r.status, '重试一次'); clearTimeout(timeoutTimer); continue }
          res = r; break
        } catch (e) {
          console.error('[chat] fetch 失败，重试一次：', e)
          clearTimeout(timeoutTimer)
          if (_try === 0) continue
          throw e
        }
      }
      if (!res || !res.ok || !res.body) {
        setAllMessages(prev => ({ ...prev, [did || '']: [...(prev[did || ''] || []), { role: 'assistant', content: '⚠️ 请求失败（HTTP ' + (res ? res.status : '网络错误') + '），请检查后端服务与 API Key。' }] }))
        return
      }
      let finalReply = ''; const steps: any[] = []; let taskStats: any = null; let flowError = ''
      let special: Array<{ key: string; label: string }> = []
      let retrievedImages: Array<{ source: string; content: string; file_path: string; mime: string }> = []
      let review: ReviewResult | undefined
      await streamChatResponse(res, (data: ChatEvent) => {
        if (data.type === 'start') { requestIdRef.current = data.request_id || null; return }
        if (data.type === 'heartbeat') return
        if (data.type === 'error') {
          flowError = data.message || '请求出错'
          return
        }
        if (data.type === 'step') {
          setFlowAgents(prev => prev.includes(data.agent) ? prev : [...prev, data.agent])
          setFlowActiveAgent(data.agent)
          if (data.agent === '学习助手·规划') {
            setFlowStatus('正在规划…')
          } else if (data.agent === '学习助手·生成') {
            setFlowStatus('正在思考生成…')
          } else if (data.agent === '学情与记忆管理') {
            setFlowStatus('正在阅读记忆…')
          } else if (data.agent === '知识库管理') {
            setFlowStatus('正在检索知识库…')
          } else if (data.agent === '审核') {
            setFlowStatus('正在审核…')
          } else {
            setFlowStatus('处理中…')
          }
          setFlowMindchain(prev => {
            const last = prev[prev.length - 1]
            if (last && last.agent === data.agent) return prev
            const next = [...prev, { agent: data.agent, content: '' }]
            mindchainRef.current = next
            return next
          })
          return
        }
        if (data.type === 'thought_token') {
          setFlowAgents(prev => prev.includes(data.agent) ? prev : [...prev, data.agent])
          setFlowActiveAgent(data.agent)
          const c = data.chunk || ''
          // 围栏检测必须逐字扫描：SSE 改按 chunk 原样直传（faa44b1）后 chunk 常为多字，
          // 旧写法 `if (c === '\`')` 只认单字块，多字 chunk 会整体漏判导致代码围栏失效
          const appended = feedThoughtChunk(fenceRef.current, c, data.agent, (ag, text) => {
            const cur = pendingMindRef.current
            if (cur && cur.agent === ag) {
              cur.text += text
            } else {
              pendingMindRef.current = { agent: ag, text }
            }
          })
          if (appended) ensureRevealLoop()
          return
        }
        if (data.type === 'answer_token') {
          const ch = data.chunk || ''
          if (ch) {
            streamedRef.current = true
            setFlowStatus('正在输出回答…')
            // RB-S1：草稿改道——不再直灌正文（pendingAnswerRef 路径停用，正文只收
            // done 帧 finalReply，owner 底线「正文只收终稿」）；草稿经独立
            // draftFenceRef（与 thought 的 fenceRef 物理隔离，围栏互染陷阱）流入
            // 思维链「学习助手·生成」条目，复用同一 rAF reveal 循环（不另起循环）。
            // 围栏直通语义（feedDraftChunk）：代码块完整入链，草稿即正文形态。
            feedDraftChunk(draftFenceRef.current, ch, draftAgentRef.current, (ag, text) => {
              const cur = pendingMindRef.current
              if (cur && cur.agent === ag) {
                cur.text += text
              } else {
                pendingMindRef.current = { agent: ag, text }
              }
            })
            ensureRevealLoop()
          }
          return
        }
        if (data.type === 'answer_reset') {
          // RB-S1：审核未通过重新生成——A2 时序保持「先清缓冲、再动消息态」。
          // 改道后语义：旧稿在链内保留（owner 底线：不得消失），链内开重写段新条目
          // （段名取 SSE 帧 data.attempt），后续草稿 token 流入新段；正文置空语义
          // 保留（改道后正文本就是空占位，等价「正文从未开始」）。
          pendingAnswerRef.current = ''
          // 冲 pm 缓冲尾段进旧条目（旧稿完整性）再开新段——顺序反了会因
          // pendingMindRef 被新段接管而丢旧稿尾字符
          const leftover = pendingMindRef.current
          if (leftover && leftover.text) {
            setFlowMindchain(prev => {
              const next = applyAnswerTokenToChain(prev, leftover.agent, leftover.text)
              mindchainRef.current = next
              return next
            })
          }
          pendingMindRef.current = null
          setFlowMindchain(prev => {
            const next = applyAnswerResetToChain(prev, data.attempt, data.reason)
            mindchainRef.current = next
            return next
          })
          draftAgentRef.current = genRewriteAgent(data.attempt)
          setAllMessages(prev => applyAnswerResetMessage(prev, activeDidRef.current))
          return
        }
        if (data.type === 'subagent') {
          // 条目4：子agent实时事件 → 外置仓库（LiveStrip/子agent界面 经 useSyncExternalStore 订阅直播）
          subagentStore.applySse(data)
          return
        }
        if (data.type === 'done') {
          pendingAnswerRef.current = ''
          pendingMindRef.current = null
          finalReply = data.reply; steps.push(...(data.steps || [])); taskStats = data.task_stats || null
          special = Array.isArray(data.special_suggestions)
            ? data.special_suggestions.map(s => ({ key: s.key, label: s.label })).filter(s => s.key)
            : []
          retrievedImages = Array.isArray(data.retrieved_images) ? data.retrieved_images : []
          review = data.review
          setFlowStatus('')
          setFlowActiveAgent(null)
          setAllMessages(prev => {
            const arr = prev[activeDidRef.current || ''] || []
            const lastMsg = arr[arr.length - 1]
            if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === '') {
              return { ...prev, [activeDidRef.current || '']: [...arr.slice(0, -1), { ...lastMsg, think: mindchainRef.current }] }
            }
            return prev
          })
          try { window.dispatchEvent(new Event('side-followups-ready')) } catch (e) {}
          const mc: Array<{ agent: string; content: string }> = data.mindchain || []
          if (mc.length > 0) {
            // 后端 mindchain 是权威终稿（只含有真实思考内容的条目）——无条件替换。
            // 旧 guard `mc.length >= 前端长度` 会在"后端条目更少"时拒换，导致 step 帧
            // 创建的空占位标题永久残留（用户见：多个光杆 agent 标题无内容）。
            mindchainRef.current = mc
            setFlowMindchain(mc)
          }
          return
        }
      }, { signal: abortCtrlRef.current?.signal, onProgress: () => { resetTimer(); firstByte = false } })
      try {
        let debugLine = ''
        if (taskStats && Object.keys(taskStats).length) {
          const NODE_CN: Record<string, string> = { plan: '规划', study_memory: '学情', kb: '知识库', generate: '生成', review: '审核' }
          const nodes = Object.entries(taskStats).filter(([k]) => k !== 'token_estimate')
          const total = nodes.reduce((s, [, v]: any) => s + (v.ms || 0), 0)
          debugLine = '⏱ ' + nodes.map(([k, v]: any) => `${NODE_CN[k] || k} ${v.ms}ms×${v.llm_calls || 1}`).join(' · ') + ` · 总计 ${total}ms · ~${taskStats.token_estimate || 0} tokens`
        }
        const thinkArr = mindchainRef.current
        if (debugLine) thinkArr.push({ agent: "运行统计", content: debugLine })
        const finalContent = resolveFinalContent(finalReply, flowError)
        // A3：打字机降级分支已删除。原 :347-348（streamedRef=true 终稿）与
        // :377-378（直出终稿）两分支内容完全相同，合并为一次无条件同步写入——
        // upsertLastAssistant 是一次同步盲写末条，不存在打字机那种 8 秒异步
        // 写入窗口（旧 :350-351 注释记录的真 bug 成因随分支一起消亡）。
        // streamedRef=false（记忆短路/SSE 被缓冲/中断后走到 done）时终稿直出，
        // 不再用定时器逐字推进（1,500 字 → 500 次全量重渲染）。
        setAllMessages(prev => ({ ...prev, [did || '']: upsertLastAssistant(prev[did || ''] || [], { role: 'assistant', content: finalContent, steps, think: thinkArr, special, retrievedImages, review }) }))
      } catch (_ex) {}
    } catch (e: any) {
      console.error('[chat] 网络中断：', e)
      if (userStoppedRef.current) {
        // RB-S2：停止终态——正文只放停止文案（改道后正文无部分内容可拼，拼接逻辑
        // 已删；条件守卫收进纯函数防旧消息残留误伤），草稿已在链内随 think 快照保留
        setAllMessages(prev => applyStoppedGenerationMessage(prev, did, mindchainRef.current))
      } else {
        setAllMessages(prev => ({ ...prev, [did || '']: upsertLastAssistant(prev[did || ''] || [], { role: 'assistant', content: NET_INTERRUPT_TEXT }) }))
        // B4：轮询收敛——上限 20 次（4s 首延迟 + 19×3s ≈ 61s 内），达上限给明确
        // 失败终态；句柄入 ref，stop()/卸载/新一轮发送即终止（旧实现无限轮询）。
        pollCtlRef.current?.cancel()
        pollCtlRef.current = startPollRecovery({
          maxTimes: 20,
          firstDelayMs: 4000,
          intervalMs: 3000,
          fetchOnce: async () => {
            const d = await api.getDialogueMessages(did || '')
            const msgs = (d.messages || []).map((m: any) => ({ role: m.role, content: m.content || '', steps: m.steps, think: m.think }))
            if (isRecoveredAssistantFinal(msgs)) {
              setAllMessages(prev => ({ ...prev, [did || '']: msgs }))
              return true
            }
            return false
          },
          giveUp: () => {
            // 失败终态：仅当占位提示仍是最后一条（期间用户新发言则不动它）
            setAllMessages(prev => {
              const arr = [...(prev[did || ''] || [])]
              const last = arr[arr.length - 1]
              if (last && last.role === 'assistant' && last.content === NET_INTERRUPT_TEXT) {
                arr[arr.length - 1] = { ...last, content: NET_GIVEUP_TEXT }
              }
              return { ...prev, [did || '']: arr }
            })
          },
          schedule: (fn, ms) => window.setTimeout(fn, ms),
          cancel: (id) => clearTimeout(id),
        })
      }
    } finally { clearTimeout(timeoutTimer); setIsLoading(false); abortCtrlRef.current = null }
  }, [currentDialogueId, agents, dialogues, currentProjectId])

  const stop = useCallback(() => {
    userStoppedRef.current = true
    // B4：终止后台取回轮询
    pollCtlRef.current?.cancel()
    pollCtlRef.current = null
    pendingAnswerRef.current = ''
    pendingMindRef.current = null
    try { if (abortCtrlRef.current) abortCtrlRef.current.abort() } catch (e) {}
    if (requestIdRef.current) {
      api.stopChat(requestIdRef.current).catch(() => {})
    }
  }, [])

  const resetFlow = useCallback(() => {
    setFlowAgents([])
    setFlowActiveAgent(null)
    setFlowMindchain([])
    mindchainRef.current = []
  }, [])

  return { sendMessage, stop, resetFlow, flowStatus, flowActiveAgent, flowAgents }
}
