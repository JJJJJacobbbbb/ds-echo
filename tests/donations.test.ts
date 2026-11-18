import { describe, expect, it } from 'vitest'
import { parseDonations } from '../src/services/donations.js'

/**
 * 打赏名单的解析测试。
 *
 * 名单是作者手填的 JSON，写错一个逗号或金额写成字符串都会发生，
 * 所以这里重点保证：**坏数据跳过而不是让整个弹窗打不开**，且排序恒定。
 */

describe('parseDonations', () => {
  it('按金额从大到小排序', () => {
    const result = parseDonations([
      { name: 'a', amount: 1.88 },
      { name: 'b', amount: 66.66 },
      { name: 'c', amount: 6.66 },
    ])
    expect(result.map((item) => item.amount)).toEqual([66.66, 6.66, 1.88])
  })

  it('金额相同按名字稳定排序', () => {
    const result = parseDonations([
      { name: '小王', amount: 5 },
      { name: '阿茶', amount: 5 },
    ])
    expect(result.map((item) => item.name)).toEqual(['阿茶', '小王'])
  })

  it('跳过金额非法或非正数的条目', () => {
    const result = parseDonations([
      { name: 'ok', amount: 3 },
      { name: 'zero', amount: 0 },
      { name: 'negative', amount: -1 },
      { name: 'nan', amount: 'abc' },
      null,
      'not an object',
    ])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('ok')
  })

  it('金额是字符串数字时也能解析', () => {
    const result = parseDonations([{ name: 'x', amount: '8.88' }])
    expect(result[0].amount).toBe(8.88)
  })

  it('名字可以为空（显示时由界面替换成"匿名"）', () => {
    const result = parseDonations([{ amount: 6.66 }])
    expect(result[0].name).toBe('')
  })

  it('留言去掉首尾空白；空留言不保留字段', () => {
    const result = parseDonations([
      { name: 'a', amount: 1, message: '  谢谢  ' },
      { name: 'b', amount: 2, message: '   ' },
    ])
    expect(result.find((item) => item.name === 'a')?.message).toBe('谢谢')
    expect(result.find((item) => item.name === 'b')?.message).toBeUndefined()
  })

  it('输入不是数组时返回空列表', () => {
    expect(parseDonations(null)).toEqual([])
    expect(parseDonations({})).toEqual([])
  })
})
