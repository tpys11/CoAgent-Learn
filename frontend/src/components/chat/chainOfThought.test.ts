// 闭环六规范·切片①④：两级标题分类 + 节点数量上限切片逻辑的纯函数守卫。
// RC3-S2 行为变更（owner 反馈①「无意义的反思和检索」）：FLOW_NODE_MAP 删除
// 「知识库管理→检索」「学情与记忆管理→反思」「审核→反思」改名归并映射——
// 有内容链目一律按真实 agent 名独立显示（L2），无内容节点不渲染。
// 本文件相应改写钉住新语义（正当测试更新，非删测试护绿；映射表缩小是行为变更本体）。
import { describe, expect, it } from 'vitest'
import { isFlowNode, mergeThinkItems } from '../../components/chat/AssistantMessage'

describe('isFlowNode：帧名 → 节点名（RC3-S2 真实名治理后）', () => {
  it('仅「·规划/·生成」后缀名保留映射（displayAgent 截断后仍保留阶段信息）', () => {
    expect(isFlowNode('学习助手·规划')).toBe('规划')
    expect(isFlowNode('学习助手·生成')).toBe('生成')
  })

  it('有内容链目按真实 agent 名独立显示：知识库管理/学情与记忆管理/审核均不再改名（null=L2）', () => {
    expect(isFlowNode('知识库管理')).toBeNull()
    expect(isFlowNode('学情与记忆管理')).toBeNull()
    expect(isFlowNode('审核')).toBeNull()
  })

  it('审核与学情互不归并：各自独立成节点（旧行为两者同显「反思」）', () => {
    const items = [
      { agent: '学情与记忆管理', content: '学情评估内容', run_ids: [] as string[] },
      { agent: '审核', content: '审核结论内容', run_ids: [] as string[] },
    ]
    const merged = mergeThinkItems(items, false)
    expect(merged).toHaveLength(2)
    expect(merged[0].agent).toBe('学情与记忆管理')
    expect(merged[1].agent).toBe('审核')
  })

  it('未知/空名一律降级 L2', () => {
    expect(isFlowNode('视觉理解')).toBeNull()
    expect(isFlowNode('某个未来新增的Agent')).toBeNull()
    expect(isFlowNode('')).toBeNull()
  })
})

describe('mergeThinkItems：无内容节点不渲染（RC3-S2③）', () => {
  it('完成态（streaming=false）剔除空内容占位——只显示真实发生且有内容的步骤', () => {
    const items = [
      { agent: '学习助手·规划', content: '规划要点', run_ids: [] as string[] },
      { agent: '知识库管理', content: '', run_ids: [] as string[] },
      { agent: '审核', content: '   ', run_ids: [] as string[] },
    ]
    const merged = mergeThinkItems(items, false)
    expect(merged).toHaveLength(1)
    expect(merged[0].agent).toBe('学习助手·规划')
  })

  it('流式期保留空占位（step 帧=进行中标记）', () => {
    const items = [{ agent: '知识库管理', content: '', run_ids: [] as string[] }]
    const merged = mergeThinkItems(items, true)
    expect(merged).toHaveLength(1)
  })

  it('相邻同名归并+run_ids 去重、「运行统计」剔除（既有语义回归钉）', () => {
    const items = [
      { agent: '学习助手·规划', content: 'a', run_ids: [] as string[] },
      { agent: '运行统计', content: 'stats', run_ids: [] as string[] },
      { agent: '学习助手·规划', content: 'b', run_ids: ['r1'] },
      { agent: '学习助手·规划', content: 'c', run_ids: ['r1', 'r2'] },
    ]
    const merged = mergeThinkItems(items, false)
    expect(merged).toHaveLength(1)
    expect(merged[0].content).toBe('a\nb\nc')
    expect(merged[0].run_ids).toEqual(['r1', 'r2'])
  })
})

describe('切片④：节点数量上限切片逻辑（首2+尾6，中段收「+N」）', () => {
  const sliceForRender = (n: number, cap = 8) =>
    n <= cap ? { head: 0, tail: n } : { head: 2, tail: 6 }

  it('≤8 条全量渲染', () => {
    expect(sliceForRender(3)).toEqual({ head: 0, tail: 3 })
    expect(sliceForRender(8)).toEqual({ head: 0, tail: 8 })
  })

  it('>8 条：首 2 + 尾 6，中段收起 9 条时 +1', () => {
    const s = sliceForRender(9)
    expect(s).toEqual({ head: 2, tail: 6 })
    expect(9 - s.head - s.tail).toBe(1) // 「+1 早期步骤」
  })

  it('50 条时中段 42 条', () => {
    const s = sliceForRender(50)
    expect(50 - s.head - s.tail).toBe(42)
  })
})
