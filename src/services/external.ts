/**
 * 外部页面跳转。
 *
 * 所有"离开 App 去看官方网页"的动作都从这里走，原因有两条：
 * 1) 域名白名单：只允许打开 DeepSeek 官方域名。App 里任何地方都不该出现
 *    可配置的外链，否则钓鱼链接会把用户引到假页面去输 Key。
 * 2) 原生和浏览器的打开方式不同：Android 上要用 Capacitor Browser（系统浏览器容器），
 *    直接 window.open 在 WebView 里会被拦住或变成奇怪的内嵌窗口。
 */
import { Browser } from '@capacitor/browser'
import { Capacitor, registerPlugin } from '@capacitor/core'

type ExternalLinkPlugin = {
  open(options: { url: string }): Promise<{ opened: boolean }>
}

const ExternalLink = registerPlugin<ExternalLinkPlugin>('ExternalLink')

/** 官方页面地址集中在这里，改地址只改这一处 */
export const OFFICIAL_URL = {
  /** 创建 API Key（需登录） */
  apiKeys: 'https://platform.deepseek.com/api_keys',
  /** 充值 */
  topUp: 'https://platform.deepseek.com/top_up',
  /** 开放平台首页，用于让用户先注册/登录 */
  platform: 'https://platform.deepseek.com',
} as const

export type OfficialPage = keyof typeof OFFICIAL_URL

/** 允许打开的主机名。子域放行，其他一律拒绝。 */
const ALLOWED_HOSTS = ['platform.deepseek.com', 'chat.deepseek.com', 'www.deepseek.com', 'deepseek.com', 'github.com']

export const isAllowedExternalUrl = (url: string): boolean => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') {
    return false
  }
  return ALLOWED_HOSTS.some((host) => parsed.host === host || parsed.host.endsWith(`.${host}`))
}

/**
 * 打开外部页面：优先 Capacitor Browser（Custom Tabs），失败则回退到系统默认浏览器。
 *
 * 为什么要回退：Custom Tabs 依赖浏览器支持该协议（通常只有 Chrome 系支持）。
 * 用户删掉 Chrome 后 Browser.open 会直接失败，而系统里其实还有别的浏览器。
 * 回退走后端插件的 ACTION_VIEW Intent，由系统自己挑默认浏览器。
 */
const openUrl = async (url: string): Promise<void> => {
  if (!Capacitor.isNativePlatform()) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  try {
    await Browser.open({ url })
    return
  } catch {
    // 没有支持 Custom Tabs 的浏览器，继续走系统默认浏览器
  }
  try {
    await ExternalLink.open({ url })
  } catch (error) {
    throw new Error(`无法打开链接：${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 在系统浏览器里打开官方页面。
 * 被白名单拒绝时抛错而不是静默失败——调用方应当把这件事当成 bug 暴露出来。
 */
export const openOfficialPage = async (page: OfficialPage): Promise<void> => {
  const url = OFFICIAL_URL[page]
  if (!isAllowedExternalUrl(url)) {
    throw new Error(`拒绝打开非官方地址：${url}`)
  }
  await openUrl(url)
}


/**
 * 打开受信任的外部地址（更新下载、项目主页）。
 * 与 openOfficialPage 共用同一份主机白名单：宁可少开，也不放开任意 URL。
 */
export const openTrustedUrl = async (url: string): Promise<void> => {
  if (!isAllowedExternalUrl(url)) {
    throw new Error(`拒绝打开未授权地址：${url}`)
  }
  await openUrl(url)
}
