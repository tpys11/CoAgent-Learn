/** ResourceView 拆分子组件共享类型与工具（5.1） */
import { BookOpen, FileText, Wrench } from 'lucide-react'

export type Tab = 'tutorials' | 'generated' | 'uploads'

export type ListItem = {
  id: string; title: string; sub: string; body: string; icon: any
  kind: 'tutorial' | 'artifact' | 'resource' | 'kb' | 'wiki' | 'gen'; url?: string
  deletable: boolean
  time?: string
  pid?: string
}

export const TYPE_ICONS: Record<string, any> = {
  '定制讲义': BookOpen, '讲义': BookOpen,
  '实操指南': Wrench,
  '分阶测试题': FileText, '测试题': FileText,
}

/** 时间格式化：ISO/sqlite 时间 → YYYY-MM-DD */
export const fmtTime = (s?: string) => {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(s).slice(0, 10)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 导出卡片内容为 Markdown 文件（wiki 详情 / 生成物 / 资料正文） */
export const exportItem = (item: ListItem) => {
  const content = item.body || ''
  const safeName = (item.title || '导出').replace(/[\\/:*?"<>|]/g, '-')
  const blob = new Blob(['# ' + item.title + '\n\n' + content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = safeName + '.md'; a.click()
  URL.revokeObjectURL(url)
}