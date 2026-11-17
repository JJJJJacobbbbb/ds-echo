import { describe, expect, it } from 'vitest'
import { planMerge } from '../src/services/chat/mergePlan.js'

/**
 * 合并导入的去重规则单测。
 *
 * 这些用例直接对应计划书 P2 的验收条款，所以每条都写成"要求"的口吻：
 * 同一份归档导入两次不能产生重复；本地已有会话不能被覆盖。
 */

describe('planMerge', () => {
  it('空归档不导入也不报错', () => {
    const plan = planMerge({ stagedIds: [], localIds: [] })
    expect(plan.importIds).toEqual([])
    expect(plan.duplicateIds).toEqual([])
  })

  it('全新归档全部导入', () => {
    const plan = planMerge({ stagedIds: ['a', 'b', 'c'], localIds: [] })
    expect(plan.importIds).toEqual(['a', 'b', 'c'])
    expect(plan.duplicateIds).toEqual([])
  })

  it('同一份归档导入两次：第二次全部跳过（不产生重复）', () => {
    const first = planMerge({ stagedIds: ['a', 'b'], localIds: [] })
    expect(first.importIds).toEqual(['a', 'b'])
    // 第二次：本地已经有 a、b
    const second = planMerge({ stagedIds: ['a', 'b'], localIds: ['a', 'b'] })
    expect(second.importIds).toEqual([])
    expect(second.duplicateIds).toEqual(['a', 'b'])
  })

  it('本地已有会话不被覆盖，只导入新的', () => {
    const plan = planMerge({ stagedIds: ['a', 'b'], localIds: ['a'] })
    expect(plan.importIds).toEqual(['b'])
    expect(plan.duplicateIds).toEqual(['a'])
  })

  it('本地有会话但归档里没有：完全不受影响', () => {
    const plan = planMerge({ stagedIds: ['b'], localIds: ['local-only'] })
    expect(plan.importIds).toEqual(['b'])
    expect(plan.duplicateIds).toEqual([])
  })

  it('归档内部同一 ID 出现两次时只导入一次', () => {
    const plan = planMerge({ stagedIds: ['a', 'a'], localIds: [] })
    expect(plan.importIds).toEqual(['a'])
    expect(plan.duplicateIds).toEqual(['a'])
  })

  it('保留归档顺序，便于界面按时间展示', () => {
    const plan = planMerge({ stagedIds: ['z', 'a', 'm'], localIds: [] })
    expect(plan.importIds).toEqual(['z', 'a', 'm'])
  })

  it('全部重复时 importIds 为空但 duplicateIds 完整', () => {
    const plan = planMerge({ stagedIds: ['a', 'b', 'c'], localIds: ['a', 'b', 'c'] })
    expect(plan.importIds).toEqual([])
    expect(plan.duplicateIds).toHaveLength(3)
  })
})
