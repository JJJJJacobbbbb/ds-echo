import { useEffect, type RefObject } from 'react'

const scopes: HTMLElement[] = []
const focusable =
  'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), [tabindex="0"]'

/** Only the top overlay owns keyboard focus; restore its trigger after the exit. */
export const useFocusScope = (ref: RefObject<HTMLElement>) => {
  useEffect(() => {
    const surface = ref.current
    if (!surface) {
      return
    }
    const previous = document.activeElement
    scopes.push(surface)
    surface.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || scopes.at(-1) !== surface) {
        return
      }
      const elements = Array.from(surface.querySelectorAll<HTMLElement>(focusable)).filter(
        (element) => element.getClientRects().length > 0 && !element.closest('[inert]')
      )
      const first = elements[0]
      const last = elements.at(-1)
      if (!first || !last) {
        event.preventDefault()
        return
      }
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === surface || !surface.contains(active))) {
        event.preventDefault()
        last.focus({ preventScroll: true })
      } else if (
        !event.shiftKey &&
        (active === last || active === surface || !surface.contains(active))
      ) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      const wasTop = scopes.at(-1) === surface
      scopes.splice(scopes.indexOf(surface), 1)
      document.removeEventListener('keydown', onKey)
      if (
        wasTop &&
        previous instanceof HTMLElement &&
        previous.isConnected &&
        !previous.closest('[inert]')
      ) {
        previous.focus({ preventScroll: true })
      }
    }
  }, [ref])
}
