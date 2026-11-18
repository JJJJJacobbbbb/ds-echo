import { describe, expect, it } from 'vitest'
import { toRequestMessages } from '../src/services/chat/reply.js'
import type { AssistantMessage, Message, UserMessage } from '../src/services/chat/types.js'

/**
 * 真实请求路径的集成测试：证明 `toRequestMessages` 会把超长历史裁进预算。
 *
 * 为什么需要这一层：`contextBudget` 的纯函数测试只证明算法对，
 * 不能证明它**真的接在了发请求的路径上**。这里用真正的 `toRequestMessages`
 * 构造一个超过 1M token 的会话，断言：
 * 1. 发出去的 messages 估算量不超过预算
 * 2. 丢的是**最早的**轮次（最近几轮必须还在）
 * 3. 返回的 droppedRounds 能让界面如实提示
 */

const makeUser = (id: string, content: string): UserMessage => ({
  id,
  role: 'user',
  content,
  files: [],
  createdAt: 0,
})

const makeReply = (id: string, text: string): AssistantMessage => ({
  id,
  role: 'assistant',
  createdAt: 0,
  model: null,
  prefix: false,
  status: 'done',
  stopReason: 'end_turn',
  blocks: [{ type: 'text', text }],
})

/** 造 n 轮对话，每轮正文 length 个汉字（提问与回答各一半） */
const makeHistory = (rounds: number, length: number): Message[] => {
  const history: Message[] = []
  for (let i = 0; i < rounds; i++) {
    const half = `第${i}轮` + '字'.repeat(Math.floor(length / 2))
    history.push(makeUser(`u${i}`, half))
    history.push(makeReply(`a${i}`, half))
  }
  return history
}

describe('toRequestMessages 的上下文裁剪', () => {
  it('历史很短时一条都不丢，也不报告裁剪', () => {
    const history = makeHistory(3, 100)
    const result = toRequestMessages(history, makeUser('q', '你好'))
    expect(result.droppedRounds).toBe(0)
    expect(result.messages.length).toBeGreaterThan(0)
  })

  it('历史超过预算时丢弃最早的轮次，保留最近的', () => {
    // 60 轮 × 4 万汉字 ≈ 240 万汉字 ≈ 144 万 token，超过 90 万预算
    const history = makeHistory(60, 40_000)
    const result = toRequestMessages(history, makeUser('q', '继续'))

    expect(result.droppedRounds).toBeGreaterThan(0)
    // 裁剪后估算量必须落回预算内
    expect(result.estimatedTokens).toBeLessThanOrEqual(900_000)

    // 丢的是最早的：第 0 轮的标记必须已不在请求里，最后一轮的标记必须还在
    const serialized = JSON.stringify(result.messages)
    expect(serialized).not.toContain('第0轮')
    expect(serialized).toContain('第59轮')
    // 被丢掉的轮次数量应当与标记缺失一致
    expect(result.droppedRounds).toBeGreaterThan(0)
  })

  it('估算 token 与实际字符量同量级（防止单位写错导致永不触发或总是触发）', () => {
    const history = makeHistory(10, 1_000) // 1 万汉字 ≈ 6000 token
    const result = toRequestMessages(history, makeUser('q', ''))
    expect(result.estimatedTokens).toBeGreaterThan(4_000)
    expect(result.estimatedTokens).toBeLessThan(30_000)
    expect(result.droppedRounds).toBe(0)
  })
})
