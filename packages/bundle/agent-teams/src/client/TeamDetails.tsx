/** Session-bound office and workflow context in the existing right sidebar. */
import { useEffect, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { Button, MarkdownText, StateDot, Tooltip, IconBranchOutlineRegular, IconUsersOutlineRegular, IconChevronDownOutlineRegular, IconSettingsOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { Office, OfficeDiscussion } from '../office-types.ts'
import type { WorkflowHistory, WorkflowHistoryCursor, WorkflowHistoryPage, WorkflowTrace } from '../workflow-types.ts'
import type { CatalogueFace } from './catalogue.ts'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { TeamManagementTarget } from './team-management.ts'
import { AgentAvatar } from './TeamCard.tsx'
import { en, zh } from './team-details-copy.ts'
import css from './TeamDetails.module.css'
import { WorkflowRunHistory } from './WorkflowRunHistory.tsx'
import { WorkflowEditDialog, type WorkflowEditActions } from './WorkflowEditDialog.tsx'
import { OfficeSettingsDialog, type OfficeSettingsActions } from './OfficeSettingsDialog.tsx'

/** Session-owned team detail categories. */
export type TeamDetailsMode = 'office' | 'workflow'

/** Existing domain reads and management navigation used by session details. */
export interface TeamDetailsActions {
  readOffice(this: void, sessionId: SessionId): Promise<OfficeDiscussion | null>
  readWorkflow(this: void, sessionId: SessionId): Promise<WorkflowHistory | null>
  readWorkflowTrace(this: void, sessionId: SessionId): Promise<WorkflowTrace | null>
  readWorkflowHistory(this: void, workflowId: string, before?: WorkflowHistoryCursor): Promise<WorkflowHistoryPage>
  workflowEditor: WorkflowEditActions
  officeSettings: OfficeSettingsActions
  openManagement(this: void, target: TeamManagementTarget): void
}

interface HeaderActions extends TeamDetailsActions {
  openDetails(mode: TeamDetailsMode): void
}
type HeaderProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<'teamDetails'> & InjectFace<{ actions: HeaderActions } & CatalogueFace>

/** Reveal context only for conversations owned by an office or workflow run. */
export function TeamDetailsButton({ sessionId, useSession, actions, t, useCatalogue }: HeaderProps) {
  const revision = useCatalogue(value => value)
  const running = useSession(state => state.running)
  const [selection, setSelection] = useState<{ sessionId: SessionId; mode: TeamDetailsMode }>()
  useEffect(() => {
    let alive = true
    void Promise.all([actions.readOffice(sessionId), actions.readWorkflow(sessionId)]).then(([office, workflow]) => {
      const mode = office ? 'office' : workflow ? 'workflow' : undefined
      if (alive) setSelection(mode ? { sessionId, mode } : undefined)
    }, () => { if (alive) setSelection(undefined) })
    return () => { alive = false }
  }, [actions, sessionId, running, revision])
  if (selection?.sessionId !== sessionId) return null
  const mode = selection.mode
  return <Button size="sm" className={css.trigger} onClick={() => { actions.openDetails(mode) }}>
    {mode === 'office' ? <IconUsersOutlineRegular size={14} /> : <IconBranchOutlineRegular size={14} />}
    <span>{t(mode === 'office' ? 'viewOffice' : 'viewWorkflow')}</span>
  </Button>
}

type PanelProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'teamDetails'> & InjectFace<{
  mode: TeamDetailsMode
  actions: TeamDetailsActions
} & CatalogueFace>

type DetailsSnapshot =
  | { sessionId: SessionId; mode: 'office'; office: OfficeDiscussion | null }
  | { sessionId: SessionId; mode: 'workflow'; workflow: WorkflowHistory | null; trace: WorkflowTrace | null }

type EditingTarget =
  | { sessionId: SessionId; kind: 'office'; office: Office }
  | { sessionId: SessionId; kind: 'workflow'; workflowId: string }

function statusLabel(t: PanelProps['t'], value: string): string {
  switch (value) {
    case 'preparing': case 'running': return t('working')
    case 'pending': return t('pending')
    case 'delivering': return t('delivering')
    case 'delivered': return t('delivered')
    case 'completed': return t('completed')
    case 'rejected': return t('rejected')
    case 'failed': return t('failed')
    case 'interrupted': return t('interrupted')
    case 'cancelled': return t('cancelled')
    case 'idle': return t('idle')
    case 'notRun': return t('notRun')
    default: return t('queued')
  }
}

function statusTone(value: string): StateDotState {
  switch (value) {
    case 'preparing': case 'running': case 'delivering': return 'ongoing'
    case 'pending': return 'warning'
    case 'delivered': case 'completed': return 'done'
    case 'failed': case 'interrupted': case 'rejected': return 'error'
    default: return 'idle'
  }
}

interface StepRow {
  id: string
  name: string
  instruction: string | undefined
  preset: string | undefined
  dependencies: string[] | undefined
  state: string
  output: string | undefined
  approval: boolean
}

function runSteps(workflow: WorkflowHistory, trace: WorkflowTrace | null, t: PanelProps['t']): StepRow[] {
  if (trace?.steps) return trace.steps.map((step) => {
    const node = trace.nodes.filter(item => item.phase === step.id).at(-1)
    let state = trace.completedSteps?.includes(step.id) ? 'completed' : node?.state ?? 'queued'
    if (trace.pendingApprovalId === step.id) state = workflow.status === 'rejected' ? 'rejected' : 'pending'
    if (workflow.status === 'delivered') state = 'completed'
    if (state === 'queued' && ['failed', 'interrupted', 'rejected'].includes(workflow.status)) state = 'notRun'
    return { id: step.id, name: step.name, instruction: step.instruction, preset: step.agentPreset,
      dependencies: step.dependsOn.map(id => trace.steps?.find(item => item.id === id)?.name ?? id),
      state, output: workflow.stepOutputs?.[step.id], approval: step.kind === 'approval' }
  })
  return trace?.nodes.map((node) => {
    let output: string | undefined
    let name = node.label
    if (node.phase === 'Draft') output = workflow.draft
    if (node.phase === 'Delivery') output = workflow.delivery
    if (node.label === 'Reviewer 1') { name = t('reviewOne'); output = workflow.reviews?.[0] }
    if (node.label === 'Reviewer 2') { name = t('reviewTwo'); output = workflow.reviews?.[1] }
    if (node.label === 'Draft') name = t('draftStep')
    if (node.label === 'Delivery') name = t('deliveryStep')
    return { id: node.id, name, instruction: undefined, preset: t('presetNotRecorded'),
      dependencies: undefined, state: node.state, output, approval: false }
  }) ?? []
}

/** Show the current office or the immutable definition captured by this workflow run. */
export function TeamDetailsPanel({ sessionId, useTabInfo, useSession, mode, actions, t, useCatalogue }: PanelProps) {
  const revision = useCatalogue(value => value)
  const visible = useTabInfo().tab.visible
  const running = useSession(state => state.running)
  const [snapshot, setSnapshot] = useState<DetailsSnapshot>()
  const [failure, setFailure] = useState<{ sessionId: SessionId; mode: TeamDetailsMode }>()
  const [retry, setRetry] = useState(0)
  const [historySession, setHistorySession] = useState<SessionId>()
  const [editor, setEditor] = useState<EditingTarget>()
  useEffect(() => { setHistorySession(undefined); setEditor(undefined) }, [sessionId, mode])
  useEffect(() => {
    if (!visible) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        if (mode === 'office') {
          const record = await actions.readOffice(sessionId)
          if (!alive) return
          setSnapshot({ sessionId, mode, office: record })
          if (record) timer = setTimeout(() => { void load() }, 2000)
        } else {
          const [record, execution] = await Promise.all([actions.readWorkflow(sessionId), actions.readWorkflowTrace(sessionId)])
          if (!alive) return
          setSnapshot({ sessionId, mode, workflow: record, trace: execution })
          if (record && ['preparing', 'pending', 'delivering'].includes(record.status)) timer = setTimeout(() => { void load() }, 2000)
        }
        setFailure(undefined)
      } catch { if (alive) setFailure({ sessionId, mode }) }
    }
    void load()
    return () => { alive = false; clearTimeout(timer) }
  }, [actions, mode, sessionId, visible, running, retry, revision])
  const current = snapshot?.sessionId === sessionId && snapshot.mode === mode ? snapshot : undefined
  const failed = failure?.sessionId === sessionId && failure.mode === mode
  const error = failed && <div className={css.notice} role="alert"><span>{t('loadFailed')}</span>
    <Button size="sm" onClick={() => { setRetry(value => value + 1) }}>{t('retry')}</Button></div>
  if (!current) return error || <div className={css.loading} role="status" aria-label={t('loading')}><StateDot state="ongoing" size={20} /></div>
  if (current.mode === 'office') {
    const office = current.office
    if (office === null) return <p className={css.notice}>{t('unavailable')}</p>
    const leader = office.office.members.find(member => member.id === office.office.leaderId)
    const active = office.messages.filter(message => message.status === 'running').length
    return <section className={css.panel} data-team-details="office">
      <header className={css.heading}><div><span className={css.eyebrow}>{t('office')}</span><h3>{office.office.name}</h3></div>
        <Tooltip label={t('setLeader')} portal><Button size="sm" aria-label={t('setLeader')} className={css.iconButton}
          onClick={() => { setEditor({ sessionId, kind: 'office', office: office.office }) }}><IconSettingsOutlineRegular size={16} /></Button></Tooltip>
      </header>
      {error}
      {office.office.description && <p className={css.description}>{office.office.description}</p>}
      <div className={css.context}>
        <span className={css.meta}>{office.scope?.projectName ?? t('lobby')}</span>
        {office.scope && <strong>{office.scope.title}</strong>}
        <span className={css.routing}>{leader ? `${t('coordinatedBy')} ${leader.name}` : t('directRouting')}</span>
      </div>
      <div className={css.summary}><span>{office.office.members.length} {t('memberCount')}</span>
        <span className={css.status}><StateDot state={active ? 'ongoing' : 'idle'} />{active ? `${active} ${t('activeCount')}` : t('allIdle')}</span></div>
      <section className={css.section}><h4>{t('members')} <span>{office.office.members.length}</span></h4>
        <ul className={css.members}>{office.office.members.map((member, index) => {
          const message = office.messages.filter(item => item.memberId === member.id).at(-1)
          const runningMessage = office.messages.some(item => item.memberId === member.id && item.status === 'running')
          const lastFailed = message?.status === 'failed' || message?.status === 'interrupted'
          const state = runningMessage ? 'running' : lastFailed ? message.status : 'idle'
          return <li key={member.id}><details className={css.disclosure}>
            <summary><AgentAvatar label={member.name} index={index} />
              <div className={css.person}><strong>{member.name}{office.office.leaderId === member.id && <small className={css.badge} data-office-leader="">{t('leader')}</small>}</strong>
                <span>{member.role}</span></div>
              <span className={css.status}><StateDot state={statusTone(state)} /><small>{statusLabel(t, state)}</small></span>
              <IconChevronDownOutlineRegular className={css.chevron} size={14} />
            </summary>
            <div className={css.detailBody}>
              <div className={css.fact}><span>{t('agentPreset')}</span><strong>{member.agentPreset ?? t('inheritPreset')}</strong></div>
              <div className={css.field}><h5>{t('responsibility')}</h5><p>{member.instruction}</p></div>
              {message && <div className={css.field}><h5>{t('latestTask')} · {statusLabel(t, message.status)}</h5><p>{message.text}</p>
                {message.requestedBy && <span className={css.meta}>{t('assignedBy')} {office.office.members.find(item => item.id === message.requestedBy)?.name ?? t('leader')}</span>}
              </div>}
              {message?.topicDeliveryError && <p className={css.deliveryWarning}>{t('deliveryPending')}</p>}
            </div>
          </details></li>
        })}</ul>
      </section>
      <footer className={css.actions}><Button size="sm" onClick={() => { actions.openManagement({ kind: 'office', officeId: office.office.id,
        view: 'projects', ...(office.scope ? { projectId: office.scope.projectId } : {}) }) }}>{t('openProjects')}</Button></footer>
      {editor?.kind === 'office' && editor.sessionId === sessionId && <OfficeSettingsDialog key={`${sessionId}:${editor.office.id}`}
        office={editor.office} actions={actions.officeSettings}
        close={() => { setEditor(value => value === editor ? undefined : value) }}
        saved={() => { setEditor(value => value === editor ? undefined : value); setRetry(value => value + 1) }} />}
    </section>
  }
  const { workflow, trace } = current
  if (workflow === null) return <p className={css.notice}>{t('unavailable')}</p>
  const workflowId = workflow.workflowId
  const steps = runSteps(workflow, trace, t)
  const completePlan = trace?.steps?.every(step => step.kind !== undefined) === true
  const completed = steps.filter(step => step.state === 'completed').length
  const activeSteps = steps.filter(step => step.state === 'running' || step.state === 'pending')
  const labels = { code: { copyLabel: t('copy'), copiedLabel: t('copied') }, footnotes: t('footnotes') }
  return <section className={css.panel} data-team-details="workflow">
    <header className={css.heading}><div><span className={css.eyebrow}>{t('thisRun')}</span><h3>{workflow.name}</h3></div>
      {workflowId && <Tooltip label={t('editWorkflow')} portal><Button size="sm" aria-label={t('editWorkflow')} className={css.iconButton}
        onClick={() => { setEditor({ sessionId, kind: 'workflow', workflowId }) }}><IconSettingsOutlineRegular size={16} /></Button></Tooltip>}
    </header>
    {error}
    <div className={css.runMeta}>
      <span className={css.status}><StateDot state={statusTone(workflow.status)} />{statusLabel(t, workflow.status)}</span>
      <time className={css.meta} dateTime={new Date(workflow.createdAt).toISOString()}>
        {new Date(workflow.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</time></div>
    {completePlan && steps.length > 0 && <div className={css.progress}><div><span>{t('progress')}</span><span>{completed} / {steps.length}</span></div>
      <progress value={completed} max={steps.length} aria-label={t('progress')} />
      {activeSteps.length > 0 && <p>{activeSteps.map(step => step.name).join(' · ')}</p>}
    </div>}
    {!completePlan && <p className={css.hint}>{t('completedAgents')} {completed}</p>}
    <details className={css.input}><summary>{t('input')}<IconChevronDownOutlineRegular className={css.chevron} size={14} /></summary><p>{workflow.input}</p></details>
    <section className={css.section}><h4>{t(completePlan ? 'steps' : 'agentExecutions')} <span>{steps.length}</span></h4>
      <ol className={css.steps}>{steps.map(step => <li key={step.id}>
        <details className={css.disclosure}><summary>
          <StateDot state={statusTone(step.state)} appearance="step" size={16} />
          <div className={css.person}><strong>{step.name}</strong><span>{step.approval ? t('humanApproval') : step.preset ?? t('inheritPreset')}</span></div>
          <small>{statusLabel(t, step.state)}</small><IconChevronDownOutlineRegular className={css.chevron} size={14} />
        </summary>
        <div className={css.detailBody}>
          {step.instruction && <div className={css.field}><h5>{t('workContent')}</h5><p>{step.instruction}</p></div>}
          <div className={css.field}><h5>{t('dependencies')}</h5>
            <p>{step.dependencies?.join(' · ') || t(step.dependencies ? 'noDependencies' : 'dependenciesNotRecorded')}</p></div>
          {step.output && <div className={css.field}><h5>{t('result')}</h5><div className={css.output}><MarkdownText omitHtml labels={labels} text={step.output} /></div></div>}
        </div>
        </details>
      </li>)}</ol>
    </section>
    <p className={css.hint}>{t('traceHint')}</p>
    {workflowId && <footer className={css.actions}><Button size="sm"
      onClick={() => { setHistorySession(sessionId) }}>{t('runHistory')}</Button></footer>}
    {workflowId && historySession === sessionId && <WorkflowRunHistory key={`${workflowId}:${sessionId}`}
      workflowId={workflowId} name={workflow.name} currentSessionId={sessionId} read={actions.readWorkflowHistory} revision={revision}
      close={() => { setHistorySession(undefined) }} t={t} />}
    {editor?.kind === 'workflow' && editor.sessionId === sessionId && <WorkflowEditDialog key={`${sessionId}:${editor.workflowId}`}
      workflowId={editor.workflowId} actions={actions.workflowEditor}
      close={() => { setEditor(value => value === editor ? undefined : value) }} />}
  </section>
}

/** Register session utilities and two ordinary right-sidebar page types. */
export function registerTeamDetails(ctx: Context, actions: TeamDetailsActions, catalogue: SnapshotStore<number>): void {
  ctx.effect(() => ctx.locale.register('teamDetails', { en, zh }), 'team details dictionaries')
  const t = ctx.locale.bind('teamDetails')
  const kinds = { office: 'team-office-details', workflow: 'team-workflow-details' } as const
  const headerActions: HeaderActions = { ...actions, openDetails: (mode) => { ctx.sidebarRight.openTab(kinds[mode]) } }
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities', id: 'team-details', locale: 'teamDetails',
    inject: () => ({ actions: headerActions, hooks: { catalogue } }),
  }, TeamDetailsButton))
  for (const mode of ['office', 'workflow'] as const) {
    const id = `@deepseek-ai/dsh-agent-teams-bundle/${mode}-details`
    ctx.effect(() => ctx.sidebarRightTabs.register({ id, kind: kinds[mode], priority: 'builtin',
      title: () => t(mode === 'office' ? 'office' : 'workflow'),
    }), `team ${mode} details page`)
    ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab', key: id, locale: 'teamDetails', inject: () => ({ mode, actions, hooks: { catalogue } }),
    }, TeamDetailsPanel))
  }
}
