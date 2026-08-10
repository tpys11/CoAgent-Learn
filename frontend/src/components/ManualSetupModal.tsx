import { useEffect, useState } from 'react'
import { X, Save, Loader2 } from 'lucide-react'

/** 课程基本信息手动填写弹窗：新建课程引导消息右下角「手动填写」打开；
 * 字段保存到课程记忆（project_memories 白名单字段）+ 课程名（projects） */
export default function ManualSetupModal({ projectId, projectName, onClose }: {
  projectId: string | null
  projectName: string
  onClose: () => void
}) {
  const [name, setName] = useState(projectName || '')
  const [purpose, setPurpose] = useState('')      // 抽象目的
  const [overview, setOverview] = useState('')    // 抽象项目情况
  const [start, setStart] = useState('')          // 起点
  const [level, setLevel] = useState('')          // 当前水平
  const [goal, setGoal] = useState('')            // 目标
  const [prefer, setPrefer] = useState('')        // 偏好（逗号分隔）
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // 打开时预填当前课程记忆
  useEffect(() => {
    if (!projectId) return
    fetch('/api/project-memory/' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const m = d.memory || {}
        setPurpose(String(m['抽象目的'] || ''))
        setOverview(String(m['抽象项目情况'] || ''))
        setStart(String(m['起点'] || ''))
        setLevel(String(m['当前水平'] || ''))
        setGoal(String(m['目标'] || ''))
        const p = m['偏好']
        setPrefer(Array.isArray(p) ? p.join('、') : String(p || ''))
      })
      .catch(() => {})
  }, [projectId])

  const save = async () => {
    if (!projectId) return
    setSaving(true)
    try {
      // 课程记忆：合并保存（白名单字段）
      await fetch('/api/project-memory/' + encodeURIComponent(projectId), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: {
          抽象目的: purpose, 抽象项目情况: overview, 起点: start, 当前水平: level, 目标: goal,
          偏好: prefer.split(/[,，、\n]+/).map(s => s.trim()).filter(Boolean),
        } }),
      })
      // 课程名
      if (name.trim() && name.trim() !== projectName) {
        await fetch('/api/projects/' + encodeURIComponent(projectId), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim() }),
        })
      }
      setSaved(true)
      setTimeout(onClose, 800)
    } catch (e) {
      alert('保存失败：' + ((e as any)?.message || '网络异常'))
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, placeholder: string, value: string, set: (v: string) => void, rows = 1) => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold text-dim">{label}</span>
      <textarea rows={rows} value={value} placeholder={placeholder}
        onChange={(e) => set(e.target.value)}
        className="w-full px-2.5 py-1.5 rounded-lg border hairline outline-none text-xs resize-none bg-[var(--bg-input)] focus:border-[var(--accent)]" />
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={onClose}>
      <div className="card-lift rounded-2xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold">课程基本信息</p>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-lg icon-btn" title="关闭">
            <X size={14} />
          </button>
        </div>
        <div className="flex flex-col gap-2.5">
          {field('课程名', '例如：Python 数据分析实战', name, setName)}
          {field('学习目的', '为什么学？（求职 / 兴趣 / 考试 / 项目需要…）', purpose, setPurpose)}
          {field('课程概述', '一句话说说这门课学什么', overview, setOverview)}
          {field('起点水平', '开始学习前的水平', start, setStart)}
          {field('当前水平', '现在的水平', level, setLevel)}
          {field('学习目标', '想最终学会什么', goal, setGoal)}
          {field('偏好', '喜欢的学习方式（逗号分隔，如：例子驱动、视频、图文）', prefer, setPrefer)}
          <div className="flex gap-2 mt-1">
            <button onClick={onClose}
              className="flex-1 py-2 rounded-xl text-[11px] font-medium border hairline row-hover transition-colors">取消</button>
            <button onClick={save} disabled={saving || saved}
              className="flex-1 py-2 rounded-xl text-[11px] font-medium text-white bg-[var(--accent)] hover:opacity-90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
              {saved ? <><Loader2 size={11} className="animate-spin" /> 已保存</> : <><Save size={11} /> 保存</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
