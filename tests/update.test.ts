import { describe, expect, it } from 'vitest'
import { currentVersion, isNewer } from '../src/services/update.js'

/**
 * 版本比较。
 *
 * 这段逻辑决定"要不要提示更新"，错了有两种后果：
 * 误报（永远提示新版）或漏报（永远说已是最新）。所以把边界都钉住。
 */

describe('isNewer', () => {
  it('大版本更高', () => {
    expect(isNewer('0.4.0', '0.3.0')).toBe(true)
    expect(isNewer('0.3.0', '0.4.0')).toBe(false)
  })

  it('补丁版本更高', () => {
    expect(isNewer('0.3.1', '0.3.0')).toBe(true)
    expect(isNewer('0.3.0', '0.3.1')).toBe(false)
  })

  it('相同版本不算新', () => {
    expect(isNewer('0.3.0', '0.3.0')).toBe(false)
  })

  it('忽略前缀 v', () => {
    expect(isNewer('v0.4.0', '0.3.0')).toBe(true)
    expect(isNewer('0.4.0', 'v0.3.0')).toBe(true)
  })

  it('位数不同时按缺省 0 补齐', () => {
    expect(isNewer('1.0', '0.9.9')).toBe(true)
    expect(isNewer('0.3', '0.3.0')).toBe(false)
  })

  it('预发布后缀只比较数字段', () => {
    expect(isNewer('0.4.0-beta.1', '0.3.0')).toBe(true)
    expect(isNewer('0.3.0-beta.1', '0.3.0')).toBe(false)
  })

  it('非法版本号当作 0，不会抛错', () => {
    expect(isNewer('abc', '0.1.0')).toBe(false)
    expect(isNewer('0.1.0', 'abc')).toBe(true)
  })
})

describe('currentVersion', () => {
  it('测试环境拿到注入的版本号', () => {
    expect(currentVersion()).toBe('0.0.0-test')
  })
})
