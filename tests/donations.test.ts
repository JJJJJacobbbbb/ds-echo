import { describe, expect, it } from 'vitest'
import { parseDonations } from '../src/services/donations.js'

/**
 * 打赏名单解析。
 *
 * 名单是作者手填的 JSON，写错一个逗号、金额写成字符串都会发生，
 * 所以这里重点保证：**坏数据跳过而不是让整个弹窗打不开**，排序恒定，
 * 并且能读「带 updatedAt 的新格式」和「纯数组的旧格式」。
 */

describe('parseDonations', () => {
  const wrap = (items: unknown[]) => ({ updatedAt: '2026-11-18', items })

  it('按金额从大到小排序', () => {
    const { items } = parseDonations(
      wrap([
        { name: 'a', amount: 1.88 },
        { name: 'b', amount: 66.66 },
        { name: 'c', amount: 6.66 },
      ])
    )
    expect(items.map((item) => item.amount)).toEqual([66.66, 6.66, 1.88])
  })

  it('金额相同按名字排序', () => {
    const { items } = parseDonations(
      wrap([
        { name: '小王', amount: 5 },
        { name: '阿茶', amount: 5 },
      ])
    )
    expect(items.map((item) => item.name)).toEqual(['阿茶', '小王'])
  })

  it('跳过金额非法或非正数的条目', () => {
    const { items } = parseDonations(
      wrap([
        { name: 'ok', amount: 3 },
        { name: 'zero', amount: 0 },
        { name: 'negative', amount: -1 },
        { name: 'nan', amount: 'abc' },
        null,
        'not an object',
      ])
    )
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('ok')
  })

  it('金额是字符串数字时也能解析', () => {
    const { items } = parseDonations(wrap([{ name: 'x', amount: '8.88' }]))
    expect(items[0].amount).toBe(8.88)
  })

  it('名字可以为空（显示时由界面替换成"匿名"）', () => {
    const { items } = parseDonations(wrap([{ amount: 6.66 }]))
    expect(items[0].name).toBe('')
  })

  it('只保留名称与金额，多余字段被忽略', () => {
    const { items } = parseDonations(
      wrap([{ name: 'a', amount: 1, message: '谢谢', date: '2026-11-01' }])
    )
    expect(items[0]).toEqual({ name: 'a', amount: 1 })
  })

  it('读出 updatedAt', () => {
    const result = parseDonations({ updatedAt: '2026-11-18', items: [] })
    expect(result.updatedAt).toBe('2026-11-18')
  })

  it('兼容旧格式：顶层直接是数组，没有 updatedAt', () => {
    const result = parseDonations([{ name: 'a', amount: 2 }])
    expect(result.items).toHaveLength(1)
    expect(result.updatedAt).toBeUndefined()
  })

  it('输入不是数组也不是带 items 的对象时返回空列表', () => {
    expect(parseDonations(null).items).toEqual([])
    expect(parseDonations({}).items).toEqual([])
    expect(parseDonations(42).items).toEqual([])
  })
})
