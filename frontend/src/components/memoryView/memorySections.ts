/**
 * F12-S2 记忆单框化：课程记忆的规范数据模型「标题→要点[]」与旧 dict 的双向兼容。
 *
 * 为什么兼容层在前端：后端记忆 dict 被记忆对话（memory_chat）、蒸馏（memory_service）、
 * 学情评估（assess）等多条 AI 写路径直接读写键名（抽象目的/偏好/…），改存储 schema
 * 会炸穿整条链；单框化只改变「呈现与编辑模型」，持久化契约不变（保存仍走
 * POST /api/project-memory 的键值合并），旧数据经转换无损进出。
 */

/** 单框的一个 section：## 标题 + 若干要点 */
export interface MemorySection { title: string; points: string[] }

/** 对象型键：由专属组件渲染（进度条/大纲/对话概要），不进单框 */
const OBJECT_KEYS = new Set(['进度', '对话概要', '里程碑'])

/** 数组 nature 键：保存时存数组（与后端白名单键的既有形态一致） */
const ARRAY_KEYS = new Set(['偏好', '知识点', '难点', '薄弱点', '兴趣'])

/** 已知键的稳定展示序：目的与情况在前，补充类靠后（对齐旧 PROJECT_DIMS 的「概述→实现进度」叙事） */
const KNOWN_ORDER = [
  '抽象目的', '抽象项目情况', '起点', '当前水平', '目标',
  '偏好', '知识点', '难点', '薄弱点', '兴趣',
  '课程结束时间', '平均每日投入时间', '其他',
]

function toPoints(v: unknown): string[] {
  if (v == null) return []
  if (Array.isArray(v)) {
    return v.filter((x: any) => typeof x === 'string' || typeof x === 'number')
      .map(x => String(x).trim()).filter(Boolean)
  }
  if (typeof v === 'string' || typeof v === 'number') {
    return String(v).split(/\n+/).map(s => s.trim()).filter(Boolean)
  }
  return []  // 对象值不进单框
}

/** 旧记忆 dict → 单框 sections。已知键按稳定序在前，未知字符串/数组键泛化纳入（AI 新增键不丢）。 */
export function memoryToSections(mem: Record<string, unknown> | null | undefined): MemorySection[] {
  const m = mem || {}
  const out: MemorySection[] = []
  const seen = new Set<string>()
  const push = (title: string, points: string[]) => {
    if (seen.has(title)) return
    seen.add(title)
    out.push({ title, points })
  }
  for (const k of KNOWN_ORDER) {
    if (!(k in m)) continue
    const v = m[k]
    if (v != null && typeof v === 'object' && !Array.isArray(v)) continue  // 对象形态的已知键不进单框
    push(k, toPoints(v))  // 已知键恒渲染（空=待填，行尾输入框可达）
  }
  for (const k of Object.keys(m)) {
    if (seen.has(k) || OBJECT_KEYS.has(k)) continue
    const v = m[k]
    if (v != null && typeof v === 'object' && !Array.isArray(v)) continue  // 未知对象键不渲染（保存时仍保留）
    const pts = toPoints(v)
    if (!pts.length) continue  // 未知键空值跳过（AI 噪声不占版面）
    push(k, pts)
  }
  return out
}

/**
 * 单框 sections → 保存 payload（合并覆盖）。
 * - 数组 nature 键存数组；字符串键存「\n」拼接；
 * - 空要点 section：该键从 payload 省略（后端对已知字符串键本就按空值弹出，语义一致）；
 * - base 中未呈现的键（进度/对话概要/未知对象）原样保留——这是「旧数据不丢」的写侧保证。
 */
export function sectionsToMemory(sections: MemorySection[], base: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(base || {}) }
  for (const s of sections) {
    if (OBJECT_KEYS.has(s.title)) continue
    if (!s.points.length) { delete out[s.title]; continue }
    out[s.title] = ARRAY_KEYS.has(s.title) ? [...s.points] : s.points.join('\n')
  }
  return out
}

/** 单框编辑：向指定标题追加一条要点（section 行尾输入框回车） */
export function appendPoint(sections: MemorySection[], title: string, point: string): MemorySection[] {
  const p = point.trim()
  if (!p) return sections
  return sections.map(s => (s.title === title ? { ...s, points: [...s.points, p] } : s))
}

/** 单框编辑：末尾新建空标题（owner 手动补充位）；重复标题不新建 */
export function appendSection(sections: MemorySection[], title: string): MemorySection[] {
  const t = title.trim()
  if (!t || sections.some(s => s.title === t)) return sections
  return [...sections, { title: t, points: [] }]
}
