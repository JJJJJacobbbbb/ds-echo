/**
 * 大图查看器的全局状态。
 *
 * 为什么要全局：消息里的图片、输入框里的草稿附件都需要"点开看大图"，
 * 但它们是两棵互不相干的组件树。用一个全局 store 让任何地方都能调用
 * `openImage(src)`，查看器本身只在 App 根部渲染一次。
 *
 * 不用 `<a target="_blank">` 的原因：Capacitor 的 WebView 里新窗口没有地址栏、
 * 没有返回按钮，点开原图后用户无法退出——这正是之前的 bug。
 */
import { create } from 'zustand'

type ImageViewerState = {
  src: string | null
  name: string
  open: (src: string, name?: string) => void
  close: () => void
}

export const useImageViewer = create<ImageViewerState>((set) => ({
  src: null,
  name: '',
  open: (src, name = '') => set({ src, name }),
  close: () => set({ src: null, name: '' }),
}))

/** 便捷调用：任何组件里 openImage(url) 即可 */
export const openImage = (src: string, name?: string) => useImageViewer.getState().open(src, name)
