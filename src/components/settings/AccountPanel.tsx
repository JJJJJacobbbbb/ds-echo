/**
 * 设置里的「账户余额」区块。
 *
 * 触发时机（刻意不做轮询，余额不是实时行情）：
 * - 打开设置（挂载时）查一次
 * - 用户点「刷新」
 * - 从充值页返回 App（页面重新可见）时再查一次
 *
 * 不做的事：不显示"实时消费"、不跨币种相加、不在失败时把上一次的数字抹成 0。
 */
import { useEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { useSettings } from '../../services/settings.js'
import { useBalance } from '../../services/account/balance.js'
import { openOfficialPage } from '../../services/external.js'
import styles from './AccountPanel.module.css'

/** 币种符号；未知币种直接显示代码，不猜 */
const SYMBOLS: Record<string, string> = { CNY: '¥', USD: '$' }

const formatAmount = (currency: string, amount: string) => {
  const symbol = SYMBOLS[currency]
  // 金额是服务端给的字符串，原样拼接不做数值运算，避免浮点误差
  return symbol ? `${symbol}${amount}` : `${currency} ${amount}`
}

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const AccountPanel = () => {
  const t = useTranslate()
  const apiKey = useSettings((state) => state.apiKey)
  const status = useBalance((state) => state.status)
  const data = useBalance((state) => state.data)
  const condition = useBalance((state) => state.condition)
  const errorMessage = useBalance((state) => state.errorMessage)
  const updatedAt = useBalance((state) => state.updatedAt)
  const [opening, setOpening] = useState(false)

  // 打开设置面板时查询一次
  useEffect(() => {
    if (apiKey) {
      void useBalance.getState().refresh()
    }
  }, [apiKey])

  // 从充值页（系统浏览器）返回 App 后重新查询。
  // 用 visibilitychange 而不是 Capacitor 的 appRestore：后者在 Android 上
  // 只在 Activity 被回收后重建时触发，切浏览器再回来时页面并不会重建。
  useEffect(() => {
    if (!apiKey) {
      return
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void useBalance.getState().refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [apiKey])

  const topUp = async () => {
    if (opening) {
      return
    }
    setOpening(true)
    try {
      await openOfficialPage('topUp')
    } finally {
      setOpening(false)
    }
  }

  const errorText =
    condition === 'unauthorized'
      ? t('balanceErrorUnauthorized')
      : condition === 'network'
        ? t('balanceErrorNetwork')
        : t('balanceErrorOther', { message: errorMessage ?? '' })

  return (
    <div className={styles.cell}>
      <div className={styles.head}>
        <div className={styles.title}>{t('balanceTitle')}</div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.textButton}
            disabled={!apiKey || status === 'loading'}
            onClick={() => void useBalance.getState().refresh()}
          >
            {t('balanceRefresh')}
          </button>
          <button type="button" className={styles.topUp} disabled={opening} onClick={topUp}>
            {t('balanceTopUp')}
          </button>
        </div>
      </div>

      {!apiKey ? (
        <div className={styles.muted}>{t('accountNotConnected')}</div>
      ) : (
        <>
          {data && data.balance_infos.length > 0 ? (
            <div className={styles.list}>
              {data.balance_infos.map((info) => (
                <div key={info.currency} className={styles.row}>
                  <span className={styles.amount}>
                    {formatAmount(info.currency, info.total_balance)}
                  </span>
                  <span className={styles.detail}>
                    {t('balanceToppedUp', {
                      amount: formatAmount(info.currency, info.topped_up_balance),
                    })}
                    {' · '}
                    {t('balanceGranted', {
                      amount: formatAmount(info.currency, info.granted_balance),
                    })}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {data && !data.is_available ? (
            <div className={styles.warn}>{t('balanceUnavailable')}</div>
          ) : null}

          {status === 'loading' && !data ? (
            <div className={styles.muted}>{t('balanceLoading')}</div>
          ) : null}

          {status === 'error' ? <div className={styles.warn}>{errorText}</div> : null}

          <div className={styles.muted}>
            {updatedAt ? t('balanceUpdatedAt', { time: formatTime(updatedAt) }) : t('balanceNever')}
          </div>
        </>
      )}
    </div>
  )
}
