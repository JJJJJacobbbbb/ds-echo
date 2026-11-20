import { useTranslate } from '../../i18n/index.js'
import { IconCloseOutline16 } from '../base/icons.js'
import { IconButton } from '../base/IconButton.js'
import { closeSearchPanel, useSearchPanel } from './searchPanelState.js'
import { SourceCard } from './SourceCard.js'
import styles from './SearchPanel.module.css'
import { Presence, useMotionState } from '../base/Presence.js'
import type { Source } from '../../services/chat/view.js'

/** 右侧「搜索结果」面板 */
export const SearchPanel = () => {
  const entry = useSearchPanel((state) => state.entry)
  const sources = useSearchPanel((state) => state.sources)
  return (
    <Presence present={!!entry}>
      <PanelContent sources={sources} />
    </Presence>
  )
}

const PanelContent = ({ sources }: { sources: Source[] }) => {
  const t = useTranslate()
  const state = useMotionState()
  return (
    <aside
      className={styles.panel}
      data-state={state}
      data-motion-surface
      {...(state === 'closed' ? { inert: '' } : {})}
    >
      <div className={styles.header}>
        <div role="heading" className={styles.title}>
          {t('searchResult')}
        </div>
        <IconButton
          icon={<IconCloseOutline16 />}
          aria-label={t('close')}
          onClick={closeSearchPanel}
        />
      </div>
      <div className={styles.content}>
        {sources.map((source) => (
          <SourceCard key={source.url} source={source} className={styles.item} />
        ))}
      </div>
    </aside>
  )
}
