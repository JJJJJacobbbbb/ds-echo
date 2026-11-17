/**
 * 余额状态：账户区展示与充值返回后的刷新都读这里。
 *
 * 状态机（刻意只有这几个，不做实时轮询）：
 *   idle    还没查过
 *   loading 请求进行中
 *   ready   拿到数据（data 非空）
 *   error   失败（condition 说明是哪一类，UI 据此给不同文案）
 *
 * 为什么要单独的 store 而不是在组件里 useState：
 * 余额会被两处同时读（设置里的账户区、充值返回后的提示），
 * 放在组件里会出现两处数据不同步。
 */
import { create } from 'zustand'
import { fetchBalance, type Balance } from '../api/balance.js'
import { classifyApiError, type ApiErrorCondition } from '../api/errors.js'
import { useSettings } from '../settings.js'

export type BalanceStatus = 'idle' | 'loading' | 'ready' | 'error'

type BalanceState = {
  status: BalanceStatus
  data: Balance | null
  /** 失败原因分类；status 为 error 时非空 */
  condition: ApiErrorCondition | null
  /** 失败的具体信息（服务端文案或网络错误），用于「其他错误」的兜底展示 */
  errorMessage: string | null
  /** 上次成功查询的时间戳（毫秒）；null 表示从未成功过 */
  updatedAt: number | null
  refresh: () => Promise<void>
  /** 清除 Key 或换 Key 时调用，避免展示上一个账号的余额 */
  reset: () => void
}

/** 请求序号：避免先发后到的旧响应覆盖新结果（用户连点刷新、或刚换了 Key） */
let requestSeq = 0

export const useBalance = create<BalanceState>((set) => ({
  status: 'idle',
  data: null,
  condition: null,
  errorMessage: null,
  updatedAt: null,

  refresh: async () => {
    const apiKey = useSettings.getState().apiKey
    if (!apiKey) {
      // 没有 Key 时不该发请求；清空状态让 UI 显示「未连接」
      set({ status: 'idle', data: null, condition: null, errorMessage: null, updatedAt: null })
      return
    }
    const seq = ++requestSeq
    set({ status: 'loading', condition: null, errorMessage: null })
    try {
      const data = await fetchBalance(apiKey)
      if (seq !== requestSeq) {
        return
      }
      set({ status: 'ready', data, condition: null, errorMessage: null, updatedAt: Date.now() })
    } catch (error) {
      if (seq !== requestSeq) {
        return
      }
      // 保留上一次成功的数据：网络抖一下不该让余额栏变成空白
      set({
        status: 'error',
        condition: classifyApiError(error),
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    }
  },

  reset: () => {
    requestSeq += 1
    set({ status: 'idle', data: null, condition: null, errorMessage: null, updatedAt: null })
  },
}))

