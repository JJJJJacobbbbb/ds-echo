/**
 * 检查更新：比对 GitHub Releases 的最新版本与当前版本。
 *
 * 为什么用 GitHub Releases 而不是自建服务器：
 * 这个 App 不收集用户数据、也没有后端；GitHub 是唯一已知的公开分发点。
 *
 * 隐私说明（会写进 README）：检查更新会请求 `api.github.com`，
 * GitHub 能看到你的 IP。默认**不自动检查**，只在用户点「检查更新」时发请求。
 */

/** 仓库地址：开源后填成 owner/repo，例如 `someone/ds-echo` */
export const UPDATE_REPO = ''

/** 当前版本（构建时从 package.json 注入为 __APP_VERSION__） */
export const currentVersion = (): string =>
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

export type UpdateResult =
  | { status: 'unconfigured' }
  | { status: 'latest'; version: string }
  | { status: 'outdated'; version: string; url: string; notes: string }
  | { status: 'error'; message: string }

/** 把 `v1.2.3` / `1.2.3` 归一成可比较的数字数组 */
const parse = (version: string): number[] =>
  version
    .replace(/^v/i, '')
    .split(/[.\-+]/)
    .map((part) => Number.parseInt(part, 10))
    .map((value) => (Number.isFinite(value) ? value : 0))

/** a 比 b 新返回 true；只比较数字段，预发布后缀不参与 */
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

export const checkForUpdate = async (): Promise<UpdateResult> => {
  if (!UPDATE_REPO) {
    return { status: 'unconfigured' }
  }
  try {
    const response = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!response.ok) {
      return { status: 'error', message: `HTTP ${response.status}` }
    }
    const data = (await response.json()) as {
      tag_name?: string
      html_url?: string
      body?: string
    }
    const version = (data.tag_name ?? '').replace(/^v/i, '')
    if (!version) {
      return { status: 'error', message: 'release 缺少版本号' }
    }
    const current = currentVersion()
    if (!isNewer(version, current)) {
      return { status: 'latest', version: current }
    }
    return {
      status: 'outdated',
      version,
      url: data.html_url ?? `https://github.com/${UPDATE_REPO}/releases`,
      notes: (data.body ?? '').slice(0, 500),
    }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}
