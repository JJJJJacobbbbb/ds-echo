/**
 * 调起系统相机拍照，并把结果变成普通的 File。
 *
 * 为什么不用 `<input type="file" capture>`：WebView 对该属性支持很不一致，
 * 实测 vivo 上直接忽略、仍然弹相册。原生 Camera 插件走的是标准的
 * ACTION_IMAGE_CAPTURE，各家 ROM 都能正确调起相机。
 *
 * 权限：必须**显式申请**再取图。只声明 AndroidManifest 里的权限不够——
 * 系统不会自动弹窗，`getPhoto` 会直接抛"用户拒绝"，表现就是"给了权限还是提示没权限"。
 */
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'

/** 拍照是否可用（仅原生平台） */
export const canTakePhoto = (): boolean => Capacitor.isNativePlatform()

export type TakePhotoResult =
  | { status: 'ok'; file: File }
  /** 用户取消，不该报错 */
  | { status: 'cancelled' }
  /** 权限被拒 */
  | { status: 'denied' }
  | { status: 'error'; message: string }

const isCancelMessage = (message: string): boolean => /cancel|取消/i.test(message)

/**
 * 打开相机并返回文件。
 * 返回具体状态而不是简单抛错：界面要区分「用户取消」（什么都不做）和
 * 「被拒权」（引导去设置）以及「真失败」（提示重试）。
 */
export const takePhoto = async (): Promise<TakePhotoResult> => {
  if (!Capacitor.isNativePlatform()) {
    return { status: 'error', message: 'not-native' }
  }

  try {
    const permission = await Camera.requestPermissions({ permissions: ['camera'] })
    if (permission.camera === 'denied') {
      return { status: 'denied' }
    }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }

  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Base64,
      quality: 85,
      // 长边压到 1600：原图动辄 10MB，上传慢且没必要
      width: 1600,
      correctOrientation: true,
    })
    if (!photo.base64String) {
      return { status: 'cancelled' }
    }
    const binary = atob(photo.base64String)
    const buffer = new ArrayBuffer(binary.length)
    const bytes = new Uint8Array(buffer)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    const ext = photo.format || 'jpeg'
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
    return {
      status: 'ok',
      file: new File([bytes], `photo-${stamp}.${ext}`, { type: `image/${ext}` }),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isCancelMessage(message)) {
      return { status: 'cancelled' }
    }
    return { status: 'error', message }
  }
}
