/**
 * 记忆条目的**文件格式**——与 dsh-persona-memory / pi-hermes-memory 字节兼容。
 *
 * 格式（照抄上游，不要改）：
 *   <条目正文> <!-- created=YYYY-MM-DD, last=YYYY-MM-DD -->
 *   §
 *   <条目正文> <!-- created=..., last=... -->
 *
 * - 条目之间用 "\n§\n" 分隔（ENTRY_DELIMITER）
 * - 日期放在行尾的 HTML 注释里：Markdown 里不可见，且不会干扰分隔符
 * - 没有注释的旧条目也能读：日期默认今天（兼容上游 legacy 条目）
 *
 * 之所以严格照抄而不是"用 JSON 更干净"：格式一致才能和 pi-hermes-memory 等工具
 * 读写同一份记忆文件，用户换工具时记忆可以带走。
 */

/** 与 pi-hermes-memory 的 src/constants.ts 保持一致 */
export const ENTRY_DELIMITER = '\n§\n'

/** 每条记忆文件的字符上限（与上游一致） */
export const DEFAULT_MEMORY_CHAR_LIMIT = 5_000
export const DEFAULT_USER_CHAR_LIMIT = 5_000

export type MemoryKind = 'memory' | 'user'

export type MemoryEntry = {
  text: string
  /** YYYY-MM-DD */
  created: string
  /** 最后一次被引用/更新的日期 YYYY-MM-DD */
  last: string
}

const today = (): string => new Date().toISOString().slice(0, 10)

/** 编码一条条目（与上游 encodeEntry 等价；不含项目元数据——本 App 没有项目概念） */
export const encodeEntry = (text: string, created: string, last: string): string =>
  `${text} <!-- created=${created}, last=${last} -->`

/** 解码一条原始条目；缺注释时按兼容处理，日期取今天 */
export const decodeEntry = (raw: string): MemoryEntry => {
  const match = /^(.*?)\s*<!--\s*created=([^,]+),\s*last=([^,>]+)\s*-->\s*$/s.exec(raw)
  if (match) {
    return { text: match[1].trim(), created: match[2].trim(), last: match[3].trim() }
  }
  const t = today()
  return { text: raw.trim(), created: t, last: t }
}

/** 把整份文件内容拆成条目 */
export const parseEntries = (raw: string): MemoryEntry[] =>
  raw
    .split(ENTRY_DELIMITER)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(decodeEntry)

/** 把条目拼回文件内容 */
export const serializeEntries = (entries: MemoryEntry[]): string =>
  entries.map((entry) => encodeEntry(entry.text, entry.created, entry.last)).join(ENTRY_DELIMITER)

/** 字符数（用于上限判断，与上游口径一致：按字符不按 token） */
export const contentChars = (entries: MemoryEntry[]): number =>
  serializeEntries(entries).length
