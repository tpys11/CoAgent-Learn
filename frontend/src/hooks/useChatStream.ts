import { useRef, useState, useCallback } from 'react'
import type { Dispatch, SetStateAction, MutableRefObject } from 'react'
import type { AgentConfig, Message, Dialogue, ReviewResult } from '../types'
import { streamChatResponse, type ChatEvent } from '../sse'
import { drainTake, feedThoughtChunk, newFenceState } from '../streaming'
import { LS, lsGet, lsGetJSON, lsSetJSON } from '../storage'
import { api } from '../api'
import { subagentStore } from '../stores/subagentStore'

const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

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
        const idx = prev.map(x => x.agent).lastIndexOf(pm.agent)
        let next: Array<{ agent: string; content: string }>
        if (idx >= 0) {
          next = prev.slice()
          next[idx] = { agent: pm.agent, content: next[idx].content + out }
        } else {
          next = [...prev, { agent: pm.agent, content: out }]
        }
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
    pendingAnswerRef.current = ''
    pendingMindRef.current = null
    activeDidRef.current = did || null
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
      const model = (() => {
        const m = lsGet(LS.model, 'deepseek-v4-flash-vision-exp')
        const alias: Record<string, string> = {
          'deepseek-chat': 'deepseek-v4-pro',
          'deepseek-reasoner': 'deepseek-v4-pro',
          'deepseek-pro': 'deepseek-v4-pro',
          'deepseek-flash': 'deepseek-v4-flash-vision-exp',
          'deepseek-v4-flash': 'deepseek-v4-flash-vision-exp',   // 老用户存量 localStorage 迁移到视觉版
        }
        return alias[m] || m
      })()
      const providerBaseUrls: Record<string, string> = {
        deepseek: 'https://api.deepseek.com/v1',
        zhipu: 'https://open.bigmodel.cn/api/paas/v4',
      }
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
            body: JSON.stringify({ message: text.trim(), session_id: sessionId.current, client_msg_id: clientMsgId, dialogue_id: did, project_id: currentProjectId, api_key: apiKey, model: model, base_url: providerBaseUrls[provider], settings: mergedSettings, image: (mergedSettings && mergedSettings.image) || undefined, agents: agents, extra_followup_did: secondDialogueId.current, extra_followup_focus: 'expand' }),
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
            pendingAnswerRef.current += ch
            ensureRevealLoop()
          }
          return
        }
        if (data.type === 'answer_reset') {
          // A2：审核未通过重新生成——必须先清流式缓冲、再置空气泡 content
          //（顺序错了会漏字符：reset 前已排队的 token 会残留在新稿里）；
          // think/steps 保留。attempt 递增仅作区分记录，清空是无条件的。
          pendingAnswerRef.current = ''
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
        const finalContent = finalReply || (flowError ? '⚠️ ' + flowError : '处理完成')
        const typingOn = true
        if (typingOn && streamedRef.current) {
          setAllMessages(prev => ({ ...prev, [did || '']: upsertLastAssistant(prev[did || ''] || [], { role: 'assistant', content: finalContent, steps, think: thinkArr, special, retrievedImages, review }) }))
        } else if (typingOn) {
          // 打字机必须钉住目标下标：isLoading 在动画结束前已复位，用户可再发消息——
          // 旧写法盲写"数组末条"，会把旧回复的打字内容踩进新消息的占位气泡（真bug）
          let typeIdx = -1
          setAllMessages(prev => {
            const next = upsertLastAssistant(prev[did || ''] || [], { role: 'assistant', content: '', steps, think: thinkArr, special, retrievedImages, review })
            typeIdx = next.length - 1
            return { ...prev, [did || '']: next }
          })
          let i = 0
          const iv = setInterval(() => {
            i += 3
            const chunk = finalContent.slice(0, i)
            setAllMessages(prev => {
              const arr = [...(prev[did || ''] || [])]
              const tgt = arr[typeIdx]
              if (!tgt || tgt.role !== 'assistant') { clearInterval(iv); return prev }
              if (arr.length !== typeIdx + 1) {
                // 打字期间插入了新消息：本条立即终稿化并停表，绝不越过下标乱写
                clearInterval(iv)
                arr[typeIdx] = { role: 'assistant', content: finalContent, steps, think: thinkArr, special, retrievedImages, review }
                return { ...prev, [did || '']: arr }
              }
              arr[typeIdx] = { role: 'assistant', content: chunk, steps, think: thinkArr, special, retrievedImages, review }
              return { ...prev, [did || '']: arr }
            })
            if (i >= finalContent.length) clearInterval(iv)
          }, 16)
        } else {
          setAllMessages(prev => ({ ...prev, [did || '']: upsertLastAssistant(prev[did || ''] || [], { role: 'assistant', content: finalContent, steps, think: thinkArr, special, retrievedImages, review }) }))
        }
      } catch (_ex) {}
    } catch (e: any) {
      console.error('[chat] 网络中断：', e)
      if (userStoppedRef.current) {
        setAllMessages(prev => {
          const arr = [...(prev[did || ''] || [])]
          if (arr.length) {
            const last = arr[arr.length - 1]
            if (last.role === 'assistant') {
              arr[arr.length - 1] = { ...last, content: ((last.content || '').trim() ? last.content + '\n\n' : '') + '⏹ 已停止生成', think: mindchainRef.current }
            }
          }
          return { ...prev, [did || '']: arr }
        })
      } else {
        setAllMessages(prev => ({ ...prev, [did || '']: upsertLastAssistant(prev[did || ''] || [], { role: 'assistant', content: '⚠️ 网络中断，正在后台继续生成并自动取回结果…' }) }))
        let polled = false
        const poll = async () => {
          if (polled) return
          try {
            const d = await api.getDialogueMessages(did || '')
            const msgs = (d.messages || []).map((m: any) => ({ role: m.role, content: m.content || '', steps: m.steps, think: m.think }))
            const last = msgs[msgs.length - 1]
            if (last && last.role === 'assistant' && last.content && last.content !== '（系统未生成内容）') {
              polled = true
              setAllMessages(prev => ({ ...prev, [did || '']: msgs }))
              return
            }
          } catch (e) {}
          if (!polled) setTimeout(poll, 3000)
        }
        setTimeout(poll, 4000)
      }
    } finally { clearTimeout(timeoutTimer); setIsLoading(false); abortCtrlRef.current = null }
  }, [currentDialogueId, agents, dialogues, currentProjectId])

  const stop = useCallback(() => {
    userStoppedRef.current = true
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
