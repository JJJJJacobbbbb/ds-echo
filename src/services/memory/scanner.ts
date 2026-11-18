/**
 * 记忆写入安检（照抄 dsh-persona-memory 的 secret-scanner 思路，做了精简）。
 *
 * 为什么需要：记忆会被自动注入到 system prompt，一旦写进恶意内容就相当于
 * 给模型永久植入指令。同时要防止把 API Key 之类的凭据写进记忆。
 *
 * 拦截三类：
 * 1. 凭据：常见 API Key 形态、私钥块、Bearer token
 * 2. 不可见字符：零宽字符、双向控制符（可用来做视觉欺骗）
 * 3. 提示注入：明显的"忽略之前指令""你现在是另一个 AI"等句式
 *
 * 宁可误杀：被拦下的条目只是少记一条，写进记忆则是长期风险。
 */

export type ScanResult = { ok: true } | { ok: false; reason: string }

const CREDENTIAL_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/, reason: '疑似 API Key' },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, reason: '疑似私钥' },
  { pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}/i, reason: '疑似 Bearer token' },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, reason: '疑似 AWS Key' },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/, reason: '疑似 GitHub token' },
]

/** 零宽与双向控制字符：肉眼不可见，能让文本看起来是别的内容 */
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/

const INJECTION_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /忽略(以上|之前|前面)(所有|全部)?(的)?(指令|规则|设定)/i, reason: '疑似提示注入' },
  { pattern: /ignore\s+(all\s+)?(previous|above)\s+instructions/i, reason: '疑似提示注入' },
  { pattern: /你现在是(?!.*角色的)/, reason: '疑似改写身份' },
  { pattern: /system\s*prompt/i, reason: '疑似探测系统提示' },
]

export const scanContent = (text: string): ScanResult => {
  if (INVISIBLE.test(text)) {
    return { ok: false, reason: '包含不可见字符' }
  }
  for (const { pattern, reason } of CREDENTIAL_PATTERNS) {
    if (pattern.test(text)) {
      return { ok: false, reason }
    }
  }
  for (const { pattern, reason } of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return { ok: false, reason }
    }
  }
  return { ok: true }
}

/** 批量过滤，返回通过的条目与被拦下的原因 */
export const filterByScan = (texts: string[]): { passed: string[]; rejected: string[] } => {
  const passed: string[] = []
  const rejected: string[] = []
  for (const text of texts) {
    if (scanContent(text).ok) {
      passed.push(text)
    } else {
      rejected.push(text)
    }
  }
  return { passed, rejected }
}
