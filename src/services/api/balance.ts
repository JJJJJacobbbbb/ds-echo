/**
 * 账户余额接口。
 *
 * 只在「用户主动刷新 / 打开账户区 / 从充值页返回」时调用，不做轮询：
 * 余额是计费状态而不是实时行情，轮询只会白白消耗请求额度。
 *
 * 接口：GET https://api.deepseek.com/user/balance
 *   Authorization: Bearer <用户自己的 Key>
 *   → { is_available: boolean, balance_infos: [{ currency, total_balance, granted_balance, topped_up_balance }] }
 *
 * 注意：金额字段服务端返回的是**字符串**（如 "9.84"），不是数字。
 * 不要用 Number 直接算出展示值再四舍五入，也不要跨币种相加——
 * 多币种时各币种是独立账本，合并显示会误导用户。
 */
import { API_ORIGIN, ApiError, request } from './client.js'

/** 单个币种的余额；金额保持服务端原样的字符串，避免浮点误差 */
export type BalanceInfo = {
  currency: string
  total_balance: string
  granted_balance: string
  topped_up_balance: string
}

export type Balance = {
  is_available: boolean
  balance_infos: BalanceInfo[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isBalanceInfo = (value: unknown): value is BalanceInfo => {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.currency === 'string' &&
    typeof value.total_balance === 'string' &&
    typeof value.granted_balance === 'string' &&
    typeof value.topped_up_balance === 'string'
  )
}

/**
 * 校验并收窄服务端响应。
 * 形状不符时抛 protocol 错误而不是静默返回空数据——否则界面会显示「余额 ¥0」，
 * 让用户误以为钱没了。
 */
export const parseBalance = (value: unknown): Balance => {
  if (!isRecord(value) || typeof value.is_available !== 'boolean') {
    throw new ApiError('protocol', '余额接口返回格式异常（缺少 is_available）')
  }
  const infos = value.balance_infos
  if (!Array.isArray(infos) || !infos.every(isBalanceInfo)) {
    throw new ApiError('protocol', '余额接口返回格式异常（balance_infos 不合法）')
  }
  return { is_available: value.is_available, balance_infos: infos }
}

/**
 * 查询余额。
 *
 * 失败时抛 ApiError，调用方用 classifyApiError 归类：
 * 401 → unauthorized（Key 无效）、402 → insufficientBalance、429 → rateLimited、
 * 其余或断网 → network / other。
 */
export const fetchBalance = async (apiKey: string, signal?: AbortSignal): Promise<Balance> => {
  const response = await request(`${API_ORIGIN}/user/balance`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  })
  const json: unknown = await response.json().catch(() => {
    throw new ApiError('protocol', '余额接口返回的不是 JSON')
  })
  return parseBalance(json)
}
