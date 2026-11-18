/**
 * 记忆的读写层（浏览器版）。
 *
 * 上游 dsh-persona-memory 写的是磁盘文件 MEMORY.md / USER.md；
 * 本 App 跑在 WebView 里，没有文件系统，所以把**同样的文件内容字符串**存进 localStorage。
 * 好处是格式仍与上游一致：用户把这段文本复制出去就是一份合法的 MEMORY.md。
 *
 * 作用域：**按会话**（本 App 一个会话就是一段角色扮演，跨会话共享记忆会串味）。
 * 这是与上游唯一的实质差异——上游是"跨会话全局记忆"。
 *
 * 写入串行化：同一 scope 的写操作排队，避免并发学习请求互相覆盖。
 */
import {
  DEFAULT_MEMORY_CHAR_LIMIT,
  DEFAULT_USER_CHAR_LIMIT,
  type MemoryEntry,
  type MemoryKind,
  contentChars,
  parseEntries,
  serializeEntries,
} from './format.js'

const keyFor = (scope: string, kind: MemoryKind) => `dsecho-memory:${scope}:${kind}`

const queues = new Map<string, Promise<unknown>>()

const enqueue = <T>(key: string, run: () => T | Promise<T>): Promise<T> => {
  const previous = queues.get(key) ?? Promise.resolve()
  const task = previous.then(run)
  // 失败不阻塞后续写入
  queues.set(
    key,
    task.catch(() => undefined)
  )
  return task
}

export const charLimitFor = (kind: MemoryKind): number =>
  kind === 'user' ? DEFAULT_USER_CHAR_LIMIT : DEFAULT_MEMORY_CHAR_LIMIT

/** 读条目；读不到返回空数组 */
export const readEntries = (scope: string, kind: MemoryKind): MemoryEntry[] => {
  try {
    const raw = localStorage.getItem(keyFor(scope, kind))
    return raw ? parseEntries(raw) : []
  } catch {
    return []
  }
}

/** 读原始文件内容（界面展示/导出用） */
export const readRaw = (scope: string, kind: MemoryKind): string => {
  try {
    return localStorage.getItem(keyFor(scope, kind)) ?? ''
  } catch {
    return ''
  }
}

export const writeEntries = (scope: string, kind: MemoryKind, entries: MemoryEntry[]): Promise<void> =>
  enqueue(keyFor(scope, kind), () => {
    const text = serializeEntries(entries)
    try {
      if (entries.length === 0) {
        localStorage.removeItem(keyFor(scope, kind))
      } else {
        localStorage.setItem(keyFor(scope, kind), text)
      }
    } catch {
      // 存储不可用时静默（记忆是增强项，不能影响对话）
    }
  })

/** 是否已超出字符上限（触发合并） */
export const isOverLimit = (scope: string, kind: MemoryKind): boolean =>
  contentChars(readEntries(scope, kind)) > charLimitFor(kind)

/**
 * 追加条目（自动去重：文本完全相同则只刷新 last 日期）。
 * 返回实际新增/更新的条数，便于上层判断是否需要合并。
 */
export const addEntries = async (
  scope: string,
  kind: MemoryKind,
  texts: string[]
): Promise<number> => {
  const clean = texts.map((text) => text.trim()).filter(Boolean)
  if (clean.length === 0) {
    return 0
  }
  return enqueue(keyFor(scope, kind), () => {
    const entries = readEntries(scope, kind)
    const today = new Date().toISOString().slice(0, 10)
    let changed = 0
    for (const text of clean) {
      const existing = entries.find((entry) => entry.text === text)
      if (existing) {
        if (existing.last !== today) {
          existing.last = today
          changed += 1
        }
        continue
      }
      entries.push({ text, created: today, last: today })
      changed += 1
    }
    if (changed > 0) {
      try {
        localStorage.setItem(keyFor(scope, kind), serializeEntries(entries))
      } catch {
        return 0
      }
    }
    return changed
  })
}

/** 覆盖写入（合并、清空用） */
export const replaceEntries = (
  scope: string,
  kind: MemoryKind,
  entries: MemoryEntry[]
): Promise<void> => writeEntries(scope, kind, entries)
