/** Shared Teams entry with mode-owned configuration pages. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from './locales.ts'
import css from './TeamHub.module.css'
import cards from './TeamTemplates.module.css'
import { TeamCard } from './TeamCard.tsx'
import { TeamPageHeader, type TeamNavigation } from './TeamPageHeader.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Configuration content owned by one team mode. */
    'teams.mode': { kind: 'keyed'; scope: 'root'; owner: { navigation: TeamNavigation } }
  }
}
/** Team category selected by catalogue and contextual management navigation. */
export type TeamMode = 'experts' | 'offices' | 'workflows' | 'specialists'
/** Owner navigation and standard runtime props for a Teams mode entry. */
export type TeamModeProps = PropsRuntime<'teams.mode'>
type Props = PropsRuntime<'main'> & PropsLocale<'expertTeamTemplates'> & PropsRenderSlots<'teams.mode'> & InjectFace<{ hooks: { teamMode: SnapshotStore<TeamMode> }; selectMode(mode: TeamMode): void }>

/**
 * Render the shared Teams page with independent mode configuration.
 * @param props - Locale and mode page renderers.
 * @returns The Teams page.
 */
export function TeamHub({ t, renderSlot, useTeamMode, selectMode }: Props) {
  const mode = useTeamMode(value => value)
  const navigation: TeamNavigation = {
    title: t('teamsPage'), mode, selectMode,
    labels: { specialists: t('specialists'), experts: t('experts'), offices: t('offices'), workflows: t('workflows') },
  }
  return <main className={css.hub} data-team-page="">
    <div className={css.content}>
      {renderSlot('teams.mode', { navigation }, {
        entryKey: mode,
        fallback: <>
          <TeamPageHeader navigation={navigation} />
          {(mode === 'offices' || mode === 'workflows') && <div className={cards.list}>
            <TeamCard title={t(mode)} mode={mode} description={t(mode === 'offices' ? 'officesDescription' : 'workflowsDescription')}
              footer={<span>{t('integrationPending')}</span>} />
          </div>}
        </>,
      })}
    </div>
  </main>
}
