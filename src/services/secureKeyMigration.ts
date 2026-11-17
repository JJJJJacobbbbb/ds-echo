/**
 * API Key 的一次性迁移：localStorage 明文 → 安全存储。
 *
 * 迁移是这类改动最容易出事的地方，所以这里做成**纯逻辑 + 依赖注入**：
 * 不直接碰 localStorage / 插件，由调用方传入四个适配器，单元测试可以精确模拟
 * 「写入失败」「校验不一致」「安全存储已有值」等分支。
 *
 * 安全规则（顺序很重要）：
 * 1. 先写安全存储，再**读回校验**，确认一致后才删除 localStorage 的明文
 * 2. 任何一步失败都保留明文——宁可暂时留着，也不能让用户丢了 Key 又没存进去
 * 3. 安全存储已有值时，忽略并清掉残留明文（旧的迁移可能中断过）
 */
export type MigrationAdapters = {
  /** 读旧版 localStorage 明文；没有返回 null */
  readLegacy: () => string | null
  /** 删除旧版明文 */
  clearLegacy: () => void
  /** 读安全存储；没有返回 null */
  readSecure: () => Promise<string | null>
  /** 写安全存储 */
  writeSecure: (value: string) => Promise<void>
}

export type MigrationResult = {
  /** 迁移完成后应当使用的 Key */
  apiKey: string | null
  /** 本次是否真的把明文搬进了安全存储 */
  migrated: boolean
  /** 是否清掉了残留的明文 */
  clearedLegacy: boolean
}

export const migrateApiKey = async (adapters: MigrationAdapters): Promise<MigrationResult> => {
  const secure = await adapters.readSecure()
  const legacy = adapters.readLegacy()

  if (secure) {
    // 安全存储里已有值：以它为准，顺手清掉可能残留的明文
    if (legacy) {
      adapters.clearLegacy()
      return { apiKey: secure, migrated: false, clearedLegacy: true }
    }
    return { apiKey: secure, migrated: false, clearedLegacy: false }
  }

  if (!legacy) {
    return { apiKey: null, migrated: false, clearedLegacy: false }
  }

  // 写失败会抛错，调用方保留明文并记录，让用户下次再试
  await adapters.writeSecure(legacy)
  const verify = await adapters.readSecure()
  if (verify !== legacy) {
    throw new Error('API Key 迁移校验失败：写入安全存储后读回不一致')
  }
  adapters.clearLegacy()
  return { apiKey: legacy, migrated: true, clearedLegacy: true }
}
