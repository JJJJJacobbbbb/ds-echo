import { useEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { memoryTokens } from '../../services/chat/memory.js'
import styles from './MemoryDialog.module.css'

/**
 * 会话「长期记忆」编辑器。
 *
 * 为什么让用户能改：上下文超出窗口时会自动把早期轮次压成要点写进这里，
 * 但摘要可能漏掉或改动关键设定（角色扮演尤其敏感），所以必须可见、可改、可清空。
 */
export const MemoryDialog = ({
  memory,
  updatedAt,
  onSave,
  onClose,
}: {
  memory: string | undefined
  updatedAt?: number
  onSave: (memory: string | null) => void
  onClose: () => void
}) => {
  const t = useTranslate()
  const [draft, setDraft] = useState(memory ?? '')

  useEffect(() => {
    setDraft(memory ?? '')
  }, [memory])

  const tokens = memoryTokens(draft)

  return (
    <Modal
      title={t('memoryTitle')}
      closable
      onClose={onClose}
      className={styles.dialog}
      footer={
        <>
          <Button variant="outlined" size="m" onClick={() => setDraft('')}>
            {t('memoryClearDraft')}
          </Button>
          <div className={styles.spacer} />
          <Button
            variant="outlined"
            size="m"
            onClick={() => {
              onSave(draft)
              onClose()
            }}
          >
            {t('memorySave')}
          </Button>
        </>
      }
    >
      <p className={styles.hint}>{t('memoryHint')}</p>
      <textarea
        className={styles.editor}
        value={draft}
        spellCheck={false}
        placeholder={t('memoryPlaceholder')}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className={styles.meta}>
        <span>{t('memoryTokenCount', { tokens: tokens.toLocaleString() })}</span>
        {updatedAt ? (
          <span>{t('memoryUpdatedAt', { time: new Date(updatedAt).toLocaleString() })}</span>
        ) : null}
      </div>
    </Modal>
  )
}
