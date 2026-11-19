/** Projects, topics and unread queues delegated to the pinned Contexera ledger. */
import type { Context } from '@deepseek-ai/cordis'
import { notifyTeamCatalogue } from './catalogue.ts'
import { principalOf, Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-workspace'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { AgentTeamLedger, agentTeamHumanActor } from './contexera-domain/ledger.ts'
import { agentTeamDomainSpec } from './contexera-domain/spec.ts'
import type { AgentTeamMemberId, AgentTeamRequestId, AgentTeamMemberActor, AgentTeamMessageRef } from './contexera-domain/types.ts'
import type { Office, OfficeId, OfficeMemberId, OfficeMessage, OfficeTopicScope } from './office-types.ts'
import type { OfficeProjectOverview, OfficeProjectId, OfficeTopicId, OfficeTopic, OfficeTopicSubmission } from './office-project-types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { /** Contexera-backed office collaboration. */ teamOfficeProjects: TeamOfficeProjects }
}
interface OfficeDomain { office: Office; ledger: AgentTeamLedger; domain: Domain<typeof agentTeamDomainSpec>; workspaceId: import('@deepseek-ai/dsh-workspace').WorkspaceId }
const memberId = (id: OfficeMemberId) => `member:${id}` as AgentTeamMemberId
const requestId = (id: string = randomUUID()) => id as AgentTeamRequestId

interface OfficeTopicInput {
  text: string
  revision: number
  readThroughSequence: number
  sourceMessageSequence: number
}

/** Preserve office and member session identities while adding a durable collaboration ledger. */
export class TeamOfficeProjects extends TypertRemoteService {
  private readonly offices = new Map<OfficeId, Promise<OfficeDomain>>()
  private readonly topicPosts = new Map<OfficeTopicId, Promise<void>>()
  /** @param ctx - Current storage-domain and existing office services. */
  constructor(ctx: Context) {
    super(ctx, 'teamOfficeProjects')
    ctx.effect(() => async () => {
      const loaded = await Promise.allSettled(this.offices.values())
      await Promise.all(loaded.flatMap(result => result.status === 'fulfilled' ? [result.value.domain.close()] : []))
    }, 'office project domains')
  }
  private async get(id: OfficeId): Promise<OfficeDomain> {
    if (principalOf(this.ctx.invocation) !== undefined) throw new RemoteError('team-office/owner-required', 'Office settings belong to the Host owner.', {})
    const loaded = this.offices.get(id) ?? this.load(id)
    const synchronized = loaded.then(value => this.synchronizeMembers(value))
    this.offices.set(id, synchronized.catch(() => loaded))
    return synchronized
  }
  private async load(id: OfficeId): Promise<OfficeDomain> {
    const office = this.ctx.teamOffices.list().find(item => item.id === id)
    if (!office?.sessionId) throw new Error('Enter the office before opening its projects.')
    const officeSessionId = office.sessionId
    const workspace = this.ctx.workspaceRegistry.list().find(item => item.sessionIds.includes(officeSessionId))
    if (!workspace) throw new Error('The office workspace is unavailable.')
    const domain = await this.ctx.storageDomain.open({ ...agentTeamDomainSpec, name: `crewon_office_${id.replaceAll('-', '')}` })
    const ledger = new AgentTeamLedger(domain.table('operations'))
    try {
      await ledger.initialize()
      return { office, ledger, domain, workspaceId: workspace.id }
    } catch (error) { await domain.close(); throw error }
  }
  private async synchronizeMembers(value: OfficeDomain): Promise<OfficeDomain> {
    const office = this.ctx.teamOffices.list().find(item => item.id === value.office.id)
    if (!office?.sessionId) throw new Error('Office is unavailable.')
    const { ledger, workspaceId } = value
    for (const prior of ledger.listMembers()) {
      if (prior.state !== 'inactive' && prior.state !== 'archived' && !office.members.some(member => memberId(member.id) === prior.memberId)) {
        await ledger.removeMember({ requestId: requestId(), actor: agentTeamHumanActor(), memberId: prior.memberId })
      }
    }
    // Clear old handles before assigning the final roster so name swaps remain valid.
    for (const member of office.members) {
      const prior = ledger.getMember(memberId(member.id))
      if (prior && prior.handle !== member.name) {
        await ledger.updateMember({ requestId: requestId(), actor: agentTeamHumanActor(), memberId: prior.memberId,
          handle: `office-update-${randomUUID()}`, description: prior.description })
      }
    }
    const projectRefs = ledger.view({ workspaceId, includeCatalog: true, limit: 1 }).projects.map(project => project.projectRef)
    for (const member of office.members) {
      const prior = ledger.getMember(memberId(member.id))
      if (prior) {
        if (prior.handle !== member.name || prior.description !== member.role) {
          await ledger.updateMember({ requestId: requestId(), actor: agentTeamHumanActor(), memberId: prior.memberId,
            handle: member.name, description: member.role })
        }
      } else {
        if (!member.sessionId) throw new Error('Office member session is unavailable.')
        await ledger.addMember({ requestId: requestId(`import-${office.id}-${member.id}`), actor: agentTeamHumanActor(),
          workspaceId, handle: member.name, description: member.role, presetId: member.agentPreset ?? 'standard', projectRefs,
          member: { memberId: memberId(member.id), sessionId: member.sessionId, workspaceId, handle: member.name,
            description: member.role, presetId: member.agentPreset ?? 'standard', state: 'enabled',
            privateMemoryPath: join(this.ctx.profileContext.dir, 'office-members', member.id) },
        })
      }
    }
    return { ...value, office }
  }
  /**
   * Read an office’s Projects and caller-visible collaboration records.
   * @param officeId - Existing office.
   * @param recipient - Optional member inbox.
   * @returns Project catalogue and unread topics.
   */
  @Remote('overview')
  async overview(officeId: OfficeId, recipient?: OfficeMemberId): Promise<OfficeProjectOverview> {
    const { ledger, workspaceId, office } = await this.get(officeId)
    const view = ledger.view({ workspaceId, includeCatalog: true, limit: 100 })
    const inbox = ledger.inbox(recipient ? this.actor(office, recipient, ledger) : agentTeamHumanActor(), { workspaceId })
    return { officeId, projects: view.projects.map(project => ({
      id: project.projectRef, name: project.name, description: project.description,
      topics: view.threads.flatMap((thread) => {
        const history = ledger.threadHistory(agentTeamHumanActor(), { workspaceId, threadRef: thread.threadRef, limit: 1 })
        return history.anchor.projectRef === project.projectRef
          ? [{ id: thread.threadRef, title: history.anchor.body.split('\n')[0] ?? '', revision: thread.revision }]
          : []
      }),
    })), inbox: inbox.items.map(item => ({ topicId: item.thread.threadRef, projectName: item.projectName ?? '', preview: item.previewText ?? '', unread: item.unreadCount })), unread: inbox.totalUnreadCount }
  }
  private actor(office: Office, id: OfficeMemberId, ledger: AgentTeamLedger): AgentTeamMemberActor {
    const member = office.members.find(item => item.id === id)
    const identity = ledger.getMember(memberId(id))
    if (!member || !identity || identity.state !== 'enabled') throw new Error('Member does not belong to this office.')
    return { kind: 'member', memberId: memberId(id), handle: identity.handle }
  }
  /**
   * Create a Project under Human authority and record its initial owners.
   * @param officeId - Existing office.
   * @param name - Project name.
   * @param description - Purpose.
   * @param id - Stable retry identity.
   * @returns Saved project identity.
   */
  @Remote('createProject')
  async createProject(officeId: OfficeId, name: string, description: string, id: string): Promise<OfficeProjectId> {
    const { ledger, workspaceId, office } = await this.get(officeId)
    const result = await ledger.createProject({ requestId: requestId(id), actor: agentTeamHumanActor(), workspaceId, name, description,
      memberIds: office.members.map(member => memberId(member.id)) })
    if (result.committed) notifyTeamCatalogue(this.ctx)
    return result.value.project.projectRef
  }
  /**
   * Create an office topic under the selected Project and admit its initial message.
   * @param officeId - Existing office.
   * @param projectId - Owning project.
   * @param body - Opening message.
   * @param id - Stable retry identity.
   * @returns Created topic.
   */
  @Remote('startTopic')
  async startTopic(officeId: OfficeId, projectId: OfficeProjectId, body: string, id: string): Promise<OfficeTopicSubmission> {
    const { ledger, workspaceId } = await this.get(officeId)
    const result = await ledger.startThread({ requestId: requestId(id), actor: agentTeamHumanActor(), workspaceId, projectRef: projectId, kind: 'discussion', body })
    if (result.committed) notifyTeamCatalogue(this.ctx)
    return { topicId: result.value.thread.threadRef, sourceMessageRef: result.value.message.messageRef,
      sourceMessageSequence: result.value.message.sequence }
  }
  /**
   * Resolve the owning workspace without changing any read markers.
   * @param officeId - Existing office.
   * @returns Workspace shared by its topic conversations.
   */
  async topicWorkspaceId(officeId: OfficeId): Promise<import('@deepseek-ai/dsh-workspace').WorkspaceId> {
    return (await this.get(officeId)).workspaceId
  }
  /**
   * Validate a topic and capture the history preceding its independent conversation.
   * @param officeId - Existing office.
   * @param topicId - Topic to bind.
   * @returns Display context and fixed history watermark.
   */
  async topicScope(officeId: OfficeId, topicId: OfficeTopicId): Promise<OfficeTopicScope> {
    const { ledger, workspaceId } = await this.get(officeId)
    const history = ledger.threadHistory(agentTeamHumanActor(), { workspaceId, threadRef: topicId, limit: 1 })
    const project = ledger.getProject(history.anchor.projectRef)
    if (!project) throw new Error('The topic project is unavailable.')
    return { topicId, projectId: project.projectRef, projectName: project.name,
      title: history.anchor.body.split('\n')[0] ?? '', historyThroughSequence: history.thread.revision }
  }
  /**
   * Save one addressed human request through the shared topic ledger.
   * @param officeId - Existing office.
   * @param topicId - Destination.
   * @param recipient - Addressed member.
   * @param text - User message.
   * @param id - Stable retry identity.
   * @returns Committed source message.
   */
  submitMemberRequest(
    officeId: OfficeId, topicId: OfficeTopicId, recipient: OfficeMemberId, text: string, id: string,
  ): Promise<OfficeTopicSubmission> {
    const task = (this.topicPosts.get(topicId) ?? Promise.resolve()).then(async () => {
      const { ledger, workspaceId, office, domain } = await this.get(officeId)
      const actor = this.actor(office, recipient, ledger)
      const history = ledger.threadHistory(agentTeamHumanActor(), { workspaceId, threadRef: topicId, limit: 1 })
      const previous = ledger.hasCommitted(requestId(id))
        ? [...domain.table('operations').entries()].find(([, operation]) => operation.requestId === id)?.[1]
        : undefined
      const revision = previous?.kind === 'team/thread-replied' ? previous.data.baseRevision : history.thread.revision
      return this.reply(officeId, topicId, `@${actor.handle} ${text}`, revision, id)
    })
    const settled = task.then(() => {}, () => {})
    this.topicPosts.set(topicId, settled)
    void settled.then(() => { if (this.topicPosts.get(topicId) === settled) this.topicPosts.delete(topicId) })
    return task
  }
  /**
   * Read a durable office topic and its associated collaboration history.
   * @param officeId - Existing office.
   * @param topicId - Topic to read.
   * @param throughSequence - Optional upper bound for historical reads.
   * @returns Ordered discussion messages without changing unread markers.
   */
  @Remote('topic')
  async topic(officeId: OfficeId, topicId: OfficeTopicId, throughSequence?: number): Promise<OfficeTopic> {
    const { ledger, workspaceId } = await this.get(officeId)
    const history = ledger.threadHistory(agentTeamHumanActor(), { workspaceId, threadRef: topicId, limit: 100,
      ...(throughSequence === undefined ? {} : { beforeSequence: throughSequence + 1 }) })
    const facts = [...history.facts]
    let page = history
    while (page.hasMore) {
      page = ledger.threadHistory(agentTeamHumanActor(), { workspaceId, threadRef: topicId, limit: 100, beforeSequence: page.cursor })
      facts.unshift(...page.facts)
    }
    const messages = [history.anchor, ...facts.flatMap(fact => fact.kind === 'message' ? [fact.message] : [])]
    return { id: topicId, title: history.anchor.body.split('\n')[0] ?? '', revision: history.thread.revision,
      deliveries: this.ctx.teamOffices.topicMessages(officeId, topicId)
        .filter(message => message.status !== 'completed' || message.topicDeliveryError !== undefined)
        .map(message => ({ ...message, sourceMessageRef: message.sourceMessageRef ?? history.anchor.messageRef })),
      messages: [...new Map(messages.map(message => [message.messageRef, message])).values()].map(message => ({ id: message.messageRef,
        author: message.sender === 'member:human' ? 'human' : ledger.getMember(message.sender)?.handle ?? message.sender,
        body: message.body, time: message.occurredAt, sequence: message.sequence })) }
  }
  /**
   * Confirm the contiguous history already shown in the topic conversation.
   * @param officeId - Existing office.
   * @param topicId - Visible topic.
   * @param throughSequence - Last rendered ledger sequence.
   */
  @Remote('acknowledgeTopic')
  async acknowledgeTopic(officeId: OfficeId, topicId: OfficeTopicId, throughSequence: number): Promise<void> {
    const { ledger, workspaceId } = await this.get(officeId)
    let committed = true
    while (committed) {
      const result = await ledger.readThread({ requestId: requestId(), actor: agentTeamHumanActor(), workspaceId,
        threadRef: topicId, selectedThroughSequence: throughSequence })
      committed = result.committed
      if (committed) notifyTeamCatalogue(this.ctx)
    }
  }
  /**
   * Append a Thread reply after resolving its caller, mentions and attachment references.
   * @param officeId - Existing office.
   * @param topicId - Destination.
   * @param body - Message text.
   * @param revision - Last observed topic revision.
   * @param id - Retry identity.
   * @returns The admitted topic submission and its durable identities.
   */
  @Remote('reply')
  async reply(officeId: OfficeId, topicId: OfficeTopicId, body: string, revision: number, id: string): Promise<OfficeTopicSubmission> {
    const { ledger, workspaceId } = await this.get(officeId)
    const result = await ledger.reply({
      requestId: requestId(id), actor: agentTeamHumanActor(), workspaceId, threadRef: topicId, body, baseRevision: revision,
    })
    if (result.value.kind !== 'committed') throw new Error('The topic changed. Reload it before replying.')
    if (result.committed) notifyTeamCatalogue(this.ctx)
    return { topicId: result.value.thread.threadRef, sourceMessageRef: result.value.message.messageRef,
      sourceMessageSequence: result.value.message.sequence }
  }
  /**
   * Prepare a named topic snapshot without advancing the member's unread state.
   * @param office - Existing office.
   * @param member - Recipient.
   * @param topic - Topic.
   * @param sourceMessageRef - Exact message being answered, when supplied.
   * @returns Model context and the bounded unread watermark it includes.
   */
  async memberInput(
    office: Office, member: OfficeMemberId, topic: OfficeTopicId, sourceMessageRef?: AgentTeamMessageRef,
  ): Promise<OfficeTopicInput> {
    const { ledger, workspaceId } = await this.get(office.id)
    const actor = this.actor(office, member, ledger)
    const preview = ledger.previewThreadRead({ requestId: requestId(), actor, workspaceId, threadRef: topic })
    const history = ledger.threadHistory(actor, { workspaceId, threadRef: topic, limit: 100 })
    const source = ledger.readMessage(actor, { workspaceId, threadRef: topic,
      messageRef: sourceMessageRef ?? history.anchor.messageRef })
    const project = ledger.getProject(history.anchor.projectRef)
    if (!project) throw new Error('The topic project is unavailable.')
    const messages = [history.anchor, ...history.facts.flatMap(fact => fact.kind === 'message' ? [fact.message] : []),
      ...preview.facts.flatMap(item => item.fact.kind === 'message' ? [item.fact.message] : []), source]
    const ordered = [...new Map(messages.map(message => [message.messageRef, message])).values()]
      .sort((left, right) => left.sequence - right.sequence)
    const text = [
      `Office: ${office.name} (${office.id})`,
      `Project: ${project.name} (${project.projectRef})`,
      `Topic: ${history.anchor.body.split('\n')[0]} (${topic})`,
      `Topic revision: ${history.thread.revision}`,
      `Reply to message: ${source.messageRef}`,
      'Work only within this topic and its supplied history. Other project and lobby conversations are separate scopes.',
      ...ordered.map((message) => {
        const author = message.sender === 'member:human' ? 'Human' : ledger.getMember(message.sender)?.handle ?? message.sender
        return `[${author} | ${message.messageRef}]\n${message.body}`
      }),
    ].join('\n\n')
    return { text, revision: history.thread.revision, sourceMessageSequence: source.sequence,
      readThroughSequence: preview.facts.filter(item => item.unread).at(-1)?.fact.sequence ?? 0 }
  }
  /**
   * Confirm only the unread batch actually accepted by the native member.
   * @param office - Existing office.
   * @param message - Persisted dispatched snapshot.
   */
  async acknowledgeMemberInput(office: Office, message: OfficeMessage): Promise<void> {
    if (!message.topicId || message.topicInputSequence === undefined) return
    const { ledger, workspaceId } = await this.get(office.id)
    const result = await ledger.readThread({ requestId: requestId(`delivered-${message.id}-${message.topicInputSequence}`), actor: this.actor(office, message.memberId, ledger),
      workspaceId, threadRef: message.topicId, selectedThroughSequence: message.topicInputSequence })
    if (result.committed) notifyTeamCatalogue(this.ctx)
  }
  /**
   * Persist one native result without consuming topic updates that were absent from its input.
   * @param office - Existing office.
   * @param message - Addressed request.
   * @param output - Native member output.
   * @returns The separate topic delivery failure, when the ledger refuses the write.
   */
  async memberReply(office: Office, message: OfficeMessage, output: string): Promise<OfficeMessage['topicDeliveryError']> {
    if (!message.topicId) return undefined
    const { ledger, workspaceId } = await this.get(office.id)
    await this.acknowledgeMemberInput(office, message)
    const actor = this.actor(office, message.memberId, ledger)
    const history = ledger.threadHistory(actor, { workspaceId, threadRef: message.topicId, limit: 1 })
    const result = await ledger.reply({ requestId: requestId(`result-${message.id}`), actor, workspaceId, threadRef: message.topicId,
      baseRevision: history.thread.revision, body: output, replyToMessageRef: message.sourceMessageRef ?? history.anchor.messageRef })
    if (result.committed) notifyTeamCatalogue(this.ctx)
    return result.value.kind === 'committed' ? undefined : result.value.kind
  }
}
