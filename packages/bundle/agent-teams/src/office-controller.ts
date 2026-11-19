/** Office state and delivery over native continuable subagents. */
import type { Context } from '@deepseek-ai/cordis'
import { notifyTeamCatalogue } from './catalogue.ts'
import { principalOf, Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { CommandInvocation } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/dsh-api-session-controller/types'
import { createUserMessage, type ContextFormed, type UserMessage } from '@deepseek-ai/dsh-llm'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import type { Office, OfficeDiscussion, OfficeDraft, OfficeUpdate, OfficeMessage, OfficeId, OfficeMemberId, OfficeMessageId, OfficeTopicScope, OfficeTopicConversation } from './office-types.ts'
import type { OfficeTopicId } from './office-project-types.ts'
import { AGENT_TEAM_HUMAN_HANDLE } from './contexera-domain/ledger.ts'

const draftSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400),
  members: z.array(z.object({
    name: z.string().trim().min(1).max(80),
    role: z.string().trim().min(1).max(400),
    instruction: z.string().trim().min(1).max(4000),
    agentPreset: z.string().trim().min(1).optional(),
  })).min(1),
  leaderIndex: z.number().int().nonnegative().optional(),
})
const updateSchema = draftSchema.extend({
  members: z.array(draftSchema.shape.members.element.extend({
    id: z.uuid().transform(value => value as OfficeMemberId).optional(),
  })).min(1),
})
const messageSchema = z.object({
  memberId: z.uuid().transform(value => value as OfficeMemberId).optional(),
  text: z.string().trim().min(1).max(12000),
  id: z.uuid().transform(value => value as OfficeMessageId),
  topicId: z.string().regex(/^thread:[^:]+$/).transform(value => value as OfficeTopicId).optional(),
  sourceMessageRef: z.string().regex(/^message:[^:]+$/).transform(value => value as import('./contexera-domain/types.ts').AgentTeamMessageRef).optional(),
}).refine(input => input.sourceMessageRef === undefined || input.topicId !== undefined, 'A source message requires its topic.')
const topicOpenSchema = z.object({
  officeId: z.uuid().transform(value => value as OfficeId),
  topicId: z.string().regex(/^thread:[^:]+$/).transform(value => value as OfficeTopicId),
})
const delegationSchema = z.object({ member: z.string().trim().min(1), task: z.string().trim().min(1).max(12000) })
const delegationNamespace = Buffer.from('5e4294a3baa54e1d9a6a2d0df87b12e4', 'hex')

function delegationId(parent: OfficeMessageId, callId: ToolRunContext['callId']): OfficeMessageId {
  const bytes = createHash('sha1').update(delegationNamespace).update(`${parent}\0${callId}`).digest().subarray(0, 16)
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x50, 6)
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8)
  const value = bytes.toString('hex')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}` as OfficeMessageId
}


declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Office context retained with its original message content. @persistenceAttribution */
    'team-office-context': { kind: 'team-office-context' } & ContextFormed
    /** Topic initialization attribution; removal of the producer retains the queued content. @persistenceAttribution */
    'team-office-topic-initialization': { kind: 'team-office-topic-initialization'; officeId: OfficeId; topicId: OfficeTopicId }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Long-lived office membership and addressed discussion state. */
    teamOffices: TeamOffices
  }
}
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** Office settings belong to the local Host owner. */
    'team-office/owner-required': {}
  }
}

/** Own office identities; native subagent sessions own their model context and resume lifecycle. */
export class TeamOffices extends TypertRemoteService {
  private readonly db: DatabaseSync
  private closed = false
  private readonly delegationOwners = new Map<OfficeMessageId, { id: OfficeMemberId; requestId: OfficeMessageId }>()
  private readonly deliveryWaiters = new Map<OfficeMessageId, Set<{
    resolve: (message: OfficeMessage) => void
    reject: (error: Error) => void
  }>>()

  /** @param ctx - Native subagents, profile storage and command registrations. */
  constructor(ctx: Context) {
    super(ctx, 'teamOffices')
    this.db = new DatabaseSync(join(ctx.profileContext.dir, 'team-offices.sqlite'))
    const version = this.db.prepare('PRAGMA user_version').get()?.user_version
    if (version !== 0 && version !== 1 && version !== 2) throw new Error('Unsupported office database version.')
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS offices (id TEXT PRIMARY KEY, session_id TEXT UNIQUE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, office_id TEXT NOT NULL, member_id TEXT NOT NULL,
        child_id TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS topic_sessions (office_id TEXT NOT NULL, topic_id TEXT NOT NULL,
        session_id TEXT NOT NULL UNIQUE, data TEXT NOT NULL, PRIMARY KEY(office_id, topic_id));
      CREATE TABLE IF NOT EXISTS topic_members (root_session_id TEXT NOT NULL, topic_id TEXT NOT NULL,
        member_id TEXT NOT NULL, child_id TEXT NOT NULL UNIQUE, PRIMARY KEY(root_session_id, topic_id, member_id));
    `)
    if (version !== 2) {
      this.db.exec(`
        BEGIN IMMEDIATE;
        ALTER TABLE messages ADD COLUMN root_session_id TEXT;
        UPDATE messages SET root_session_id=(SELECT session_id FROM offices WHERE offices.id=messages.office_id);
        PRAGMA user_version=2;
        COMMIT;
      `)
    }
    this.db.exec(`
      DROP INDEX IF EXISTS active_member;
      CREATE UNIQUE INDEX IF NOT EXISTS active_child ON messages(child_id) WHERE status='running';
      UPDATE messages SET status='interrupted' WHERE status='running';
      UPDATE messages SET data=json_set(data, '$.topicDeliveryError', 'delivery_failed')
        WHERE json_extract(data, '$.topicDeliveryError')='delivery_pending';
    `)
    ctx.on('api-session/reusable', (sessionId, next) => {
      const allowed = next()
      const bound = this.db.prepare('SELECT 1 FROM offices WHERE session_id=? UNION ALL SELECT 1 FROM topic_sessions WHERE session_id=? LIMIT 1')
        .get(sessionId, sessionId)
      return allowed && bound === undefined
    })
    ctx.effect(() => () => {
      this.closed = true
      for (const waiters of this.deliveryWaiters.values()) {
        for (const waiter of waiters) waiter.reject(new Error('Office service stopped before delegated work settled.'))
      }
      this.deliveryWaiters.clear()
      this.db.close()
    }, 'office database lifetime')
    ctx.effect(() => ctx.commands.register({
      name: 'team-office-open', description: 'Open a persistent office.',
      handler: request => this.open(request),
    }), 'office open command')
    ctx.effect(() => ctx.commands.register({
      name: 'team-office-topic-open', description: 'Open an independent office topic conversation.',
      handler: request => this.openTopic(request),
    }), 'office topic open command')
    ctx.effect(() => ctx.commands.register({
      name: 'team-office-send', description: 'Address one persistent office member.',
      handler: request => this.send(request),
    }), 'office send command')
    ctx.effect(() => ctx.tools.register({
      name: 'office_delegate',
      description: 'Delegate a task to a fixed member of your current office and wait for its real result. Only the office leader may call this.',
      parameters: z.toJSONSchema(delegationSchema),
      output: {
        schema: { type: 'object', additionalProperties: false, required: ['memberId', 'name', 'messageId', 'output'], properties: {
          memberId: { type: 'string' }, name: { type: 'string' }, messageId: { type: 'string' }, output: { type: 'string' },
          topicContext: { type: 'string' }, deliveryError: { type: 'string' },
        } },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      execute: (args, exec) => this.delegate(delegationSchema.parse(args), exec),
      presentCall: () => ({ card: 'generic', title: 'Delegate office task', kind: 'execute' }),
    }, { when: ({ agent }) => this.leaderRequest(agent.id) !== undefined }), 'office leader delegation tool')
    ctx.on('agent/pre-step', async ({ agent, messages }, next) => {
      const decision = await next()
      if (decision.kind !== 'enter') return decision
      const topic = this.db.prepare('SELECT office_id,topic_id FROM topic_sessions WHERE session_id=?').get(agent.session.id)
      const lobby = this.db.prepare('SELECT id FROM offices WHERE session_id=?').get(agent.session.id)
      const children = new Set(this.db.prepare('SELECT DISTINCT child_id FROM messages WHERE root_session_id=?')
        .all(agent.session.id).map(row => String(row.child_id)))
      if (!topic && !lobby && children.size === 0) return decision
      const isInternalNotice = (message: UserMessage) => {
        const source = message.source
        if (source.kind === 'subagent-settled') return children.has(source.senderSessionId)
        if (source.kind === 'team-office-context') return lobby !== undefined
        return topic !== undefined && source.kind === 'team-office-topic-initialization'
          && source.officeId === topic.office_id && source.topicId === topic.topic_id
      }
      // Rejection survives outer admission plugins that append context to an entered step.
      if (messages.length > 0 && messages.every(isInternalNotice)) return { kind: 'reject' }
      return { ...decision, messages: decision.messages.filter(message => !isInternalNotice(message)) }
    }, { prepend: true })
    // oxlint-disable-next-line typescript/no-misused-promises -- subagent/end contains rejected observer promises.
    ctx.on('subagent/end', async (info) => {
      if (this.closed) return
      const row = this.db.prepare("SELECT id, data, office_id FROM messages WHERE child_id=? AND status='running'").get(info.id)
      if (!row) return
      const message = JSON.parse(String(row.data)) as OfficeMessage
      const status = info.stopReason === 'completed' ? 'completed' : 'failed'
      const output = (info.lastAssistantMessage ?? []).filter(block => block.type === 'text').map(block => block.text).join('\n')
      const settled: OfficeMessage = { ...message, status, output,
        ...(message.topicId && output ? { topicDeliveryError: 'delivery_pending' } : {}) }
      this.db.prepare("UPDATE messages SET status=?, data=? WHERE id=? AND status='running'")
        .run(status, JSON.stringify(settled), String(row.id))
      if (message.topicId && output) {
        let deliveryError: OfficeMessage['topicDeliveryError'] = 'delivery_failed'
        try {
          const office = this.list().find(item => item.id === row.office_id)
          if (office) deliveryError = await this.projects().memberReply(office, message, output)
        } catch (error) {
          this.ctx.logger.warn('Office topic reply could not be recorded: %s', error)
        }
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- disposal can close the database while memberReply is awaited.
        if (this.closed) return
        const { topicDeliveryError: _pending, ...completed } = settled
        this.db.prepare('UPDATE messages SET data=? WHERE id=?')
          .run(JSON.stringify({ ...completed, ...(deliveryError ? { topicDeliveryError: deliveryError } : {}) }), String(row.id))
      }
      this.notifyDelivery(message.id)
    })
  }

  private projects(): Context['teamOfficeProjects'] {
    const projects = this.ctx.get('teamOfficeProjects')
    if (!projects) throw new Error('Office projects require workspace storage services.')
    return projects
  }

  private delivery(id: OfficeMessageId): OfficeMessage | undefined {
    const row = this.db.prepare('SELECT data,status FROM messages WHERE id=?').get(id)
    return row ? { ...JSON.parse(String(row.data)) as OfficeMessage, status: String(row.status) as OfficeMessage['status'] } : undefined
  }

  private leaderRequest(childId: SessionId) {
    if (this.closed) return undefined
    const row = this.db.prepare("SELECT id,root_session_id FROM messages WHERE child_id=? AND status='running'").get(childId)
    if (!row || typeof row.root_session_id !== 'string') return undefined
    const rootId = SessionId(row.root_session_id)
    const discussion = this.read(rootId)
    const request = this.delivery(String(row.id) as OfficeMessageId)
    if (!discussion || !request || discussion.office.leaderId !== request.memberId) return undefined
    return { request, discussion, rootId }
  }

  private notifyDelivery(id: OfficeMessageId): void {
    notifyTeamCatalogue(this.ctx)
    const message = this.delivery(id)
    if (!message || message.status === 'running' || message.topicDeliveryError === 'delivery_pending') return
    const waiters = this.deliveryWaiters.get(id)
    this.deliveryWaiters.delete(id)
    for (const waiter of waiters ?? []) waiter.resolve(message)
  }

  private waitForDelivery(id: OfficeMessageId): Promise<OfficeMessage> {
    if (this.closed) return Promise.reject(new Error('Office service stopped before delegated work settled.'))
    const message = this.delivery(id)
    if (!message) return Promise.reject(new Error('The delegated office task was not recorded.'))
    if (message.status !== 'running' && message.topicDeliveryError !== 'delivery_pending') return Promise.resolve(message)
    return new Promise((resolve, reject) => {
      const waiters = this.deliveryWaiters.get(id) ?? new Set()
      waiters.add({ resolve, reject })
      this.deliveryWaiters.set(id, waiters)
    })
  }

  private async delegate(args: z.infer<typeof delegationSchema>, exec: ToolRunContext) {
    const agent = exec.agent
    if (!agent) throw new Error('Only the active office leader can delegate office tasks.')
    const leader = this.leaderRequest(agent.id)
    if (!leader) throw new Error('Only the active office leader can delegate office tasks.')
    const root = this.ctx.subagents.rootOf(agent)
    if (root.id !== leader.rootId) throw new Error('The leader does not belong to this office conversation.')
    const target = leader.discussion.office.members.find(member => member.id === args.member
      || member.name.normalize('NFC').toLocaleLowerCase() === args.member.normalize('NFC').toLocaleLowerCase())
    if (!target?.sessionId) throw new Error('The requested member does not belong to this office.')
    if (target.id === leader.request.memberId) throw new Error('The office leader must delegate to another member.')
    const id = delegationId(leader.request.id, exec.callId)
    const childId = leader.request.topicId ? this.topicChild(leader.rootId, leader.request.topicId, target.id) : target.sessionId
    const onAbort = (): void => {
      if (!this.closed && this.delivery(id)?.status === 'running') {
        this.ctx.subagents.interrupt(childId, { kind: 'ancestor', agent: root })
      }
    }
    exec.signal.throwIfAborted()
    exec.signal.addEventListener('abort', onAbort, { once: true })
    this.delegationOwners.set(id, { id: leader.request.memberId, requestId: leader.request.id })
    try {
      const input = { id, memberId: target.id, text: args.task,
        ...(leader.request.topicId ? { topicId: leader.request.topicId } : {}),
        ...(leader.request.sourceMessageRef ? { sourceMessageRef: leader.request.sourceMessageRef } : {}) }
      const execution = await this.ctx.commands.execute(root, `/team-office-send ${JSON.stringify(input)}`, [], exec.signal)
      if (!execution || execution.result.kind === 'error') {
        throw new Error(execution?.result.text ?? 'The office delegation command is unavailable.')
      }
      const result = await this.waitForDelivery(id)
      exec.signal.throwIfAborted()
      if (result.status !== 'completed') throw new Error(`Office member ${target.name} ended the delegated task as ${result.status}.`)
      let topicContext: string | undefined
      if (leader.request.topicId) {
        const context = await this.projects().memberInput(leader.discussion.office, leader.request.memberId,
          leader.request.topicId, leader.request.sourceMessageRef)
        topicContext = context.text
        const current = this.delivery(leader.request.id)
        if (!current || current.status !== 'running') throw new Error('The leader request ended before its delegated result was delivered.')
        const updated = { ...current, topicInputSequence: context.readThroughSequence, topicInputRevision: context.revision }
        this.db.prepare('UPDATE messages SET data=? WHERE id=?').run(JSON.stringify(updated), current.id)
        await this.projects().acknowledgeMemberInput(leader.discussion.office, updated)
      }
      return { memberId: target.id, name: target.name, messageId: id, output: result.output ?? '',
        ...(topicContext === undefined ? {} : { topicContext }),
        ...(result.topicDeliveryError === undefined ? {} : { deliveryError: result.topicDeliveryError }) }
    } catch (error) {
      if (exec.signal.aborted && !this.closed && this.delivery(id)?.status === 'running') await this.waitForDelivery(id)
      throw error
    } finally {
      exec.signal.removeEventListener('abort', onAbort)
      this.delegationOwners.delete(id)
    }
  }

  private owner(): void {
    if (principalOf(this.ctx.invocation) !== undefined) throw new RemoteError('team-office/owner-required', 'Office settings belong to the Host owner.', {})
  }

  /**
   * List office definitions without loading their member sessions.
   * @returns The saved office definitions.
   */
  @Remote('list')
  list(): Office[] {
    this.owner()
    return this.db.prepare('SELECT data FROM offices ORDER BY rowid DESC').all().map(row => JSON.parse(String(row.data)) as Office)
  }

  /**
   * Save a new office and stable member identities.
   * @param draft - User-configured roles and existing native Agent presets.
   * @returns The saved office.
   */
  @Remote('save')
  save(draft: OfficeDraft): Office {
    this.owner()
    const parsed = draftSchema.parse(draft)
    const names = parsed.members.map(member => member.name.normalize('NFKC').toLowerCase())
    if (new Set(names).size !== names.length) throw new Error('Office member names must be unique.')
    if (names.includes(AGENT_TEAM_HUMAN_HANDLE)) throw new Error('The member name is reserved for the human user.')
    const { leaderIndex, ...definition } = parsed
    const members = parsed.members.map(({ agentPreset, ...member }) => ({
      ...member, id: randomUUID() as OfficeMemberId, ...(agentPreset ? { agentPreset } : {}),
    }))
    const leader = leaderIndex === undefined ? undefined : members[leaderIndex]
    if (leaderIndex !== undefined && !leader) throw new Error('The selected leader is outside the office roster.')
    const office: Office = { ...definition, id: randomUUID() as OfficeId, members, ...(leader ? { leaderId: leader.id } : {}) }
    this.db.prepare('INSERT INTO offices VALUES (?, NULL, ?)').run(office.id, JSON.stringify(office))
    notifyTeamCatalogue(this.ctx)
    return office
  }

  /**
   * Update an office while retaining existing member sessions and every recorded discussion.
   * @param officeId - Office whose configuration is being edited.
   * @param draft - Complete roster. Missing member ids create fresh identities; stable unused ids preserve new specialists across retries.
   * @returns Saved configuration with stable member identities. A changed preset allocates new execution sessions for future messages.
   */
  @Remote('update')
  update(officeId: OfficeId, draft: OfficeUpdate): Office {
    this.owner()
    const parsed = updateSchema.parse(draft)
    const row = this.db.prepare('SELECT data FROM offices WHERE id=?').get(officeId)
    if (!row) throw new Error('Office not found.')
    const office = JSON.parse(String(row.data)) as Office
    const names = parsed.members.map(member => member.name.normalize('NFKC').toLowerCase())
    if (new Set(names).size !== names.length) throw new Error('Office member names must be unique.')
    if (names.includes(AGENT_TEAM_HUMAN_HANDLE)) throw new Error('The member name is reserved for the human user.')
    const ids = parsed.members.flatMap(member => member.id ? [member.id] : [])
    if (new Set(ids).size !== ids.length) throw new Error('Office member identities must be unique.')
    const switched = new Set<OfficeMemberId>()
    const members = parsed.members.map(({ id, agentPreset, ...fields }) => {
      const existing = office.members.find(member => member.id === id)
      if (id && !existing && (this.list().some(item => item.members.some(member => member.id === id))
        || this.db.prepare('SELECT member_id FROM messages WHERE member_id=? UNION SELECT member_id FROM topic_members WHERE member_id=? LIMIT 1').get(id, id))) {
        throw new Error('The member identity belongs to another office or a former member.')
      }
      const changedPreset = existing !== undefined && agentPreset !== existing.agentPreset
      if (changedPreset) switched.add(existing.id)
      return { ...fields, id: existing?.id ?? id ?? randomUUID() as OfficeMemberId,
        ...(agentPreset ? { agentPreset } : {}),
        ...(existing?.sessionId && !changedPreset ? { sessionId: existing.sessionId }
          : office.sessionId ? { sessionId: SessionId(randomUUID()) } : {}) }
    })
    const leader = parsed.leaderIndex === undefined ? undefined : members[parsed.leaderIndex]
    if (parsed.leaderIndex !== undefined && !leader) throw new Error('The selected leader is outside the office roster.')
    const busy = this.db.prepare("SELECT member_id FROM messages WHERE office_id=? AND (status='running' OR json_extract(data,'$.topicDeliveryError')='delivery_pending')").all(officeId)
    if (busy.some(message => !members.some(member => member.id === message.member_id))) {
      throw new Error('A member is still working. Wait for their reply before removing them.')
    }
    if (busy.length > 0 && leader?.id !== office.leaderId) throw new Error('Office members are still working. Wait for their replies before changing the leader.')
    const { leaderId: _previousLeader, ...previous } = office
    const updated: Office = { ...previous, name: parsed.name, description: parsed.description, members,
      ...(leader ? { leaderId: leader.id } : {}) }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('UPDATE offices SET data=? WHERE id=?').run(JSON.stringify(updated), officeId)
      const topics = this.db.prepare('SELECT session_id,topic_id FROM topic_sessions WHERE office_id=?').all(officeId)
      for (const topic of topics) for (const member of members) {
        if (switched.has(member.id)) {
          this.db.prepare('UPDATE topic_members SET child_id=? WHERE root_session_id=? AND topic_id=? AND member_id=?')
            .run(randomUUID(), String(topic.session_id), String(topic.topic_id), member.id)
        }
        this.topicChild(SessionId(String(topic.session_id)), String(topic.topic_id) as OfficeTopicId, member.id)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    notifyTeamCatalogue(this.ctx)
    return updated
  }

  /** Select or clear the default recipient without replacing any office or member session.
   * @param officeId - Office to update.
   * @param memberId - Existing member to select; omission clears the leader.
   * @returns Updated office definition.
   */
  @Remote('setLeader')
  setLeader(officeId: OfficeId, memberId?: OfficeMemberId): Office {
    this.owner()
    const row = this.db.prepare('SELECT data FROM offices WHERE id=?').get(officeId)
    if (!row) throw new Error('Office not found.')
    const office = JSON.parse(String(row.data)) as Office
    if (memberId !== undefined && !office.members.some(member => member.id === memberId)) {
      throw new Error('The selected leader does not belong to this office.')
    }
    const { leaderId: _previous, ...definition } = office
    const updated: Office = { ...definition, ...(memberId === undefined ? {} : { leaderId: memberId }) }
    this.db.prepare('UPDATE offices SET data=? WHERE id=?').run(JSON.stringify(updated), officeId)
    notifyTeamCatalogue(this.ctx)
    return updated
  }

  /**
   * Read the office bound to a conversation and its retained discussion.
   * @param sessionId - Owning office conversation.
   * @returns Discussion, or null for an ordinary conversation.
   */
  @Remote('read')
  read(sessionId: SessionId): OfficeDiscussion | null {
    this.owner()
    const row = this.db.prepare('SELECT data FROM offices WHERE session_id=?').get(sessionId)
    const topic = row ? undefined : this.db.prepare('SELECT office_id,data FROM topic_sessions WHERE session_id=?').get(sessionId)
    const officeRow = row ?? (topic ? this.db.prepare('SELECT data FROM offices WHERE id=?').get(String(topic.office_id)) : undefined)
    if (!officeRow) return null
    const original = JSON.parse(String(officeRow.data)) as Office
    const scope = topic ? JSON.parse(String(topic.data)) as OfficeTopicScope : undefined
    const office = scope ? { ...original, sessionId,
      members: original.members.map(member => ({ ...member, sessionId: this.readTopicChild(sessionId, scope.topicId, member.id) })),
    } : original
    const messages = this.readMessages('SELECT data,status FROM messages WHERE root_session_id=? ORDER BY rowid', sessionId)
    return { office, messages, ...(scope ? { scope } : {}) }
  }

  /**
   * Read topic deliveries across its current conversation and earlier office conversations.
   * @param officeId - Office owning the topic.
   * @param topicId - Topic identity.
   * @returns Persisted delivery records.
   */
  topicMessages(officeId: OfficeId, topicId: OfficeTopicId): OfficeMessage[] {
    this.owner()
    return this.readMessages("SELECT data,status FROM messages WHERE office_id=? AND json_extract(data,'$.topicId')=? ORDER BY rowid", officeId, topicId)
  }

  /**
   * Resolve the topic's canonical conversation without creating or dispatching work.
   * @param officeId - Topic's office.
   * @param topicId - Existing topic identity.
   * @returns Existing conversation, or the workspace and scope needed to create it.
   */
  @Remote('resolveTopicSession')
  async resolveTopicSession(officeId: OfficeId, topicId: OfficeTopicId): Promise<OfficeTopicConversation> {
    this.owner()
    const scope = await this.projects().topicScope(officeId, topicId)
    const workspaceId = await this.projects().topicWorkspaceId(officeId)
    const row = this.db.prepare('SELECT session_id,data FROM topic_sessions WHERE office_id=? AND topic_id=?').get(officeId, topicId)
    return row ? { sessionId: SessionId(String(row.session_id)), workspaceId, scope: JSON.parse(String(row.data)) as OfficeTopicScope }
      : { workspaceId, scope }
  }

  private readMessages(sql: string, ...parameters: string[]): OfficeMessage[] {
    return this.db.prepare(sql).all(...parameters)
      .map(row => ({ ...JSON.parse(String(row.data)) as OfficeMessage, status: String(row.status) as OfficeMessage['status'] }))
  }

  private topicChild(root: SessionId, topic: OfficeTopicId, member: OfficeMemberId): SessionId {
    this.db.prepare('INSERT OR IGNORE INTO topic_members VALUES (?,?,?,?)').run(root, topic, member, randomUUID())
    return this.readTopicChild(root, topic, member)
  }

  private readTopicChild(root: SessionId, topic: OfficeTopicId, member: OfficeMemberId): SessionId {
    const row = this.db.prepare('SELECT child_id FROM topic_members WHERE root_session_id=? AND topic_id=? AND member_id=?').get(root, topic, member)
    if (!row) throw new Error('Office topic member session could not be allocated.')
    return SessionId(String(row.child_id))
  }

  private async openTopic(request: CommandInvocation) {
    const input = topicOpenSchema.parse(JSON.parse(request.rawInput))
    const office = this.list().find(item => item.id === input.officeId)
    if (!office?.sessionId) throw new Error('Enter the office before opening its topics.')
    const scope = await this.projects().topicScope(input.officeId, input.topicId)
    const existing = this.db.prepare('SELECT session_id FROM topic_sessions WHERE office_id=? AND topic_id=?').get(input.officeId, input.topicId)
    if (existing) {
      if (existing.session_id === request.agent.session.id) this.initializeTopic(request, input.officeId, input.topicId)
      return { kind: 'success' as const }
    }
    if (this.read(request.agent.session.id)) throw new Error('Open this topic in a new conversation.')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('INSERT INTO topic_sessions VALUES (?,?,?,?)').run(input.officeId, input.topicId, request.agent.session.id, JSON.stringify(scope))
      for (const member of office.members) this.topicChild(request.agent.session.id, input.topicId, member.id)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    notifyTeamCatalogue(this.ctx)
    this.initializeTopic(request, input.officeId, input.topicId)
    return { kind: 'success' as const }
  }

  private initializeTopic(request: CommandInvocation, officeId: OfficeId, topicId: OfficeTopicId): void {
    request.agent.followup(createUserMessage({
      source: { kind: 'team-office-topic-initialization', officeId, topicId },
      content: [{ type: 'text', text: 'Initialize this office topic conversation.' }],
    }))
  }

  private open(request: CommandInvocation) {
    const id = z.uuid().parse(request.rawInput.trim())
    const row = this.db.prepare('SELECT data,session_id FROM offices WHERE id=?').get(id)
    if (!row) throw new Error('Office not found.')
    if (row.session_id && row.session_id !== request.agent.session.id) throw new Error('Open the existing office conversation.')
    if (row.session_id) return { kind: 'success' as const }
    if (this.read(request.agent.session.id)) throw new Error('Open this office in a new conversation.')
    const office = JSON.parse(String(row.data)) as Office
    const saved: Office = { ...office, sessionId: request.agent.session.id,
      members: office.members.map(member => ({ ...member, sessionId: SessionId(randomUUID()) })),
    }
    const result = this.db.prepare('UPDATE offices SET session_id=?, data=? WHERE id=? AND session_id IS NULL')
      .run(request.agent.session.id, JSON.stringify(saved), id)
    if (!result.changes) throw new Error('This office has already been opened.')
    notifyTeamCatalogue(this.ctx)
    const text = `Initialize the persistent office "${saved.name}" conversation.`
    request.agent.followup(createUserMessage({
      source: { kind: 'team-office-context', form: 'snapshot', sections: [{ name: 'office', text }] },
      content: [{ type: 'text', text }],
    }))
    return { kind: 'success' as const }
  }

  private async send(request: CommandInvocation) {
    const input = messageSchema.parse(JSON.parse(request.rawInput))
    const discussion = this.read(request.agent.session.id)
    if (!discussion) throw new Error('This conversation does not belong to an office.')
    if (discussion.scope && input.topicId && input.topicId !== discussion.scope.topicId) throw new Error('This request belongs to a different office topic.')
    const topicId = discussion.scope?.topicId ?? input.topicId
    const previous = this.db.prepare('SELECT root_session_id,status,data FROM messages WHERE id=?').get(input.id)
    const previousMessage = previous ? JSON.parse(String(previous.data)) as OfficeMessage : undefined
    const recipientId = input.memberId ?? previousMessage?.memberId ?? discussion.office.leaderId
    if (recipientId === undefined) throw new Error('This office has no leader. Select a leader or address a member.')
    const member = discussion.office.members.find(candidate => candidate.id === recipientId)
    if (!member?.sessionId) throw new Error('This member does not belong to the current office.')
    if (previous) {
      if (previous.root_session_id !== request.agent.session.id || previousMessage?.memberId !== member.id
        || previousMessage.text !== input.text || previousMessage.topicId !== topicId
        || (this.delegationOwners.has(input.id) && previousMessage.requestedBy !== this.delegationOwners.get(input.id)?.id)) {
        throw new Error('This message identity was already used for another request.')
      }
      if (previous.status === 'failed' || previous.status === 'interrupted') {
        throw new Error('The previous request failed or was interrupted. Send it as a new request to retry.')
      }
      return { kind: 'success' as const }
    }
    const childId = topicId ? this.topicChild(request.agent.session.id, topicId, member.id) : member.sessionId
    if (this.db.prepare("SELECT id FROM messages WHERE child_id=? AND status='running'").get(childId)) {
      throw new Error('This member is still working. Wait for their reply before sending another message.')
    }
    const delegation = this.delegationOwners.get(input.id)
    const requestedBy = delegation?.id
    const message: OfficeMessage = { id: input.id, commandId: request.commandId, memberId: member.id, memberName: member.name,
      ...(member.agentPreset ? { agentPreset: member.agentPreset } : {}),
      text: input.text, createdAt: Date.now(), status: 'running', ...(topicId ? { topicId } : {}),
      ...(requestedBy === undefined ? {} : { requestedBy }),
      ...(delegation === undefined ? {} : { requestedFor: delegation.requestId }),
      ...(input.sourceMessageRef ? { sourceMessageRef: input.sourceMessageRef } : {}) }
    this.db.prepare('INSERT INTO messages (id,office_id,member_id,child_id,status,data,root_session_id) VALUES (?,?,?,?,?,?,?)')
      .run(message.id, discussion.office.id, member.id, childId, 'running', JSON.stringify(message), request.agent.session.id)
    notifyTeamCatalogue(this.ctx)
    try {
      if (discussion.scope && !message.sourceMessageRef) {
        const submitted = await this.projects().submitMemberRequest(
          discussion.office.id, discussion.scope.topicId, member.id, input.text, input.id,
        )
        message.sourceMessageRef = submitted.sourceMessageRef
        message.sourceMessageSequence = submitted.sourceMessageSequence
        this.db.prepare('UPDATE messages SET data=? WHERE id=?').run(JSON.stringify(message), message.id)
      }
      const children = await this.ctx.subagents.listDescendants(request.agent.session.id, request.signal)
      const exists = children.some(child => child.id === childId)
      const topicContext = topicId
        ? await this.projects().memberInput(discussion.office, member.id, topicId, message.sourceMessageRef)
        : undefined
      if (topicContext) {
        message.topicInputSequence = topicContext.readThroughSequence
        message.topicInputRevision = topicContext.revision
        message.sourceMessageSequence = topicContext.sourceMessageSequence
        this.db.prepare('UPDATE messages SET data=? WHERE id=?').run(JSON.stringify(message), message.id)
      }
      const requestText = topicContext ? `${input.text}\n\nTopic history:\n${topicContext.text}` : input.text
      const requestHeading = requestedBy === undefined ? 'User request'
        : `Subtask authored by office leader ${discussion.office.members.find(item => item.id === requestedBy)?.name ?? requestedBy}`
      const coordination = discussion.office.leaderId === member.id
        ? [
          'For this request, act as the office leader. Understand the goal, coordinate viewpoints, and summarize agreements and conflicts.',
          'Use office_delegate to send concrete tasks to the fixed office members and receive their real results. Do not spawn replacement members.',
          'Never invent another member\'s work or findings. If delegation fails, explain it and separate your own analysis from their results.',
          `Office members: ${discussion.office.members.map(item => `${item.name} — ${item.role}`).join('; ')}.`,
        ].join('\n')
        : 'For this request, act as the addressed specialist and follow the responsibilities below.'
      const content = [{ type: 'text' as const, text: `Office member: ${member.name}
Role: ${member.role}
Responsibilities: ${member.instruction}
${coordination}

${requestHeading}:
${requestText}` }]
      if (exists) {
        await this.ctx.subagents.followup(request.agent, childId, content, { source: { kind: 'user' }, signal: request.signal })
      } else {
        const run = await this.ctx.subagents.startActivation({
          parent: request.agent, childId, provider: 'spawn', label: member.name,
          delivery: 'caller', signal: request.signal,
          ...(member.agentPreset ? { agentPreset: member.agentPreset } : {}),
          prompt: [{ type: 'text', text: `You are a persistent office member.
Office: ${discussion.office.name}
Role: ${member.role}
Responsibilities: ${member.instruction}
${coordination}
Continue serving as this member across future messages. Respond directly to the user's addressed request.

${requestHeading}:
${requestText}` }],
        })
        // Lifecycle delivery persists the response; this handler only observes infrastructure rejection.
        void run.result.catch((error: unknown) => {
          if (this.closed) return
          this.ctx.logger.warn('Office member failed: %s', error)
          this.db.prepare("UPDATE messages SET status='failed' WHERE id=? AND status='running'").run(message.id)
          this.notifyDelivery(message.id)
        })
      }
      if (topicId) {
        try {
          await this.projects().acknowledgeMemberInput(discussion.office, message)
        } catch (error) {
          this.ctx.logger.warn('Office member accepted input but its receipt could not be recorded: %s', error)
          message.topicDeliveryError = 'delivery_failed'
          this.db.prepare("UPDATE messages SET data=? WHERE id=? AND status='running'")
            .run(JSON.stringify(message), message.id)
        }
      }
      return { kind: 'success' as const }
    } catch (error) {
      this.db.prepare("UPDATE messages SET status='failed' WHERE id=? AND status='running'").run(message.id)
      this.notifyDelivery(message.id)
      throw error
    }
  }
}
