/** 阅读偏好：结构化程度展示（列表/表格），未设置项留空。 */
export function PrefSummary({ pref }: { pref: Record<string, any> | null }) {
  const jc = pref?.结构化程度 || {}
  const list = jc?.列表
  const table = jc?.表格
  return (
    <div className="flex flex-col gap-1.5 text-xs leading-relaxed">
      <p><span className="font-semibold text-[var(--text)]">列表</span>　{list ? (list.喜欢 ? `喜欢 · ${list.有序 ? '有序' : '无序'}` : '不喜欢') : ''}</p>
      <p><span className="font-semibold text-[var(--text)]">表格</span>　{table ? (table.喜欢 ? '喜欢' : '不喜欢') : ''}</p>
    </div>
  )
}
