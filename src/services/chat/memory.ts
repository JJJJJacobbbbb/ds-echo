/**
 * 会话级「长期记忆」（markdown）。
 *
 * 解决的问题：上下文窗口有限，超出后只能丢最早的轮次——那是**遗忘**。
 * 记忆文档是补偿手段：把被丢弃轮次里的关键信息压成 markdown，随每次请求放进 system，
 * 模型即使看不到原文，也知道"之前发生过什么、设定是什么"。
 *
 * 三个刻意的设计取舍：
 * 1. **记忆是用户可见、可编辑的**（会话里的「记忆」面板），不是黑盒——角色扮演的设定被
 *    模型擅自"总结"掉是很严重的问题，用户必须能改。
 * 2. **增量更新**：只把「还没并入记忆」的那些轮次送去总结，避免每轮都花一次摘要请求。
 * 3. **失败不影响主流程**：记忆更新是尽力而为，挂了就按无记忆继续发送。
 */
import { streamMessage } from '../api/client.js'
import type { ChatModel, MessageParam } from '../api/types.js'
import { estimateTokens } from './contextBudget.js'
import type { AssistantMessage, Message, UserMessage } from './types.js'

/** 记忆正文最多占多少 token；超了就在提示词里要求模型压缩 */
export const MEMORY_TOKEN_LIMIT = 8_000

/** 累计有多少「未被记忆覆盖」的内容被丢弃后，才值得花一次摘要请求 */
export const MEMORY_UPDATE_THRESHOLD = 20_000

/** 把记忆拼进 system prompt；没有记忆时原样返回 */
export const buildSystemPrompt = (base: string, memory: string | null | undefined): string => {
  const trimmed = memory?.trim()
  if (!trimmed) {
    return base
  }
  return [
    base,
    '',
    '# 本会话的长期记忆',
    '以下是本会话更早对话的要点（按时间顺序整理）。这些内容已不在你眼前的对话记录里，',
    '但它们真实发生过，请把它们当作已知事实，不要否认或重新追问。',
    '',
    trimmed,
  ].join('\n')
}

/**
 * 判断要不要更新记忆。
 *
 * @param droppedRounds 本次请求因超预算被丢弃的轮次数量
 * @param coveredRounds 已经被并入记忆的轮次数量（存在会话上，避免重复总结）
 * @param tokensOf 计算 [from, to) 区间轮次的估算 token
 */
export const planMemoryUpdate = (
  droppedRounds: number,
  coveredRounds: number,
  tokensOf: (from: number, to: number) => number,
  threshold = MEMORY_UPDATE_THRESHOLD
): { from: number; to: number } | null => {
  if (droppedRounds <= coveredRounds) {
    return null
  }
  return tokensOf(coveredRounds, droppedRounds) >= threshold
    ? { from: coveredRounds, to: droppedRounds }
    : null
}

/** 记忆更新用的提示词：要求输出**完整的新记忆正文**（不是补丁），便于直接覆盖保存 */
export const memoryUpdateSystem = (previous: string | null): string =>
  [
    '你负责维护一段对话的「长期记忆」文档。',
    '输入是：已有的记忆（可能为空）+ 一段即将从上下文里被移除的对话原文。',
    '',
    '要求：',
    '1. 输出**更新后的完整记忆**，用 Markdown 写。不要输出任何解释、前言或代码块围栏。',
    `2. 全文控制在 ${MEMORY_TOKEN_LIMIT} token 以内；超了就压缩细节，保留结论。`,
    '3. 只保留对后续对话有用的内容：人物设定、关系、约定、已发生的关键情节、用户明确要求记住的事。',
    '4. **不要编造**原文没有的信息；不确定的宁可不写。',
    '5. 用中文写。保持条理（可按「设定」「已发生」「待办」分节）。',
    '',
    '已有记忆：',
    previous?.trim() ? previous.trim() : '（空）',
  ].join('\n')

/** 把若干轮对话渲染成一段纯文本，供摘要用 */
export const renderRounds = (rounds: [UserMessage, AssistantMessage][]): string =>
  rounds
    .map(([user, reply]) => {
      const answer = reply.blocks
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('')
        .trim()
      return `【用户】${user.content.trim()}\n【助手】${answer}`
    })
    .join('\n\n')

/** 单次摘要最多送多少字符的原文，防止这一次请求本身又爆掉 */
const MAX_EXCERPT_CHARS = 60_000

/** 把过长原文截断：保留开头（设定通常在前面）与结尾（最近的情节） */
export const clipExcerpt = (text: string, limit = MAX_EXCERPT_CHARS): string => {
  if (text.length <= limit) {
    return text
  }
  const head = Math.floor(limit * 0.55)
  const tail = limit - head
  return `${text.slice(0, head)}\n\n……（中间省略若干轮）……\n\n${text.slice(-tail)}`
}

/**
 * 调一次模型，把「已有记忆 + 新被丢弃的原文」合成新的记忆正文。
 * 失败抛错，由调用方吞掉并记录——记忆更新不能影响主对话。
 */
export const summarizeMemory = async (options: {
  apiKey: string
  model: ChatModel
  previous: string | null
  excerpt: string
  signal: AbortSignal
}): Promise<string> => {
  const { apiKey, model, previous, excerpt, signal } = options
  const messages: MessageParam[] = [{ role: 'user', content: clipExcerpt(excerpt) }]
  let text = ''
  for await (const event of streamMessage(
    apiKey,
    {
      model,
      system: memoryUpdateSystem(previous),
      messages,
      thinking: { type: 'disabled' },
      tools: [],
      safety_check: { level: 'high' },
    },
    signal
  )) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      text += event.delta.text
    }
  }
  return text.trim()
}

/** 记忆的估算 token（用于在界面上展示"记忆占了多少"） */
export const memoryTokens = (memory: string | null | undefined): number =>
  memory ? estimateTokens(memory) : 0

/** 供 store 使用：把若干轮历史按区间取出来（区间是轮次序号，不是消息序号） */
export const sliceRounds = (
  history: Message[],
  from: number,
  to: number
): [UserMessage, AssistantMessage][] => {
  const rounds: [UserMessage, AssistantMessage][] = []
  for (let i = 0; i + 1 < history.length; i++) {
    const [user, reply] = [history[i], history[i + 1]]
    if (user.role === 'user' && reply.role === 'assistant') {
      rounds.push([user, reply])
      i++
    }
  }
  return rounds.slice(from, to)
}
