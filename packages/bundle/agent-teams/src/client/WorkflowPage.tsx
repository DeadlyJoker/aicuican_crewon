/** Teams workflow library and conversation approval surfaces. */
import { useEffect, useRef, useState } from 'react'
import { Button, MarkdownText, Modal, Tooltip, IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { WorkflowDefinition, WorkflowDraft, WorkflowHistory, WorkflowLibrary } from '../workflow-types.ts'
import type { TeamManagementNavigation, TeamManagementTarget } from './team-management.ts'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from './workflow-copy.ts'
import type { TeamModeProps } from './TeamHub.tsx'
import css from './WorkflowPage.module.css'
import { AgentAvatar, TeamCard } from './TeamCard.tsx'
import type { CatalogueFace } from './catalogue.ts'
import { TeamPageHeader } from './TeamPageHeader.tsx'
import { WorkflowEditor } from './WorkflowEditor.tsx'
import { editableWorkflowSteps } from './workflow-editing.ts'
import type { ExpertPickerActions } from './ExpertPicker.tsx'

interface LibraryActions {
  expertPicker?: ExpertPickerActions
  presets(this: void): Promise<readonly { id: string; name?: string; broken?: string }[]>
  list(this: void): Promise<WorkflowLibrary>
  save(this: void, draft: WorkflowDraft, id?: string): Promise<void>
  run(this: void, id: string, name: string, input: string, workspaceId: WorkspaceId): Promise<void>
  open(this: void, sessionId: SessionId): void
}

interface ApprovalActions {
  read(this: void, sessionId: SessionId): Promise<WorkflowHistory | null>
  decide(this: void, sessionId: SessionId, decision: 'approve' | 'reject', approvalId?: string): Promise<void>
}

type PageProps = TeamModeProps & PropsLocale<'teamWorkflow'> & InjectFace<LibraryActions & TeamManagementNavigation & CatalogueFace>
type WorkflowManagementTarget = Extract<TeamManagementTarget, { kind: 'workflow' }>
type ApprovalProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'teamWorkflow'> & InjectFace<ApprovalActions>
const blank: WorkflowDraft = { name: '', description: '', draft: '', review: '', secondReview: '', delivery: '' }

/** Render the saved library, editor and run history.
 * @param props - Workflow operations and current workspaces.
 * @returns The workflow mode page.
 */
export function WorkflowPage({ t, navigation, useWorkspaces, list, save, run, open, presets, expertPicker,
  useManagement, consumeManagement, useCatalogue }: PageProps) {
  const revision = useCatalogue(value => value)
  const management = useManagement(value => value)
  const workspaces = useWorkspaces(state => state.items)
  const [library, setLibrary] = useState<WorkflowLibrary>()
  const [agentPresets, setAgentPresets] = useState<Awaited<ReturnType<LibraryActions['presets']>>>([])
  const [presetError, setPresetError] = useState(false)
  const [draft, setDraft] = useState<WorkflowDraft>()
  const [editingId, setEditingId] = useState<string>()
  const editing = draft !== undefined
  useEffect(() => {
    if (!editing) return
    let active = true
    setPresetError(false)
    void presets().then(
      (rows) => { if (active) setAgentPresets(rows) },
      () => { if (active) setPresetError(true) },
    )
    return () => { active = false }
  }, [editing, presets, revision])
  const [expandedHistory, setExpandedHistory] = useState<string>()
  const [selected, select] = useState<string>()
  const [input, setInput] = useState('')
  const [workspaceId, setWorkspace] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [targetMissing, setTargetMissing] = useState(false)
  const [pendingManagement, setPendingManagement] = useState<{
    target: WorkflowManagementTarget
    definition: WorkflowDefinition
  }>()
  const [focusHistory, setFocusHistory] = useState<string>()
  const historyRef = useRef<HTMLDivElement>(null)
  const handledManagement = useRef<TeamManagementTarget | undefined>(undefined)
  const locked = useRef(false)
  const workspace = workspaces.find(item => item.workspaceId === workspaceId) ?? workspaces[0]
  const reload = async () => {
    try {
      setLibrary(await list())
      setError(false)
    } catch {
      setError(true)
    }
  }
  useEffect(() => {
    let active = true
    void list().then((value) => { if (active) setLibrary(value) }, () => { if (active) setError(true) })
    return () => { active = false }
  }, [list, revision])
  const openTarget = (target: WorkflowManagementTarget, definition: WorkflowDefinition) => {
    setPendingManagement(undefined)
    setTargetMissing(false)
    select(undefined)
    setInput('')
    if (target.view === 'edit') {
      const { id, ...fields } = definition
      setEditingId(id)
      setDraft({ ...fields, steps: editableWorkflowSteps(fields, t) })
    } else {
      setDraft(undefined)
      setExpandedHistory(definition.id)
      setFocusHistory(definition.id)
    }
  }
  useEffect(() => {
    if (management?.kind !== 'workflow' || !library || handledManagement.current === management) return
    handledManagement.current = management
    const definition = library.definitions.find(item => item.id === management.workflowId)
    if (!definition) setTargetMissing(true)
    else if (management.view === 'edit' && editingId === definition.id && draft) setTargetMissing(false)
    else if (draft || (selected && input.trim()) || busy) setPendingManagement({ target: management, definition })
    else openTarget(management, definition)
    consumeManagement(management)
  }, [management, library, editingId, draft, selected, input, busy, consumeManagement])
  useEffect(() => {
    if (!focusHistory || expandedHistory !== focusHistory) return
    historyRef.current?.scrollIntoView({ block: 'nearest' })
    historyRef.current?.focus({ preventScroll: true })
    setFocusHistory(undefined)
  }, [focusHistory, expandedHistory])
  async function action(operation: () => Promise<void>) {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError(false)
    try {
      await operation()
      await reload()
    } catch {
      setError(true)
    } finally {
      locked.current = false
      setBusy(false)
    }
  }

  const historyRows = (runs: WorkflowHistory[]) => runs.length ? runs.map(item =>
    <div key={item.sessionId} className={css.row}>
      <div><p className={css.truncate}>{item.input}</p></div>
      <time dateTime={new Date(item.createdAt).toISOString()}>{new Date(item.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</time>
      <span className={css.status} data-status={item.status}>{t(item.status)}</span>
      <Tooltip label={t('open')} side="top" portal>
        <Button size="sm" aria-label={t('open')} onClick={() => { open(item.sessionId) }}><IconChevronRightOutlineRegular size={16} /></Button>
      </Tooltip>
    </div>) : <p>{t('noRuns')}</p>

  return <div className={css.page}>
    <TeamPageHeader navigation={navigation} create={{ label: t('create'), disabled: busy || editing,
      onClick: () => { select(undefined); setEditingId(undefined); setDraft({ ...blank, steps: [{ id: randomUUID(), kind: 'agent', name: '', instruction: '', stage: 'prepare', dependsOn: [] }] }) },
    }} />
    <p className={css.description}>{t('intro')}</p>
    {error && <div className={css.notice} role="alert">{t('failure')} <Button onClick={() => { void reload() }}>{t('retry')}</Button></div>}
    {targetMissing && <p className={css.notice} role="alert">{t('managementMissing')}</p>}
    {draft && <WorkflowEditor key={editingId ?? 'new'} draft={draft} editing={editingId !== undefined} busy={busy} failed={error}
      presetsFailed={presetError} presets={agentPresets} {...expertPicker ? { expertPicker } : {}} t={t} change={setDraft}
      close={() =>{  setDraft(undefined) }}
      save={() => { void action(async () => { await save(draft, editingId); setDraft(undefined) }) }} />}
    <section className={css.section}>
      {!library && !error && <p role="status">{t('loading')}</p>}
      {library?.definitions.length === 0 && <p className={css.empty}>{t('empty')}</p>}
      {library?.definitions.map(item => <TeamCard key={item.id} title={item.name} description={item.description} mode="workflows"
        actions={[
          { kind: 'run', label: t('run'), disabled: busy || editing, expanded: selected === item.id,
            onClick: () => { select(selected === item.id ? undefined : item.id); setInput('') } },
          { kind: 'settings', label: t('settings'), disabled: busy || editing, onClick: () => {
            const { id, ...fields } = item
            select(undefined)
            setEditingId(id)
            setDraft({ ...fields, steps: editableWorkflowSteps(fields, t) })
          } },
          { kind: 'history', label: t('history'), expanded: expandedHistory === item.id,
            onClick: () =>{  setExpandedHistory(expandedHistory === item.id ? undefined : item.id) } },
        ]}
        footer={<><div className={css.avatars}>
          {(item.steps?.filter(step => step.kind !== 'approval').slice(0, 4)
            ?? [{ id: 'draft', name: t('draftStep') }, { id: 'review', name: t('reviewStep') }])
            .map((step, index) => <AgentAvatar key={step.id} index={index} label={step.name} />)}
          <span>{item.steps?.length ?? (item.secondReview ? 5 : 4)} {t('nodesUnit')}</span>
        </div><span>{t('history')} · {library.runs.filter(run => run.workflowId === item.id).length}</span></>}>
        {selected === item.id && <form className={css.runForm} onSubmit={(event) => {
          event.preventDefault()
          if (workspace && input.trim()) void action(() => run(item.id, item.name, input.trim(), workspace.workspaceId))
        }}>
          <label>{t('workspace')}
            <select value={workspace?.workspaceId ?? ''} onChange={(event) => { setWorkspace(event.target.value) }}>
              {workspaces.map(place => <option key={place.workspaceId} value={place.workspaceId}>{place.title}</option>)}
            </select>
          </label>
          <label>{t('input')}
            <textarea rows={3} required maxLength={12000} value={input} onChange={(event) => { setInput(event.target.value) }} />
          </label>
          <footer className={css.actions}><Button type="submit" variant="primary" disabled={busy || !workspace || !input.trim()}>{t('run')}</Button></footer>
        </form>}
        {expandedHistory === item.id && <div ref={historyRef} tabIndex={-1}
          className={css.workflowHistory} role="region" aria-label={item.name + ' · ' + t('history')}>
          {historyRows(library.runs.filter(run => run.workflowId === item.id))}
        </div>}
      </TeamCard>)}
    </section>
    {library && library.runs.some(run => !library.definitions.some(item => item.id === run.workflowId)) &&
      <details className={css.workflowHistory}>
        <summary>{t('ungroupedHistory')}</summary>
        {historyRows(library.runs.filter(run => !library.definitions.some(item => item.id === run.workflowId)))}
      </details>}
    {pendingManagement && <Modal open title={t('unsavedTitle')} closeLabel={t('cancel')}
      onClose={() => { setPendingManagement(undefined) }}>
      <p>{t('unsavedPrompt')}</p>
      <div className={css.actions}>
        <Button onClick={() => { setPendingManagement(undefined) }}>{t('keepEditing')}</Button>
        <Button variant="primary" disabled={busy} onClick={() => {
          openTarget(pendingManagement.target, pendingManagement.definition)
        }}>{t('discardAndOpen')}</Button>
      </div>
    </Modal>}
  </div>
}

/** Show a persistent workflow decision card above the owning conversation composer.
 * @param props - Session identity, locale and approval operations.
 * @returns Approval or delivery card for a workflow session.
 */
export function WorkflowApproval({ session, t, read, decide }: ApprovalProps) {
  const id = session.sessionId
  const [retry, setRetry] = useState(0)
  const [item, setItem] = useState<WorkflowHistory | null>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const locked = useRef(false)
  useEffect(() => {
    let active = true
    let remaining = 5
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const value = await read(id)
        if (!active) return
        setItem(value)
        if (value ? ['preparing', 'pending', 'delivering'].includes(value.status) : remaining-- > 0) {
          timer = setTimeout(() => { void load() }, 1200)
        }
      } catch {
        if (active) setError(true)
      }
    }
    void load()
    return () => { active = false; clearTimeout(timer) }
  }, [id, read, retry])
  async function submit(decision: 'approve' | 'reject') {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError(false)
    try {
      await decide(id, decision, item?.pendingApproval?.id)
      setItem(await read(id))
    } catch {
      setError(true)
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  if (!item || item.sessionId !== id || item.status !== 'pending') return null
  const labels = { code: { copyLabel: t('copy'), copiedLabel: t('copied') }, footnotes: t('footnotes') }
  return <aside className={css.approval} aria-label={t('approvalStep')}>
    <div className={css.row}>
      <div><h4>{item.name}</h4><p>{item.pendingApproval?.name ?? t('approvalTitle')}</p></div>
      <span className={css.status} data-status={item.status} role="status">{t(item.status)}</span>
    </div>
    {item.pendingApproval?.instruction && <p>{item.pendingApproval.instruction}</p>}
    {item.draft && <details><summary>{t('draftPreview')}</summary><div className={css.preview}><MarkdownText labels={labels} omitHtml text={item.draft} /></div></details>}
    {item.reviews?.length ? <details><summary>{t('reviews')} · {item.reviews.length}</summary>
      <div className={css.preview}>{item.reviews.map((review, index) =>
        <MarkdownText labels={labels} omitHtml key={index} text={review} />,
      )}</div></details> : null}
    {error && <div className={css.notice} role="alert">{t('failure')} <Button onClick={() => { setError(false); setRetry(value => value + 1) }}>{t('retry')}</Button></div>}
    <footer className={css.actions}>
      <Button disabled={busy} onClick={() => { void submit('reject') }}>{t('reject')}</Button>
      <Button variant="primary" disabled={busy} onClick={() => { void submit('approve') }}>{t('approve')}</Button>
    </footer>
  </aside>
}

/** Localize workflow actions recorded by the shared command renderer.
 * @param props - Durable command outcome and locale.
 * @returns A compact operation row.
 */
export function WorkflowCommand({ node, sessionId, t, read, renderCard = false }:
PropsRuntime<'conversation.chat.commandview'> & PropsLocale<'teamWorkflow'> & InjectFace<Pick<ApprovalActions, 'read'>>
  & { renderCard?: boolean }) {
  const [run, setRun] = useState<WorkflowHistory | null>(null)
  const isStart = node.name === 'team-workflow-run'
  useEffect(() => {
    if (!isStart || !renderCard) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const value = await read(sessionId)
        if (!active) return
        setRun(value)
        if (!value || value.status === 'preparing' || value.status === 'pending' || value.status === 'delivering') {
          timer = setTimeout(() => { void load() }, 1200)
        }
      } catch {
        if (active) timer = setTimeout(() => { void load() }, 3000)
      }
    }
    void load()
    return () => { active = false; clearTimeout(timer) }
  }, [sessionId, read, isStart, renderCard])
  if (isStart && !renderCard) return null
  if (!isStart) return node.outcome?.kind === 'error'
    ? <div className={css.command} role="alert">{node.outcome.text ?? t('failure')}</div> : null
  if (!run || run.sessionId !== sessionId) return <div className={css.command}>
    {t(node.outcome?.kind === 'error' ? 'failure' : 'loading')}
  </div>
  const labels = { code: { copyLabel: t('copy'), copiedLabel: t('copied') }, footnotes: t('footnotes') }
  return <article className={css.transcript}>
    <div className={css.request}>
      <span>{t('originalRequest')}</span>
      <p>{run.input}</p>
    </div>
    <div className={css.reply}>
      <span role="status">{run.delivery ? t('result') : t(run.status)}</span>
      {node.outcome?.kind === 'error' && <span role="alert">{node.outcome.text ?? t('failure')}</span>}
      {run.delivery && <MarkdownText labels={labels} omitHtml text={run.delivery} />}
    </div>
  </article>
}

/** Render the original workflow card as visible, cold-replayable conversation content. */
export function WorkflowMessage({ node, ...props }:
Omit<ChatNodeViewProps<'workflow-message'>, 't'> & PropsLocale<'teamWorkflow'> & InjectFace<Pick<ApprovalActions, 'read'>>) {
  return <WorkflowCommand {...props} renderCard node={node.data} />
}
