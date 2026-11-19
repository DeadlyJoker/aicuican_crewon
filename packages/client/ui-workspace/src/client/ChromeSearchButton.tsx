/** Native sidebar search control using the Workspace browser's shared request. */
import { IconSearchOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ShortcutCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './contract/slots.ts'
import css from './ChromeSearchButton.module.css'

/** Workspace-owned callbacks and shortcut metadata for the native search control. */
export interface ChromeSearchInjected {
  /** Open and focus the existing Session search. */
  requestSearch: () => void
  hooks: { shortcuts: HostObservable<readonly ShortcutCatalogEntry[]> }
}

type ChromeSearchButtonProps = PropsLocale<'workspace'> & InjectFace<ChromeSearchInjected>

/**
 * Open Session search from the sidebar's native window row.
 * @param props - Shared search request, active shortcut catalog, and localized labels.
 * @returns A search button with the effective keyboard shortcut.
 */
export function ChromeSearchButton({ requestSearch, useShortcuts, t }: ChromeSearchButtonProps) {
  const shortcut = useShortcuts(entries => entries.find(entry => entry.id === 'session.search'))
  return <Tooltip label={t('search.sessions.aria')} shortcutKeys={shortcut?.keys} side="bottom" delayMs={500} portal>
    <button type="button" className={css.button} data-sidebar-chrome-search
      aria-label={t('search.sessions.aria')} aria-keyshortcuts={shortcut?.aria}
      onClick={(event) => {
        event.stopPropagation()
        requestSearch()
      }}>
      <IconSearchOutlineRegular size={16} />
    </button>
  </Tooltip>
}
