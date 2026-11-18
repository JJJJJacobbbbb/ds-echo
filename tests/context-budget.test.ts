import { describe, expect, it } from 'vitest'
import {
  CONTEXT_INPUT_BUDGET,
  estimateTokens,
  fitToBudget,
} from '../src/services/chat/contextBudget.js'

/**
 * 上下文预算的单测。
 *
 * 背景：`deepseek-flash` 上下文 1M token，官方 App 单次输入只有约 4 万字。
 * 本模块负责把历史裁进窗口，且必须**从最早的开始丢**（保留最近对话）。
 */

describe('estimateTokens', () => {
  it('空字符串是 0', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('中文字符按约 0.6 token/字估算', () => {
    const tenChars = '一二三四五六七八九十'
    expect(estimateTokens(tenChars)).toBe(6)
  })

  it('ASCII 按约 0.25 token/字符估算', () => {
    expect(estimateTokens('abcdefgh')).toBe(2)
  })

  it('中英混排按各自比例相加', () => {
    // 10 个汉字 = 6，8 个 ASCII = 2
    expect(estimateTokens('一二三四五六七八九十abcdefgh')).toBe(8)
  })

  it('1 万汉字约 6000 token（用于对齐官方 App 的 4 万字输入上限）', () => {
    const text = '字'.repeat(10_000)
    expect(estimateTokens(text)).toBe(6_000)
  })
})

describe('fitToBudget', () => {
  const items = [100, 200, 300, 400, 500]

  it('总量在预算内时一条都不丢', () => {
    const result = fitToBudget(items, (n) => n, 10_000)
    expect(result.kept).toEqual(items)
    expect(result.dropped).toBe(0)
    expect(result.estimatedTokens).toBe(1500)
  })

  it('超预算时从最早的开始丢，保留最近的', () => {
    const result = fitToBudget(items, (n) => n, 900)
    // 总 1500 > 900：丢 100(剩1400) → 丢 200(剩1200) → 丢 300(剩900) → 停
    expect(result.kept).toEqual([400, 500])
    expect(result.dropped).toBe(3)
    expect(result.estimatedTokens).toBe(900)
  })

  it('预算比单条还小时，全部丢弃但不会崩', () => {
    const result = fitToBudget(items, (n) => n, 50)
    expect(result.kept).toEqual([])
    expect(result.dropped).toBe(5)
    expect(result.estimatedTokens).toBe(0)
  })

  it('空历史返回空结果', () => {
    const result = fitToBudget([], () => 0, 100)
    expect(result.kept).toEqual([])
    expect(result.dropped).toBe(0)
  })

  it('默认预算是 256K（改预算时只改常量，不用改测试）', () => {
    expect(CONTEXT_INPUT_BUDGET).toBe(256_000)
  })
})
