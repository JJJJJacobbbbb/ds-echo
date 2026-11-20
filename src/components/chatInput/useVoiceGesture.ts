import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react'
import { createVoiceGesture } from './voiceGesture.js'

export const useVoiceGesture = (options: {
  disabled: boolean
  start: () => void
  finish: () => void
  cancel: () => void
  tap: () => void
}) => {
  const latest = useRef(options)
  latest.current = options
  const [cancelling, setCancelling] = useState(false)
  const [gesture] = useState(() =>
    createVoiceGesture({
      start: () => latest.current.start(),
      finish: () => latest.current.finish(),
      cancel: () => latest.current.cancel(),
      tap: () => latest.current.tap(),
      change: setCancelling,
    })
  )
  useEffect(() => {
    const abort = () => {
      gesture.abort()
      latest.current.cancel()
    }
    const visibility = () => {
      if (document.hidden) {
        abort()
      }
    }
    window.addEventListener('blur', abort)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      gesture.abort()
      window.removeEventListener('blur', abort)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [gesture])
  const handlers = {
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (latest.current.disabled || event.button !== 0 || !event.isPrimary) {
        return
      }
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      gesture.down(event.pointerId, event.clientY)
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      gesture.move(event.pointerId, event.clientY)
    },
    onPointerUp(event: PointerEvent<HTMLButtonElement>) {
      gesture.up(event.pointerId)
    },
    onPointerCancel() {
      gesture.abort()
    },
    onLostPointerCapture() {
      gesture.abort()
    },
    onContextMenu(event: React.MouseEvent) {
      event.preventDefault()
    },
    onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      if (event.key === 'Escape') {
        gesture.abort()
        latest.current.cancel()
      }
    },
    onClick(event: React.MouseEvent) {
      // Pointer clicks are handled above; keyboard / assistive activation is a tap.
      if (event.detail === 0 && !latest.current.disabled) {
        latest.current.tap()
      }
    },
  }
  return { handlers, cancelling }
}
