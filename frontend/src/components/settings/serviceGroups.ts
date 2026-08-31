/** F14-S2：设置页按「用途」重组的分组单一事实源（顺序即渲染顺序）。
 * 为什么纯文件：CONVENTIONS 纯逻辑导出直调先例（memorySections）；vitest 无 jsdom，组件测试不可行。 */
export interface ServiceGroup { id: 'chat' | 'kb' | 'parse'; title: string; desc: string }
export const SERVICE_GROUPS: ServiceGroup[] = [
  { id: 'chat', title: '对话与审核', desc: '对话主模型与审核判卷模型；DeepSeek 对话 Key 在「基础」页配置' },
  { id: 'kb', title: '知识库检索', desc: '向量化 + 重排（硅基流动 Key 驱动）' },
  { id: 'parse', title: '文档解析', desc: 'MinerU 未配置时自动降级本地 pymupdf4llm 兜底，功能不中断' },
]