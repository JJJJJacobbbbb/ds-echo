import clsx from 'clsx'
import { useTranslate } from '../../i18n/index.js'
import { IconToastError16 } from './icons.js'
import { useToast } from './toastState.js'
import styles from './Toast.module.css'
import { Presence, useMotionState } from './Presence.js'
import type { LinkedMessage } from '../../i18n/index.js'

export const Toast = () => {
  const { id, message } = useToast()
  return (
    <Presence present={!!message}>
      {message ? <ToastContent key={id} message={message} /> : null}
    </Presence>
  )
}

const ToastContent = ({ message }: { message: LinkedMessage | string }) => {
  const t = useTranslate()
  const state = useMotionState()
  if (typeof message === 'string') {
    return (
      <div className={styles.toast} role="status" data-state={state}>
        {message}
      </div>
    )
  }
  const error = message.type === 'error'
  return (
    <div className={clsx(styles.toast, error && styles.error)} role="status" data-state={state}>
      {error ? (
        <span className={styles.icon}>
          <IconToastError16 />
        </span>
      ) : null}
      <span className={styles.content}>
        {t(message.key, message.params)}
        {message.link ? (
          <a className={styles.link} href={message.link.href} target="_blank" rel="noreferrer">
            {t(message.link.key)}
          </a>
        ) : null}
      </span>
    </div>
  )
}
