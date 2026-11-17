/**
 * 合并导入的去重规则（纯函数，不碰数据库，便于单测）。
 *
 * 为什么"本地已有同 ID 的会话就跳过"而不是覆盖：
 * 用户可能已经在自己手机上继续聊过这个会话，覆盖会直接吞掉他的新消息。
 * 计划书的要求是"首版默认保留本地最新数据"，这里就是那条规则。
 *
 * 为什么不用"归档指纹"来禁止再次导入：
 * 用户可能会先删掉某个会话，再想从同一个 ZIP 里把它恢复回来。
 * 用指纹一律拦死会让这件事永远做不到；按会话 ID 去重既能防重复，
 * 又能让"删了再导入"正常工作。
 */
export type MergePlan = {
  /** 需要写入本地的会话 ID（按归档顺序） */
  importIds: string[]
  /** 本地已存在、本次跳过的会话 ID */
  duplicateIds: string[]
}

export const planMerge = ({
  stagedIds,
  localIds,
}: {
  /** 暂存区里的会话 ID（归档里的全部会话） */
  stagedIds: readonly string[]
  /** 本地已有的会话 ID */
  localIds: readonly string[]
}): MergePlan => {
  const local = new Set(localIds)
  const planned = new Set<string>()
  const importIds: string[] = []
  const duplicateIds: string[] = []
  for (const id of stagedIds) {
    // 归档内部重复（同一个 ID 出现两次）也按重复处理，避免自己覆盖自己
    if (local.has(id) || planned.has(id)) {
      duplicateIds.push(id)
      continue
    }
    planned.add(id)
    importIds.push(id)
  }
  return { importIds, duplicateIds }
}
