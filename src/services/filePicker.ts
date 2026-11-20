/**
 * 选文件（系统文档界面）。
 *
 * 网页的 `<input type="file">` 在安卓上由 Capacitor 用 `ACTION_GET_CONTENT` 打开，
 * 国产 ROM 会劫持到自家「文件管理」；这里改用原生 `ACTION_OPEN_DOCUMENT`，
 * 得到的是用户熟悉的系统文档界面（最近 / 下载 / 文档）。
 *
 * 非原生平台没有该能力，调用方回退到 input。
 */
import { Capacitor, registerPlugin } from '@capacitor/core'

type FilePickerPlugin = {
  pick(): Promise<{ files: Array<{ name: string; mimeType: string; base64: string }> }>
}

const FilePicker = registerPlugin<FilePickerPlugin>('FilePicker')

export const nativeFilePickerAvailable = (): boolean => Capacitor.isNativePlatform()

const base64ToBytes = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(value)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/** 打开系统文档界面选文件；用户取消返回空数组 */
export const pickFiles = async (): Promise<File[]> => {
  const { files } = await FilePicker.pick()
  return files.map((item) => new File([base64ToBytes(item.base64)], item.name, { type: item.mimeType }))
}
