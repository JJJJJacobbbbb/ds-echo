/**
 * 相册最近照片（原生插件）。
 *
 * 用途：附件菜单底部的一排「快捷照片」。网页拿不到相册列表，
 * 只能靠原生查 MediaStore；这里只负责取缩略图与取原图，
 * 上传仍然走 attachments.ts 的统一管线。
 *
 * 非原生平台没有这个能力：`available()` 返回 false，界面就不显示这一排。
 */
import { Capacitor, registerPlugin } from '@capacitor/core'

type PhotoLibraryPlugin = {
  checkAccess(): Promise<{ granted: boolean }>
  requestAccess(): Promise<{ granted: boolean }>
  recentImages(): Promise<{ items: Array<{ id: string; name: string; thumbnail: string }> }>
  readImage(options: { id: string }): Promise<{ base64: string; mimeType: string }>
}

const PhotoLibrary = registerPlugin<PhotoLibraryPlugin>('PhotoLibrary')

export type RecentPhoto = {
  id: string
  name: string
  /** JPEG 缩略图的 base64（不含 data: 前缀） */
  thumbnail: string
}

export const photoLibraryAvailable = (): boolean => Capacitor.isNativePlatform()

/** 是否已获得相册权限（不会弹窗） */
export const hasPhotoAccess = async (): Promise<boolean> => {
  if (!photoLibraryAvailable()) {
    return false
  }
  try {
    const { granted } = await PhotoLibrary.checkAccess()
    return granted
  } catch {
    return false
  }
}

/** 请求相册权限（会弹系统框）；返回是否拿到 */
export const requestPhotoAccess = async (): Promise<boolean> => {
  if (!photoLibraryAvailable()) {
    return false
  }
  const { granted } = await PhotoLibrary.requestAccess()
  return granted
}

/** 最近 20 张缩略图；未授权时抛错，由界面区分"没权限"与"没照片" */
export const recentPhotos = async (): Promise<RecentPhoto[]> => {
  const { items } = await PhotoLibrary.recentImages()
  return items
}

const base64ToBytes = (value: string): Uint8Array<ArrayBuffer> => {
  // 显式复制到新的 ArrayBuffer：File 构造签名要求 ArrayBuffer 而非 ArrayBufferLike
  const binary = atob(value)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/** 取原图并转成 File，供上传管线使用 */
export const photoAsFile = async (photo: RecentPhoto): Promise<File> => {
  const { base64, mimeType } = await PhotoLibrary.readImage({ id: photo.id })
  const bytes = base64ToBytes(base64)
  const ext = mimeType === 'image/png' ? 'png' : 'jpg'
  return new File([bytes], photo.name || `photo.${ext}`, { type: mimeType })
}
