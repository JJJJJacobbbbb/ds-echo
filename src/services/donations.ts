/**
 * 打赏名单。
 *
 * 维护方式：**远端优先**。作者在 GitHub 上编辑仓库根目录的 `donations.json` 即可生效，
 * 不需要重新发版；App 打开打赏弹窗时通过 jsDelivr（国内可达）拉取，失败则用内置兜底名单。
 *
 * 为什么需要兜底：手机可能连不上 jsDelivr/GitHub；内置那份保证弹窗永远有内容可显示。
 *
 * 容错：JSON 里出现坏数据（金额不是数字、条目不是对象）时**跳过该条**而不是整体失败——
 * 一个手滑的逗号不该让打赏弹窗整个打不开。
 */
import raw from '../data/donations.json' with { type: 'json' }

export type Donation = {
  name: string
  amount: number
  message?: string
  date?: string
}

/** 解析并排序；金额大的在前，金额相同按名字稳定排序 */
export const parseDonations = (input: unknown): Donation[] => {
  if (!Array.isArray(input)) {
    return []
  }
  const items: Donation[] = []
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const record = entry as Record<string, unknown>
    const amount = Number(record.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      continue
    }
    items.push({
      name: typeof record.name === 'string' ? record.name.trim() : '',
      amount,
      ...(typeof record.message === 'string' && record.message.trim()
        ? { message: record.message.trim() }
        : {}),
      ...(typeof record.date === 'string' ? { date: record.date } : {}),
    })
  }
  return items.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
}

export const listDonations = (): Donation[] => parseDonations(raw)

/** 远端名单地址（与 update.ts 的仓库一致），jsDelivr 优先、raw 兜底 */
const DONATION_URLS = (): string[] => {
  const bust = `?t=${Date.now()}`
  return [
    `https://cdn.jsdelivr.net/gh/JJJJJacobbbbb/ds-echo@main/donations.json${bust}`,
    `https://raw.githubusercontent.com/JJJJJacobbbbb/ds-echo/main/donations.json${bust}`,
  ]
}

const SOURCE_TIMEOUT_MS = 6_000

/** 从远端拉取名单；全都失败时返回 null（调用方用内置兜底） */
export const fetchDonations = async (): Promise<Donation[] | null> => {
  for (const url of DONATION_URLS()) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS)
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' })
      if (response.ok) {
        return parseDonations(await response.json())
      }
    } catch {
      // 换下一个源
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

/** 内置兜底名单（构建时打进去，永远可用） */
export const bundledDonations = (): Donation[] => listDonations()
