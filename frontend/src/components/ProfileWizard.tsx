import { useRef, useState } from 'react'
import { ClipboardList, ListTree, PenLine, Upload } from 'lucide-react'
import { LS, lsGet } from '../storage'
import { api } from '../api'
import { consumeScopeTarget, reportIngestDone, type ScopeTarget } from '../lib/kbScopeBus'
import { watchUploadProgress } from '../lib/uploadProgressWatcher'
import { RetentionScopePanel } from './resource/RetentionScopePanel'

interface Props {
  mode: 'project' | 'dialogue'
  projectName?: string
  /** F10-S1：dialogue 模式携带所属课程——向导内可补传教材（上传与向导并行，发起后向导可立即关闭） */
  projectId?: string
  /** F10-S2：向导呈现面的待选择目标（App 裁决下发）——非空时向导先出「知识库处理选择」步 */
  scopeTargets?: ScopeTarget[]
  inheritedProfile?: Record<string, any>
  onClose: () => void
  onSave: (profile: Record<string, any>) => void
}

const DOMAINS = ['智能制造', '人工智能', '软件开发', '工业互联网', '其他']
const LEVELS = ['零基础', '有基础', '熟练', '精通']
const PREFER = ['讲义讲解', '实操练习', '刷题巩固', '混合']

export default function ProfileWizard({ mode, projectName, projectId, scopeTargets, inheritedProfile, onClose, onSave }: Props) {
  const [domain, setDomain] = useState(inheritedProfile?.domain || DOMAINS[0])
  const [background, setBackground] = useState(inheritedProfile?.background || LEVELS[0])
  const [goal, setGoal] = useState(inheritedProfile?.goal || '')
  const [prefer, setPrefer] = useState(inheritedProfile?.prefer || PREFER[3])
  const [topic, setTopic] = useState(inheritedProfile?.topic || '')
  const [selfLevel, setSelfLevel] = useState(inheritedProfile?.selfLevel || '')
  const [target, setTarget] = useState(inheritedProfile?.target || '')
  const [questionType, setQuestionType] = useState(inheritedProfile?.questionType || '基础')
  // F10-S1 向导补传：wait=0 后台上传 + watchUploadProgress 等待完成 + kbScopeBus 上报。
  // 上传链与向导生命周期解耦——用户发起后立即可关向导，完成事件照达 App 推进器（选择机会不丢）。
  const [upBusy, setUpBusy] = useState(false)
  const [upMsg, setUpMsg] = useState('')
  const upFileRef = useRef<HTMLInputElement>(null)

  const uploadFile = async (file: File) => {
    if (!projectId || upBusy) return
    setUpBusy(true); setUpMsg(`上传中：${file.name}`)
    try {
      const fd = new FormData()
      fd.append('project_id', projectId); fd.append('session_id', 'project-res')
      fd.append('api_key', lsGet(LS.apiKey, ''))
      fd.append('wait', '0'); fd.append('file', file, file.name)
      const d: any = await api.uploadKnowledgeFile(fd)
      if (d && d.status === 'processing') {
        setUpMsg(`「${file.name}」后台处理中…（可先继续填写或关闭，完成后会询问处理方式）`)
        const r = await watchUploadProgress(projectId, file.name)
        if (r.ok) { reportIngestDone(projectId, [file.name]); setUpMsg(`✓「${file.name}」已入库完成`) }
        else setUpMsg(`「${file.name}」处理失败：${r.msg ? r.msg.replace(/。+$/, '') : '处理超时'}，请稍后在资源页重试`)
      } else if (d && d.status === 'ok') {
        reportIngestDone(projectId, [file.name]); setUpMsg(`✓「${file.name}」已入库完成`)
      } else if (d && d.duplicate) {
        // 内容已存在（hash 去重）：树早已在库且此前处理过选择，不重报（防重复弹面板）
        setUpMsg(`「${file.name}」内容已存在，已跳过重复入库`)
      } else {
        setUpMsg(`「${file.name}」接入失败：${(d && d.msg) || '处理失败'}`)
      }
    } catch (e: any) {
      setUpMsg(`「${file.name}」上传失败：${e?.message || '网络异常'}`)
    } finally {
      setUpBusy(false)
    }
  }

  const isProject = mode === 'project'

  // F10-S2 打断步：切割完成且有本课程待选择目标时，向导先呈现「知识库处理选择」，
  // 选择/跳过后自动回到画像表单（表单 state 全程保留=恢复正确）。
  // 跳过=默认全量：上传时已全量入库，跳过零动作、仅消费撤销（bus 契约②：消费后内联面同步消失）。
  const scopeList = isProject ? [] : (scopeTargets || [])
  const scopeStep = scopeList.length > 0
  const skipScopeAll = () => { for (const t of scopeList) consumeScopeTarget(t.projectId, t.source) }

  const save = () => {
    const p: Record<string, any> = { domain, background, prefer }
    if (isProject) { p.goal = goal } else { p.topic = topic; p.selfLevel = selfLevel || background; p.target = target; p.questionType = questionType }
    onSave(p)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-lift w-full max-w-md mx-4 p-6">
        <h2 className="font-display text-lg mb-1 flex items-center gap-2">
          {scopeStep ? <><ListTree size={17} /> 知识库处理选择</> : isProject ? <><ClipboardList size={17} /> 课程画像向导</> : <><PenLine size={17} /> 对话画像向导</>}
        </h2>
        <p className="text-[11px] text-gray-400 mb-4">
          {scopeStep ? '上传的教材已完成切割入库：逐份选择留存范围；跳过则保留全部内容（默认）。'
            : isProject ? `为课程「${projectName || ''}」建立学情画像，AI 将据此调整学习内容` : '补充本次学习画像（已继承课程画像）'}
        </p>
        {scopeStep ? (
          <div className="flex flex-col gap-2.5">
            {scopeList.map(t => (
              <RetentionScopePanel key={t.source} projectId={t.projectId} source={t.source}
                tree={t.tree} apiKey={lsGet(LS.apiKey, '')}
                onApplied={() => consumeScopeTarget(t.projectId, t.source)} />
            ))}
            <div className="flex justify-end">
              <button onClick={skipScopeAll} className="text-xs px-3 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg">跳过，保留全部内容</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3">
          {isProject && (
            <>
              <div>
                <label className="text-xs font-medium text-gray-600">① 选择领域</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {DOMAINS.map(d => (
                    <button key={d} onClick={() => setDomain(d)} className={`text-[11px] px-2.5 py-1 rounded-lg border ${domain === d ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-gray-600 border-gray-200'}`}>{d}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">② 学习背景</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {LEVELS.map(l => (
                    <button key={l} onClick={() => setBackground(l)} className={`text-[11px] px-2.5 py-1 rounded-lg border ${background === l ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-gray-600 border-gray-200'}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">③ 课程学习目标</label>
                <input value={goal} onChange={e => setGoal(e.target.value)} placeholder="如：掌握 PLC 编程，能独立完成小课程" className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1a1a1a]" />
              </div>
            </>
          )}
          {!isProject && (
            <>
              <div>
                <label className="text-xs font-medium text-gray-600">① 本次学什么</label>
                <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="如：梯形图编程" className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1a1a1a]" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">② 本次水平自评</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {LEVELS.map(l => (
                    <button key={l} onClick={() => setSelfLevel(l)} className={`text-[11px] px-2.5 py-1 rounded-lg border ${selfLevel === l ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-gray-600 border-gray-200'}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">③ 本次目标</label>
                <input value={target} onChange={e => setTarget(e.target.value)} placeholder="如：理解梯形图基本指令" className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1a1a1a]" />
              </div>
            </>
          )}
          {/* F10-S1 向导补传（仅对话向导）：上传与画像填写并行；发起后可立即关闭向导 */}
          {!isProject && projectId && (
            <div className="border-t border-gray-100 pt-3 mt-1">
              <input ref={upFileRef} type="file" className="hidden"
                accept=".txt,.md,.markdown,.pdf,.docx,.pptx,.xlsx,.epub"
                onChange={e => { const f = e.target.files?.[0]; if (f) void uploadFile(f); e.target.value = '' }} />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-gray-500">教材还没传？现在补传，切割完成后会询问处理方式</span>
                <button onClick={() => upFileRef.current?.click()} disabled={upBusy}
                  className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                  <Upload size={11} /> 补传教材
                </button>
              </div>
              {upMsg && <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">{upMsg}</p>}
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600">{isProject ? '④' : '④'} 偏好学习方式</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {PREFER.map(p => (
                <button key={p} onClick={() => setPrefer(p)} className={`text-[11px] px-2.5 py-1 rounded-lg border ${prefer === p ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-gray-600 border-gray-200'}`}>{p}</button>
              ))}
            </div>
          </div>
        </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={onClose} className="text-xs px-3 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg">跳过</button>
              <button onClick={save} className="text-xs px-4 py-1.5 bg-[#1a1a1a] text-white font-semibold rounded-lg hover:bg-[#333333]">保存画像</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
