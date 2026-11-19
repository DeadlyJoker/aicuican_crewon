/** Office definitions and one continuously updated addressed discussion. */
import { useEffect, useRef, useState } from 'react'
import { Button, MarkdownText, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { Office, OfficeDiscussion, OfficeDraft, OfficeUpdate, OfficeTopicScope, OfficeMessage as OfficeMessageData } from '../office-types.ts'
import type { OfficeProjectId, OfficeTopic, OfficeTopicId } from '../office-project-types.ts'
import type { TeamManagementNavigation, TeamManagementTarget } from './team-management.ts'
import type { CatalogueFace } from './catalogue.ts'
import type { TeamModeProps } from './TeamHub.tsx'
import type {} from './office-copy.ts'
import { AgentAvatar, TeamCard } from './TeamCard.tsx'
import { TeamPageHeader } from './TeamPageHeader.tsx'
import css from './OfficePage.module.css'
import { OfficeProjects, type OfficeProjectActions } from './OfficeProjects.tsx'
import { OfficeEditor, officeUpdateFrom } from './OfficeEditor.tsx'
import type { ExpertPickerActions } from './ExpertPicker.tsx'

interface Actions {
  projectActions: OfficeProjectActions
  list(this: void): Promise<Office[]>
  save(this: void, draft: OfficeDraft): Promise<void>
  update(this: void, officeId: Office['id'], draft: OfficeUpdate): Promise<Office>
  open(this: void, office: Office, workspace: WorkspaceId): Promise<void>
  presets(this: void): Promise<readonly { id: string; name?: string; broken?: string }[]>
  expertPicker?: ExpertPickerActions
}
type Props = TeamModeProps & PropsLocale<'teamOffice'> & InjectFace<Actions & TeamManagementNavigation & CatalogueFace>
type OfficeManagementTarget = Extract<TeamManagementTarget, { kind: 'office' }>

/** Create and enter long-lived offices in the shared Teams catalogue. */
export function OfficePage({ t, navigation, list, save, update, open, presets, expertPicker, useWorkspaces, projectActions,
  useManagement, consumeManagement, useCatalogue }: Props) {
  const revision = useCatalogue(value => value)
  const management = useManagement(value => value)
  const [selected, setSelected] = useState<Office>()
  const [initialProjectId, setInitialProjectId] = useState<OfficeProjectId>()
  const [projectNavigation, setProjectNavigation] = useState(0)
  const [projectEditing, setProjectEditing] = useState(false)
  const [offices, setOffices] = useState<Office[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState<OfficeDraft>()
  const [editingOffice, setEditingOffice] = useState<{ office: Office; draft: OfficeUpdate }>()
  const [pendingManagement, setPendingManagement] = useState<{ target: OfficeManagementTarget; office: Office }>()
  const [targetMissing, setTargetMissing] = useState(false)
  const handledManagement = useRef<TeamManagementTarget | undefined>(undefined)
  const [choices, setChoices] = useState<Awaited<ReturnType<Actions['presets']>>>([])
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const locked = useRef(false)
  const workspaces = useWorkspaces(state => state.items)
  const [workspaceId, setWorkspaceId] = useState('')
  const workspace = workspaces.find(item => item.workspaceId === workspaceId)?.workspaceId ?? workspaces[0]?.workspaceId
  useEffect(() => {
    let alive = true
    void Promise.all([list(), presets()]).then(([items, available]) => {
      if (alive) { setOffices(items); setChoices(available); setLoaded(true) }
    }, () => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [list, presets, revision])
  const openTarget = (target: OfficeManagementTarget, office: Office) => {
    setDraft(undefined)
    setEditingOffice(undefined)
    setProjectEditing(false)
    setPendingManagement(undefined)
    setTargetMissing(false)
    if (target.view === 'settings') {
      setSelected(undefined)
      setEditingOffice({ office, draft: officeUpdateFrom(office) })
    } else {
      setInitialProjectId(target.projectId)
      setProjectNavigation(value => value + 1)
      setSelected(office)
    }
  }
  useEffect(() => {
    if (management?.kind !== 'office' || !loaded || handledManagement.current === management) return
    handledManagement.current = management
    const office = offices.find(item => item.id === management.officeId)
    if (!office) setTargetMissing(true)
    else if (management.view === 'settings' && editingOffice?.office.id === office.id) {
      setTargetMissing(false)
    } else if (draft || editingOffice || projectEditing || busy) setPendingManagement({ target: management, office })
    else openTarget(management, office)
    consumeManagement(management)
  }, [management, loaded, offices, draft, editingOffice, projectEditing, busy, consumeManagement])
  const act = async (operation: () => Promise<void>) => {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setFailed(false)
    try { await operation(); setOffices(await list()) } catch { setFailed(true) }
    finally { locked.current = false; setBusy(false) }
  }
  const managementPrompt = pendingManagement && <Modal open title={t('unsavedTitle')} closeLabel={t('cancel')}
    onClose={() => { setPendingManagement(undefined) }}>
    <p>{t('unsavedPrompt')}</p>
    <div className={css.formActions}>
      <Button onClick={() => { setPendingManagement(undefined) }}>{t('keepEditing')}</Button>
      <Button variant="primary" disabled={busy} onClick={() => {
        openTarget(pendingManagement.target, pendingManagement.office)
      }}>{t('discardAndOpen')}</Button>
    </div>
  </Modal>
  const header = <TeamPageHeader navigation={navigation} create={{ label: t('create'),
    disabled: busy || Boolean(draft) || Boolean(editingOffice) || projectEditing,
    onClick: () => {
      setSelected(undefined)
      setDraft({ name: '', description: '', members: [{ name: '', role: '', instruction: '' }] })
    },
  }} />
  if (selected) return <div className={css.page}>
    {header}
    {targetMissing && <p role="alert">{t('managementMissing')}</p>}
    <OfficeProjects key={projectNavigation} office={offices.find(office => office.id === selected.id) ?? selected}
      actions={projectActions} revision={revision}
      {...(initialProjectId === undefined ? {} : { initialProjectId })} onEditingChange={setProjectEditing}
      onBack={() => { setSelected(undefined); setProjectEditing(false) }} t={t} />
    {managementPrompt}
  </div>
  return <section className={css.page}>
    {header}
    <p className={css.description}>{t('intro')}</p>
    <label className={css.workspace}>{t('workspace')}<select value={workspace ?? ''} onChange={(event) => { setWorkspaceId(event.target.value) }}>
      {workspaces.map(item => <option key={item.workspaceId} value={item.workspaceId}>{item.title}</option>)}
    </select></label>
    {failed && !draft && !editingOffice && <p role="alert">{t('failure')}</p>}
    {targetMissing && <p role="alert">{t('managementMissing')}</p>}
    {!offices.length && <p>{t('empty')}</p>}
    <div className={css.grid}>{offices.map(office => <TeamCard key={office.id} title={office.name} description={office.description} mode="offices"
      actions={[{ kind: 'settings', label: t('settings'), disabled: busy, onClick: () => {
        setFailed(false)
        setEditingOffice({ office, draft: officeUpdateFrom(office) })
      } }, { kind: 'projects', label: t('projectAction'), disabled: !office.sessionId, onClick: () => {
        setInitialProjectId(undefined); setSelected(office)
      } }, { kind: 'office', label: t('enterHall'), disabled: busy || !workspace,
        onClick: () => { if (workspace) void act(() => open(office, workspace)) } }]}
      footer={<div className={css.officeFooter}><div className={css.avatars}>{office.members.map((member, index) => <AgentAvatar key={member.id} index={index} label={member.name + ' · ' + member.role} />)}</div>
        {office.leaderId && <span className={css.leaderSummary}>
          <span>{office.members.find(member => member.id === office.leaderId)?.name}</span>
          <span className={css.leaderBadge} data-office-leader="">{t('leader')}</span>
        </span>}
        <span>{t('hallHint')} · {office.members.length} {t('members')}</span></div>} />)}</div>
    {draft && <OfficeEditor draft={draft} change={setDraft} presets={choices} busy={busy} failed={failed}
      {...(expertPicker ? { expertPicker } : {})}
      save={() => { void act(async () => { await save(draft); setDraft(undefined) }) }}
      close={() => { setDraft(undefined) }} t={t} />}
    {editingOffice && <OfficeEditor key={editingOffice.office.id} draft={editingOffice.draft} editing
      presets={choices} busy={busy} failed={failed} {...(expertPicker ? { expertPicker } : {})}
      change={(value) => { setEditingOffice({ ...editingOffice, draft: value }) }}
      close={() => { setEditingOffice(undefined) }}
      save={() => { void act(async () => {
        await update(editingOffice.office.id, editingOffice.draft)
        setEditingOffice(undefined)
      }) }} t={t} />}
    {managementPrompt}
  </section>
}

type Read = { readOffice(this: void, id: SessionId): Promise<OfficeDiscussion | null> }
type BodySlot = PropsRenderFactories
type ChatProps = PropsRuntime<'conversation.chat.commandview'> & PropsLocale<'teamOffice'> & InjectFace<Read> & BodySlot

/** Render an office member with the same identity and bubble in live and imported history. */
function MemberReply({ office, name, output, status, delivery, t, identity, memberId, renderFactorySlot }: {
  memberId?: string
  identity: string
  office: Office
  name: string
  output: string | undefined
  status?: OfficeMessageData['status']
  delivery?: OfficeMessageData['topicDeliveryError']
} & PropsLocale<'teamOffice'> & Pick<BodySlot, 'renderFactorySlot'>) {
  const labels = { code: { copyLabel: t('copy'), copiedLabel: t('copied') }, footnotes: t('footnotes') }
  const recipientId = memberId ?? office.members.find(member => member.name === name)?.id
  const leader = office.leaderId !== undefined && office.members.find(member => member.name === name)?.id === office.leaderId
  return <div className={css.answer}><div className={css.answerHeading}>
    <AgentAvatar index={office.members.findIndex(member => member.name === name)} label={name} />
    <strong>{name}</strong>{leader && <span className={css.leaderBadge} data-office-leader="">{t('leader')}</span>}
    {status && <small data-state={status}>{t(status)}</small>}</div>
  <div className={css.answerBubble}>{output ? renderFactorySlot('conversation.message.body', { text: output, identity, streaming: status === 'running', labels, recipient: recipientId ? { namespace: 'office', id: recipientId } : undefined }, { fallback: <MarkdownText omitHtml labels={labels} text={output} /> }) : status && <p>{t(status === 'running' ? 'waiting' : status)}</p>}</div>
  {delivery && <p className={css.deliveryNotice} role={delivery === 'delivery_pending' ? 'status' : 'alert'} data-state={delivery}>{t(delivery)}</p>}
  </div>
}

/** Identify a delegated member result without attributing its task to the user. */
function DelegationLabel({ office, message, t }: {
  office: Office
  message: OfficeMessageData
} & PropsLocale<'teamOffice'>) {
  return <p className={css.delegationLabel}>
    {office.members.find(member => member.id === message.requestedBy)?.name ?? t('leader')}
    {' → '}{message.memberName}
  </p>
}

/** Keep one topic ledger in sync, acknowledging only the visible message snapshot. */
export function OfficeTopicConversation({ node, sessionId, readOffice, readTopic, ackTopic, t, renderFactorySlot }: ChatProps & InjectFace<{
  readTopic(this: void, office: Office['id'], topic: OfficeTopicId, throughSequence?: number): Promise<OfficeTopic>
  ackTopic(this: void, office: Office['id'], topic: OfficeTopicId, throughSequence: number): Promise<void>
}>) {
  let restoring = false
  if (node.args) {
    try {
      const args: unknown = JSON.parse(node.args)
      restoring = Boolean(args && typeof args === 'object' && 'restore' in args && args.restore === true)
    } catch (_invalidInput) { /* Earlier commands without structured input still show their opening history. */ }
  }
  const [history, setHistory] = useState<{ sessionId: SessionId; office: Office; scope: OfficeTopicScope; topic: OfficeTopic }>()
  const [failed, setFailed] = useState(false)
  const [ackFailed, setAckFailed] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const acknowledged = useRef<{ sessionId: SessionId; sequence: number } | undefined>(undefined)
  const ackPending = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (restoring || node.outcome?.kind === 'error') return
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const discussion = await readOffice(sessionId)
        if (!alive) return
        if (!discussion?.scope) { timer = setTimeout(() => { void load() }, 1500); return }
        const topic = await readTopic(discussion.office.id, discussion.scope.topicId)
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- Unmount can occur while readTopic is pending.
        if (alive) { setHistory({ sessionId, office: discussion.office, scope: discussion.scope, topic }); setFailed(false) }
      } catch {
        if (alive) setFailed(true)
      }
      if (alive) timer = setTimeout(() => { void load() }, 1500)
    }
    void load()
    return () => { alive = false; clearTimeout(timer) }
  }, [node.outcome?.kind, readOffice, readTopic, restoring, sessionId])
  const displayed = history?.sessionId === sessionId ? history : undefined
  const officeId = displayed?.office.id
  const topicId = displayed?.topic.id
  const throughSequence = displayed?.topic.messages.reduce((highest, message) => Math.max(highest, message.sequence), 0) ?? 0
  useEffect(() => {
    const sentinel = end.current
    if (restoring || !sentinel || !officeId || !topicId || throughSequence === 0 || typeof IntersectionObserver === 'undefined') return
    let alive = true
    let visible = false
    let retryTimer: ReturnType<typeof setTimeout>
    const key = `${sessionId}:${throughSequence}`
    const acknowledge = () => {
      if (!alive || !visible || document.visibilityState !== 'visible' || ackPending.current === key) return
      if (acknowledged.current?.sessionId === sessionId && acknowledged.current.sequence >= throughSequence) return
      ackPending.current = key
      void ackTopic(officeId, topicId, throughSequence).then(() => {
        if (!alive) return
        const previous = acknowledged.current?.sessionId === sessionId ? acknowledged.current.sequence : 0
        acknowledged.current = { sessionId, sequence: Math.max(throughSequence, previous) }
        setAckFailed(false)
      }, () => {
        if (alive) { setAckFailed(true); retryTimer = setTimeout(acknowledge, 1500) }
      }).finally(() => { if (ackPending.current === key) ackPending.current = undefined })
    }
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some(entry => entry.isIntersecting)
      acknowledge()
    })
    observer.observe(sentinel)
    document.addEventListener('visibilitychange', acknowledge)
    return () => { alive = false; observer.disconnect(); clearTimeout(retryTimer); document.removeEventListener('visibilitychange', acknowledge) }
  }, [ackTopic, officeId, restoring, sessionId, throughSequence, topicId])
  if (node.outcome?.kind === 'error') return <p role="alert">{node.outcome.text ?? t('failure')}</p>
  if (restoring) return null
  if (!displayed) return <p role="status">{t(failed ? 'failure' : 'preparing')}</p>
  const { office, scope, topic } = displayed
  const labels = { code: { copyLabel: t('copy'), copiedLabel: t('copied') }, footnotes: t('footnotes') }
  return <div className={css.discussion}>
    <header className={css.topicScope}><span>{scope.projectName}</span><span aria-hidden="true">/</span><strong>{scope.title}</strong></header>
    {failed && <p role="alert">{t('failure')}</p>}
    {topic.messages.map((message, index) => <section key={message.id} className={css.exchange} data-topic-history={message.id}>
      {message.author === 'human' ? <div className={css.question}>
        <MarkdownText omitHtml labels={labels} text={openingMessageText(topic, message, index)} /></div>
        : <MemberReply renderFactorySlot={renderFactorySlot} identity={message.id}
          office={office} name={message.author} output={message.body} t={t} />}
      {topic.deliveries.filter(delivery => delivery.sourceMessageRef === message.id).map(delivery => <MemberReply
        renderFactorySlot={renderFactorySlot} identity={String(delivery.id)} memberId={delivery.memberId} key={delivery.id}
        office={office} name={delivery.memberName} output={delivery.output} status={delivery.status}
        delivery={delivery.topicDeliveryError} t={t} />)}
    </section>)}
    {ackFailed && <p className={css.deliveryNotice} role="alert">{t('readFailure')}</p>}
    <div ref={end} className={css.historyEnd} aria-hidden="true" />
  </div>
}

/** Avoid repeating the topic heading in its opening message while preserving later posts. */
function openingMessageText(topic: OfficeTopic, message: OfficeTopic['messages'][number], index: number): string {
  if (index !== 0 || !message.body.startsWith(topic.title + '\n')) return message.body
  const body = message.body.slice(topic.title.length + 1).replace(/^(?:[ \t]*\n)+/, '')
  return body.trim() ? body : topic.title
}

/** Render office identity or an addressed reply while native child sessions retain full traces. */
export function OfficeConversation({ node, sessionId, t, readOffice, renderFactorySlot }: ChatProps) {
  const [discussion, setDiscussion] = useState<OfficeDiscussion | null>(null)
  let messageId: string | undefined
  if (node.name === 'team-office-send' && node.args) {
    try {
      const args: unknown = JSON.parse(node.args)
      if (args && typeof args === 'object' && 'id' in args && typeof args.id === 'string') messageId = args.id
    } catch (_invalidInput) { /* Older or malformed command input has no message to project. */ }
  }
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const next = await readOffice(sessionId)
        if (!alive) return
        setDiscussion(next)
        setFailed(false)
        if (next?.scope) return
        const message = next?.messages.find(item => item.id === messageId)
        if (message?.requestedFor !== undefined) return
        const ownsMessage = message?.commandId === undefined || message.commandId === node.commandId
        const pending = message?.status === 'running' || message?.topicDeliveryError === 'delivery_pending'
          || next?.messages.some(child => child.requestedFor === messageId
            && (child.status === 'running' || child.topicDeliveryError === 'delivery_pending'))
        if (!next || (messageId && (!message || (ownsMessage && pending)))) timer = setTimeout(() => { void load() }, 1500)
      } catch {
        if (alive) { setFailed(true); timer = setTimeout(() => { void load() }, 1500) }
      }
    }
    void load()
    return () => { alive = false; clearTimeout(timer) }
  }, [messageId, node.commandId, readOffice, sessionId])
  if (node.outcome?.kind === 'error') return <p role="alert">{node.outcome.text ?? t('failure')}</p>
  if (!discussion) return <p role="status">{t(failed ? 'failure' : 'preparing')}</p>
  if (discussion.scope) return null
  if (discussion.messages.some(message => message.id === messageId && message.requestedFor !== undefined)) return null
  return <div className={css.discussion}>
    {node.name === 'team-office-open' && <header className={css.officeIdentity}><h3>{discussion.office.name}</h3><p>{t('mention')}</p>
      <div className={css.avatars}>{discussion.office.members.map((member, index) =>
        <span key={member.id} className={css.memberLabel}><AgentAvatar index={index} label={member.role} />{member.name}</span>,
      )}</div>
    </header>}
    {failed && <p role="alert">{t('failure')}</p>}
    {discussion.messages.filter(message => message.id === messageId
      && (message.commandId === undefined || message.commandId === node.commandId)).map(message =>
      <section key={message.id} className={css.exchange} data-office-message={message.id} data-status={message.status}
        data-delegated={message.requestedBy === undefined ? undefined : true}>
        {message.requestedBy === undefined
          ? <div className={css.question}><span>@{message.memberName}</span><p>{message.text}</p></div>
          : <DelegationLabel office={discussion.office} message={message} t={t} />}
        {discussion.messages.filter(child => child.requestedFor === message.id).map(child =>
          <div key={child.id} className={css.exchange} data-office-message={child.id} data-status={child.status} data-delegated="true">
            <DelegationLabel office={discussion.office} message={child} t={t} />
            <MemberReply renderFactorySlot={renderFactorySlot} identity={child.id} memberId={child.memberId}
              office={discussion.office} name={child.memberName} output={child.output} status={child.status}
              delivery={child.topicDeliveryError} t={t} />
          </div>)}
        <MemberReply renderFactorySlot={renderFactorySlot} identity={message.id} memberId={message.memberId}
          office={discussion.office} name={message.memberName} output={message.output} status={message.status}
          delivery={message.topicDeliveryError} t={t} />
      </section>)}
  </div>
}

/** Render addressed messages in the ordinary chronological conversation stream. */
export function OfficeMessage({ node, ...props }: Omit<ChatNodeViewProps<'office-message'>, 't'> & PropsLocale<'teamOffice'> & InjectFace<Read> & BodySlot) {
  return <OfficeConversation {...props} node={node.data} />
}
