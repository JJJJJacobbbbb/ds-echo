/**
 * 首次使用的极简连接向导。
 *
 * 目标读者是完全不懂 API 的人，所以这一页只允许出现三件事：
 * 去官方建 Key、粘贴 Key、连接。Base URL、模型名、余额阈值这类参数一律不出现。
 *
 * 与设置弹窗的关系：设置里的 API Key 字段仍然保留（老用户改 Key 用），
 * 但首次进入不再直接甩一个「设置」对话框给用户——那正是之前体验最差的一环。
 */
import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { openOfficialPage } from '../../services/external.js'
import { useBalance } from '../../services/account/balance.js'
import { useApiKeyForm } from '../settings/useApiKeyForm.js'
import styles from './SetupGuide.module.css'

export const SetupGuide = () => {
  const t = useTranslate()
  const [opening, setOpening] = useState(false)
  // 校验通过并保存后立刻查一次余额：用户能马上确认「连上了、还剩多少钱」
  const form = useApiKeyForm(() => {
    void useBalance.getState().refresh()
  })

  const openKeyPage = async () => {
    if (opening) {
      return
    }
    setOpening(true)
    try {
      await openOfficialPage('apiKeys')
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className={styles.guide}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('setupTitle')}</h1>
        <p className={styles.subtitle}>{t('setupSubtitle')}</p>

        <section className={styles.step}>
          <div className={styles.stepHead}>
            <span className={styles.stepIndex}>1</span>
            <h2 className={styles.stepTitle}>{t('setupStep1Title')}</h2>
          </div>
          <p className={styles.stepBody}>{t('setupStep1Body')}</p>
          <button type="button" className={styles.outlined} disabled={opening} onClick={openKeyPage}>
            {t('setupCreateKey')}
          </button>
        </section>

        <section className={styles.step}>
          <div className={styles.stepHead}>
            <span className={styles.stepIndex}>2</span>
            <h2 className={styles.stepTitle}>{t('setupStep2Title')}</h2>
          </div>
          <p className={styles.stepBody}>{t('setupStep2Body')}</p>
          <input
            type="password"
            className={styles.input}
            placeholder={t('apiKeyPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            value={form.value}
            onChange={(event) => form.setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                void form.submit()
              }
            }}
          />
        </section>

        <section className={styles.step}>
          <div className={styles.stepHead}>
            <span className={styles.stepIndex}>3</span>
            <h2 className={styles.stepTitle}>{t('setupStep3Title')}</h2>
          </div>
          <p className={styles.stepBody}>{t('setupStep3Body')}</p>
          <button
            type="button"
            className={styles.primary}
            disabled={form.verifying || !form.value.trim()}
            onClick={() => void form.submit()}
          >
            {form.verifying ? t('setupConnecting') : t('setupConnect')}
          </button>
          {form.error ? (
            <p className={styles.error} role="alert">
              {form.error}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  )
}
