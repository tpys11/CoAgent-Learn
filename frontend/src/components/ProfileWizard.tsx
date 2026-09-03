import { useRef, useState } from 'react'
import { ClipboardList, ListTree, PenLine, Upload, ListChecks, FileText } from 'lucide-react'
import { LS, lsGet } from '../storage'
import { api } from '../api'
import { consumeScopeTarget, reportIngestDone, type ScopeTarget } from '../lib/kbScopeBus'
import { watchUploadProgress } from '../lib/uploadProgressWatcher'
import { RetentionScopePanel } from './resource/RetentionScopePanel'

interface Props {
  mode: 'project' | 'dialogue'
  projectName?: string
  projectId?: string
  scopeTargets?: ScopeTarget[]
  inheritedProfile?: Record<string, any>
  onClose: () => void
  onSave: (profile: Record<string, any>) => void
}

/** 文本框行：label + 轻提示 + 自由输入 */
function Field({ no, label, value, onChange, placeholder, hint }: {
  no: string; label: string; value: string; onChange: (v: string) => void; placeholder: string; hint?: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium text-gray-600">{no} {label}</label>
        {hint && <span className="text-[10px] text-gray-400">{hint}</span>}
      </div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1a1a1a]" />
    </div>
  )
}

export default function ProfileWizard({ mode, projectName, projectId, scopeTargets, inheritedProfile, onClose, onSave }: Props) {
  const isProject = mode === 'project'
  const [formMode, setFormMode] = useState<'guide' | 'free'>(inheritedProfile?.raw ? 'free' : 'guide')

  // ---- 分类字段（文本框自由填写）----
  const [domain, setDomain] = useState<string>(String(inheritedProfile?.domain || ''))
  const [identity, setIdentity] = useState<string>(String(inheritedProfile?.identity || inheritedProfile?.background || ''))
  const [selfLevel, setSelfLevel] = useState<string>(String(inheritedProfile?.selfLevel || ''))
  const [goal, setGoal] = useState<string>(String(inheritedProfile?.goal || ''))
  const [prefer, setPrefer] = useState<string>(String(inheritedProfile?.prefer || ''))
  const [topic, setTopic] = useState<string>(String(inheritedProfile?.topic || ''))
  const [target, setTarget] = useState<string>(String(inheritedProfile?.target || ''))
  const [questionType, setQuestionType] = useState<string>(String(inheritedProfile?.questionType || ''))
  const [freeText, setFreeText] = useState<string>(String(inheritedProfile?.raw || ''))

  // 上传补传
  const [upBusy, setUpBusy] = useState(false)
  const [upMsg, setUpMsg] = useState('')
  const upFileRef = useRef<HTMLInputElement>(null)

  const uploadFile = async (file: File) => {
    if (!projectId || upBusy) return
    setUpBusy(true); setUpMsg('上传中：' + file.name)
    try {
      const fd = new FormData()
      fd.append('project_id', projectId); fd.append('session_id', 'project-res')
      fd.append('api_key', lsGet(LS.apiKey, ''))
      fd.append('wait', '0'); fd.append('file', file, file.name)
      const d: any = await api.uploadKnowledgeFile(fd)
      if (d && d.status === 'processing') {
        setUpMsg('「' + file.name + '」后台处理中…（可先继续填写或关闭，完成后会询问处理方式）')
        const r = await watchUploadProgress(projectId, file.name)
        if (r.ok) { reportIngestDone(projectId, [file.name]); setUpMsg('✓「' + file.name + '」已入库完成') }
        else setUpMsg('「' + file.name + '」处理失败：' + (r.msg ? r.msg.replace(/。+$/, '') : '处理超时') + '，请稍后在资源页重试')
      } else if (d && d.status === 'ok') {
        reportIngestDone(projectId, [file.name]); setUpMsg('✓「' + file.name + '」已入库完成')
      } else if (d && d.duplicate) {
        setUpMsg('「' + file.name + '」内容已存在，已跳过重复入库')
      } else {
        setUpMsg('「' + file.name + '」接入失败：' + ((d && d.msg) || '处理失败'))
      }
    } catch (e: any) {
      setUpMsg('「' + file.name + '」上传失败：' + (e?.message || '网络异常'))
    } finally {
      setUpBusy(false)
    }
  }

  const scopeList = isProject ? [] : (scopeTargets || [])
  const scopeStep = scopeList.length > 0
  const skipScopeAll = () => { for (const t of scopeList) consumeScopeTarget(t.projectId, t.source) }

  const save = () => {
    if (formMode === 'free' && freeText.trim()) {
      onSave({ raw: freeText.trim(), domain, prefer }); return
    }
    const p: Record<string, any> = {}
    if (domain.trim()) p.domain = domain.trim()
    if (prefer.trim()) p.prefer = prefer.trim()
    if (isProject) {
      if (identity.trim()) p.identity = identity.trim()
      if (selfLevel.trim()) p.selfLevel = selfLevel.trim()
      if (goal.trim()) p.goal = goal.trim()
    } else {
      if (topic.trim()) p.topic = topic.trim()
      if (selfLevel.trim()) p.selfLevel = selfLevel.trim()
      if (target.trim()) p.target = target.trim()
      if (questionType.trim()) p.questionType = questionType.trim()
    }
    onSave(p)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-lift w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="font-display text-lg mb-1 flex items-center gap-2">
          {scopeStep ? (<><ListTree size={17} /> 知识库处理选择</>)
            : isProject ? (<><ClipboardList size={17} /> 课程画像</>)
            : (<><PenLine size={17} /> 对话画像</>)}
        </h2>
        <p className="text-[11px] text-gray-400 mb-4">
          {scopeStep ? '上传的教材已完成切割入库：逐份选择留存范围；跳过则保留全部内容（默认）。'
            : isProject ? '为课程「' + (projectName || '') + '」建立学情画像，AI 将据此调整讲解深度与方式。可逐项填写，或切到「一段话告诉我」一次说清。'
            : '补充本次学习画像（已继承课程画像）。'}
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
            <div className="flex gap-1 p-1 rounded-xl bg-gray-100 mb-4">
              <button onClick={() => setFormMode('guide')} className={'flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg transition-colors ' + (formMode === 'guide' ? 'bg-white shadow-sm font-semibold text-gray-800' : 'text-gray-500')}>
                <ListChecks size={13} /> 逐项填写
              </button>
              <button onClick={() => setFormMode('free')} className={'flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg transition-colors ' + (formMode === 'free' ? 'bg-white shadow-sm font-semibold text-gray-800' : 'text-gray-500')}>
                <FileText size={13} /> 一段话告诉我
              </button>
            </div>

            {formMode === 'free' ? (
              <div>
                <p className="text-[11px] text-gray-500 mb-2">用一段话描述你自己 / 学习目标 / 目前水平 / 希望的学习方式即可，AI 会整理成画像。</p>
                <textarea value={freeText} onChange={e => setFreeText(e.target.value)} rows={6}
                  placeholder={isProject
                    ? '例如：我是大二本科生，没系统学过这门课但有一点基础。想学懂基本原理、能动手做小项目，希望多讲例子少讲公式推导。'
                    : '例如：这次想学 xx 主题，之前零基础/有一点了解，希望学完能自己动手…'}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1a1a1a] resize-none" />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {isProject ? (
                  <>
                    <Field no="①" label="学习领域 / 方向" value={domain} onChange={setDomain}
                      placeholder="如：人工智能 / 智能制造 / PLC 编程…" hint="自由填写，不必照固定选项" />
                    <Field no="②" label="你的身份 / 学历背景" value={identity} onChange={setIdentity}
                      placeholder="如：在校本科生 / 研究生 / 在职工程师 / 转行自学者…" />
                    <Field no="③" label="先验水平自评" value={selfLevel} onChange={setSelfLevel}
                      placeholder="如：零基础 / 有一点点了解 / 学过基础 / 比较熟练…" />
                    <Field no="④" label="学习目标" value={goal} onChange={setGoal}
                      placeholder="如：掌握基本原理，能独立完成一个小型实操项目" />
                    <Field no="⑤" label="偏好学习方式" value={prefer} onChange={setPrefer}
                      placeholder="如：多讲例子少推导 / 边学边实操 / 讲义+刷题巩固…" />
                  </>
                ) : (
                  <>
                    <Field no="①" label="本次学什么" value={topic} onChange={setTopic}
                      placeholder="如：梯形图编程 / 线性代数矩阵…" />
                    <Field no="②" label="本次水平自评" value={selfLevel} onChange={setSelfLevel}
                      placeholder="如：零基础 / 有一点基础 / 熟练…" hint="不填则沿用课程画像" />
                    <Field no="③" label="本次目标" value={target} onChange={setTarget}
                      placeholder="如：理解基本指令并能独立编写" />
                    <Field no="④" label="偏好学习方式" value={prefer} onChange={setPrefer}
                      placeholder="如：多讲例子 / 多实操 / 讲义+刷题…" />
                  </>
                )}
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
              </div>
            )}

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
