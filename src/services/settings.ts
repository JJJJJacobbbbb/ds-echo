import { create } from 'zustand'
import type { TtsVoice } from './api/speech.js'
import { normalizeLocation, type UserLocation } from './location.js'
import { migrateApiKey } from './secureKeyMigration.js'
import { readSecret, removeSecret, secretsBackend, writeSecret } from './secureKey.js'

export type Locale = 'zh-CN' | 'en-US'

/** 主题偏好；默认跟随系统 */
export type ThemePreference = 'light' | 'dark' | 'system'

/** 本机设置，存 localStorage：API Key、语言、主题、位置、朗读音色、深度思考与智能搜索开关、侧边栏收起状态 */
type Settings = {
  /** API Key 只存在于内存 + 系统安全存储；这里不是持久化来源 */
  apiKey: string | null
  /** 首次启动时密钥从安全存储加载完成之前为 false，界面据此避免闪一下连接向导 */
  credentialsReady: boolean
  locale: Locale
  themePreference: ThemePreference
  location: UserLocation | null
  ttsVoice: TtsVoice
  thinking: boolean
  search: boolean
  siderCollapsed: boolean
  /** 用户是否关掉过"导入历史"引导卡片；关掉后永不再显示 */
  importGuideDismissed: boolean
}

/**
 * localStorage 键名。
 *
 * 注意：前缀是 `chat-demo:`（上游名），**故意不改成 `dsecho:`**。
 * 这些键里存着用户已有的 API Key 与偏好；一旦改名，升级后所有旧设置都会"丢失"
 * （读不到旧键 = 回到默认值，Key 也要重输）。同理见 db.ts 里的 IndexedDB 名 'chat-demo'。
 * 如果将来确实要改名，必须同时写一段一次性迁移：读旧键 → 写新键 → 删旧键。
 */
const KEYS = {
  apiKey: 'chat-demo:api-key',
  locale: 'chat-demo:locale',
  location: 'chat-demo:location',
  themePreference: 'chat-demo:theme-preference',
  ttsVoice: 'chat-demo:tts-voice',
  thinking: 'chat-demo:thinking',
  search: 'chat-demo:search',
  siderCollapsed: 'chat-demo:sider-collapsed',
  importGuideDismissed: 'chat-demo:import-guide-dismissed',
} as const

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // 存储不可用时只在内存中生效
  }
}

/** 位置选择模式跟随浏览器语言，与应用内选择的界面语言无关。 */
export const isChineseBrowser = (): boolean =>
  (typeof navigator === 'undefined' ? 'zh' : navigator.language).toLowerCase().startsWith('zh')

const initialLocale = (): Locale => {
  const saved = read(KEYS.locale)
  if (saved === 'zh-CN' || saved === 'en-US') {
    return saved
  }
  return isChineseBrowser() ? 'zh-CN' : 'en-US'
}

const initialLocation = (): UserLocation | null => {
  try {
    const location = normalizeLocation(JSON.parse(read(KEYS.location) ?? 'null'))
    if (!location) {
      return null
    }
    return isChineseBrowser()
      ? location.region === 'CN' && location.province
        ? location
        : null
      : { region: location.region }
  } catch {
    return null
  }
}

/** 未保存过时跟随系统 */
const initialThemePreference = (): ThemePreference => {
  const saved = read(KEYS.themePreference)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

/** 未保存过时使用服务端默认音色 stella（海星） */
const initialTtsVoice = (): TtsVoice => (read(KEYS.ttsVoice) === 'tide' ? 'tide' : 'stella')

export const useSettings = create<Settings>(() => ({
  // 初始为空：Key 由 hydrateCredentials() 从安全存储异步加载（见下）
  apiKey: null,
  credentialsReady: false,
  locale: initialLocale(),
  location: initialLocation(),
  themePreference: initialThemePreference(),
  ttsVoice: initialTtsVoice(),
  thinking: read(KEYS.thinking) === 'true',
  search: read(KEYS.search) === 'true',
  siderCollapsed: read(KEYS.siderCollapsed) === 'true',
  importGuideDismissed: read(KEYS.importGuideDismissed) === 'true',
}))

export const setLocale = (locale: Locale) => {
  write(KEYS.locale, locale)
  useSettings.setState({ locale })
}

export const setLocation = (value: UserLocation | null) => {
  const location = normalizeLocation(value)
  write(KEYS.location, location ? JSON.stringify(location) : null)
  useSettings.setState({ location })
}

export const setThemePreference = (themePreference: ThemePreference) => {
  write(KEYS.themePreference, themePreference)
  useSettings.setState({ themePreference })
}

export const setTtsVoice = (ttsVoice: TtsVoice) => {
  write(KEYS.ttsVoice, ttsVoice)
  useSettings.setState({ ttsVoice })
}

/**
 * 保存/清除 API Key。
 *
 * 原生环境：写入 Android Keystore，并确保 localStorage 里不残留明文。
 * 浏览器调试：退回 localStorage（界面会标注"仅调试"）。
 * 写安全存储失败时只记日志、不静默降级成明文——宁可这次不持久化，也不回到老做法。
 */
export const setApiKey = (apiKey: string | null) => {
  useSettings.setState({ apiKey })
  const backend = secretsBackend()
  void (async () => {
    try {
      if (apiKey) {
        await writeSecret(apiKey)
        if (backend === 'keystore') {
          write(KEYS.apiKey, null)
        }
      } else {
        await removeSecret()
        write(KEYS.apiKey, null)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[credentials] 保存 API Key 到安全存储失败', error)
    }
  })()
}

/**
 * 启动时加载 Key：优先安全存储；若存在旧版明文则先迁移再清理。
 * 见 secureKeyMigration.ts——那边保证「写成功并读回一致后才删明文」。
 */
export const hydrateCredentials = async (): Promise<void> => {
  try {
    const result = await migrateApiKey({
      readLegacy: () => read(KEYS.apiKey),
      clearLegacy: () => write(KEYS.apiKey, null),
      readSecure: readSecret,
      writeSecure: writeSecret,
    })
    useSettings.setState({ apiKey: result.apiKey })
  } catch (error) {
    // 迁移失败：保留明文，下次启动重试；本次仍可用旧值工作
    // eslint-disable-next-line no-console
    console.error('[credentials] API Key 迁移失败，保留明文待重试', error)
    useSettings.setState({ apiKey: read(KEYS.apiKey) })
  } finally {
    useSettings.setState({ credentialsReady: true })
  }
}

export const setThinking = (thinking: boolean) => {
  write(KEYS.thinking, String(thinking))
  useSettings.setState({ thinking })
}

export const setSearch = (search: boolean) => {
  write(KEYS.search, String(search))
  useSettings.setState({ search })
}

export const setSiderCollapsed = (siderCollapsed: boolean) => {
  write(KEYS.siderCollapsed, String(siderCollapsed))
  useSettings.setState({ siderCollapsed })
}


/** 关掉「导入历史」引导卡片；持久化，之后不再出现 */
export const dismissImportGuide = () => {
  write(KEYS.importGuideDismissed, 'true')
  useSettings.setState({ importGuideDismissed: true })
}
