import clsx from 'clsx'
import { useRef, useState, type ReactNode } from 'react'
import {
  IconDarkOutline16,
  IconDataOutline16,
  IconDownloadOutline16,
  IconFollowsystemOutline16,
  IconLightOutline16,
  IconSettingsOutline16,
  IconUploadOutline14,
} from '../base/icons.js'
import {
  BackupError,
  clearHistory,
  exportHistory,
  cancelHistoryImport,
  commitHistoryImport,
  stageHistoryImport,
  type ImportPreview,
} from '../../services/chat/backup.js'
import { useIsMobile } from '../../app/viewport.js'
import { useChatStore } from '../../services/chat/store.js'
import { regionCodes, getRegionName, provinces } from '../../services/location.js'
import {
  isChineseBrowser,
  setLocale,
  setLocation,
  setThemePreference,
  setTtsVoice,
  useSettings,
  type ThemePreference,
} from '../../services/settings.js'
import { useTranslate, type TranslationKey, type TranslationMessage } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { Select } from '../base/Select.js'
import { showToast } from '../base/toastState.js'
import { saveFileForUser } from '../../services/fileSave.js'
import { ApiKeyConfirm, ApiKeyField, useApiKeyEditor } from './ApiKeyField.js'
import { AccountPanel } from './AccountPanel.js'
import { DonateDialog } from './DonateDialog.js'
import { LANDING_PASSWORD, LANDING_URL, RELEASES_URL, checkForUpdate, currentVersion, type UpdateResult } from '../../services/update.js'
import { openTrustedUrl } from '../../services/external.js'
import { canInstallInApp, installApk } from '../../services/apkInstaller.js'
import { closeSettings, useSettingsDialog, type SettingsSection } from './settingsDialogState.js'
import styles from './Settings.module.css'

/**
 * 设置弹窗：分「通用设置」（主题、语言、朗读音色、位置）与「数据管理」（API Key、导入、导出、删除）。
 * 桌面端为居中弹窗、左侧导航；移动端为底部弹层、导航横排在内容上方
 */
export const SettingsDialog = () => {
  const open = useSettingsDialog((state) => state.open)
  return open ? <SettingsContent /> : null
}

const sections: { value: SettingsSection; label: TranslationKey; icon: ReactNode }[] = [
  {
    value: 'general',
    label: 'settingDialogAsideGeneralOptionLabel',
    icon: <IconSettingsOutline16 />,
  },
  { value: 'data', label: 'settingDialogAsideDataOptionLabel', icon: <IconDataOutline16 /> },
]

const SettingsContent = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  // 打开时按调用方指定的分组选中，之后在弹窗内切换
  const [section, setSection] = useState(() => useSettingsDialog.getState().section)
  // 切换分组不丢失正在输入的 API Key 与导入状态
  const apiKeyEditor = useApiKeyEditor()
  /** 分组内容的滚动容器；切分组时要用它回到顶部 */
  const contentRef = useRef<HTMLDivElement>(null)
  const historyImport = useHistoryImport()
  const historyDelete = useHistoryDelete()
  const replacingHistory = useChatStore((state) => state.importingHistory)
  const historyBusy = historyImport.busy || historyDelete.busy || replacingHistory
  return (
    <>
      <Modal
        title={t('settings')}
        closable
        className={styles.dialog}
        mainClassName={styles.dialogMain}
        onClose={() => {
          // 导入/删除进行中禁止关闭：中途退出会让人以为失败了（实测用户就是这么退的）
          if (!historyBusy) {
            closeSettings()
          }
        }}
      >
        <div role="tablist" className={styles.navigation}>
          {sections.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={section === item.value}
              className={clsx(styles.navItem, section === item.value && styles.navItemActive)}
              onClick={() => {
                setSection(item.value)
                // 切换分组时回到顶部：两个分组高度不同，保留上一次的滚动位置会把
                // 新分组的第一行（例如账户余额的标题与按钮）滚出可视区。
                contentRef.current?.scrollTo({ top: 0 })
              }}
            >
              {item.icon}
              {t(item.label)}
            </button>
          ))}
        </div>
        <div role="tabpanel" className={styles.content} ref={contentRef}>
          {section === 'general' ? (
            <>
              <ThemeSetting />
              <LocaleSetting />
              <TtsVoiceSetting />
              <LocationSetting />
              <UpdateSetting />
              <DonateSetting />
            </>
          ) : (
            <>
              <AccountPanel />
              <ApiKeyField editor={apiKeyEditor} />
              <ImportHistory historyImport={historyImport} disabled={historyBusy} />
              <ExportHistory disabled={historyBusy} />
              <SettingCell
                label={t('deleteAllSessions')}
                status={null}
                action={
                  <Button
                    variant="dangerOutlined"
                    size="m"
                    className={styles.cellButton}
                    disabled={historyBusy}
                    onClick={historyDelete.open}
                  >
                    {t('delete')}
                  </Button>
                }
              />
              {isMobile ? <ApiKeyConfirm editor={apiKeyEditor} /> : null}
            </>
          )}
        </div>
      </Modal>
      {historyImport.preview ? <ImportConfirm historyImport={historyImport} /> : null}
      {historyDelete.opened ? <DeleteAllConfirm historyDelete={historyDelete} /> : null}
    </>
  )
}

/** 删除确认保留在设置之上；失败可重试，成功只关闭确认弹窗。 */
const DeleteAllConfirm = ({
  historyDelete,
}: {
  historyDelete: ReturnType<typeof useHistoryDelete>
}) => {
  const t = useTranslate()
  return (
    <Modal
      title={t('deleteAllSessionsModalTitle')}
      className={styles.deleteConfirm}
      onClose={historyDelete.cancel}
      footer={
        <div className={styles.deleteActions} aria-busy={historyDelete.busy}>
          <Button
            variant="outlined"
            autoFocus
            disabled={historyDelete.busy}
            onClick={historyDelete.cancel}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={historyDelete.busy}
            onClick={() => void historyDelete.confirm()}
          >
            {t(historyDelete.busy ? 'historyDeleting' : 'deleteAllSessions')}
          </Button>
        </div>
      }
    >
      {t('deleteAllSessionsModalDescription')}
    </Modal>
  )
}

const useHistoryDelete = () => {
  const [opened, setOpened] = useState(false)
  const [busy, setBusy] = useState(false)
  const deleting = useRef(false)

  const confirm = async () => {
    if (deleting.current) {
      return
    }
    deleting.current = true
    setBusy(true)
    try {
      await clearHistory()
      setOpened(false)
      showToast({ key: 'historyDeleted' })
    } catch {
      showToast({ key: 'historyDeleteFailed', type: 'error' })
    } finally {
      deleting.current = false
      setBusy(false)
    }
  }

  return {
    opened,
    busy,
    open: () => setOpened(true),
    cancel: () => {
      if (!deleting.current) {
        setOpened(false)
      }
    },
    confirm,
  }
}

const LocationSetting = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const location = useSettings((state) => state.location)
  const province =
    location?.region === 'CN'
      ? provinces.find((item) => item.code === location.province)
      : undefined

  return (
    <SettingCell
      label={t('settingsLocation')}
      status={null}
      className={styles.locationCell}
      action={
        <div className={styles.locationSelectors}>
          {isChineseBrowser() ? (
            <>
              <Select
                ariaLabel={t('settingsLocationProvince')}
                className={styles.provinceSelect}
                value={province?.code ?? ''}
                placeholder={t('settingsLocationProvince')}
                options={provinces.map((item) => ({ value: item.code, label: item.name }))}
                onChange={(value) => {
                  if (value !== province?.code) {
                    setLocation({ region: 'CN', province: value })
                  }
                }}
              />
              <Select
                ariaLabel={t('settingsLocationCity')}
                className={styles.citySelect}
                value={province ? (location?.city ?? '') : ''}
                disabled={!province?.cities.length}
                placeholder={t('settingsLocationCity')}
                options={
                  province?.cities.map((item) => ({ value: item.code, label: item.name })) ?? []
                }
                onChange={(value) => {
                  if (province) {
                    setLocation({ region: 'CN', province: province.code, city: value })
                  }
                }}
              />
            </>
          ) : (
            <Select
              ariaLabel={t('settingsLocationRegion')}
              className={styles.regionSelect}
              value={location?.region ?? ''}
              placeholder={t('settingsLocationRegion')}
              options={regionCodes
                .map((code) => ({ value: code, label: getRegionName(code, locale) }))
                .sort((a, b) => a.label.localeCompare(b.label, locale))}
              onChange={(value) => setLocation({ region: value })}
            />
          )}
        </div>
      }
    />
  )
}

const LocaleSetting = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  return (
    <SettingCell
      label={t('settingsLocalePreference')}
      status={null}
      action={
        <Select
          ariaLabel={t('settingsLocalePreference')}
          value={locale}
          options={[
            { value: 'zh-CN', label: t('settingsLocaleZhCN'), lang: 'zh-CN' },
            { value: 'en-US', label: t('settingsLocaleEnUS'), lang: 'en' },
          ]}
          onChange={setLocale}
        />
      }
    />
  )
}

/** 朗读音色：stella（海星，女声）/ tide（暗潮，男声） */
const TtsVoiceSetting = () => {
  const t = useTranslate()
  const ttsVoice = useSettings((state) => state.ttsVoice)
  return (
    <SettingCell
      label={t('settingsTtsVoice')}
      status={null}
      action={
        <Select
          ariaLabel={t('settingsTtsVoice')}
          value={ttsVoice}
          options={[
            { value: 'stella', label: t('settingsTtsVoiceStella') },
            { value: 'tide', label: t('settingsTtsVoiceTide') },
          ]}
          onChange={setTtsVoice}
        />
      }
    />
  )
}

/** 导入前的预览确认：先说清会导入多少、跳过多少，再让用户决定 */
const ImportConfirm = ({
  historyImport,
}: {
  historyImport: ReturnType<typeof useHistoryImport>
}) => {
  const t = useTranslate()
  const preview = historyImport.preview
  if (!preview) {
    return null
  }
  const fresh = preview.totalSessions - preview.duplicateSessions
  return (
    <Modal
      title={t('historyImportConfirmTitle')}
      className={styles.importConfirm}
      onClose={historyImport.cancel}
      footer={
        <>
          <Button variant="outlined" size="m" autoFocus onClick={historyImport.cancel}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            size="m"
            disabled={fresh === 0 || historyImport.busy}
            onClick={() => void historyImport.confirm()}
          >
            {t('historyImportConfirm')}
          </Button>
        </>
      }
    >
      <div className={styles.importConfirmText}>
        {fresh > 0
          ? t('historyPreviewSummary', {
              fresh,
              skipped: preview.duplicateSessions,
              files: preview.fileCount,
              messages: preview.messageCount,
            })
          : t('historyPreviewNothingNew', { skipped: preview.duplicateSessions })}
      </div>
    </Modal>
  )
}

const themeOptions: { value: ThemePreference; label: TranslationKey; icon: ReactNode }[] = [
  {
    value: 'light',
    label: 'avatarMenuSettingsDialogThemeSelectLightOption',
    icon: <IconLightOutline16 />,
  },
  {
    value: 'dark',
    label: 'avatarMenuSettingsDialogThemeSelectDarkOption',
    icon: <IconDarkOutline16 />,
  },
  {
    value: 'system',
    label: 'avatarMenuSettingsDialogThemeSelectSystemOption',
    icon: <IconFollowsystemOutline16 />,
  },
]

/**
 * 主题项：标题下方浅色 / 深色 / 跟随系统三个选块。
 * 与下方语言选项连续排列。
 */
const ThemeSetting = () => {
  const t = useTranslate()
  const themePreference = useSettings((state) => state.themePreference)
  const label = t('avatarMenuSettingsDialogThemeItemLabel')
  return (
    <div className={styles.theme}>
      {label}
      <div role="radiogroup" aria-label={label} className={styles.themeOptions}>
        {themeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={themePreference === option.value}
            className={clsx(
              styles.themeOption,
              themePreference === option.value && styles.themeOptionSelected
            )}
            onClick={() => setThemePreference(option.value)}
          >
            {option.icon}
            {t(option.label)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** `reason` 为失败原因的文案 key，展示时按当前语言翻译后填入 `message` 参数。 */
type Status = (TranslationMessage & { error?: boolean; reason?: TranslationKey }) | null

/** 导出失败附带原因：预期的错误用对应文案作原因，其他错误用错误信息。 */
const errorStatus = (key: TranslationKey, error: unknown): Status => ({
  key,
  ...(error instanceof BackupError
    ? { reason: error.key }
    : { params: { message: error instanceof Error ? error.message : String(error) } }),
  error: true,
})

const SettingCell = ({
  label,
  description,
  status,
  action,
  className,
}: {
  label: string
  description?: string
  status: Status
  action: ReactNode
  className?: string
}) => {
  const t = useTranslate()
  return (
    <div className={clsx(styles.cell, styles.row, className)}>
      <div className={styles.text}>
        <div className={styles.label}>{label}</div>
        {status || description ? (
          <div className={clsx(styles.description, status?.error && styles.error)}>
            {status
              ? t(status.key, status.reason ? { message: t(status.reason) } : status.params)
              : description}
          </div>
        ) : null}
      </div>
      {action}
    </div>
  )
}

/**
 * 导入历史对话：先校验并写入暂存区（不碰现有数据）→ 拿到预览 → 用户确认
 * → 单事务合并进正式数据。取消时直接丢弃暂存。
 */
const useHistoryImport = () => {
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  /** 读取进度 0~100；null 表示没有在进行 */
  const [percent, setPercent] = useState<number | null>(null)
  const importing = useRef(false)

  const select = async (file: File) => {
    if (importing.current) {
      return
    }
    importing.current = true
    setBusy(true)
    setStatus(null)
    setPercent(0)
    try {
      setPreview(
        await stageHistoryImport(file, ({ doneBytes, totalBytes }) => {
          setPercent(totalBytes > 0 ? Math.min(99, Math.round((doneBytes / totalBytes) * 100)) : null)
        })
      )
    } catch {
      setStatus({ key: 'historyImportFailed', error: true })
    } finally {
      importing.current = false
      setBusy(false)
      setPercent(null)
    }
  }

  const cancel = () => {
    if (preview) {
      void cancelHistoryImport()
    }
    setPreview(null)
  }

  const confirm = async () => {
    if (!preview || importing.current) {
      return
    }
    importing.current = true
    setBusy(true)
    setStatus(null)
    try {
      const result = await commitHistoryImport(preview.fingerprint)
      const count = result.imported.length
      setStatus(
        count > 0
          ? { key: 'historyMerged', params: { count, skipped: result.skipped } }
          : { key: 'historyMergedNone', params: { skipped: result.skipped } }
      )
    } catch {
      setStatus({ key: 'historyImportFailed', error: true })
    } finally {
      setPreview(null)
      importing.current = false
      setBusy(false)
    }
  }

  return { preview, busy, status, percent, select, cancel, confirm }
}

/** 导入 = 覆盖：用选中文件替换本地全部会话与附件。 */
const ImportHistory = ({
  historyImport,
  disabled,
}: {
  historyImport: ReturnType<typeof useHistoryImport>
  disabled: boolean
}) => {
  const t = useTranslate()
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <SettingCell
      label={t('historyImport')}
      description={t('historyImportDescription')}
      status={
        historyImport.percent !== null
          ? {
              key: 'historyImportReading',
              params: { percent: historyImport.percent },
            }
          : historyImport.status
      }
      action={
        <>
          <Button
            variant="outlined"
            size="m"
            className={clsx(styles.cellButton, styles.uploadButton)}
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <IconUploadOutline14 />
            {t('upload')}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) {
                historyImport.select(file)
              }
            }}
          />
        </>
      }
    />
  )
}

/** 将全部会话及图片导出为 ZIP 文件并下载 */
const ExportHistory = ({ disabled }: { disabled: boolean }) => {
  const t = useTranslate()
  const empty = useChatStore((state) => state.sessions.length === 0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  const onExport = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const { name, blob } = await exportHistory()
      // 不能再用 <a download>：在 Android WebView 里它静默失效（实测点了什么都不发生，也不报错）
      const outcome = await saveFileForUser(blob, name)
      setStatus(outcome.kind === 'cancelled' ? null : { key: 'historyExported' })
    } catch (error) {
      setStatus(errorStatus('historyExportFailed', error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingCell
      label={t('exportAllLabel')}
      description={t('historyExportDescription')}
      status={status}
      action={
        <Button
          variant="outlined"
          size="m"
          className={styles.cellButton}
          disabled={disabled || busy || empty}
          onClick={() => void onExport()}
        >
          <IconDownloadOutline16 />
          {t('exportAllDownload')}
        </Button>
      }
    />
  )
}






/** 版本与更新：只在用户点击时请求 GitHub，不在后台自动检查（隐私） */
const UpdateSetting = () => {
  const t = useTranslate()
  const [state, setState] = useState<UpdateResult | 'checking' | 'installing' | null>(null)

  const label = t('updateSectionLabel')
  const version = currentVersion()

  // 显式返回类型：避免各分支 params 被推断成联合类型（message?: undefined 不兼容）
  const status = ((): Status => {
    if (state === 'checking') {
      return { key: 'updateChecking' }
    }
    if (state === 'installing') {
      return { key: 'updateInstalling' }
    }
    if (!state) {
      return { key: 'currentVersionLabel', params: { version } }
    }
    if (state.status === 'unconfigured') {
      return { key: 'updateUnconfigured' }
    }
    if (state.status === 'unavailable') {
      return { key: 'updateUnavailable', params: { tried: state.tried } }
    }
    if (state.status === 'latest') {
      return { key: 'updateLatest', params: { version: state.version } }
    }
    return {
      key: 'updateAvailableSize',
      params: {
        version: state.version,
        size: state.apkSize ? `${(state.apkSize / 1024 / 1024).toFixed(1)} MB` : '',
      },
    }
  })()

  return (
    <SettingCell
      label={label}
      // 连不上 GitHub 时提示国内下载入口与提取码
      description={
        state !== 'checking' && state !== 'installing' && state?.status === 'unavailable'
          ? t('updateLandingHint', { code: LANDING_PASSWORD })
          : undefined
      }
      status={status}
      action={
        state && state !== 'checking' && state !== 'installing' && state.status === 'unavailable' ? (
          <>
            {LANDING_URL ? (
              <Button
                variant="primary"
                size="m"
                className={styles.cellButton}
                onClick={() => void openTrustedUrl(LANDING_URL)}
              >
                {t('updateOpenLanding')}
              </Button>
            ) : null}
            <Button
              variant="outlined"
              size="m"
              className={styles.cellButton}
              onClick={() => void openTrustedUrl(RELEASES_URL)}
            >
              {t('updateOpenReleases')}
            </Button>
          </>
        ) : state && state !== 'checking' && state !== 'installing' && state.status === 'outdated' ? (
          <Button
            variant="primary"
            size="m"
            className={styles.cellButton}
            onClick={() => {
              const targets = state.apkMirrors?.length ? state.apkMirrors : []
              const urls = [...targets, ...(state.apk ? [state.apk] : [])]
              if (canInstallInApp() && state.apkSha256 && urls.length > 0) {
                setState('installing')
                void installApk(urls, state.apkSha256).then((result) => {
                  if (result.status !== 'started') {
                    setState({ status: 'unavailable', message: result.reason, tried: 0 })
                  }
                  // 成功时保持「正在安装」直到系统安装器接管
                })
                return
              }
              // 浏览器（或没有校验值）时退回打开下载地址
              void openTrustedUrl(state.apk ?? state.url)
            }}
          >
            {t('updateDownload')}
          </Button>
        ) : (
          <Button
            variant="outlined"
            size="m"
            className={styles.cellButton}
            disabled={state === 'checking' || state === 'installing'}
            onClick={() => {
              setState('checking')
              void checkForUpdate().then(setState)
            }}
          >
            {t('updateCheck')}
          </Button>
        )
      }
    />
  )
}

/** 打赏：金额快捷项 + 收款码，支付在用户自己的扫码里完成 */
const DonateSetting = () => {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  return (
    <>
      <SettingCell
        label={t('donateSectionLabel')}
        status={null}
        action={
          <Button variant="outlined" size="m" className={styles.cellButton} onClick={() => setOpen(true)}>
            {t('donateAction')}
          </Button>
        }
      />
      {open ? <DonateDialog onClose={() => setOpen(false)} /> : null}
    </>
  )
}
