/**
 * 记忆相关的一次性模型调用（非流式：把流读完拼成文本）。
 *
 * 独立成文件的原因：学习和合并走的是同一套"调用 → 收文本 → 解析"的流程，
 * 放在两处会重复，且将来换模型参数只改一处。
 */
import { streamMessage } from '../api/client.js'
import type { ChatModel } from '../api/types.js'

/** 调一次模型并把文本收集完；失败抛错，由调用方决定降级方式 */
export const collectText = async (options: {
  apiKey: string
  model: ChatModel
  system: string
  prompt: string
  signal: AbortSignal
}): Promise<string> => {
  const { apiKey, model, system, prompt, signal } = options
  let text = ''
  for await (const event of streamMessage(
    apiKey,
    {
      model,
      system,
      messages: [{ role: 'user', content: prompt }],
      // 记忆整理不需要思考过程：省钱、也避免思考内容混进解析
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
