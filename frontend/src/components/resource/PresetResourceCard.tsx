/** F13-S2 预设资源大卡片：封面占位区 + owner 文件命名 + 页数/出版社/初版时间 + 领域徽标。
 *  单文件资源 = 整卡一文件（「加入课程」直取该文件）；多文件 = 资源文件夹（逐文件独立加入）。
 *  点卡片本体 → 详情模态（元数据与文件清单）；加入按钮 stopPropagation 不触发详情。 */
import { BookOpen, FileText, Loader2, Plus } from 'lucide-react'
import type { PresetFile, PresetResource } from '../../api'
import { presetMetaLine } from '../../lib/presetLibrary'

export function PresetResourceCard({ resource, domain, adding, onOpen, onAddFile }: {
  resource: PresetResource
  domain: string
  /** 正在加入课程的文件名（对应按钮转 spinner；null=空闲） */
  adding: string | null
  onOpen: () => void
  onAddFile: (f: PresetFile) => void
}) {
  const single = resource.files.length === 1
  const ext = (resource.files[0]?.ext || 'file').toUpperCase()
  return (
    <div onClick={onOpen}
      className="group card-surface rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-[var(--border-strong)]">
      {/* 封面占位区：owner 明示占位即可——cover 字段非空展示名称备注，否则渐变+图标占位 */}
      <div className="h-24 relative flex items-center justify-center bg-gradient-to-br from-[var(--bg-hover)] to-[var(--bg-active)]">
        <BookOpen size={26} className="text-dim" />
        {resource.cover && (
          <span className="absolute bottom-1 left-2 right-2 text-[9px] text-dim truncate">封面：{resource.cover}</span>
        )}
        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-[#1a1a1a] text-white text-[9px] font-semibold">
          {ext}
        </span>
      </div>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-semibold leading-snug flex-1 min-w-0">{resource.name}</p>
          <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full bg-[var(--bg-hover)] text-[9px] text-dim font-medium max-w-[45%] truncate"
            title={domain}>{domain}</span>
        </div>
        <p className="text-[10px] text-dim">{presetMetaLine(resource) || '元数据待补充'}</p>
        {single ? (
          <button onClick={(e) => { e.stopPropagation(); onAddFile(resource.files[0]) }} disabled={!!adding}
            className="mt-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a1a] text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40">
            {adding === resource.files[0].name ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            {adding === resource.files[0].name ? '加入中…' : '加入课程'}
          </button>
        ) : (
          <div className="mt-auto flex flex-col gap-1 border-t hairline pt-2">
            {resource.files.map(f => (
              <div key={f.rel_path} className="flex items-center gap-1.5">
                <FileText size={11} className="text-dim flex-shrink-0" />
                <span className="text-[10.5px] truncate flex-1">{f.name}</span>
                {typeof f.pages === 'number' && f.pages > 0 && (
                  <span className="text-[9px] text-dim flex-shrink-0">{f.pages}页</span>
                )}
                <button onClick={(e) => { e.stopPropagation(); onAddFile(f) }} disabled={!!adding}
                  className="p-1 rounded text-dim hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] flex-shrink-0 transition-colors"
                  title="加入课程">
                  {adding === f.name ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
