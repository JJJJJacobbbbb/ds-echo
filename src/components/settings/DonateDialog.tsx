import { useTranslate } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { listDonations } from '../../services/donations.js'
import qr from '../../assets/donate/qrcode.png'
import styles from './DonateDialog.module.css'

/**
 * 打赏弹窗：只放收款码 + 捐赠名单。
 *
 * 为什么没有金额按钮：金额是用户扫码后在**收款方页面**上选的（微信/支付宝的赞赏页），
 * App 里放一排在本地点了也不会跳转，属于假按钮，所以不做。
 *
 * 名单数据在 `src/data/donations.json`，由作者手填——本 App 没有后端，
 * 不可能自动知道谁打赏了。不填就是空列表。
 */
export const DonateDialog = ({ onClose }: { onClose: () => void }) => {
  const t = useTranslate()
  const donations = listDonations()

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

      <div className={styles.qrWrap}>
        <img className={styles.qr} src={qr} alt={t('donateQrAlt')} />
        <div className={styles.qrTip}>{t('donateScanHint')}</div>
      </div>

      <div className={styles.listSection}>
        <div className={styles.listTitle}>{t('donateListTitle')}</div>
        {donations.length === 0 ? (
          <div className={styles.listEmpty}>{t('donateListEmpty')}</div>
        ) : (
          <ul className={styles.list}>
            {donations.map((item) => (
              <li key={`${item.name}-${item.amount}-${item.date ?? ''}`} className={styles.item}>
                <span className={styles.itemName}>{item.name || t('donateAnonymous')}</span>
                {item.message ? <span className={styles.itemMessage}>{item.message}</span> : null}
                <span className={styles.itemAmount}>¥{item.amount.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.listNote}>{t('donateListNote')}</div>
      </div>

      <p className={styles.footnote}>{t('donateFootnote')}</p>
    </Modal>
  )
}
