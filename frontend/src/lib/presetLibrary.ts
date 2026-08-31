/** F13-S1 预设资源库前端纯逻辑：领域合并 / 清单索引 / 摘要与详情文案（导出纯函数供测试直调） */
import type { PresetDomain, PresetResource } from '../api'

/** 领域合并：默认领域在前（承载链接教程/百科）→ 预设领域（去重）→ 自定义领域（localStorage） */
export function mergeDomains(defaults: string[], preset: string[], custom: string[]): string[] {
  const out: string[] = []
  for (const d of [...defaults, ...preset, ...custom]) {
    if (d && !out.includes(d)) out.push(d)
  }
  return out
}

/** API 三级清单 → 领域→资源 映射（组件按选中领域直取，O(1)） */
export function groupByDomain(domains: PresetDomain[]): Record<string, PresetResource[]> {
  const out: Record<string, PresetResource[]> = {}
  for (const d of domains) out[d.name] = d.resources || []
  return out
}

/** 「预设资源」页签下当前领域无内容时，返回第一个有预设资源的领域（无则 null） */
export function firstPresetDomain(order: string[], byDomain: Record<string, PresetResource[]>): string | null {
  for (const d of order) {
    if ((byDomain[d] || []).length > 0) return d
  }
  return null
}

/** 资源摘要（卡片副标题）：多文件 → 文件数；单文件 → 页数（md 无页数留空） */
export function presetSummary(res: PresetResource): string {
  if (res.files.length > 1) return `${res.files.length} 个文件`
  const p = res.files[0]?.pages
  return typeof p === 'number' && p > 0 ? `${p} 页` : ''
}

/** 大卡片元数据行（F13-S2）：页数/文件数 · 出版社 · 初版时间；缺省项不显示 */
export function presetMetaLine(res: PresetResource): string {
  const parts: string[] = []
  const withPages = res.files.filter(f => typeof f.pages === 'number' && f.pages > 0)
  if (res.files.length > 1) parts.push(`${res.files.length} 个文件`)
  else if (withPages.length) parts.push(`${withPages[0].pages} 页`)
  if (res.publisher) parts.push(res.publisher)
  if (res.pub_year) parts.push(res.pub_year)
  return parts.join(' · ')
}

/* ---------- F13-S3 打开方式矩阵（派发单 §四.4：pdf=内嵌阅读器 / md·txt=统一渲染 / pptx·docx=下载 / 异常=iframe 兜底） ---------- */

export type PresetFileKind = 'pdf' | 'text' | 'office' | 'other'

/** 按文件名/URL 扩展名判打开方式（query/hash 剥离；编码 URL 的扩展名是 ASCII 不受影响） */
export function presetFileKind(nameOrUrl: string): PresetFileKind {
  const clean = (nameOrUrl || '').split('?')[0].split('#')[0]
  const last = clean.slice(clean.lastIndexOf('/') + 1)
  const e = last.includes('.') ? last.slice(last.lastIndexOf('.') + 1).toLowerCase() : ''
  if (e === 'pdf') return 'pdf'
  if (e === 'md' || e === 'markdown' || e === 'txt') return 'text'
  if (e === 'pptx' || e === 'docx') return 'office'
  return 'other'
}

/** 资源详情正文：占位元数据（出版社/初版时间/页数）+ 文件清单；缺省项不显示 */
export function presetDetailBody(res: PresetResource): string {
  const lines: string[] = []
  if (res.publisher) lines.push(`出版社：${res.publisher}`)
  if (res.pub_year) lines.push(`初版时间：${res.pub_year}`)
  if (res.files.length > 1) {
    lines.push(`文件数：${res.files.length}`)
  } else {
    const p = res.files[0]?.pages
    if (typeof p === 'number' && p > 0) lines.push(`页数：${p}`)
  }
  if (lines.length) lines.push('')
  lines.push(...res.files.map(f => `- ${f.name}`))
  return lines.join('\n')
}
