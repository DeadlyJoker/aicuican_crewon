/** Shared Teams page heading, navigation and mode-owned creation action. */
import { Button, IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TeamMode } from './TeamHub.tsx'
import css from './TeamPageHeader.module.css'

/** Localized navigation passed by the Teams slot owner. */
export interface TeamNavigation {
  title: string
  labels: Record<TeamMode, string>
  mode: TeamMode
  selectMode(this: void, mode: TeamMode): void
}

/**
 * Render the page title and active mode's creation control above its navigation.
 * @param props - Localized navigation and optional creation action.
 * @returns The shared Teams page header.
 */
export function TeamPageHeader({ navigation, create }: {
  navigation: TeamNavigation
  create?: { label: string; disabled: boolean; onClick(this: void): void }
}) {
  return <header data-team-mode-header="">
    <div className={css.heading}>
      <h1>{navigation.title}</h1>
      {create && <Button variant="primary" size="sm" className={css.create} data-team-create=""
        disabled={create.disabled} onClick={create.onClick}>
        <IconPlusOutlineRegular size={13} />{create.label}
      </Button>}
    </div>
    <nav className={css.tabs} aria-label={navigation.title}>
      {(['specialists', 'experts', 'offices', 'workflows'] as const).map(value => <Button size="sm" className={css.tab}
        key={value} aria-pressed={navigation.mode === value}
        onClick={() => { navigation.selectMode(value) }}>{navigation.labels[value]}</Button>)}
    </nav>
  </header>
}
