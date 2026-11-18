/**
 * 自动学习：每 N 轮复习最近的对话，提取值得长期记住的事实。
 *
 * 照抄 dsh-persona-memory 的 learning.js：
 * - 默认每 10 轮触发一次
 * - 用**会话自己的模型**去提取（不为记忆单独配模型）
 * - 系统提示词要求"每行一条事实，不要编号、不要项目符号、不要围栏"
 * - 把"已有记忆"一起给它，避免重复记录
 *
 * 用户完全无感：不弹窗、不询问、不需要确认。
 */
import { readEntries, addEntries } from './store.js'
import { collectText } from './llm.js'
import { filterByScan } from './scanner.js'
import type { ChatModel } from '../api/types.js'

/** 每多少轮复习一次（上游默认 10） */
export const LEARNING_INTERVAL_TURNS = 10

/** 学习时最多回看多少条消息，避免一次塞太多 */
const MAX_TRANSCRIPT_MESSAGES = 40

const LEARNING_SYSTEM_PROMPT = `你负责为一段长期对话维护"持久记忆"。
阅读最近的对话记录，提取**以后再看时仍然有用**的事实：人物设定、关系、称呼、约定、用户偏好、已发生的关键情节、用户明确要求记住的事。

规则：
- 只输出纯文本行，**每行一条**事实。
- 不要编号、不要项目符号、不要 Markdown 围栏、不要解释、不要 JSON。
- 跳过寒暄、一次性任务细节、以及"当前记忆"里已经有的内容。
- 不要编造原文没有的信息。
- 用中文写。`

/** 是否到了学习时机 */
export const shouldLearn = (turnCount: number): boolean =>
  turnCount > 0 && turnCount % LEARNING_INTERVAL_TURNS === 0

/** 把最近的消息渲染成 transcript（只取正文，控制长度） */
export const buildTranscript = (
  messages: { role: string; text: string }[]
): string =>
  messages
    .slice(-MAX_TRANSCRIPT_MESSAGES)
    .map((message) => `【${message.role === 'user' ? '用户' : '助手'}】${message.text}`)
    .join('\n\n')
    .slice(-24_000)

/** 解析模型输出：一行一条，去掉模型可能自作主张加的项目符号 */
export const parseFacts = (output: string): string[] =>
  output
    .replace(/```[a-z]*|```/gi, '')
    .split('\n')
    .map((line) =>
      line
        .trim()
        .replace(/^[-*•]\s+/, '')
        .replace(/^\d+[.)]\s+/, '')
        .trim()
    )
    .filter((line) => line.length > 1)
    .filter((line) => !line.startsWith('#'))
    .slice(0, 20)

/**
 * 执行一次学习：提取 → 安检 → 写入。
 * 失败返回 0，不抛出——记忆学习不能影响用户正常对话。
 */
export const learnOnce = async (options: {
  scope: string
  apiKey: string
  model: ChatModel
  transcript: string
  signal: AbortSignal
}): Promise<number> => {
  const { scope, apiKey, model, transcript, signal } = options
  if (!transcript.trim()) {
    return 0
  }
  const current = readEntries(scope, 'memory')
    .map((entry) => entry.text)
    .join('\n')
  try {
    const output = await collectText({
      apiKey,
      model,
      system: LEARNING_SYSTEM_PROMPT,
      prompt: `最近的对话记录：\n---begin---\n${transcript}\n---end---\n\n当前记忆：\n${current || '（空）'}`,
      signal,
    })
    const facts = parseFacts(output)
    if (facts.length === 0) {
      return 0
    }
    const { passed, rejected } = filterByScan(facts)
    if (rejected.length > 0) {
      // oxlint-disable-next-line no-console -- 被拦下的条目需要留痕
      console.warn(`[memory] ${rejected.length} 条记忆未通过安检，已丢弃`)
    }
    return addEntries(scope, 'memory', passed)
  } catch (error) {
    // oxlint-disable-next-line no-console -- 后台任务，失败只能记录
    console.error('[memory] 学习失败，跳过本轮', error)
    return 0
  }
}
