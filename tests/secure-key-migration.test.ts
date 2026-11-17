import { describe, expect, it, vi } from 'vitest'
import { migrateApiKey } from '../src/services/secureKeyMigration.js'

/**
 * 迁移逻辑单测。
 *
 * 这些用例就是"迁移不能丢 Key"这条要求的可执行版本：
 * 只要有一支失败，用户要么丢 Key，要么明文残留。
 */

const makeAdapters = (
  legacy: string | null,
  secure: string | null,
  options: { failWrite?: boolean; verifyMismatch?: boolean } = {}
) => {
  const state = { legacy, secure }
  let writes = 0
  const adapters = {
    readLegacy: vi.fn(() => state.legacy),
    clearLegacy: vi.fn(() => {
      state.legacy = null
    }),
    // 校验失败的场景要模拟成「第一次读到空、写完之后读回的内容却不对」，
    // 否则会误走「安全存储已有值」的分支，测不到校验逻辑。
    readSecure: vi.fn(async () => {
      if (options.verifyMismatch && writes > 0) {
        return 'something-else'
      }
      return state.secure
    }),
    writeSecure: vi.fn(async (value: string) => {
      if (options.failWrite) {
        throw new Error('keystore 不可用')
      }
      writes += 1
      state.secure = value
    }),
  }
  return { adapters, state }
}

describe('migrateApiKey', () => {
  it('只有明文：搬进安全存储并删除明文', async () => {
    const { adapters, state } = makeAdapters('sk-legacy', null)
    const result = await migrateApiKey(adapters)
    expect(result).toEqual({ apiKey: 'sk-legacy', migrated: true, clearedLegacy: true })
    expect(state.secure).toBe('sk-legacy')
    expect(state.legacy).toBeNull()
  })

  it('安全存储已有值：以安全存储为准，并清掉残留明文', async () => {
    const { adapters, state } = makeAdapters('sk-legacy', 'sk-secure')
    const result = await migrateApiKey(adapters)
    expect(result).toEqual({ apiKey: 'sk-secure', migrated: false, clearedLegacy: true })
    expect(state.legacy).toBeNull()
  })

  it('安全存储已有值且没有明文：什么都不做', async () => {
    const { adapters } = makeAdapters(null, 'sk-secure')
    const result = await migrateApiKey(adapters)
    expect(result).toEqual({ apiKey: 'sk-secure', migrated: false, clearedLegacy: false })
    expect(adapters.writeSecure).not.toHaveBeenCalled()
  })

  it('两边都没有：返回 null', async () => {
    const { adapters } = makeAdapters(null, null)
    const result = await migrateApiKey(adapters)
    expect(result).toEqual({ apiKey: null, migrated: false, clearedLegacy: false })
  })

  it('写入安全存储失败：抛错，且**明文必须保留**（不能丢 Key）', async () => {
    const { adapters, state } = makeAdapters('sk-legacy', null, { failWrite: true })
    await expect(migrateApiKey(adapters)).rejects.toThrow('keystore 不可用')
    expect(state.legacy).toBe('sk-legacy')
    expect(adapters.clearLegacy).not.toHaveBeenCalled()
  })

  it('写入后读回不一致：抛错，且明文保留', async () => {
    const { adapters, state } = makeAdapters('sk-legacy', null, { verifyMismatch: true })
    await expect(migrateApiKey(adapters)).rejects.toThrow('校验失败')
    expect(state.legacy).toBe('sk-legacy')
    expect(adapters.clearLegacy).not.toHaveBeenCalled()
  })
})
