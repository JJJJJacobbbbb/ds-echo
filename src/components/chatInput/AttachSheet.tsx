/**
 * 附件面板：最近照片 + 拍照 / 相册 / 文件。
 *
 * 按用户逐条反馈定稿的行为：
 * - **不加底框**：直接悬浮在背景上，没有卡片底色/边框/阴影
 * - **顺序**：照片在上、三个入口在下；面板在输入框下方（输入框被顶起）
 * - **权限**：打开面板不申请权限；没权限就不显示照片区。
 *   只有点「相册」时才申请（相册本身需要它）。
 * - **照片选了就加**：没有「添加 N 张」按钮，点一张立刻进输入框，面板不关；
 *   再点一次取消。缩略图右上角始终有一个可点的叉号，取消选中与点叉号是同一个动作。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { IconCameraOutline20, IconFileOutline20, IconImageOutline20 } from '../base/icons.js'
import {
  hasPhotoAccess,
  photoLibraryAvailable,
  recentPhotos,
  type RecentPhoto,
} from '../../services/photoLibrary.js'
import styles from './AttachSheet.module.css'

type Props = {
  open: boolean
  showCamera: boolean
  onClose: () => void
  onCamera: () => void
  onAlbum: () => void
  onFile: () => void
  /** 已选中的照片 id（状态由 ChatInput 持有，输入框删照片时也要同步取消勾选） */
  selectedIds: string[]
  /** 选中照片：立刻加入输入框（面板不关） */
  onSelectPhoto: (photo: RecentPhoto) => void
  /** 取消选中：从输入框移除 */
  onUnselectPhoto: (photo: RecentPhoto) => void
}

export const AttachSheet = ({
  open,
  showCamera,
  onClose,
  onCamera,
  onAlbum,
  onFile,
  selectedIds,
  onSelectPhoto,
  onUnselectPhoto,
}: Props) => {
  const t = useTranslate()
  const panelRef = useRef<HTMLDivElement>(null)
  const [photos, setPhotos] = useState<RecentPhoto[]>([])

  useLayoutEffect(() => {
    if (!open || !panelRef.current) {
      document.documentElement.style.removeProperty('--attach-sheet-height')
      return
    }
    const node = panelRef.current
    const publish = () => {
      document.documentElement.style.setProperty('--attach-sheet-height', `${node.offsetHeight}px`)
    }
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(node)
    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty('--attach-sheet-height')
    }
  }, [open])

  // 打开面板只读「有没有权限」，不主动申请；没权限就整块不显示
  useEffect(() => {
    if (!open) {
      return
    }
    let alive = true
    if (!photoLibraryAvailable()) {
      setPhotos([])
      return
    }
    void (async () => {
      try {
        if (!(await hasPhotoAccess())) {
          if (alive) {
            setPhotos([])
          }
          return
        }
        const list = await recentPhotos()
        if (alive) {
          setPhotos(list)
        }
      } catch {
        if (alive) {
          setPhotos([])
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [open])

  if (!open) {
    return null
  }

  const pick = (action: () => void) => () => {
    onClose()
    action()
  }

  const isSelected = (id: string) => selectedIds.includes(id)

  const select = (photo: RecentPhoto) => {
    onSelectPhoto(photo)
  }

  const unselect = (photo: RecentPhoto) => {
    onUnselectPhoto(photo)
  }

  return (
    <div
      ref={panelRef}
      className={styles.panel}
      role="dialog"
      data-attach-panel
      aria-label={t('attachSheetTitle')}
    >
      {photos.length > 0 ? (
        <div className={styles.recent}>
          <div className={styles.thumbnails}>
            {photos.map((photo) => {
              const chosen = isSelected(photo.id)
              return (
                <div key={photo.id} className={styles.thumbnailCell}>
                  <button
                    type="button"
                    className={styles.thumbnail}
                    aria-label={t('attachSheetRecentPhoto')}
                    aria-pressed={chosen}
                    onClick={() => (chosen ? unselect(photo) : select(photo))}
                  >
                    <img src={`data:image/jpeg;base64,${photo.thumbnail}`} alt="" />
                  </button>
                  {/* 选中标记：未选中是空心圆环，选中后变白色实心圆 + 黑色对号 */}
                  <span className={chosen ? `${styles.check} ${styles.checked}` : styles.check} aria-hidden>
                    {chosen ? (
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M3 7.2 5.8 10 11 4.4"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className={styles.options}>
        {showCamera ? (
          <button type="button" className={styles.option} onClick={pick(onCamera)}>
            <span className={styles.icon}>
              <IconCameraOutline20 />
            </span>
            <span className={styles.label}>{t('attachSheetCamera')}</span>
          </button>
        ) : null}
        <button type="button" className={styles.option} onClick={pick(onAlbum)}>
          <span className={styles.icon}>
            <IconImageOutline20 />
          </span>
          <span className={styles.label}>{t('attachSheetAlbum')}</span>
        </button>
        <button type="button" className={styles.option} onClick={pick(onFile)}>
          <span className={styles.icon}>
            <IconFileOutline20 />
          </span>
          <span className={styles.label}>{t('attachSheetFile')}</span>
        </button>
      </div>
    </div>
  )
}
