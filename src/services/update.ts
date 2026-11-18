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

/** 发布页：检查失败时给用户一个手动入口 */
export const RELEASES_URL = `https://github.com/${UPDATE_REPO}/releases`

export type UpdateResult =
  | { status: 'unconfigured' }
  | { status: 'latest'; version: string }
  | { status: 'outdated'; version: string; url: string; notes: string }
  | { status: 'unavailable'; message: string }

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

type ReleaseInfo = { version: string; url: string; notes: string }

const decide = (info: ReleaseInfo, current: string): UpdateResult =>
  isNewer(info.version, current)
    ? { status: 'outdated', version: info.version, url: info.url, notes: info.notes }
    : { status: 'latest', version: current }

/** 主路径：仓库里的 version.json（无速率限制） */
const readManifest = async (signal: AbortSignal): Promise<ReleaseInfo | null> => {
  const response = await fetch(
    `https://raw.githubusercontent.com/${UPDATE_REPO}/main/version.json`,
    { signal, cache: 'no-store' }
  )
  if (!response.ok) {
    return null
  }
  const data = (await response.json()) as {
    version?: string
    url?: string
    notes?: string
  }
  if (!data.version) {
    return null
  }
  return {
    version: data.version,
    url: data.url || RELEASES_URL,
    notes: data.notes ?? '',
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
  }
  const version = (data.tag_name ?? '').replace(/^v/i, '')
  if (!version) {
    return null
  }
  return {
    version,
    url: data.html_url || RELEASES_URL,
    notes: (data.body ?? '').slice(0, 500),
  }
}

export const checkForUpdate = async (): Promise<UpdateResult> => {
  if (!UPDATE_REPO) {
    return { status: 'unconfigured' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const current = currentVersion()
    const api = await readApi(controller.signal).catch(() => null)
    if (api) {
      return decide(api, current)
    }
    const manifest = await readManifest(controller.signal).catch(() => null)
    if (manifest) {
      return decide(manifest, current)
    }
    return { status: 'unavailable', message: 'network' }
  } catch (error) {
    return {
      status: 'unavailable',
      message: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}
