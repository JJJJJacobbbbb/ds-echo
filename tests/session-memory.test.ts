import { describe, expect, it } from 'vitest'
import {
  MEMORY_UPDATE_THRESHOLD,
  buildSystemPrompt,
  clipExcerpt,
  memoryTokens,
  planMemoryUpdate,
} from '../src/services/chat/memory.js'

/**
 * 会话记忆的纯逻辑测试。
 *
 * 记忆的作用：上下文窗口装不下时，被丢弃的早期轮次压成 markdown 保留下来，
 * 让模型"看不到原文但知道发生过什么"。这些用例锁住三件事：
 * 1. 记忆确实进了 system prompt
 * 2. 只总结「还没被记忆覆盖」的那段，避免重复花摘要请求
 * 3. 摘要输入有上限，防止摘要请求本身又爆掉
 */

describe('buildSystemPrompt', () => {
  const base = '该助手为DeepSeek，由深度求索公司创造。'

  it('没有记忆时原样返回', () => {
    expect(buildSystemPrompt(base, null)).toBe(base)
    expect(buildSystemPrompt(base, '   ')).toBe(base)
  })

  it('有记忆时拼上标题与"当作已知事实"的说明', () => {
    const result = buildSystemPrompt(base, '- 用户叫小林\n- 已约定用第二人称')
    expect(result).toContain(base)
    expect(result).toContain('本会话的长期记忆')
    expect(result).toContain('当作已知事实')
    expect(result).toContain('用户叫小林')
  })
})

describe('planMemoryUpdate', () => {
  const tokensOf = (from: number, to: number) => (to - from) * 10_000

  it('没有新丢弃的轮次时不更新', () => {
    expect(planMemoryUpdate(5, 5, tokensOf)).toBeNull()
    expect(planMemoryUpdate(3, 5, tokensOf)).toBeNull()
  })

  it('新丢弃的内容不够阈值时不更新（避免每轮都花一次摘要请求）', () => {
    // 丢 1 轮 = 1 万 token < 2 万阈值
    expect(planMemoryUpdate(6, 5, tokensOf)).toBeNull()
  })

  it('达到阈值时返回需要总结的区间', () => {
    // 从第 5 轮到第 8 轮 = 3 万 token ≥ 阈值
    expect(planMemoryUpdate(8, 5, tokensOf)).toEqual({ from: 5, to: 8 })
  })

  it('阈值可覆盖（测试用）', () => {
    expect(planMemoryUpdate(6, 5, tokensOf, 5_000)).toEqual({ from: 5, to: 6 })
  })

  it('默认阈值是 2 万 token', () => {
    expect(MEMORY_UPDATE_THRESHOLD).toBe(20_000)
  })
})

describe('clipExcerpt', () => {
  it('短文本原样返回', () => {
    expect(clipExcerpt('abc', 100)).toBe('abc')
  })

  it('超长时保留开头与结尾，并插入省略标记', () => {
    const text = 'A'.repeat(60) + 'B'.repeat(60)
    const result = clipExcerpt(text, 100)
    expect(result.length).toBeLessThanOrEqual(140)
    expect(result).toContain('省略')
    // 开头（设定常在前）与结尾（最近情节）都要保留
    expect(result.startsWith('A')).toBe(true)
    expect(result.endsWith('B')).toBe(true)
  })
})

describe('memoryTokens', () => {
  it('空记忆是 0', () => {
    expect(memoryTokens(undefined)).toBe(0)
    expect(memoryTokens('')).toBe(0)
  })

  it('中文记忆按估算系数折算', () => {
    expect(memoryTokens('字'.repeat(1000))).toBe(600)
  })
})
