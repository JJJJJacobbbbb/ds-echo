import { describe, expect, it } from 'vitest'
import { isAllowedExternalUrl, OFFICIAL_URL } from '../src/services/external.js'

/**
 * 外链白名单的单元测试。
 *
 * 这是安全边界：只要这里放宽了，任何一个被注入的链接都能把用户带到假页面去输 Key。
 * 所以重点测"该拒绝的必须拒绝"，包括看起来很像官方域名的那些。
 */

describe('isAllowedExternalUrl', () => {
  it('放行官方三个页面', () => {
    expect(isAllowedExternalUrl(OFFICIAL_URL.apiKeys)).toBe(true)
    expect(isAllowedExternalUrl(OFFICIAL_URL.topUp)).toBe(true)
    expect(isAllowedExternalUrl(OFFICIAL_URL.platform)).toBe(true)
  })

  it('放行官方子域', () => {
    expect(isAllowedExternalUrl('https://chat.deepseek.com/')).toBe(true)
    expect(isAllowedExternalUrl('https://api.deepseek.com/user/balance')).toBe(true)
  })

  it('拒绝 http（非 https）', () => {
    expect(isAllowedExternalUrl('http://platform.deepseek.com/top_up')).toBe(false)
  })

  it('拒绝仿冒域名（官方域名作为前缀）', () => {
    expect(isAllowedExternalUrl('https://platform.deepseek.com.evil.com/top_up')).toBe(false)
    expect(isAllowedExternalUrl('https://platform.deepseek.com.cn/top_up')).toBe(false)
  })

  it('拒绝把官方域名放进路径或参数的链接', () => {
    expect(isAllowedExternalUrl('https://evil.com/?next=https://platform.deepseek.com')).toBe(false)
    expect(isAllowedExternalUrl('https://evil.com/platform.deepseek.com')).toBe(false)
  })

  it('拒绝非 https 协议', () => {
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('ftp://deepseek.com/')).toBe(false)
  })

  it('拒绝无法解析的字符串', () => {
    expect(isAllowedExternalUrl('not a url')).toBe(false)
    expect(isAllowedExternalUrl('')).toBe(false)
  })
})
