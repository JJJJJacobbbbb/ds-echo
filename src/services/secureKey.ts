/**
 * API Key 的安全存储。
 *
 * 背景：上游把 Key 明文存在 localStorage（WebView 的 leveldb 里），
 * 任何能读到应用数据的途径（root、备份、调试端口）都能拿到它。
 * 这里改为在 Android 上用系统 Keystore 加密保存（AES-GCM），密钥材料由硬件保护。
 *
 * 分工：
 * - 本文件只管「怎么读写一个字符串」，不判断迁移逻辑（见 secureKeyMigration.ts）
 * - 浏览器调试环境没有 Keystore，退回 localStorage（并在界面标注，避免误以为已安全）
 */
import { Capacitor } from '@capacitor/core'
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin'

/** 安全存储里的键名（与 localStorage 的展示键无关） */
const SECRET_NAME = 'apiKey'

/** 上游遗留的明文键；仅用于迁移与浏览器调试回退 */
export const LEGACY_LOCAL_KEY = 'chat-demo:api-key'

export type SecretsBackend = 'keystore' | 'web-local'

/** 当前环境的密钥存储方式；界面据此提示用户 */
export const secretsBackend = (): SecretsBackend =>
  Capacitor.isNativePlatform() ? 'keystore' : 'web-local'

/** 界面展示用的翻译键（文案在 i18n，不写在服务层） */
export const backendLabelKey = (backend: SecretsBackend) =>
  backend === 'keystore' ? 'secretsBackendKeystore' : 'secretsBackendWeb'

/** 读；没有值时返回 null（插件在 key 不存在时会抛错，统一按"没有"处理） */
export const readSecret = async (): Promise<string | null> => {
  if (secretsBackend() === 'web-local') {
    return localStorage.getItem(LEGACY_LOCAL_KEY)
  }
  try {
    const { value } = await SecureStoragePlugin.get({ key: SECRET_NAME })
    return value ? value : null
  } catch {
    return null
  }
}

export const writeSecret = async (value: string): Promise<void> => {
  if (secretsBackend() === 'web-local') {
    localStorage.setItem(LEGACY_LOCAL_KEY, value)
    return
  }
  await SecureStoragePlugin.set({ key: SECRET_NAME, value })
}

export const removeSecret = async (): Promise<void> => {
  if (secretsBackend() === 'web-local') {
    localStorage.removeItem(LEGACY_LOCAL_KEY)
    return
  }
  try {
    await SecureStoragePlugin.remove({ key: SECRET_NAME })
  } catch {
    // 本来就不存在时忽略
  }
}
