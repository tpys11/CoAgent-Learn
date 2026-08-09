import { useEffect, useState } from 'react'
import { Home, Plus, X, FolderOpen, Clock } from 'lucide-react'

/** 系统预设领域 → 预存图片（非系统自带领域无图，显示首字占位） */
const DOMAIN_IMAGES: Record<string, string> = {
  'Agent 应用与开发': '/domain-images/agent.svg',
  'Python 编程': '/domain-images/python.svg',
}

interface HomeProject {
  id: string
  name: string
  domain?: string
  simple?: boolean
  created_at?: string
}

/** 主页：按项目展开（图片 + 名称 + 信息），点击进入该项目对话 */
export default function HomeView({ projects, onEnter, onCreate, onDelete }: {
  projects: HomeProject[]
  onEnter: (id: string) => void
  onCreate: (name: string) => void
  onDelete: (id: string) => void
}) {
  const [stats, setStats] = useState<Record<string, number>>({})
  useEffect(() => {
    const m: Record<string, number> = {}
    Promise.all(projects.map(p =>
      fetch('/api/stats?project_id=' + encodeURIComponent(p.id), { cache: 'no-store' })
        .then(r => r.json()).then(d => { m[p.id] = d.dialogue_count ?? d.count ?? 0 }).catch(() => { m[p.id] = 0 })
    )).then(() => setStats(m))
  }, [projects])

  const newProject = () => {
    const name = window.prompt('项目名称：')
    if (name && name.trim()) onCreate(name.trim())
  }

  return (
    <div className="flex-1 h-full min-w-0 flex panel rounded-3xl overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-10 py-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><Home size={22} /> 我的主页</h1>
              <p className="text-xs text-dim mt-1.5">选择项目进入对话，或创建新项目开始学习</p>
            </div>
            <button onClick={newProject}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl hover:bg-[#333333] transition-colors">
              <Plus size={14} /> 新建项目
            </button>
          </div>
          {projects.length === 0 ? (
            <div className="border border-dashed hairline rounded-3xl py-20 flex flex-col items-center gap-3 text-dim">
              <FolderOpen size={36} className="opacity-50" />
              <p className="text-sm">还没有项目，点击「新建项目」开始</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {projects.map(p => {
                const img = p.domain ? DOMAIN_IMAGES[p.domain] : undefined
                return (
                  <div key={p.id} onClick={() => onEnter(p.id)}
                    className="group relative card-surface rounded-2xl overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-[var(--border-strong)]">
                    {/* 项目图片：系统预设领域加载预存图，其他无图（首字占位） */}
                    <div className="h-36 w-full overflow-hidden">
                      {img ? (
                        <img src={img} alt={p.domain} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-white"
                          style={{ background: 'linear-gradient(135deg, var(--border-strong), var(--bg-hover))' }}>
                          {p.name.slice(0, 1)}
                        </div>
                      )}
                    </div>
                    <div className="p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold truncate">{p.name}</span>
                        <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`删除项目「${p.name}」？`)) onDelete(p.id) }}
                          className="p-1 rounded-lg text-dim opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all flex-shrink-0" title="删除项目">
                          <X size={13} />
                        </button>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-dim">
                        {p.domain && <span className="px-2 py-0.5 rounded-full bg-[var(--bg-hover)]">{p.domain}</span>}
                        <span className="flex items-center gap-1"><Clock size={10} /> {p.created_at ? String(p.created_at).slice(0, 10) : '—'}</span>
                        <span>{stats[p.id] ?? 0} 次对话</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
