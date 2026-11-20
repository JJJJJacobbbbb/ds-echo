import { afterEach, describe, expect, it, vi } from 'vitest'
import { createVoiceGesture } from '../src/components/chatInput/voiceGesture.js'

afterEach(() => vi.useRealTimers())
const setup = () => {
  vi.useFakeTimers()
  const callbacks = {
    start: vi.fn(),
    finish: vi.fn(),
    cancel: vi.fn(),
    tap: vi.fn(),
    change: vi.fn(),
  }
  return { gesture: createVoiceGesture(callbacks), ...callbacks }
}
describe('hold to talk', () => {
  it('a short tap switches mode without recording', () => {
    const s = setup()
    s.gesture.down(1, 500)
    vi.advanceTimersByTime(120)
    s.gesture.up(1)
    vi.runAllTimers()
    expect(s.tap).toHaveBeenCalledOnce()
    expect(s.start).not.toHaveBeenCalled()
  })
  it('holding starts once and release sends once', () => {
    const s = setup()
    s.gesture.down(1, 500)
    s.gesture.down(2, 500)
    vi.advanceTimersByTime(350)
    s.gesture.up(2)
    expect(s.finish).not.toHaveBeenCalled()
    s.gesture.up(1)
    s.gesture.up(1)
    expect(s.start).toHaveBeenCalledOnce()
    expect(s.finish).toHaveBeenCalledOnce()
    expect(s.tap).not.toHaveBeenCalled()
  })
  it('slide up cancels; sliding back before release restores sending', () => {
    const s = setup()
    s.gesture.down(1, 500)
    vi.advanceTimersByTime(350)
    s.gesture.move(1, 420)
    s.gesture.up(1)
    expect(s.cancel).toHaveBeenCalledOnce()
    expect(s.finish).not.toHaveBeenCalled()
    s.gesture.down(1, 500)
    vi.advanceTimersByTime(350)
    s.gesture.move(1, 420)
    s.gesture.move(1, 490)
    s.gesture.up(1)
    expect(s.finish).toHaveBeenCalledOnce()
  })
  it('system interruption never sends or toggles', () => {
    const s = setup()
    s.gesture.down(1, 500)
    vi.advanceTimersByTime(350)
    s.gesture.abort()
    s.gesture.up(1)
    expect(s.cancel).toHaveBeenCalledOnce()
    expect(s.finish).not.toHaveBeenCalled()
    expect(s.tap).not.toHaveBeenCalled()
    s.gesture.down(1, 500)
    s.gesture.abort()
    vi.runAllTimers()
    expect(s.start).toHaveBeenCalledOnce()
  })
})
