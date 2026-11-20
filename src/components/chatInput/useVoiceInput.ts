import { useCallback, useEffect, useRef, useState } from 'react'
import type { TranslationMessage } from '../../i18n/index.js'
import { transcribe } from '../../services/api/speech.js'
import { startRecording, type Recording } from '../../services/speech/recorder.js'
import { useSettings } from '../../services/settings.js'
import { showToast } from '../base/toastState.js'

export type VoiceInputStatus = 'idle' | 'starting' | 'recording' | 'transcribing'

/**
 * 录音依赖 getUserMedia，只在安全上下文可用（HTTPS、localhost、file://）。
 * 普通 HTTP 页面上直接禁用入口，避免点击后必然失败。
 */
const AVAILABLE = typeof window === 'undefined' || window.isSecureContext

const describeRecordingError = (error: unknown): TranslationMessage => {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return { key: 'voiceInputPermissionDenied' }
    }
    if (error.name === 'NotFoundError') {
      return { key: 'voiceInputNoDevice' }
    }
  }
  return { key: 'voiceInputFailed' }
}

/**
 * Hold-to-talk lifecycle. Releases during permission acquisition cancel the
 * operation; a late microphone stream is disposed without transcription.
 */
export const useVoiceInput = (
  onText: (text: string) => void,
  shouldCancelAtLimit: () => boolean = () => false
) => {
  const [status, setStatus] = useState<VoiceInputStatus>('idle')
  const statusRef = useRef<VoiceInputStatus>('idle')
  const updateStatus = (value: VoiceInputStatus) => {
    statusRef.current = value
    setStatus(value)
  }
  const recordingRef = useRef<Recording | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const operationRef = useRef(0)
  const onTextRef = useRef(onText)
  onTextRef.current = onText
  const shouldCancelRef = useRef(shouldCancelAtLimit)
  shouldCancelRef.current = shouldCancelAtLimit

  const cancelOperation = useCallback(() => {
    operationRef.current++
    recordingRef.current?.cancel()
    recordingRef.current = null
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [])

  const cancel = useCallback(() => {
    cancelOperation()
    updateStatus('idle')
  }, [cancelOperation])

  const finish = useCallback(async () => {
    if (statusRef.current === 'transcribing' || statusRef.current === 'idle') {
      return
    }
    const recording = recordingRef.current
    if (!recording) {
      // 仍在等待麦克风授权时也允许取消；迟到的录音对象会立即释放。
      cancel()
      return
    }
    const operation = operationRef.current
    recordingRef.current = null
    updateStatus('transcribing')
    let controller: AbortController | null = null
    try {
      let audio: Blob | null
      try {
        audio = await recording.stop()
      } finally {
        recording.cancel()
      }
      if (operationRef.current !== operation) {
        return
      }
      if (!audio) {
        showToast({ key: 'voiceInputEmpty' })
        return
      }
      controller = new AbortController()
      controllerRef.current = controller
      const text = await transcribe(useSettings.getState().apiKey ?? '', audio, controller.signal)
      if (controller.signal.aborted || operationRef.current !== operation) {
        return
      }
      if (text.trim()) {
        onTextRef.current(text.trim())
      } else {
        showToast({ key: 'voiceInputEmpty' })
      }
    } catch {
      if (operationRef.current === operation && !controller?.signal.aborted) {
        showToast({ key: 'voiceInputFailed' })
      }
    } finally {
      if (operationRef.current === operation) {
        controllerRef.current = null
        updateStatus('idle')
      }
    }
  }, [cancel])

  const start = useCallback(async () => {
    if (!AVAILABLE || statusRef.current !== 'idle') {
      return
    }
    const operation = ++operationRef.current
    updateStatus('starting')
    try {
      const recording = await startRecording(() => {
        if (operationRef.current === operation) {
          showToast({ key: 'voiceInputLimitReached' })
          if (shouldCancelRef.current()) {
            cancel()
          } else {
            void finish()
          }
        }
      })
      if (operationRef.current !== operation) {
        recording.cancel()
        return
      }
      recordingRef.current = recording
      updateStatus('recording')
    } catch (error) {
      if (operationRef.current === operation) {
        updateStatus('idle')
        showToast(describeRecordingError(error))
      }
    }
  }, [finish, cancel])

  useEffect(() => cancelOperation, [cancelOperation])

  /** 当前录音的频谱分析节点，未录音时为 null */
  const getAnalyser = useCallback(() => recordingRef.current?.analyser ?? null, [])

  return { status, getAnalyser, start, finish, cancel, available: AVAILABLE }
}
