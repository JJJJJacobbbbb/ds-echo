/**
 * 打赏名单：读本地 JSON，按金额从大到小排序。
 *
 * 为什么是本地静态文件：本 App 没有后端、不收集数据，无法自动知道谁打了赏。
 * 名单只能由作者手动维护（`src/data/donations.json`）。
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
