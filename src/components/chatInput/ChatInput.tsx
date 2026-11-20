import clsx from 'clsx'
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  IconGlobeLanguageOutline14,
  IconPlusCircleOutline20,
  IconSendOutline16,
  IconStopFill16,
  IconThinkOutline14,
} from '../base/icons.js'
import { setSearch, setThinking, useSettings } from '../../services/settings.js'
import { useIsMobile } from '../../app/viewport.js'
import { sendMessage, stopReply, useChatStore } from '../../services/chat/store.js'
import {
  addDraftFiles,
  EMPTY_DRAFT,
  getDraft,
  prepareDraftMessage,
  removeDraftAttachment,
  retryDraftAttachment,
  setDraftText,
  useDrafts,
} from '../../services/chat/drafts.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import { IconButton } from '../base/IconButton.js'
import { Tooltip } from '../base/Tooltip.js'
import { ensureApiKey } from '../settings/settingsDialogState.js'
import { DragMask, useFileDrop } from './DragMask.js'
import { showToast } from '../base/toastState.js'
import { useUploads } from '../../services/attachments.js'
import { AttachSheet } from './AttachSheet.js'
import { canTakePhoto, takePhoto } from '../../services/camera.js'
import {
  hasPhotoAccess,
  photoAsFile,
  requestPhotoAccess,
  type RecentPhoto,
} from '../../services/photoLibrary.js'
import { nativeFilePickerAvailable, pickFiles } from '../../services/filePicker.js'
import { DraftAttachments } from './DraftAttachments.js'
import { useVoiceInput } from './useVoiceInput.js'
import { VoiceButton } from './VoiceButton.js'
import { useVoiceGesture } from './useVoiceGesture.js'
import { Spectrum } from './Spectrum.js'
import { useTranslate } from '../../i18n/index.js'
import styles from './ChatInput.module.css'
import { useComposerMotion } from './useComposerMotion.js'

/** 输入框：自适应高度的文本框 + 文件 + 深度思考与智能搜索开关 + 语音输入 + 发送 / 停止 */
export const ChatInput = memo(function ChatInput({ sessionId }: { sessionId: string | null }) {
  const [voiceMode, setVoiceMode] = useState(false)
  // 切换目标时释放录音、转写和 DOM 状态；文字与附件由草稿服务保留。
  return (
    <Input
      key={sessionId === null ? 'new' : `session:${sessionId}`}
      sessionId={sessionId}
      voiceMode={voiceMode}
      setVoiceMode={setVoiceMode}
    />
  )
})

const Input = ({
  sessionId,
  voiceMode,
  setVoiceMode,
}: {
  sessionId: string | null
  voiceMode: boolean
  setVoiceMode: (value: boolean) => void
}) => {
  const t = useTranslate()
  const draft = useDrafts((state) => state.drafts.get(sessionId) ?? EMPTY_DRAFT)
  const { text, attachments } = draft
  const setText = (value: string) => setDraftText(sessionId, value)
  const draftReady = useUploads((state) => prepareDraftMessage(draft, state.tasks) !== null)
  const streaming = useChatStore(
    (state) => sessionId !== null && Object.hasOwn(state.streaming, sessionId)
  )
  const thinking = useSettings((state) => state.thinking)
  const importingHistory = useChatStore((state) => state.importingHistory)
  const isMobile = useIsMobile()
  const search = useSettings((state) => state.search)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // 拍照与相册各自一个 input：capture / accept 只有挂在 input 上才生效
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const albumInputRef = useRef<HTMLInputElement>(null)
  const [attachOpen, setAttachOpen] = useState(false)
  const motion = useComposerMotion(isMobile, attachOpen)
  // 面板里已选中的照片 id；与输入框里的附件必须保持一致
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const togglesRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const toggles = togglesRef.current
    if (!toggles) {
      return
    }

    const updateLabels = () => {
      toggles.classList.remove(styles.collapsedToggles)
      toggles.classList.toggle(styles.collapsedToggles, toggles.scrollWidth > toggles.clientWidth)
    }

    updateLabels()
    const observer = new ResizeObserver(updateLabels)
    observer.observe(toggles)
    return () => observer.disconnect()
  }, [t])

  // 拍照走原生相机插件（<input capture> 在 WebView 里各家 ROM 表现不一）
  const shootPhoto = async () => {
    const result = await takePhoto()
    if (result.status === 'ok') {
      acceptFiles([result.file])
      return
    }
    if (result.status === 'denied') {
      showToast({ type: 'error', key: 'takePhotoDenied' })
      return
    }
    if (result.status === 'error') {
      showToast({ type: 'error', key: 'takePhotoFailed' })
    }
    // cancelled：用户自己退的，什么都不做
  }

  /*
   * 勾选状态必须跟着草稿走：发出去、或被别处清空后，
   * 残留的 id 会让面板显示「已选中但输入框里没有」的矛盾状态。
   */
  useEffect(() => {
    setSelectedPhotoIds((current) => {
      if (current.length === 0) {
        return current
      }
      const alive = new Set(attachments.map((item) => item.file))
      const next = current.filter((id) => {
        const file = photoFiles.current.get(id)
        return file ? alive.has(file) : false
      })
      return next.length === current.length ? current : next
    })
  }, [attachments])

  /*
   * 点面板和输入框之外的空白区域：收起附件面板。
   * 用 pointerdown + 捕获阶段，确保在页面自己的点击处理之前判断，
   * 且不阻断后续事件（用户可以正常点消息列表里的东西）。
   */
  useEffect(() => {
    if (!attachOpen) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target) {
        return
      }
      if (target.closest('[data-attach-panel]') || wrapperRef.current?.contains(target)) {
        return
      }
      setAttachOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAttachOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [attachOpen])

  // 缩略图与已加入草稿的 File 对应关系：取消选中时按 File 引用找回附件并移除
  const photoFiles = useRef(new Map<string, File>())

  const selectPhoto = async (photo: RecentPhoto) => {
    try {
      const file = await photoAsFile(photo)
      photoFiles.current.set(photo.id, file)
      setSelectedPhotoIds((current) => [...current, photo.id])
      acceptFiles([file])
    } catch {
      showToast({ type: 'error', key: 'photoReadFailed' })
    }
  }

  /** 从输入框移除某张已选照片：勾选状态一起清掉 */
  const dropPhotoFiles = (files: File[]) => {
    if (files.length === 0) {
      return
    }
    setSelectedPhotoIds((current) =>
      current.filter((id) => {
        const file = photoFiles.current.get(id)
        return file ? !files.includes(file) : false
      })
    )
    for (const [id, file] of photoFiles.current) {
      if (files.includes(file)) {
        photoFiles.current.delete(id)
      }
    }
  }

  const unselectPhoto = (photo: RecentPhoto) => {
    const file = photoFiles.current.get(photo.id)
    if (!file) {
      return
    }
    photoFiles.current.delete(photo.id)
    setSelectedPhotoIds((current) => current.filter((id) => id !== photo.id))
    const target = getDraft(sessionId).attachments.find((item) => item.file === file)
    if (target) {
      removeDraftAttachment(sessionId, target.id)
    }
  }

  // 相册入口：只有点它时才申请相册权限（用户要求）
  const openAlbum = async () => {
    if (nativeFilePickerAvailable()) {
      try {
        if (!(await hasPhotoAccess()) && !(await requestPhotoAccess())) {
          showToast({ type: 'error', key: 'albumDenied' })
          return
        }
      } catch {
        // 权限接口异常时仍尝试打开系统选择器
      }
    }
    albumInputRef.current?.click()
  }

  // 文件入口：原生平台走 ACTION_OPEN_DOCUMENT（系统文档界面），否则用 input
  const openFiles = async () => {
    if (!nativeFilePickerAvailable()) {
      fileInputRef.current?.click()
      return
    }
    try {
      const files = await pickFiles()
      if (files.length > 0) {
        acceptFiles(files)
      }
    } catch {
      showToast({ type: 'error', key: 'filePickFailed' })
    }
  }

  const acceptFiles = (files: File[]) => {
    if (files.length === 0 || useChatStore.getState().importingHistory || !ensureApiKey()) {
      return
    }
    const error = addDraftFiles(sessionId, files, useSettings.getState().apiKey ?? '')
    if (error) {
      showToast(error)
    }
  }
  const retryFile = useCallback(
    (id: string) => {
      if (!useChatStore.getState().importingHistory && ensureApiKey()) {
        retryDraftAttachment(sessionId, id, useSettings.getState().apiKey ?? '')
      }
    },
    [sessionId]
  )
  const removeFile = useCallback(
    (id: string) => {
      if (!useChatStore.getState().importingHistory) {
        // 若这张图来自面板的最近照片，同步取消下面的勾选（上下一一对应）
        const attachment = getDraft(sessionId).attachments.find((item) => item.id === id)
        if (attachment) {
          dropPhotoFiles([attachment.file])
        }
        removeDraftAttachment(sessionId, id)
      }
    },
    [sessionId]
  )
  const dragging = useFileDrop(acceptFiles)

  /** Voice release transcribes and submits. Keep the text if submission is blocked. */
  const cancelAtLimit = useRef(false)
  const voice = useVoiceInput(
    (transcript) => {
      const current = getDraft(sessionId).text
      setText(current ? `${current}\n${transcript}` : transcript)
      const state = useChatStore.getState()
      if (
        !current &&
        !state.importingHistory &&
        !(sessionId !== null && Object.hasOwn(state.streaming, sessionId)) &&
        ensureApiKey()
      ) {
        if (sendMessage(sessionId)) {
          if (isMobile) {
            motion.begin('closed')
            textareaRef.current?.blur()
          }
          setAttachOpen(false)
          stopReadAloud()
        } else {
          setVoiceMode(false)
        }
      } else {
        setVoiceMode(false)
      }
    },
    () => cancelAtLimit.current
  )

  const switchToVoice = () => {
    motion.begin('closed')
    textareaRef.current?.blur()
    setAttachOpen(false)
    setVoiceMode(true)
  }
  const switchToKeyboard = () => {
    motion.begin('keyboard')
    setAttachOpen(false)
    flushSync(() => setVoiceMode(false))
    // Keep the textarea mounted and focus inside the user gesture (iOS included).
    textareaRef.current?.focus({ preventScroll: true })
  }
  const startVoice = () => {
    if (
      useChatStore.getState().importingHistory ||
      streaming ||
      getDraft(sessionId).text.trim() ||
      !ensureApiKey()
    ) {
      return
    }
    // Recording preserves the current keyboard / attachment panel and its position.
    // Only a successful send closes it; cancellation leaves the layout untouched.
    stopReadAloud()
    void voice.start()
  }
  const voiceDisabled =
    importingHistory || streaming || !voice.available || voice.status === 'transcribing'
  const smallGesture = useVoiceGesture({
    disabled: voiceDisabled,
    start: () => {
      if (!voiceMode) {
        startVoice()
      }
    },
    finish: () => void voice.finish(),
    cancel: voice.cancel,
    tap: voiceMode ? switchToKeyboard : switchToVoice,
  })
  const holdGesture = useVoiceGesture({
    disabled: voiceDisabled,
    start: startVoice,
    finish: () => void voice.finish(),
    cancel: voice.cancel,
    tap: () => {},
  })
  const cancelling = smallGesture.cancelling || holdGesture.cancelling
  cancelAtLimit.current = cancelling

  useEffect(() => {
    if (text.trim()) {
      setVoiceMode(false)
    }
  }, [text, setVoiceMode])

  // 欢迎页导入后会话 ID 不变，不能依赖卸载取消语音；订阅开始事件也覆盖快速完成的导入。
  const cancelVoice = voice.cancel
  useEffect(
    () =>
      useChatStore.subscribe((state, previous) => {
        if (state.importingHistory && !previous.importingHistory) {
          cancelVoice()
        }
      }),
    [cancelVoice]
  )

  // 移动端录音时用频谱替代输入框内容
  const recording = voice.status === 'recording' || voice.status === 'starting'
  const voiceBusy = voice.status !== 'idle'
  const showSend = !voiceMode && (text.trim().length > 0 || attachments.length > 0)

  // 排队、上传中或上传失败的附件都留在输入框，全部上传成功后才能发送
  const canSend = !importingHistory && !streaming && voice.status === 'idle' && draftReady

  const send = () => {
    if (
      useChatStore.getState().importingHistory ||
      voice.status !== 'idle' ||
      !prepareDraftMessage(getDraft(sessionId), useUploads.getState().tasks)
    ) {
      return
    }
    // 文本与上传完成态由提交动作读取最新快照，不使用上一次渲染的草稿。
    if (!ensureApiKey() || !sendMessage(sessionId)) {
      return
    }
    stopReadAloud()
    if (isMobile) {
      textareaRef.current?.blur()
    } else {
      textareaRef.current?.focus()
    }
  }

  return (
    <div ref={motion.ref} className={styles.composer}>
      <div
        ref={wrapperRef}
        className={clsx(
          styles.wrapper,
          sessionId === null ? styles.home : styles.session,
          voiceMode && styles.voiceMode,
          recording && styles.recording,
          cancelling && recording && styles.cancelling
        )}
        onClick={(event) => {
          if (event.target === event.currentTarget && !voiceMode && !voiceBusy) {
            textareaRef.current?.focus({ preventScroll: true })
          }
        }}
      >
        <DraftAttachments items={attachments} onRetry={retryFile} onRemove={removeFile} />
        <div className={styles.textareaWrapper}>
          <textarea
            ref={textareaRef}
            className={clsx(
              styles.textarea,
              voiceMode && styles.textareaHidden,
              !voiceMode && voiceBusy && styles.textareaRecording
            )}
            tabIndex={voiceMode ? -1 : undefined}
            aria-hidden={voiceMode}
            placeholder={t('chatInputPlaceholderChat')}
            rows={2}
            // 移动端不自动聚焦，避免一打开就弹出键盘
            autoFocus={!isMobile}
            disabled={importingHistory}
            value={text}
            onChange={(event) => {
              if (!voiceBusy) {
                setText(event.target.value)
              }
            }}
            onBeforeInput={(event) => {
              if (voiceBusy) {
                event.preventDefault()
              }
            }}
            onMouseDown={(event) => {
              // 点输入框就收起附件面板，并把焦点还给输入框（随后系统弹出键盘）
              motion.begin('keyboard')
              setAttachOpen(false)
              // 首次点击时手动聚焦，避免 Safari 把整个页面滚到输入框位置。
              if (
                isMobile &&
                event.button === 0 &&
                document.activeElement !== event.currentTarget
              ) {
                event.preventDefault()
                event.currentTarget.focus({ preventScroll: true })
              }
            }}
            onFocus={() => {
              setVoiceMode(false)
              motion.begin('keyboard')
              setAttachOpen(false)
            }}
            onKeyDown={(event) => {
              if (voiceBusy) {
                event.preventDefault()
                return
              }
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                send()
              }
            }}
            onPaste={(event) => {
              if (voiceBusy) {
                event.preventDefault()
                return
              }
              const files = Array.from(event.clipboardData.files)
              if (files.length > 0) {
                event.preventDefault()
                acceptFiles(files)
              }
            }}
          />
          {voiceMode || voiceBusy ? (
            <div className={styles.voiceArea}>
              {recording ? <Spectrum getAnalyser={voice.getAnalyser} /> : null}
              <button
                type="button"
                className={styles.holdButton}
                aria-label={t('voiceInputHold')}
                aria-disabled={voiceDisabled}
                {...holdGesture.handlers}
              >
                <span role="status" aria-live="polite">
                  {t(
                    voice.status === 'starting'
                      ? 'voiceInputStarting'
                      : voice.status === 'transcribing'
                        ? 'voiceInputTranscribing'
                        : recording
                          ? cancelling
                            ? 'voiceInputReleaseCancel'
                            : 'voiceInputReleaseSend'
                          : 'voiceInputHold'
                  )}
                </span>
              </button>
            </div>
          ) : null}
          <div className={styles.mirror} aria-hidden>
            {`${text}\n`}
          </div>
        </div>
        <div className={styles.functionRow}>
          {/* 深度思考 / 智能搜索开关，tooltip 在按钮上方 */}
          <div ref={togglesRef} className={styles.toggles}>
            <Tooltip content={t('deactivatedThinkTooltip')}>
              <button
                type="button"
                className={clsx(styles.toggle, thinking && styles.selected)}
                aria-label={t('thinkingSwitch')}
                aria-pressed={thinking}
                onClick={() => setThinking(!thinking)}
              >
                <IconThinkOutline14 />
                <span className={styles.toggleLabel}>{t('thinkingSwitch')}</span>
              </button>
            </Tooltip>
            <Tooltip content={t('deactivatedSearchTooltip')}>
              <button
                type="button"
                className={clsx(styles.toggle, search && styles.selected)}
                aria-label={t('search')}
                aria-pressed={search}
                onClick={() => setSearch(!search)}
              >
                <IconGlobeLanguageOutline14 />
                <span className={styles.toggleLabel}>{t('search')}</span>
              </button>
            </Tooltip>
          </div>
          <div className={styles.right}>
            <IconButton
              size="m"
              className={clsx(styles.bareButton, attachOpen && styles.attachActive)}
              icon={<IconPlusCircleOutline20 />}
              tooltip={t('uploadFile')}
              disabled={importingHistory}
              aria-expanded={attachOpen}
              aria-controls="chat-attach-sheet"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (voiceBusy || !ensureApiKey()) {
                  return
                }
                motion.begin(attachOpen ? 'closed' : 'panel')
                textareaRef.current?.blur()
                setAttachOpen((value) => !value)
              }}
            />
            {/* 不设 accept：系统文件管理器会隐藏不匹配的文件，与原生「文件」入口不一致 */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                acceptFiles(Array.from(event.target.files ?? []))
                event.target.value = ''
              }}
            />
            {/* capture 让安卓直接调起相机；桌面端没有这个概念，所以菜单里不显示「拍照」 */}
            <input
              ref={cameraInputRef}
              type="file"
              hidden
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                acceptFiles(Array.from(event.target.files ?? []))
                event.target.value = ''
              }}
            />
            <input
              ref={albumInputRef}
              type="file"
              multiple
              hidden
              accept="image/*"
              onChange={(event) => {
                acceptFiles(Array.from(event.target.files ?? []))
                event.target.value = ''
              }}
            />
            {streaming && sessionId ? (
              <button
                type="button"
                className={styles.sendButton}
                aria-label={t('chatInputStopButtonTooltip')}
                onClick={() => {
                  stopReadAloud()
                  stopReply(sessionId)
                }}
              >
                <IconStopFill16 />
              </button>
            ) : showSend ? (
              <button
                type="button"
                className={clsx(styles.sendButton, !canSend && styles.disabled)}
                aria-label={t('send')}
                aria-disabled={!canSend}
                onClick={send}
              >
                <IconSendOutline16 />
              </button>
            ) : (
              <VoiceButton
                keyboard={voiceMode}
                disabled={voiceDisabled || recording}
                busy={voice.status === 'transcribing'}
                handlers={smallGesture.handlers}
              />
            )}
          </div>
        </div>
        {dragging ? <DragMask /> : null}
      </div>
      {/* 面板在输入框下方：与官方一致，输入框在上、面板像键盘一样从底部顶起 */}
      <AttachSheet
        open={attachOpen}
        showCamera={isMobile}
        onClose={() => setAttachOpen(false)}
        onCamera={() => (canTakePhoto() ? void shootPhoto() : cameraInputRef.current?.click())}
        onAlbum={() => void openAlbum()}
        onFile={() => void openFiles()}
        selectedIds={selectedPhotoIds}
        onSelectPhoto={(photo) => void selectPhoto(photo)}
        onUnselectPhoto={unselectPhoto}
      />
    </div>
  )
}
