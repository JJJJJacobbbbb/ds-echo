import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import { useChatStore } from '../../services/chat/store.js'
import { dismissImportGuide, useSettings } from '../../services/settings.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { MobileHeader } from './MobileHeader.js'
import styles from './Welcome.module.css'

/** 新对话：问候语 + 输入框。桌面端居中；移动端输入框吸底 */
export const Welcome = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  // 还没有任何会话时，说明用户刚连上 Key——这是提示「导入旧聊天记录」的最佳时机
  const hasSessions = useChatStore((state) => state.sessions.length > 0)
  const guideDismissed = useSettings((state) => state.importGuideDismissed)
  return (
    <div className={styles.container}>
      {isMobile ? <MobileHeader /> : null}
      <div className={styles.welcome}>
        <div className={styles.greeting}>{t('welcomeMessageChat250808')}</div>
        {hasSessions || guideDismissed ? null : (
          <section className={styles.importGuide}>
            <h2 className={styles.importTitle}>{t('importGuideTitle')}</h2>
            <p className={styles.importBody}>{t('importGuideBody')}</p>
            <div className={styles.importActions}>
              <button
                type="button"
                className={styles.importAction}
                onClick={() => openSettings('data')}
              >
                {t('importGuideAction')}
              </button>
              <button
                type="button"
                className={styles.importDismiss}
                onClick={dismissImportGuide}
              >
                {t('importGuideDismiss')}
              </button>
            </div>
          </section>
        )}
        <ChatInput sessionId={null} />
        {isMobile ? <div className={styles.caveat}>{t('contentCaveat')}</div> : null}
      </div>
    </div>
  )
}
