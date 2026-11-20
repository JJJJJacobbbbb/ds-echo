import { useLayoutEffect, useRef } from 'react'

type Intent = 'keyboard' | 'panel' | 'closed'

/** Visual position only. Never resize the page or reserve extra keyboard space. */
export const useComposerMotion = (mobile: boolean, open: boolean) => {
  const ref = useRef<HTMLDivElement>(null)
  const openRef = useRef(open)
  const startRef = useRef<(intent?: Intent) => void>(() => {})

  useLayoutEffect(() => {
    const root = ref.current
    if (!mobile || !root) {
      return
    }
    const input = root.firstElementChild as HTMLElement | null
    if (!input) {
      return
    }
    // The input area's bottom stays in place when a preview row is inserted
    // above the editor. The composer's bottom also includes the attachment tray.
    const readInputBottom = () => input.getBoundingClientRect().bottom
    const viewport = window.visualViewport
    const frameContainer = root.closest('main')?.parentElement
    const visibleBottom = () => {
      // Use the same viewport as the page layout, including IME opening stabilization.
      const height = Number.parseFloat(
        frameContainer?.style.getPropertyValue('--app-viewport-height') ?? ''
      )
      const top = Number.parseFloat(
        frameContainer?.style.getPropertyValue('--app-viewport-top') ?? ''
      )
      return Number.isFinite(height)
        ? (Number.isFinite(top) ? top : 0) + height
        : (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)
    }
    let fullBottom = visibleBottom()
    let width = window.innerWidth
    let screenHeight = window.screen.height
    let renderedBottom = readInputBottom()
    let offset = 0
    let intent: Intent = openRef.current ? 'panel' : 'closed'
    let fromBottom = renderedBottom
    let initialBottom = visibleBottom()
    let observedKeyboard = false
    let lastGeometry = 0
    let lastBottom = initialBottom
    let began = performance.now()
    let until = 0
    let lastFrame = 0
    let frame = 0
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

    const writeBottom = (nextBottom: number) => {
      const layoutBottom = readInputBottom() - offset
      renderedBottom = nextBottom
      const nextOffset = renderedBottom - layoutBottom
      offset = Math.abs(nextOffset) < 0.2 ? 0 : nextOffset
      root.style.transform = offset === 0 ? '' : `translate3d(0, ${offset}px, 0)`
      root.parentElement?.style.setProperty('--composer-offset-y', `${offset}px`)
    }

    const tick = (now: number) => {
      frame = 0
      const bottom = visibleBottom()
      if (width !== window.innerWidth || screenHeight !== window.screen.height) {
        width = window.innerWidth
        screenHeight = window.screen.height
        fullBottom = bottom
      }
      fullBottom = Math.max(fullBottom, bottom)
      if (Math.abs(bottom - lastBottom) > 0.1) {
        lastGeometry = now
        lastBottom = bottom
        if (bottom < initialBottom - 1) {
          observedKeyboard = true
        }
      }
      const panel = root.querySelector<HTMLElement>('[data-attach-panel]')
      const parent = root.parentElement
      const gap = parent ? Number.parseFloat(getComputedStyle(parent).paddingBottom) || 0 : 0
      const keyboardBottom = bottom - gap
      const panelHeight = panel
        ? panel.offsetHeight + Number.parseFloat(getComputedStyle(panel).marginTop)
        : 0
      let targetBottom = keyboardBottom
      if (intent === 'panel' && openRef.current) {
        targetBottom = Math.min(fullBottom - gap - panelHeight, keyboardBottom)
      } else if (intent === 'keyboard') {
        // Ignore the transient bottom position while the tray closes and the
        // keyboard has not arrived. A shorter keyboard may settle below the
        // input area's starting bottom edge.
        const settled = observedKeyboard && now - lastGeometry > 140
        if (!settled && now - began < 1000) {
          targetBottom = Math.min(fromBottom, targetBottom)
        }
      }
      const elapsed = Math.min(50, Math.max(1, now - lastFrame))
      lastFrame = now
      let nextBottom = reduced.matches
        ? targetBottom
        : renderedBottom + (targetBottom - renderedBottom) * (1 - Math.exp(-elapsed / 42))
      // Stay above the actual keyboard while it moves, without a second lift.
      nextBottom = Math.min(nextBottom, keyboardBottom)
      if (Math.abs(nextBottom - targetBottom) < 0.2) {
        nextBottom = targetBottom
      }
      writeBottom(nextBottom)
      if (now < until || Math.abs(renderedBottom - targetBottom) > 0.2) {
        frame = requestAnimationFrame(tick)
      } else {
        root.style.removeProperty('will-change')
      }
    }
    const start = (next?: Intent) => {
      const now = performance.now()
      if (next) {
        // Called before focus/blur and React layout changes, so this is the
        // bottom edge currently on screen, including an interrupted animation.
        renderedBottom = readInputBottom()
        fromBottom = renderedBottom
        intent = next
        began = now
        initialBottom = visibleBottom()
        observedKeyboard = false
        lastGeometry = now
      }
      until = Math.max(until, now + (next === 'keyboard' ? 1250 : 450))
      if (!frame) {
        lastFrame = now
        root.style.willChange = 'transform'
        frame = requestAnimationFrame(tick)
      }
    }
    startRef.current = start
    const onViewport = () => start()
    const onFocusOut = () => start()
    const compensate = () => {
      // The existing viewport reset can relayout the parent after our frame
      // callback. Compensate before paint, without displaying that interim Y.
      const parent = root.parentElement
      const gap = parent ? Number.parseFloat(getComputedStyle(parent).paddingBottom) || 0 : 0
      writeBottom(Math.min(renderedBottom, visibleBottom() - gap))
      start()
    }
    const observer = new ResizeObserver(compensate)
    const frameObserver = new MutationObserver(compensate)
    if (frameContainer) {
      frameObserver.observe(frameContainer, { attributes: true, attributeFilter: ['style'] })
    }
    observer.observe(root)
    if (root.firstElementChild) {
      observer.observe(root.firstElementChild)
    }
    if (root.parentElement) {
      observer.observe(root.parentElement)
    }
    if (root.parentElement?.parentElement) {
      observer.observe(root.parentElement.parentElement)
    }
    viewport?.addEventListener('resize', onViewport)
    viewport?.addEventListener('scroll', onViewport)
    window.addEventListener('resize', onViewport)
    root.addEventListener('focusout', onFocusOut)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      frameObserver.disconnect()
      viewport?.removeEventListener('resize', onViewport)
      viewport?.removeEventListener('scroll', onViewport)
      window.removeEventListener('resize', onViewport)
      root.removeEventListener('focusout', onFocusOut)
      root.style.removeProperty('transform')
      root.style.removeProperty('will-change')
      root.parentElement?.style.removeProperty('--composer-offset-y')
      startRef.current = () => {}
    }
  }, [mobile])

  useLayoutEffect(() => {
    openRef.current = open
    startRef.current()
  }, [open])

  return { ref, begin: (intent: Intent) => startRef.current(intent) }
}
