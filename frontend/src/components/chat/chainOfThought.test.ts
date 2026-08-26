// 闭环六规范·切片①④：两级标题分类 + 节点数量上限切片逻辑的纯函数守卫。
import { describe, expect, it } from 'vitest'
import { isFlowNode } from '../../components/chat/AssistantMessage'

describe('isFlowNode：帧名 → L1 流程节点映射（拍板五段式）', () => {
  it('5 个真实帧名全覆盖（阶段2 取证的映射表）', () => {
    expect(isFlowNode('学习助手·规划')).toBe('规划')
    expect(isFlowNode('知识库管理')).toBe('检索')
    expect(isFlowNode('学情与记忆管理')).toBe('反思')
    expect(isFlowNode('审核')).toBe('反思')
    expect(isFlowNode('学习助手·生成')).toBe('生成')
  })

  it('白名单外的真实名「视觉理解」降级 L2（null）', () => {
    expect(isFlowNode('视觉理解')).toBeNull()
  })

  it('未知/空名一律降级 L2', () => {
    expect(isFlowNode('某个未来新增的Agent')).toBeNull()
    expect(isFlowNode('')).toBeNull()
  })

  it('L1 命中优先于 displayAgent 净化（映射键是净化前原名）', () => {
    // 学习助手·规划 displayAgent 后是「学习助手」，但映射键必须匹配原名
    expect(isFlowNode('学习助手·规划')).toBe('规划')
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
