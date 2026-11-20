/**
 * 大图查看器：全屏黑底 + 等比缩放 + 可关闭。
 *
 * 关闭方式给了三种，覆盖所有习惯：
 * 1. 右上角 × 按钮
 * 2. 点图片以外的黑色区域
 * 3. 系统返回键（用 history.pushState 把返回手势接过来）
 *
 * 为什么不用浏览器新窗口：WebView 里没有地址栏和返回键，用户会卡死在里面。
 */
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import { useImageViewer } from './imageViewerState.js'
import styles from './ImageViewer.module.css'

export const ImageViewer = () => {
  const t = useTranslate()
  const src = useImageViewer((state) => state.src)
  const name = useImageViewer((state) => state.name)
  const close = useImageViewer((state) => state.close)

  // 系统返回键：打开时压一条历史记录，用户按返回就回到这里并关闭
  useEffect(() => {
    if (!src) {
      return
    }
    window.history.pushState({ dsImage: true }, '')
    const onPop = () => close()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      }
    }
    window.addEventListener('popstate', onPop)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('popstate', onPop)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [src, close])

  if (!src) {
    return null
  }

  return createPortal(
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={name || t('imagePreview')}
      onClick={close}
    >
      {/* 单点任意位置（含图片本身）即关闭；不设叉号，也不做"点图不关" */}
      <img className={styles.image} src={src} alt={name} />
    </div>,
    document.body,
  )
}
