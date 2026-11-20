import clsx from 'clsx'
import type { ButtonHTMLAttributes } from 'react'
import { useTranslate } from '../../i18n/index.js'
import styles from './VoiceButton.module.css'

export const VoiceButton = ({
  keyboard,
  disabled,
  busy,
  handlers,
}: {
  keyboard: boolean
  disabled: boolean
  busy: boolean
  handlers: ButtonHTMLAttributes<HTMLButtonElement>
}) => {
  const t = useTranslate()
  return (
    <button
      type="button"
      className={clsx(styles.button, disabled && styles.disabled)}
      aria-label={t(keyboard ? 'voiceInputKeyboard' : 'voiceInput')}
      aria-disabled={disabled}
      {...handlers}
    >
      {busy ? (
        <span className={styles.loading} />
      ) : (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <circle cx="14" cy="14" r="11.25" stroke="currentColor" strokeWidth="1.7" />
          {keyboard ? (
            <>
              {[8, 12.5, 17].flatMap((x) =>
                [8.5, 13].map((y) => (
                  <rect
                    key={`${x}-${y}`}
                    x={x}
                    y={y}
                    width="2.8"
                    height="2.8"
                    rx="0.25"
                    fill="currentColor"
                  />
                ))
              )}
              <path d="M8 19h12" stroke="currentColor" strokeWidth="2" />
            </>
          ) : (
            <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M9.5 11.5v5m4.5-8v11m4.5-8v5" />
            </g>
          )}
        </svg>
      )}
    </button>
  )
}
