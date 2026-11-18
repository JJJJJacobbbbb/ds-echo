import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import wechatQr from '../../assets/donate/wechat.png'
import alipayQr from '../../assets/donate/alipay.png'
import styles from './DonateDialog.module.css'

/**
 * 打赏弹窗：金额快捷项 + 收款码。
 *
 * 为什么不是"点一下直接付"：个人微信/支付宝没有收款 API，能自动扣款的只有
 * 有企业/个体工商户资质的商户号。个人开发者只能让用户扫码，App 负责把
 * 「多少钱」提示清楚——所以点金额只是选中并提示，真正的支付在用户自己的扫码里完成。
 *
 * 收款码图片在 `src/assets/donate/`，替换同名文件即可（不要把二维码写死在代码里）。
 */

const AMOUNTS = [
  { value: '1.88', label: 'donateAmountCheap' },
  { value: '3.88', label: 'donateAmountSmall' },
  { value: '6.66', label: 'donateAmountCoffee' },
  { value: '8.88', label: 'donateAmountHappy' },
  { value: '12.90', label: 'donateAmountBig' },
  { value: '66.66', label: 'donateAmountHuge' },
] as const

type Channel = 'wechat' | 'alipay'

export const DonateDialog = ({ onClose }: { onClose: () => void }) => {
  const t = useTranslate()
  const [channel, setChannel] = useState<Channel>('wechat')
  const [amount, setAmount] = useState<string | null>(null)

  const qr = channel === 'wechat' ? wechatQr : alipayQr

  return (
    <Modal
      title={t('donateTitle')}
      closable
      onClose={onClose}
      className={styles.dialog}
      footer={
        <Button variant="outlined" size="m" onClick={onClose}>
          {t('close')}
        </Button>
      }
    >
      <p className={styles.hint}>{t('donateHint')}</p>

      <div className={styles.channels} role="tablist" aria-label={t('donateChannelLabel')}>
        <button
          type="button"
          role="tab"
          aria-selected={channel === 'wechat'}
          className={channel === 'wechat' ? styles.channelActive : styles.channel}
          onClick={() => setChannel('wechat')}
        >
          {t('donateWechat')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={channel === 'alipay'}
          className={channel === 'alipay' ? styles.channelActive : styles.channel}
          onClick={() => setChannel('alipay')}
        >
          {t('donateAlipay')}
        </button>
      </div>

      <div className={styles.amounts}>
        {AMOUNTS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={amount === item.value ? styles.amountActive : styles.amount}
            aria-pressed={amount === item.value}
            onClick={() => setAmount(item.value)}
          >
            <span className={styles.amountLabel}>{t(item.label)}</span>
            <span className={styles.amountValue}>¥{item.value}</span>
          </button>
        ))}
      </div>

      <div className={styles.qrWrap}>
        {/* 图片替换方式见 src/assets/donate/README.md */}
        <img className={styles.qr} src={qr} alt={channel === 'wechat' ? t('donateWechat') : t('donateAlipay')} />
        <div className={styles.qrTip}>
          {amount ? t('donatePayHint', { amount }) : t('donateScanHint')}
        </div>
      </div>

      <p className={styles.footnote}>{t('donateFootnote')}</p>
    </Modal>
  )
}
