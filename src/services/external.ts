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
 * 在系统浏览器（Android）或新标签页（浏览器调试）里打开官方页面。
 * 被白名单拒绝时抛错而不是静默失败——调用方应当把这件事当成 bug 暴露出来。
 */
export const openOfficialPage = async (page: OfficialPage): Promise<void> => {
  const url = OFFICIAL_URL[page]
  if (!isAllowedExternalUrl(url)) {
    throw new Error(`拒绝打开非官方地址：${url}`)
  }
  await Browser.open({ url })
}


/**
 * 打开受信任的外部地址（更新下载、项目主页）。
 * 与 openOfficialPage 共用同一份主机白名单：宁可少开，也不放开任意 URL。
 */
export const openTrustedUrl = async (url: string): Promise<void> => {
  if (!isAllowedExternalUrl(url)) {
    throw new Error(`拒绝打开未授权地址：${url}`)
  }
  await Browser.open({ url })
}
