/**
 * 把生成好的文件交给用户保存。
 *
 * 为什么需要这一层：上游用的是浏览器的 `<a download>` + blob URL。
 * 在 Android WebView 里这套是**静默失效**的——点下去没有任何反应、不报错、
 * 也不产生文件（本机实测：点击后 18 秒无任何变化，下载目录也没有新文件）。
 * 所以原生端必须走 Capacitor 的写文件 + 系统分享面板。
 *
 * 保存位置的选择交给用户：写到 App 缓存目录后唤起系统分享，
 * 由用户决定存到「文件」、发到微信还是传到网盘。
 * 这样做不需要申请存储权限（Android 10+ 的 scoped storage 下，直接写公共下载目录要额外权限）。
 */
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/** 超过这个体积的文件不适合整体转 base64（会多占约 1.3 倍内存） */
export const MAX_SHARE_BYTES = 64 * 1024 * 1024

/** Blob → base64（去掉 data:xxx;base64, 前缀） */
const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const { result } = reader
      if (typeof result !== 'string') {
        reject(new Error('读取导出文件失败'))
        return
      }
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('读取导出文件失败'))
    reader.readAsDataURL(blob)
  })

/** 浏览器端的兜底：传统下载 */
const downloadInBrowser = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export type SaveOutcome =
  | { kind: 'shared'; uri: string }
  | { kind: 'downloaded' }
  | { kind: 'cancelled' }

/**
 * 保存文件：
 * - 原生（Android）：写缓存目录 → 唤起系统分享面板 → 用户选择去向
 * - 浏览器：走传统下载（仅用于桌面调试）
 *
 * 用户取消分享不算失败，返回 cancelled 让调用方给中性提示。
 */
export const saveFileForUser = async (blob: Blob, fileName: string): Promise<SaveOutcome> => {
  if (!Capacitor.isNativePlatform()) {
    downloadInBrowser(blob, fileName)
    return { kind: 'downloaded' }
  }
  if (blob.size > MAX_SHARE_BYTES) {
    throw new Error(`文件过大（${Math.round(blob.size / 1024 / 1024)} MB），超过分享上限`)
  }
  // 写进 App 缓存目录：无需存储权限，且 file_paths.xml 已把 cache 纳入 FileProvider
  const { uri } = await Filesystem.writeFile({
    path: `exports/${fileName}`,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
    recursive: true,
  })
  try {
    await Share.share({ title: fileName, url: uri, dialogTitle: fileName })
    return { kind: 'shared', uri }
  } catch (error) {
    // 用户在分享面板上按返回：Capacitor 抛的是 "Share canceled" 一类的错误
    if (error instanceof Error && /cancel/i.test(error.message)) {
      return { kind: 'cancelled' }
    }
    throw error
  }
}
