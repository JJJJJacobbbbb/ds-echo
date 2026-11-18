/**
 * 记忆系统的入口：对话结束后调用一次 `noteTurn`，其余全自动。
 *
 * 机制来自 dsh-persona-memory：
 * - 每 N 轮（默认 10）复习最近对话，提取持久事实
 * - 条目超过字符上限时合并压缩，且只有"严格更小 + 可解析 + 过安检"才提交
 *
 * 用户什么都不用做——不弹窗、不确认、不改设置。
 * 任何一步失败都只记日志：记忆是增强项，不能挡住对话。
 */
import { readEntries } from './store.js'
import { buildTranscript, learnOnce, shouldLearn } from './learning.js'
import { consolidateOnce, shouldConsolidate } from './consolidate.js'
import type { ChatModel } from '../api/types.js'

const turnKey = (scope: string) => `dsecho-memory:${scope}:turns`

/** 当前会话已完成的轮数 */
export const readTurnCount = (scope: string): number => {
  try {
    return Number(localStorage.getItem(turnKey(scope)) ?? '0') || 0
  } catch {
    return 0
  }
}

const bumpTurnCount = (scope: string): number => {
  const next = readTurnCount(scope) + 1
  try {
    localStorage.setItem(turnKey(scope), String(next))
  } catch {
    // 存不下就不存，最多是学习频率不准
  }
  return next
}

export type NoteTurnOptions = {
  scope: string
  apiKey: string
  model: ChatModel
  /** 最近的消息（role + 纯文本），用于生成 transcript */
  messages: { role: string; text: string }[]
}

/**
 * 一轮对话结束后调用。
 * 到点才学习；学习后如果超限就合并。全部是后台任务，不阻塞 UI。
 */
export const noteTurn = async (options: NoteTurnOptions): Promise<void> => {
  const { scope, apiKey, model, messages } = options
  if (!apiKey) {
    return
  }
  const turns = bumpTurnCount(scope)
  if (!shouldLearn(turns)) {
    return
  }
  const controller = new AbortController()
  try {
    await learnOnce({
      scope,
      apiKey,
      model,
      transcript: buildTranscript(messages),
      signal: controller.signal,
    })
    if (shouldConsolidate(scope, 'memory')) {
      await consolidateOnce({ scope, kind: 'memory', apiKey, model, signal: controller.signal })
    }
  } catch (error) {
    // oxlint-disable-next-line no-console -- 后台任务，失败只记录
    console.error('[memory] 本轮记忆更新失败', error)
  }
}

/** 界面/调试用：当前记忆条目数 */
export const memoryEntryCount = (scope: string): number => readEntries(scope, 'memory').length
