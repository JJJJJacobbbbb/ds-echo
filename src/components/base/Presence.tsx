import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type MotionState = 'open' | 'closed'
const MotionContext = createContext<MotionState>('open')
export const useMotionState = () => useContext(MotionContext)

/** Keep departing UI alive for the shared CSS exit duration. Reopening cancels disposal. */
export const usePresence = (present: boolean) => {
  const [mounted, setMounted] = useState(present)
  if (present && !mounted) {
    setMounted(true)
  }

  useEffect(() => {
    if (present || !mounted) {
      return
    }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const finish = () => setMounted(false)
    if (media.matches) {
      finish()
      return
    }
    // The CSS optimizer may rewrite 220ms to .22s. Both units must keep the
    // same lifetime, otherwise the surface vanishes before its exit starts.
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue('--motion-exit')
      .trim()
    const milliseconds = Number.parseFloat(value) * (value.endsWith('ms') ? 1 : 1000)
    const duration = Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 220
    const timer = window.setTimeout(finish, duration)
    const onPreference = () => {
      if (media.matches) {
        finish()
      }
    }
    media.addEventListener('change', onPreference)
    return () => {
      window.clearTimeout(timer)
      media.removeEventListener('change', onPreference)
    }
  }, [present, mounted])

  return { mounted, state: (present ? 'open' : 'closed') as MotionState }
}

/** Retain the last visible content, including confirmation text, throughout its exit. */
export const Presence = ({ present, children }: { present: boolean; children: ReactNode }) => {
  const { mounted, state } = usePresence(present)
  const previous = useRef(children)
  useLayoutEffect(() => {
    if (present) {
      previous.current = children
    }
  }, [present, children])
  return mounted ? (
    <MotionContext.Provider value={state}>
      {present ? children : previous.current}
    </MotionContext.Provider>
  ) : null
}
