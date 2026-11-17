/**
 * 归档指纹：整包 ZIP 字节的 SHA-256。
 *
 * 用途有两个：
 * 1. 导入注册表里记录"这份归档在某时导入过哪些会话"，便于排查与将来做冲突处理；
 * 2. 同一个文件重复选择时，界面上可以提示"这份归档之前导入过"。
 *
 * 注意：指纹**不**用来阻止重复导入（见 mergePlan.ts 的说明）。
 *
 * 限制：需要把整个文件读进内存算哈希，所以先卡住体积上限。
 * 超过上限的文件直接拒绝，而不是让 WebView 因为 OOM 崩掉。
 */
export const MAX_FINGERPRINT_BYTES = 64 * 1024 * 1024

export const sha256Hex = async (buffer: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** 计算文件指纹；超过体积上限时抛错（调用方负责转成用户可读提示） */
export const fingerprintFile = async (file: Blob): Promise<string> => {
  if (file.size > MAX_FINGERPRINT_BYTES) {
    throw new Error(
      `归档文件过大（${Math.round(file.size / 1024 / 1024)} MB），超过 ${MAX_FINGERPRINT_BYTES / 1024 / 1024} MB 上限`
    )
  }
  return sha256Hex(await file.arrayBuffer())
}
