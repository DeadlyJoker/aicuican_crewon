/** User-authored specialist rosters backed by the current profile settings. */
import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { LaunchState } from './launch.ts'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { type TeamProfile, type TeamSettings } from './templates.ts'
import type {} from './locales.ts'
import type { TeamModeProps } from './TeamHub.tsx'
import css from './TeamTemplates.module.css'
import { AgentAvatar, TeamCard } from './TeamCard.tsx'
import { TeamPageHeader } from './TeamPageHeader.tsx'

import type { CatalogueFace } from './catalogue.ts'
import type { ExpertDefinition } from '../expert-types.ts'
import { TeamProfileFields } from './TeamProfileFields.tsx'
import { normalizeTeamDefinition } from '../team-authoring-types.ts'
import { teamScenarios } from '../team-scenarios.ts'
import type { ExpertPickerActions } from './ExpertPicker.tsx'

interface Face {
  scenarioLanguage?: 'en' | 'zh'
  expertPicker?: ExpertPickerActions
  listExperts(this: void): Promise<{ experts: ExpertDefinition[] }>
  hooks: { teams: SnapshotStore<ConfigFormSnapshot<TeamSettings>>; launch: SnapshotStore<LaunchState> }
  saveProfiles: ConfigForm<TeamSettings>['mutate']
  launchTask(name: string, goal: string, workspaceId: WorkspaceId): Promise<void>
  openCreated(): void
}

type Props = TeamModeProps & PropsLocale<'expertTeamTemplates'> & InjectFace<Face & CatalogueFace>
interface Draft {
  original: string | undefined
  name: string
  profile: TeamProfile
  revision: number | undefined
}

function UseTeam({ name, t, workspaces, launch, launchTask, openCreated }: {
  name: string
  t: Props['t']
  workspaces: readonly WorkspaceView[]
  launch: LaunchState
  launchTask: Face['launchTask']
  openCreated: Face['openCreated']
}) {
  const [goal, setGoal] = useState('')
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>()
  const workspace = selectedWorkspace === undefined
    ? workspaces[0]
    : workspaces.find(item => item.workspaceId === selectedWorkspace)
  const disabled = launch.pending || launch.sessionId !== undefined
  return <form className={css.use} onSubmit={(event) => {
    event.preventDefault()
    if (workspace && goal.trim() && !disabled) void launchTask(name, goal.trim(), workspace.workspaceId)
  }}>
    <label>{t('workspace')}
      <select value={workspace?.workspaceId ?? ''} disabled={disabled}
        onChange={(event) => { setSelectedWorkspace(event.target.value) }}>
        {workspaces.map(item => <option key={item.workspaceId} value={item.workspaceId}>{item.title}</option>)}
      </select>
    </label>
    {!workspace && <p role="status">{t('workspaceRequired')}</p>}
    <label>{t('goal')}
      <textarea value={goal} disabled={disabled}
        onChange={(event) => { setGoal(event.target.value) }} rows={3} />
    </label>
    <Button type="submit" variant="primary" disabled={disabled || !workspace || !goal.trim()}>
      {t(launch.pending ? 'launching' : 'launch')}
    </Button>
    <p className={css.help}>{t('instruction')}</p>
    {launch.failure && <div role="alert">
      <p>{t('launchFailed')}{launch.failure === 'agent-teams/unavailable' ? t('commandUnavailable') : launch.failure}</p>
      {launch.sessionId && <Button onClick={openCreated}>{t('openCreated')}</Button>}
    </div>}
  </form>
}

/**
 * Render saved profiles, an explicit member editor, and reusable task commands.
 * @param props - Host-backed form state, locale, and revision-fenced writes.
 * @returns The template management surface on the Teams page.
 */
export function TeamTemplates(props: Props) {
  const { t } = props
  const revision = props.useCatalogue(value => value)
  const [experts, setExperts] = useState<ExpertDefinition[]>([])
  useEffect(() => { let active = true; props.listExperts().then((value) => { if (active) setExperts(value.experts) }).catch(() => { if (active) setError('failure') }); return () => { active = false } }, [props.listExperts, revision])
  const state = props.useTeams(value => value)
  const launch = props.useLaunch(value => value)
  const workspaces = props.useWorkspaces(value => value.items)
  const profiles = state.value?.profiles ?? {}
  const memberLimit = state.value?.maxMembers ?? 0
  const [draft, setDraft] = useState<Draft>()
  const [busy, setBusy] = useState(false)
  const [pickerPending, setPickerPending] = useState(false)
  const [error, setError] = useState<'invalid' | 'duplicate' | 'failure'>()
  const [using, setUsing] = useState<string>()
  const [deleting, setDeleting] = useState<string>()
  if (state.status !== 'ready') return <>
    <TeamPageHeader navigation={props.navigation} />
    <p>{t(state.status === 'loading' ? 'loading' : 'unavailable')}</p>
  </>
  const edit = (name?: string) => {
    setError(undefined)
    const profile = name === undefined ? undefined : profiles[name]
    const members = profile?.members ?? [{ name: '', role: '', executionPrompt: '' }]
    setDraft({
      original: name, name: name ?? '', revision: state.revision,
      profile: profile === undefined
        ? { description: '', taskPlanning: 'captain', members }
        : structuredClone(profile),
    })
  }
  const save = async () => {
    if (!draft || busy || pickerPending) return
    const name = draft.name.trim()
    let profile: TeamProfile
    try { profile = normalizeTeamDefinition({ name, profile: draft.profile }, memberLimit).profile }
    catch (_error) { setError('invalid'); return }
    if (name !== draft.original && Object.hasOwn(profiles, name)) {
      setError('duplicate')
      return
    }
    setBusy(true)
    setError(undefined)
    const retained = Object.fromEntries(Object.entries(profiles).filter(([key]) => key !== draft.original))
    const next = { ...retained, [name]: profile }
    try {
      if (await props.saveProfiles([{ op: 'set', path: ['profiles'], value: next }], draft.revision)) setDraft(undefined)
      else setError('failure')
    } catch (_error) {
      // The rejected write leaves the visible draft available for correction.
      setError('failure')
    } finally {
      setBusy(false)
    }
  }
  const remove = async (name: string) => {
    setBusy(true)
    setError(undefined)
    const next = Object.fromEntries(Object.entries(profiles).filter(([key]) => key !== name))
    try {
      if (await props.saveProfiles([{ op: 'set', path: ['profiles'], value: next }], state.revision)) {
        setDeleting(undefined)
        if (using === name) setUsing(undefined)
      } else setError('failure')
    } catch (_error) {
      // The rejected write leaves the visible draft available for correction.
      setError('failure')
    } finally {
      setBusy(false)
    }
  }
  return <section className={css.root} aria-label={t('title')}>
    <TeamPageHeader navigation={props.navigation} create={{ label: t('create'),
      disabled: !state.writable || busy || Boolean(draft) || Object.keys(profiles).length >= 16,
      onClick: () => { edit() },
    }} />
    <p className={css.description}>{t('description')}</p>
    {!state.writable && <p>{t('readonly')}</p>}
    {error && <p role="alert" className={css.error}>{t(error)}</p>}
    {draft ? <form className={css.editor} onSubmit={(event) => { event.preventDefault(); void save() }}>
      <TeamProfileFields value={{ name: draft.name, profile: draft.profile }}
        onChange={(value) => { setDraft({ ...draft, name: value.name, profile: value.profile }) }}
        {...(props.expertPicker === undefined ? {} : { expertPicker: props.expertPicker })}
        onPendingChange={setPickerPending}
        experts={experts} maxMembers={memberLimit} disabled={busy || !state.writable} t={t} />
      <footer className={css.actions}>
        <Button type="submit" variant="primary" disabled={busy || pickerPending || !state.writable}>{t(busy ? 'saving' : 'save')}</Button>

        <Button disabled={busy || pickerPending}
          onClick={() => {
            setDraft(undefined)
            setError(undefined)
          }}>{t('cancel')}</Button></footer>
    </form> : <div className={css.list}>
      {Object.keys(profiles).length === 0 && <p className={css.help}>{t('empty')}</p>}
      {Object.entries(profiles).map(([name, profile]) => <TeamCard key={name} title={name}
        description={profile.description} mode="experts"
        actions={[
          { kind: 'run', label: t('use'), disabled: busy, expanded: using === name,
            onClick: () => { setUsing(using === name ? undefined : name) } },
          { kind: 'edit', label: t('edit'), disabled: busy || !state.writable, onClick: () => { edit(name) } },
          { kind: 'delete', label: t('remove'), disabled: busy || !state.writable, onClick: () => { setDeleting(name) } },
        ]}
        footer={<><div className={css.avatars}>{profile.members.slice(0, 5).map((member, index) =>
          <AgentAvatar key={member.name} index={index} label={member.name + (member.role ? ' · ' + member.role : '')} />)}</div>
        <span>{t('memberCount', { count: profile.members.length })}</span></>}>
        {deleting === name && <div role="group" aria-label={t('deleteConfirm')}><p>{t('deleteConfirm')}</p>

          <Button disabled={busy}
            onClick={() => { void remove(name) }}>{t('confirmDelete')}</Button>

          <Button disabled={busy}
            onClick={() => { setDeleting(undefined) }}>{t('cancelDelete')}</Button></div>}
        {using === name && <UseTeam name={name} t={t} workspaces={workspaces} launch={launch}
          launchTask={props.launchTask} openCreated={props.openCreated} />}
      </TeamCard>)}
    </div>}
    {!draft && <>
      <h3>{t('starterTeams')}</h3>
      <div className={css.list}>{teamScenarios(props.scenarioLanguage === 'zh').map(scenario => <TeamCard key={scenario.id}
        title={scenario.name} description={scenario.profile.description} mode="experts"
        actions={[{ kind: 'edit', label: t('useTemplate'), disabled: busy || !state.writable,
          onClick: () => { setError(undefined); setDraft({ original: undefined, name: scenario.name,
            profile: structuredClone(scenario.profile), revision: state.revision }) } }]}
        footer={<span>{t('memberCount', { count: scenario.profile.members.length })}</span>} />)}</div>
    </>}
  </section>
}
