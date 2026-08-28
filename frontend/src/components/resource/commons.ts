/** ResourceView 拆分子组件共享类型与工具（5.1） */

export type ListItem = {
  id: string; title: string; sub: string; body: string; icon: any
  kind: 'tutorial' | 'artifact' | 'resource' | 'kb' | 'wiki' | 'gen'; url?: string
  deletable: boolean
  time?: string
  pid?: string
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