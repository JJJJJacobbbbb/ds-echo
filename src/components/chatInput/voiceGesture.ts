type Callbacks = {
  start: () => void
  finish: () => void
  cancel: () => void
  tap: () => void
  change: (cancelling: boolean) => void
}

/** One pointer owns a gesture. A short tap never acquires the microphone. */
export const createVoiceGesture = (callbacks: Callbacks) => {
  let pointer: number | null = null
  let origin = 0
  let held = false
  let cancelling = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const reset = () => {
    clearTimeout(timer)
    pointer = null
    held = false
    cancelling = false
    callbacks.change(false)
  }
  return {
    down(id: number, y: number) {
      if (pointer !== null) {
        return
      }
      pointer = id
      origin = y
      timer = setTimeout(() => {
        held = true
        callbacks.start()
      }, 260)
    },
    move(id: number, y: number) {
      if (pointer !== id) {
        return
      }
      cancelling = origin - y >= 64
      callbacks.change(cancelling)
    },
    up(id: number) {
      if (pointer !== id) {
        return
      }
      const wasHeld = held
      const wasCancelling = cancelling
      reset()
      if (wasHeld) {
        if (wasCancelling) {
          callbacks.cancel()
        } else {
          callbacks.finish()
        }
      } else if (!wasCancelling) {
        callbacks.tap()
      }
    },
    abort() {
      const wasHeld = held
      reset()
      if (wasHeld) {
        callbacks.cancel()
      }
    },
  }
}
