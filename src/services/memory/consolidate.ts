/**
 * 记忆合并（压缩）：条目超字符上限时，让模型合并精简。
 *
 * 照抄 dsh-persona-memory 的 consolidate.js，核心是那道**提交护栏**：
 * 只有同时满足三条才替换旧记忆——
 *   1. 结果**严格更小**（否则等于白花一次请求，还可能变胖）
 *   2. 能解析出条目（每行一个非空条目）
 *   3. 通过内容安检
 * 任何一条不满足就保留旧记忆。上游的原话是"失败绝不损坏记忆"，这条必须照做：
 * 记忆被写坏一次，用户接下来几十轮对话都在错误设定上跑。
 */
import { contentChars, parseEntries, serializeEntries, type MemoryEntry, type MemoryKind } from './format.js'
import { charLimitFor, readEntries, replaceEntries } from './store.js'
import { collectText } from './llm.js'
import { scanContent } from './scanner.js'
import type { ChatModel } from '../api/types.js'

const CONSOLIDATION_SYSTEM_PROMPT = `你负责合并"持久记忆"条目，让它更短但信息不丢。

规则：
- 每条记忆带 <!-- created=..., last=... --> 注释，日期用于判断是否陈旧。
- 合并同义或重复的条目；很久没被引用（last 很早）的细节可以删。
- **必须保留**：人物设定、称呼、关系、用户明确要求记住的事、关键情节。
- 日期取合并后条目的最早 created 与最近 last。
- 输出格式与输入完全一致：每行先写条目正文，后面跟上 <!-- created=YYYY-MM-DD, last=YYYY-MM-DD --> 注释，
  条目之间用单独一行的 § 分隔。不要输出解释、不要围栏、不要编号。`

export type ConsolidateResult =
  | { status: 'skipped'; reason: string }
  | { status: 'kept'; chars: number; entries: number }
  | { status: 'replaced'; before: number; after: number; entries: number }

/** 是否该合并：超出该类型的字符上限 */
export const shouldConsolidate = (scope: string, kind: MemoryKind): boolean =>
  contentChars(readEntries(scope, kind)) > charLimitFor(kind)

/**
 * 执行一次合并。返回结果里 status='replaced' 才表示记忆真的变了。
 * 不抛错：失败等价于"保持原样"。
 */
export const consolidateOnce = async (options: {
  scope: string
  kind: MemoryKind
  apiKey: string
  model: ChatModel
  signal: AbortSignal
}): Promise<ConsolidateResult> => {
  const { scope, kind, apiKey, model, signal } = options
  const before = readEntries(scope, kind)
  if (before.length < 3) {
    return { status: 'skipped', reason: '条目太少，没有合并价值' }
  }
  const beforeChars = contentChars(before)
  const limit = charLimitFor(kind)

  let output = ''
  try {
    output = await collectText({
      apiKey,
      model,
      system: CONSOLIDATION_SYSTEM_PROMPT,
      prompt: [
        `今天是 ${new Date().toISOString().slice(0, 10)}。`,
        `当前记忆共 ${before.length} 条、${beforeChars} 字符，上限 ${limit} 字符。请合并到上限以内。`,
        '',
        '当前记忆：',
        serializeEntries(before),
      ].join('\n'),
      signal,
    })
  } catch (error) {
    // oxlint-disable-next-line no-console -- 后台任务
    console.error('[memory] 合并请求失败，保留旧记忆', error)
    return { status: 'kept', chars: beforeChars, entries: before.length }
  }

  const decision = evaluateConsolidation(before, output)
  if (!decision.replace) {
    return { status: 'kept', chars: beforeChars, entries: before.length }
  }
  await replaceEntries(scope, kind, decision.replace)
  return {
    status: 'replaced',
    before: beforeChars,
    after: contentChars(decision.replace),
    entries: decision.replace.length,
  }
}

/**
 * 合并结果的判定（纯函数，便于单测）。
 * 返回 { replace: entries } 才允许覆盖旧记忆；否则 replace 为 null 并给出原因。
 */
export const evaluateConsolidation = (
  before: MemoryEntry[],
  output: string
): { replace: MemoryEntry[] | null; reason?: string } => {
  const cleaned = output.replace(/```[a-z]*|```/gi, '').trim()
  const parsed = parseEntries(cleaned).filter((entry) => entry.text.length > 0)
  if (parsed.length === 0) {
    return { replace: null, reason: '解析不出条目' }
  }
  if (contentChars(parsed) >= contentChars(before)) {
    return { replace: null, reason: '没有更短' }
  }
  if (parsed.some((entry) => !scanContent(entry.text).ok)) {
    return { replace: null, reason: '未通过安检' }
  }
  return { replace: parsed }
}
