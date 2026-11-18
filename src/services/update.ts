/**
 * 检查更新。
 *
 * 两个数据源各有毛病，所以都要：
 * - `api.github.com`：实时，但对未认证请求限流 60 次/小时/IP（实测本机已撞到 403，
 *   移动网络用户共享出口 IP 更容易撞）→ 优先用它，保证刚发版时结果正确
 * - 仓库里的 `version.json`（raw.githubusercontent.com）：无限流，但 **CDN 有缓存延迟**
 *   （实测发版后数分钟仍返回旧内容）→ 只作兜底
 *
 * 隐私：检查更新会请求 github.com / raw.githubusercontent.com，对方能看到你的 IP。
 * 默认**不自动检查**，只在用户点「检查更新」时发一次请求。
 */

/** 仓库（owner/repo）。开源后改这里即可。 */
export const UPDATE_REPO = 'JJJJJacobbbbb/ds-echo'

/**
 * 备用下载页（静态页面，见 docs/download.html）。
 * 用途：GitHub 打不开时，用户仍能拿到 APK。留空则不显示该按钮。
 * 建议放到国内可达的静态托管（蓝奏云分享页 / Gitee Pages / 自己的 OSS）。
 */
export const LANDING_URL = ''

/** 发布页：检查失败时给用户一个手动入口 */
export const RELEASES_URL = `https://github.com/${UPDATE_REPO}/releases`

export type UpdateResult =
  | { status: 'unconfigured' }
  | { status: 'latest'; version: string }
  | {
      status: 'outdated'
      version: string
      /** 发布页地址（兜底） */
      url: string
      /** APK 直链（GitHub 原始地址） */
      apk?: string
      /** APK 镜像：按顺序尝试，第三方代理加速 */
      apkMirrors?: string[]
      /** 下载后必须匹配的 sha256（镜像不可信，必须校验） */
      apkSha256?: string
      /** APK 体积（字节），用于在界面上提示 */
      apkSize?: number
      notes: string
    }
  | { status: 'unavailable'; message: string; tried: number }

/** 当前版本（构建时由 rspack/vitest 从 package.json 注入） */
export const currentVersion = (): string =>
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

/**
 * 把 `v1.2.3` / `1.2.3` 归一成可比较的数字数组。
 *
 * 先砍掉预发布/构建后缀（`-beta.1`、`+build7`）：只比较数字段。
 * 否则 `0.3.0-beta.1` 会因为有第 4 段「1」而被判定比 `0.3.0` 新——这是错的。
 */
const parse = (version: string): number[] =>
  version
    .replace(/^v/i, '')
    .split(/[-+]/)[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((value) => (Number.isFinite(value) ? value : 0))

/** a 比 b 新返回 true；只比较数字段 */
export const isNewer = (a: string, b: string): boolean => {
  const left = parse(a)
  const right = parse(b)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const l = left[i] ?? 0
    const r = right[i] ?? 0
    if (l !== r) {
      return l > r
    }
  }
  return false
}

type ReleaseInfo = {
  version: string
  url: string
  notes: string
  apk?: string
  apkMirrors?: string[]
  apkSha256?: string
  apkSize?: number
}

const decide = (info: ReleaseInfo, current: string): UpdateResult =>
  isNewer(info.version, current)
    ? {
        status: 'outdated',
        version: info.version,
        url: info.url,
        ...(info.apk ? { apk: info.apk } : {}),
        ...(info.apkMirrors?.length ? { apkMirrors: info.apkMirrors } : {}),
        ...(info.apkSha256 ? { apkSha256: info.apkSha256 } : {}),
        ...(info.apkSize ? { apkSize: info.apkSize } : {}),
        notes: info.notes,
      }
    : { status: 'latest', version: current }

/**
 * 版本清单的候选地址，按顺序尝试：
 * 1. jsDelivr（CDN 镜像，国内通常可达，无速率限制）
 * 2. raw.githubusercontent.com（官方 CDN，可能有几分钟缓存延迟）
 */
const manifestUrls = (): string[] => {
  // jsDelivr 对 @main 有缓存，加时间戳让每个节点都回源（各节点缓存互相独立）
  const bust = `?t=${Date.now()}`
  const raw = `https://raw.githubusercontent.com/${UPDATE_REPO}/main/version.json`
  return [
    `https://cdn.jsdelivr.net/gh/${UPDATE_REPO}@main/version.json${bust}`,
    `https://fastly.jsdelivr.net/gh/${UPDATE_REPO}@main/version.json${bust}`,
    `https://gcore.jsdelivr.net/gh/${UPDATE_REPO}@main/version.json${bust}`,
    `https://testingcf.jsdelivr.net/gh/${UPDATE_REPO}@main/version.json${bust}`,
    `https://raw.githack.com/${UPDATE_REPO}/main/version.json${bust}`,
    `https://gh-proxy.com/${raw}`,
    raw,
  ]
}

const readManifest = async (signal: AbortSignal): Promise<ReleaseInfo | null> => {
  for (const url of manifestUrls()) {
    const info = await readManifestFrom(url, signal).catch(() => null)
    if (info) {
      return info
    }
  }
  return null
}

const readManifestFrom = async (url: string, signal: AbortSignal): Promise<ReleaseInfo | null> => {
  const response = await fetch(url, { signal, cache: 'no-store' })
  if (!response.ok) {
    return null
  }
  const data = (await response.json()) as {
    version?: string
    url?: string
    notes?: string
    apk?: string
    apkMirrors?: string[]
    apkSha256?: string
    apkSize?: number
  }
  if (!data.version) {
    return null
  }
  return {
    version: data.version,
    url: data.url || RELEASES_URL,
    notes: data.notes ?? '',
    ...(data.apk ? { apk: data.apk } : {}),
    ...(Array.isArray(data.apkMirrors) ? { apkMirrors: data.apkMirrors.filter(Boolean) } : {}),
    ...(data.apkSha256 ? { apkSha256: data.apkSha256 } : {}),
    ...(typeof data.apkSize === 'number' ? { apkSize: data.apkSize } : {}),
  }
}

/** 兜底：GitHub API（可能被限流，失败就放弃） */
const readApi = async (signal: AbortSignal): Promise<ReleaseInfo | null> => {
  const response = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
    signal,
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) {
    return null
  }
  const data = (await response.json()) as {
    tag_name?: string
    html_url?: string
    body?: string
    assets?: {
      name?: string
      browser_download_url?: string
      size?: number
      /** GitHub 现在会给资源算摘要，形如 "sha256:xxxx" */
      digest?: string
    }[]
  }
  const version = (data.tag_name ?? '').replace(/^v/i, '')
  if (!version) {
    return null
  }
  // 优先 apk 资源：直接开直链，用户少点一次、也不用在发布页里找文件
  const apk = data.assets?.find((asset) => (asset.name ?? '').toLowerCase().endsWith('.apk'))
  const downloadUrl = apk?.browser_download_url
  // digest 形如 "sha256:abc..."；没有就不带，界面会退回打开下载地址
  const digest = apk?.digest?.startsWith('sha256:') ? apk.digest.slice('sha256:'.length) : undefined
  return {
    version,
    url: data.html_url || RELEASES_URL,
    notes: (data.body ?? '').slice(0, 500),
    ...(downloadUrl ? { apk: downloadUrl } : {}),
    // API 不提供镜像列表，这里按同样的代理前缀拼（只在实测能返回 APK 字节的代理上）
    ...(downloadUrl
      ? {
          apkMirrors: [
            `https://gh-proxy.com/${downloadUrl}`,
            `https://cors.isteed.cc/${downloadUrl}`,
          ],
        }
      : {}),
    ...(digest ? { apkSha256: digest } : {}),
    ...(typeof apk?.size === 'number' ? { apkSize: apk.size } : {}),
  }
}

/**
 * 单个源的超时。之前整次检查共用一个 10 秒 AbortController：
 * 只要第一个源（api.github.com）卡住，后面所有镜像都会拿到 aborted 信号，
 * 结果必然是"网络问题"——即使镜像其实是通的。所以每个源各算各的。
 */
const SOURCE_TIMEOUT_MS = 6_000

const withTimeout = async <T>(
  run: (signal: AbortSignal) => Promise<T | null>
): Promise<T | null> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS)
  try {
    return await run(controller.signal)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export const checkForUpdate = async (): Promise<UpdateResult> => {
  if (!UPDATE_REPO) {
    return { status: 'unconfigured' }
  }
  const current = currentVersion()
  const api = await withTimeout((signal) => readApi(signal))
  if (api) {
    return decide(api, current)
  }
  const manifest = await withTimeout((signal) => readManifest(signal))
  if (manifest) {
    return decide(manifest, current)
  }
  return {
    status: 'unavailable',
    message: 'network',
    tried: manifestUrls().length + 1,
  }
}
