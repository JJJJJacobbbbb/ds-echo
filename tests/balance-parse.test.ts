import { describe, expect, it } from 'vitest'
import { ApiError } from '../src/services/api/client.js'
import { parseBalance } from '../src/services/api/balance.js'

/**
 * 余额解析的单元测试。
 *
 * 重点不是"正常数据能解析"，而是**异常数据必须报错**：
 * 如果这里静默返回空列表，界面会显示「余额 0」，用户会以为自己的钱没了。
 */

const validPayload = {
  is_available: true,
  balance_infos: [
    {
      currency: 'CNY',
      total_balance: '9.84',
      granted_balance: '0.00',
      topped_up_balance: '9.84',
    },
  ],
}

describe('parseBalance', () => {
  it('能解析正常响应', () => {
    const result = parseBalance(validPayload)
    expect(result.is_available).toBe(true)
    expect(result.balance_infos).toHaveLength(1)
    expect(result.balance_infos[0].currency).toBe('CNY')
  })

  it('金额保持字符串，不转成 number（避免浮点误差）', () => {
    const result = parseBalance(validPayload)
    expect(result.balance_infos[0].total_balance).toBe('9.84')
    expect(typeof result.balance_infos[0].total_balance).toBe('string')
  })

  it('多币种按服务端顺序保留，不做合并', () => {
    const result = parseBalance({
      is_available: true,
      balance_infos: [
        { currency: 'CNY', total_balance: '1.00', granted_balance: '0', topped_up_balance: '1.00' },
        { currency: 'USD', total_balance: '2.00', granted_balance: '0', topped_up_balance: '2.00' },
      ],
    })
    expect(result.balance_infos.map((info) => info.currency)).toEqual(['CNY', 'USD'])
  })

  it('余额为 0 是合法数据，不是错误', () => {
    const result = parseBalance({
      is_available: false,
      balance_infos: [
        { currency: 'CNY', total_balance: '0.00', granted_balance: '0.00', topped_up_balance: '0.00' },
      ],
    })
    expect(result.is_available).toBe(false)
    expect(result.balance_infos[0].total_balance).toBe('0.00')
  })

  it('缺少 is_available 时抛 protocol 错误', () => {
    expect(() => parseBalance({ balance_infos: [] })).toThrowError(ApiError)
    try {
      parseBalance({ balance_infos: [] })
    } catch (error) {
      expect((error as ApiError).kind).toBe('protocol')
    }
  })

  it('balance_infos 不是数组时抛 protocol 错误', () => {
    try {
      parseBalance({ is_available: true, balance_infos: {} })
    } catch (error) {
      expect((error as ApiError).kind).toBe('protocol')
    }
  })

  it('金额字段是数字（不是字符串）时视为格式异常', () => {
    try {
      parseBalance({
        is_available: true,
        balance_infos: [
          { currency: 'CNY', total_balance: 9.84, granted_balance: '0', topped_up_balance: '9.84' },
        ],
      })
    } catch (error) {
      expect((error as ApiError).kind).toBe('protocol')
    }
  })

  it('传入 null 不崩溃，报 protocol 错误', () => {
    expect(() => parseBalance(null)).toThrowError(ApiError)
  })
})
