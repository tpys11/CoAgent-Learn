/** F13-S2/S3 预设资源详情：占位元数据编辑（PUT /api/preset-library/meta 持久化——验收 #3）
 *  + 文件清单（每文件独立「阅读」/「加入课程」——资源文件夹内单文件可独立摄取）。
 *  元数据写入资源首个文件的 meta 行（后端 head 约定）；cover 为占位字符串仅展示。 */
import { useState } from 'react'
import { BookOpen, FileText, Loader2, Plus, X } from 'lucide-react'
import { api } from '../../api'
import type { PresetFile, PresetResource } from '../../api'
import { presetMetaLine } from '../../lib/presetLibrary'

export function PresetDetailModal({ resource, domain, adding, onClose, onAddFile, onRead, onSaved }: {
  resource: PresetResource
  domain: string
  adding: string | null
  onClose: () => void
  onAddFile: (f: PresetFile) => void
  onRead: (f: PresetFile) => void
  /** 保存成功后回调（父组件刷新清单，卡片元数据行同步更新） */
  onSaved?: () => void
}) {
  const [publisher, setPublisher] = useState(resource.publisher)
  const [pubYear, setPubYear] = useState(resource.pub_year)
  const [cover, setCover] = useState(resource.cover)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const save = async () => {
    const rel = resource.files[0]?.rel_path
    if (!rel) { setMsg('该资源无文件，无法保存元数据'); return }
    setSaving(true); setMsg('')
    try {
      const d = await api.updatePresetMeta({ rel_path: rel, publisher, pub_year: pubYear, cover })
      if (d && d.status === 'ok') { setMsg('已保存'); onSaved?.() }
      else setMsg((d && d.msg) || '保存失败')
    } catch (e) {
      setMsg(((e as any)?.message as string) || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--bg-panel)] rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)] flex-shrink-0">
          <h3 className="text-base font-bold flex items-center gap-2 min-w-0">
            <BookOpen size={16} className="flex-shrink-0" />
            <span className="truncate">{resource.name}</span>
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-[var(--bg-hover)] rounded flex-shrink-0"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <p className="text-[11px] text-dim">{domain} · {presetMetaLine(resource) || '元数据待补充'}</p>
          {/* 占位元数据编辑（owner 明示占位即可）：出版社 / 初版时间 / 封面 */}
          <div className="border border-[var(--border-color)] rounded-xl p-3 flex flex-col gap-2">
            <p className="text-[11px] font-semibold text-dim">元数据（占位字段，可编辑）</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input value={publisher} onChange={e => setPublisher(e.target.value)} placeholder="出版社"
                className="px-2.5 py-1.5 text-[11px] input-surface rounded-lg outline-none" />
              <input value={pubYear} onChange={e => setPubYear(e.target.value)} placeholder="初版时间"
                className="px-2.5 py-1.5 text-[11px] input-surface rounded-lg outline-none" />
              <input value={cover} onChange={e => setCover(e.target.value)} placeholder="封面图（占位）"
                className="px-2.5 py-1.5 text-[11px] input-surface rounded-lg outline-none" />
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] ${msg === '已保存' ? 'text-emerald-600' : 'text-red-500'}`}>{msg}</span>
              <button onClick={save} disabled={saving}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-[#1a1a1a] text-[11px] font-semibold text-white disabled:opacity-40">
                {saving ? <Loader2 size={11} className="animate-spin" /> : null} 保存
              </button>
            </div>
          </div>
          {/* 文件清单：单文件可独立加入课程 / 阅读器打开（pdf=阅读器、md=统一渲染、pptx/docx=下载兜底） */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-semibold text-dim">文件（{resource.files.length}）</p>
            {resource.files.map(f => (
              <div key={f.rel_path} className="flex items-center gap-2 rounded-lg border hairline px-2.5 py-1.5">
                <FileText size={12} className="text-dim flex-shrink-0" />
                <span className="text-[11px] font-medium truncate flex-1">{f.name}</span>
                {typeof f.pages === 'number' && f.pages > 0 && (
                  <span className="text-[9px] text-dim flex-shrink-0">{f.pages} 页</span>
                )}
                <button onClick={() => onRead(f)}
                  className="px-2 py-1 rounded-lg text-[10px] text-dim hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] flex-shrink-0 transition-colors">
                  阅读
                </button>
                <button onClick={() => onAddFile(f)} disabled={!!adding}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#1a1a1a] text-[10px] text-white flex-shrink-0 disabled:opacity-40">
                  {adding === f.name ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                  {adding === f.name ? '加入中' : '加入课程'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
