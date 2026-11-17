import clsx from 'clsx'
import { useState } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import type { Session } from '../../services/chat/types.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { MessageList } from '../messages/MessageList.js'
import { IconThinkOutline16 } from '../base/icons.js'
import { saveSessionMemory } from '../../services/chat/store.js'
import { MemoryDialog } from './MemoryDialog.js'
import { MobileHeader } from './MobileHeader.js'
import styles from './SessionView.module.css'

/** 会话页：标题栏（移动端为顶栏）+ 消息列表，输入框吸底 */
export const SessionView = ({
  session,
  streaming,
  siderCollapsed,
}: {
  session: Session
  streaming: boolean
  siderCollapsed: boolean
}) => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const [memoryOpen, setMemoryOpen] = useState(false)
  const title = session.title || t('untitledChat')
  const hasMemory = !!session.memory?.trim()
  const memoryButton = (
    <button
      type="button"
      className={clsx(styles.memoryButton, hasMemory && styles.memoryButtonActive)}
      onClick={() => setMemoryOpen(true)}
      title={t('memoryTitle')}
    >
      <IconThinkOutline16 />
      <span>{t('memoryButton')}</span>
    </button>
  )
  return (
    <div className={styles.view}>
      {isMobile ? (
        <MobileHeader title={title} action={memoryButton} />
      ) : (
        <div className={styles.header}>
          <div className={clsx(styles.title, siderCollapsed && styles.withCollapsedSider)}>
            {title}
          </div>
          {memoryButton}
        </div>
      )}
      {memoryOpen ? (
        <MemoryDialog
          memory={session.memory}
          updatedAt={session.memoryUpdatedAt}
          onSave={(memory) => saveSessionMemory(session.id, memory)}
          onClose={() => setMemoryOpen(false)}
        />
      ) : null}
      <MessageList
        session={session}
        streaming={streaming}
        footer={
          <div className={styles.inputContainer}>
            <ChatInput sessionId={session.id} />
            <div className={styles.caveat}>{t('contentCaveat')}</div>
          </div>
        }
      />
    </div>
  )
}
