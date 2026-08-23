/** URL 结构预扫描共享件：状态类型 / 工具函数 / 一次性探测 hook / 预览卡片组件。
 *  UploadPanel（手动粘贴）与 ProjectConfigModal（系统预设卡）两个入口共用，保证行为一致。 */
import { useState, useCallback, useRef } from 'react'
import { FolderTree, Globe, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../../api'
import type { UrlIngestScope, UrlProbeOk } from '../../api'

/** 链接预检状态机：闲置 → 识别中 → 成功（带预览数据）/ 失败（可直接上传兜底） */
export type ProbeState =
  | { phase: 'idle' }
  | { phase: 'loading'; url: string }
  | { phase: 'error'; url: string; msg: string }
  | { phase: 'ok'; url: string; data: UrlProbeOk }

export const PROBE_DEBOUNCE_MS = 600
export const GROUP_COLLAPSE_AT = 6   // 超过该数量时折叠
export const GROUP_COLLAPSE_KEEP = 5 // 折叠时保留可见的条数

export const isHttpUrl = (s: string) => /^https?:\/\/.+/.test(s)
/** 归一化仅用于「是否同一个链接」的判定：去空白、去锚点、去尾部斜杠 */
export const normUrl = (raw: string) => raw.trim().split('#')[0].replace(/\/+$/, '')

/** 勾选与默认一致 / 无可分区内容 → 不下发范围字段（后端按默认全量处理） */
export function buildScopeFrom(groups: UrlProbeOk['groups'], checked: Record<string, boolean>): UrlIngestScope | undefined {
  const gs = groups ?? []
  if (!gs.length) return undefined
  const checkedKeys = gs.filter(g => checked[g.key]).map(g => g.key).sort()
  const defaults = gs.filter(g => g.default_selected).map(g => g.key).sort()
  if (checkedKeys.length === defaults.length && checkedKeys.every((k, i) => k === defaults[i])) return undefined
  return { includeGroups: checkedKeys, excludeGroups: gs.filter(g => !checked[g.key]).map(g => g.key).sort() }
}

/** 一次性探测 hook：预设卡等「固定链接、点一下探一次」的场景（无输入防抖需求）。 */
export function useProbeOnce() {
  const [state, setState] = useState<ProbeState>({ phase: 'idle' })
  const [groupChecked, setGroupChecked] = useState<Record<string, boolean>>({})
  const [groupsOpen, setGroupsOpen] = useState(false)
  const seqRef = useRef(0)

  const reset = useCallback(() => {
    seqRef.current++
    setState({ phase: 'idle' })
    setGroupChecked({})
    setGroupsOpen(false)
  }, [])

  const run = useCallback(async (raw: string) => {
    const norm = normUrl(raw)
    if (!isHttpUrl(norm)) return
    const seq = ++seqRef.current
    setState({ phase: 'loading', url: norm })
    try {
      const d = await api.uploadUrlProbe(raw)
      if (seq !== seqRef.current) return // 已有更新的请求，丢弃过期响应
      if (d.status === 'ok') {
        const next: Record<string, boolean> = {}
        for (const g of d.groups ?? []) next[g.key] = !!g.default_selected
        setGroupChecked(next)
        setGroupsOpen(false)
        setState({ phase: 'ok', url: norm, data: d })
      } else {
        setState({ phase: 'error', url: norm, msg: d.msg ?? '' })
      }
    } catch (e) {
      if (seq !== seqRef.current) return
      setState({ phase: 'error', url: norm, msg: e instanceof Error ? e.message : '' })
    }
  }, [])

  const data = state.phase === 'ok' ? state.data : null
  const groups = data?.groups ?? []
  const buildScope = (): UrlIngestScope | undefined =>
    data ? buildScopeFrom(groups, groupChecked) : undefined

  return { state, data, groups, groupChecked, setGroupChecked, groupsOpen, setGroupsOpen, run, reset, buildScope }
}

/** 结构预览卡片（纯展示）：徽章 / 计数与上限 / 警告 / 分组勾选清单（含折叠与全选） */
export function ProbePreviewCard({ data, groups: rawGroups, checked, onToggle, onSelectAll, open, onToggleOpen }: {
  data: UrlProbeOk
  groups?: UrlProbeOk['groups']
  checked: Record<string, boolean>
  onToggle: (key: string) => void
  onSelectAll: (all: boolean) => void
  open: boolean
  onToggleOpen: () => void
}) {
  const groups = rawGroups ?? []
  const checkedKeys = groups.filter(g => checked[g.key]).map(g => g.key)
  const checkedFiles = groups.filter(g => checked[g.key]).reduce((n, g) => n + (g.count || 0), 0)
  const visible = groups.length > GROUP_COLLAPSE_AT && !open ? groups.slice(0, GROUP_COLLAPSE_KEEP) : groups
  return (
    <div className="flex flex-col gap-2 rounded-xl border hairline bg-[var(--bg-input)] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 flex-shrink-0 px-2 py-0.5 rounded-full bg-[var(--bg-hover)] text-[10px] font-medium">
          {data.kind === 'github' ? <FolderTree size={10} /> : <Globe size={10} />}
          {data.kind === 'github' ? 'GitHub 仓库' : '文档站'}
        </span>
        <span className="text-[11.5px] font-medium truncate flex-1" title={data.title_hint}>{data.title_hint}</span>
        <span className={`text-[10px] flex-shrink-0 ${data.truncated ? 'text-amber-600 font-medium' : 'text-dim'}`}>
          {data.total_files} / 上限 {data.max_files}
        </span>
      </div>
      {(data.warnings ?? []).map((w, i) => (
        <p key={i} className="text-[10px] leading-relaxed text-amber-600">{w}</p>
      ))}
      {groups.length === 0 ? (
        <p className="text-[11px] text-dim">未识别到可分区内容，将全量摄取</p>
      ) : (
        <div className="flex flex-col gap-0.5 border-t hairline pt-2">
          <div className="flex items-center gap-2 px-1.5 pb-0.5">
            <span className="text-[10px] font-semibold text-dim flex-1">
              选择摄取范围（已选 {checkedKeys.length}/{groups.length} 项 · 约 {checkedFiles} 个文件）
            </span>
            <button onClick={() => onSelectAll(true)}
              className="text-[10px] text-dim hover:text-[var(--accent)] transition-colors">全选</button>
            <button onClick={() => onSelectAll(false)}
              className="text-[10px] text-dim hover:text-[var(--accent)] transition-colors">全不选</button>
          </div>
          {visible.map(g => (
            <label key={g.key} className="flex items-center gap-2 px-1.5 py-1 rounded-lg row-hover cursor-pointer">
              <input type="checkbox" checked={!!checked[g.key]}
                onChange={() => onToggle(g.key)}
                className="w-3.5 h-3.5 flex-shrink-0 accent-[var(--accent)]" />
              <span className="text-[11px] truncate flex-1" title={g.key}>{g.label}</span>
              <span className="text-[10px] text-dim flex-shrink-0">（{g.count}）</span>
            </label>
          ))}
          {groups.length > GROUP_COLLAPSE_AT && (
            <button onClick={onToggleOpen}
              className="inline-flex items-center gap-1 self-start px-1.5 py-1 text-[10px] text-dim hover:text-[var(--accent)] transition-colors">
              {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              {open ? '收起' : `展开全部 ${groups.length} 项`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
