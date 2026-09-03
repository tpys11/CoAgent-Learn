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

const DOMAINS = ['智能制造', '人工智能', '软件开发', '工业互联网', '其他']
const LEVELS = ['零基础', '有基础', '熟练', '精通']
const IDENTITIES = ['在校本科生', '在校研究生', '在职工程师', '转行自学者', '其他']
const PREFER = ['讲义讲解', '实操练习', '刷题巩固', '混合']

export default function ProfileWizard({ mode, projectName, projectId, scopeTargets, inheritedProfile, onClose, onSave }: Props) {
  const isProject = mode === 'project'
  // 填写形式：分类引导（默认） / 一段话自由填写
  const [formMode, setFormMode] = useState<'guide' | 'free'>(inheritedProfile?.raw ? 'free' : 'guide')

  // ---- 分类字段 ----
  const [domain, setDomain] = useState(inheritedProfile?.domain || DOMAINS[0])
  const [identity, setIdentity] = useState(inheritedProfile?.identity || inheritedProfile?.background || IDENTITIES[0])
  const [selfLevel, setSelfLevel] = useState(inheritedProfile?.selfLevel || inheritedProfile?.background || LEVELS[0])
  const [goal, setGoal] = useState(inheritedProfile?.goal || '')
  const [prefer, setPrefer] = useState(inheritedProfile?.prefer || PREFER[3])
  // ---- 对话字段 ----
  const [topic, setTopic] = useState(inheritedProfile?.topic || '')
  const [target, setTarget] = useState(inheritedProfile?.target || '')
  const [questionType, setQuestionType] = useState(inheritedProfile?.questionType || '基础')
  // ---- 自由文本 ----
  const [freeText, setFreeText] = useState(inheritedProfile?.raw || '')

  // F10-S1 向导补传
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
    const p: Record<string, any> = { domain, prefer }
    if (isProject) {
      p.identity = identity; p.selfLevel = selfLevel; p.goal = goal
    } else {
      p.topic = topic; p.selfLevel = selfLevel || LEVELS[1]; p.target = target; p.questionType = questionType
    }
    onSave(p)
  }

  const chip = (on: boolean) => 'text-[11px] px-2.5 py-1 rounded-lg border transition-colors ' + (on ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-gray-600 border-gray-200')

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
            : isProject ? '为课程「' + (projectName || '') + '」建立学情画像，AI 将据此调整讲解深度与方式'
            : '补充本次学习画像（已继承课程画像）'}
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
            {/* 填写形式切换：分类引导 / 一段话自由填写 */}
            <div className="flex gap-1 p-1 rounded-xl bg-gray-100 mb-4">
              <button onClick={() => setFormMode('guide')} className={'flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg transition-colors ' + (formMode === 'guide' ? 'bg-white shadow-sm font-semibold text-gray-800' : 'text-gray-500')}>
                <ListChecks size={13} /> 分类填写
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
                {isProject && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-gray-600">① 学习领域</label>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {DOMAINS.map(d => (
                          <button key={d} onClick={() => setDomain(d)} className={chip(domain === d)}>{d}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">② 你的身份 / 学历背景</label>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {IDENTITIES.map(x => (
                          <button key={x} onClick={() => setIdentity(x)} className={chip(identity === x)}>{x}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">③ 先验水平自评</label>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {LEVELS.map(l => (
                          <button key={l} onClick={() => setSelfLevel(l)} className={chip(selfLevel === l)}>{l}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">④ 学习目标</label>
                      <input value={goal} onChange={e => setGoal(e.target.value)} placeholder="如：掌握基本原理，能独立完成一个小型实操项目"
                        className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1a1a1a]" />
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
                          <button key={l} onClick={() => setSelfLevel(l)} className={chip(selfLevel === l)}>{l}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">③ 本次目标</label>
                      <input value={target} onChange={e => setTarget(e.target.value)} placeholder="如：理解基本指令并能独立编写" className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1a1a1a]" />
                    </div>
                  </>
                )}
                <div>
                  <label className="text-xs font-medium text-gray-600">{isProject ? '⑤' : '④'} 偏好学习方式</label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {PREFER.map(p => (
                      <button key={p} onClick={() => setPrefer(p)} className={chip(prefer === p)}>{p}</button>
                    ))}
                  </div>
                </div>
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
