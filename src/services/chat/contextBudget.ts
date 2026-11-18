/**
 * 上下文预算：把历史裁进模型窗口。
 *
 * 为什么需要：
 * - `deepseek-flash` 的上下文是 1M token（官方定价页），但**不是无限**。
 * - 改造前 `toRequestMessages()` 把所有历史原样塞进请求：历史一旦超过窗口，
 *   服务端直接报错，用户看到的是"发不出去"，而不是"部分历史被省略"。
 * - 而"超长对话"正是本 App 的目标场景（官方 App 单次输入约 4 万字、超 7 天不活跃不能续）。
 *
 * 策略：**保留最近的轮次，从最早的开始丢**，并把"丢了多少"如实告诉用户。
 * 不做自动摘要——摘要要额外请求且可能篡改设定，对角色扮演是风险；宁可明说"看不到前面"。
 */

/**
 * 输入预算 256K token（用户指定）。
 * 依据：deepseek-flash 上下文 1M，输出上限 384K，256K 留足余量；
 * 官方 App 单会话实测不到 9 万 token，256K 仍有 3 倍空间。
 */
export const CONTEXT_INPUT_BUDGET = 256_000

/**
 * 粗略估算 token 数。
 *
 * 没有打包真正的分词器（体积大且与线上版本可能不一致），所以用经验系数：
 * - 中日韩字符：约 0.6 token/字
 * - 其它（拉丁字母、数字、标点、空白）：约 0.25 token/字符
 * 估算偏保守（宁可多算，提前触发裁剪），误差在 ±20% 量级，足以做预算控制。
 */
export const estimateTokens = (text: string): number => {
  let wide = 0
  let narrow = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    // CJK 统一表意文字、兼容表意文字、CJK 标点、全角符号
    const isWide =
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xffef)
    if (isWide) {
      wide += 1
    } else {
      narrow += 1
    }
  }
  return Math.ceil(wide * 0.6 + narrow * 0.25)
}

export type Budgeted<T> = {
  /** 保留的条目（顺序不变，丢的是最早的） */
  kept: T[]
  /** 被丢弃的条目数 */
  dropped: number
  /** 保留部分的估算 token 总量 */
  estimatedTokens: number
}

/**
 * 从最早的条目开始丢弃，直到估算总量不超过预算。
 * 入参 estimate 由调用方决定怎么算（一个轮次包含提问与回答两段文本）。
 */
export const fitToBudget = <T>(
  items: readonly T[],
  estimate: (item: T) => number,
  budget: number = CONTEXT_INPUT_BUDGET
): Budgeted<T> => {
  const sizes = items.map(estimate)
  let total = sizes.reduce((sum, size) => sum + size, 0)
  let drop = 0
  while (drop < items.length && total > budget) {
    total -= sizes[drop]
    drop += 1
  }
  return { kept: items.slice(drop), dropped: drop, estimatedTokens: total }
}
