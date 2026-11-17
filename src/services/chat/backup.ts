import { formatDate } from '../../utils/format.js'
import * as db from './db.js'
import { mergeHistory, replaceHistory, useChatStore } from './store.js'
import type { Session } from './types.js'

export { BackupError } from './history/errors.js'

// 导入、导出与全部删除串行处理，避免读取归档时数据被清空或两个替换事务交错。
let backupQueue: Promise<unknown> = Promise.resolve()

const enqueueBackup = <T>(run: () => Promise<T>): Promise<T> => {
  const task = backupQueue.then(run)
  backupQueue = task.catch(() => {})
  return task
}

const backupFileName = (date: Date) => `deepseek_data-${formatDate(date)}.zip`

/** 导出为历史会话导出格式的 ZIP，可再次导入。 */
export const exportHistory = (): Promise<{ name: string; blob: Blob }> =>
  enqueueBackup(async () => {
    // 列表和已加载内容保留导出开始时的快照；未打开的会话逐条读取，不填满详情缓存。
    const { sessions, sessionCache } = useChatStore.getState()
    async function* readSessions(): AsyncGenerator<Session> {
      for (const summary of sessions) {
        const session = Object.hasOwn(sessionCache, summary.id)
          ? sessionCache[summary.id]
          : await db.loadSession(summary.id)
        if (!session) {
          throw new Error(`History session disappeared during export: ${summary.id}`)
        }
        // 详情读取期间可能重命名，归档标题与开始时的列表保持一致。
        yield { ...session, ...summary }
      }
    }
    const { exportArchive } = await import('./history/exportArchive.js')
    const now = new Date()
    const blob = await exportArchive(readSessions())
    return { name: backupFileName(now), blob }
  })

/**
 * 导入第一步：校验 + 算指纹 + 把归档写进暂存区，返回预览信息。
 *
 * 这一步**不碰用户的任何现有数据**（只写 sessionsStaging / filesStaging），
 * 所以可以安全地先给用户看"会导入多少、跳过多少"，再让他决定。
 */
export type ImportPreview = db.StagingPreview & { fingerprint: string }

export const stageHistoryImport = (file: File): Promise<ImportPreview> =>
  enqueueBackup(async () => {
    const [{ checkArchiveFormat, importArchive }, { fingerprintFile }] = await Promise.all([
      import('./history/importArchive.js'),
      import('./history/archiveFingerprint.js'),
    ])
    await checkArchiveFormat(file)
    const fingerprint = await fingerprintFile(file)
    await db.clearStaging()
    await importArchive(file)
    const preview = await db.previewStaging()
    return { ...preview, fingerprint }
  })

/** 导入第二步：把暂存区合并进正式数据（单事务，失败整体回滚） */
export const commitHistoryImport = (fingerprint: string): Promise<db.MergeResult> =>
  enqueueBackup(() => mergeHistory(() => db.mergeStaging({ fingerprint })))

/** 用户取消预览：丢掉暂存，现有数据本来就没被动过 */
export const cancelHistoryImport = (): Promise<void> => enqueueBackup(() => db.clearStaging())

/**
 * 旧的整体替换导入。**已不再用于文件导入**（导入已改成合并），
 * 保留给「删除所有对话」复用同一套原子替换语义。
 */
export const importHistory = (file: File): Promise<number> =>
  enqueueBackup(async () => {
    const { checkArchiveFormat, importArchive } = await import('./history/importArchive.js')
    await checkArchiveFormat(file)
    return replaceHistory(() => importArchive(file))
  })

/** 确认删除后调用：以空历史原子替换全部本地会话与附件，保留 API Key 和其他设置。 */
export const clearHistory = (): Promise<void> =>
  enqueueBackup(async () => {
    await replaceHistory(async () => {})
  })

