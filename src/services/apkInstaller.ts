/**
 * 应用内更新：下载 APK 并拉起系统安装器。
 *
 * 为什么不直接用链接跳浏览器：那样要经过"打开 GitHub 页面 → 找到 APK → 点下载 →
 * 回到通知栏 → 点安装"五六步；这里在 App 内下载 + 校验 + 直接拉起安装器。
 *
 * 边界（必须让用户知道）：Android 侧载安装**一定会弹系统安装器**，
 * 真正的零点击静默安装只有设备所有者/root 能做到。想完全静默只能更新网页层（OTA）。
 */
import { Capacitor, registerPlugin } from '@capacitor/core'

type InstallOptions = {
  /** 按顺序尝试：镜像在前，GitHub 直链在后 */
  urls: string[]
  /** 下载后必须一致的 sha256；镜像站是第三方，不能无条件信任 */
  sha256: string
}

type ApkInstallerPlugin = {
  install(options: InstallOptions): Promise<{ installed: boolean }>
}

const ApkInstaller = registerPlugin<ApkInstallerPlugin>('ApkInstaller')

export type InstallResult =
  | { status: 'started' }
  | { status: 'unsupported'; reason: string }
  | { status: 'failed'; reason: string }

/** 是否具备应用内安装能力（只有 Android 原生有） */
export const canInstallInApp = (): boolean => Capacitor.getPlatform() === 'android'

/**
 * 下载并安装。返回 started 表示已拉起系统安装器，
 * 用户随后在系统弹窗里点「安装」——这一步无法绕过。
 */
export const installApk = async (
  urls: string[],
  sha256: string
): Promise<InstallResult> => {
  const candidates = urls.filter(Boolean)
  if (candidates.length === 0 || !sha256) {
    return { status: 'unsupported', reason: '缺少下载地址或校验值' }
  }
  if (!canInstallInApp()) {
    return { status: 'unsupported', reason: '当前平台不支持应用内安装' }
  }
  try {
    await ApkInstaller.install({ urls: candidates, sha256 })
    return { status: 'started' }
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}
