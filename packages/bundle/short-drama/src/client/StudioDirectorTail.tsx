/** Compact next-action card below the latest Studio reply, backed by native project state. */
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { DramaProduction, SharedGenerationSettings } from '../production-types.ts'
import { StudioServiceSettings } from './StudioServiceSettings.tsx'
import type { DramaProjectId } from '../project-types.ts'
import type { DirectorView, DirectorStage, DirectorProgress } from '../director-model.ts'
import css from './StudioDirectorTail.module.css'

/** Narrow actions keep chat and canvas attached to the same native project. */
export interface DirectorActions {
  read(sessionId: SessionId): Promise<DirectorView | null>
  confirm(sessionId: SessionId, token: string): Promise<DirectorView | null>
  run(projectId: DramaProjectId, stage: DirectorStage, action: DirectorProgress['action'], retry: boolean): Promise<void>
  settings(projectId: DramaProjectId): Promise<{ production: DramaProduction; shared: SharedGenerationSettings }>
  saveSettings(projectId: DramaProjectId, revision: number, settings: DramaProduction['settings'], shared: boolean): Promise<void>
  open(projectId: DramaProjectId): Promise<void>
}
type Props = PropsRuntime<'conversation.chat.turnTail'> & PropsLocale<'shortDrama'> & InjectFace<{ actions: DirectorActions }>
/** @param props - Current turn and scoped project operations. @returns One compact review/continuation card on the newest finished turn. */
export function StudioDirectorTail({ sessionId, turn, useChat, actions, t }: Props) {
  const latest = useChat(value => value.timeline.turnOrder.at(-1))
  const [view, setView] = useState<DirectorView | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [settings, setSettings] = useState<{ production: DramaProduction; shared: SharedGenerationSettings } | null>(null)
  const [configuring, setConfiguring] = useState(false)
  const locked = useRef(false)
  const visible = latest === turn.turn && turn.status === 'closed'
  useEffect(() => {
    if (!visible) return
    let live = true
    void actions.read(sessionId).then((value) => { if (live) { setView(value); setFailed(false) } }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [sessionId, visible, actions])
  if (!visible || !view) return null
  const { stage, action, pending } = view.progress
  const review = ['confirm-direction', 'adopt-script', 'adopt-media'].includes(action)
  const apply = async () => {
    if (locked.current) return
    locked.current = true; setBusy(true); setFailed(false)
    try {
      if (review) {
        const next = await actions.confirm(sessionId, view.token)
        setView(next)
      }
      if (action === 'configure') setSettings(await actions.settings(view.projectId))
      else if (action === 'view') await actions.open(view.projectId)
      else await actions.run(view.projectId, stage, action, view.serviceIssue === true)
    } catch (_error) {
      setFailed(true)
      try { setView(await actions.read(sessionId)) } catch (_readError) { /* Retain the visible review when refresh is unavailable. */ }
    } finally { locked.current = false; setBusy(false) }
  }
  return <section className={css.card} data-studio-stage={stage} aria-busy={busy}>
    <header><span>{t('director')}</span><strong>{t(`directorStage_${stage}`)}</strong>
      <Button size="sm" variant="ghost" onClick={() => { void actions.open(view.projectId).catch(() => { setFailed(true) }) }}>{t('directorCanvas')}</Button>
    </header>
    {stage === 'direction' && view.brief && <><p>{view.brief.idea}</p><div className={css.meta}>
      <span>{view.brief.durationSeconds}{t('directorSeconds')}</span><span>{t('directorStoryReady')}</span>
    </div><details><summary>{t('directorDetails')}</summary><dl>
      <dt>{t('directorStyle')}</dt><dd>{view.brief.style}</dd>
      <dt>{t('directorAudience')}</dt><dd>{view.brief.audience}</dd>
      <dt>{t('directorOutline')}</dt><dd>{view.brief.outline}</dd>
      <dt>{t('directorBackground')}</dt><dd>{view.brief.background}</dd>
      <dt>{t('directorCharacters')}</dt><dd>{view.brief.characters}</dd>
      <dt>{t('directorConflict')}</dt><dd>{view.brief.conflict}</dd>
      {view.brief.assumptions.length > 0 && <>
        <dt>{t('directorAssumptions')}</dt><dd>{view.brief.assumptions.join(' · ')}</dd>
      </>}
    </dl></details></>}
    {view.issues.length > 0 && <ul className={css.issues}>{view.issues.map(issue => <li key={issue.problem}>{issue.problem}
      <details><summary>{t('directorSuggestion')}</summary><p>{issue.suggestion}</p></details></li>)}</ul>}
    {view.assets.length > 0 && <details><summary>{t('directorAssetDefinitions', { count: view.assets.length })}</summary>
      <dl>{view.assets.map(asset => <div key={asset.name}><dt>{asset.name}</dt><dd>{asset.prompt}</dd></div>)}</dl>
    </details>}
    {view.serviceIssue && <p className={css.failure} role="alert">{t('directorServiceIssue')}
      <Button size="sm" onClick={() => { void actions.settings(view.projectId).then(setSettings, () => { setFailed(true) }) }}>
        {t('serviceSettings')}
      </Button></p>}
    {view.script && <details><summary>{t('directorScriptReview')}</summary><pre>{view.script.body}</pre></details>}
    {view.candidates.length > 0 && <div className={css.candidates}>
      {view.candidates.map((candidate, index) => <figure key={candidate.jobId ?? index}>
        {candidate.media?.kind === 'image' ? <img src={candidate.media.url} alt={candidate.name} />
          : candidate.media?.kind === 'video' ? <video controls preload="metadata" src={candidate.media.url} /> : null}
        <figcaption>{candidate.name}</figcaption>
      </figure>)}</div>}
    <footer><span role={failed ? 'alert' : undefined}>{failed ? t('directorFailed')
      : review ? t('directorReviewHint') : pending > 0 ? t('directorPending', { count: pending }) : t('directorHint')}</span>
    <Button size="sm" variant="primary" disabled={busy} onClick={() => { void apply() }}>{t(action === 'continue' && view.serviceIssue ? 'directorRetry'
      : action === 'continue' && stage === 'assets' ? 'directorGenerateAssets'
        : action === 'continue' && stage === 'video' ? 'directorGenerateVideos'
          : action === 'repair' && stage === 'script' ? 'directorRepairScript' : `directorAction_${action}`)}</Button>
    </footer>
    {settings && <StudioServiceSettings production={settings.production} shared={settings.shared} busy={configuring} t={t}
      close={() => { if (!configuring) setSettings(null) }} save={async (value, scope) => {
        setConfiguring(true)
        try {
          await actions.saveSettings(view.projectId, scope === 'shared' ? settings.shared.revision : settings.production.revision,
            value, scope === 'shared')
          setView(await actions.read(sessionId))
          return true
        } catch (_error) { return false } finally { setConfiguring(false) }
      }} />}
  </section>
}
