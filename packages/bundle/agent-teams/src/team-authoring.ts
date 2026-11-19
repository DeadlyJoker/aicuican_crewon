/** Durable, revision-fenced approval of reusable expert-team definitions. */
import type { Context } from '@deepseek-ai/cordis'
import { principalOf, Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { name as namespace } from '@nanmicoder/dsh-agent-teams'
import { normalizeTeamDefinition, type TeamAuthoringDraft, type TeamAuthoringInput } from './team-authoring-types.ts'
import { notifyTeamCatalogue } from './catalogue.ts'
import type { TeamExperts } from './expert-controller.ts'

const memberSchema = z.object({ name: z.string(), role: z.string().optional(), executionPrompt: z.string().optional(),
  agentPreset: z.string().optional(), expertId: z.string().optional() }).catchall(z.json())
const profileSchema = z.object({ description: z.string().optional(), goal: z.string().optional(),
  constraints: z.string().optional(), deliverables: z.string().optional(), examples: z.array(z.string()).optional(),
  protocol: z.string().optional(), members: z.array(memberSchema) }).catchall(z.json())
const inputSchema = z.object({ name: z.string(), profile: profileSchema, replace: z.boolean().optional() })
const stateSchema = inputSchema.extend({ id: z.uuid(), revision: z.number().int().positive(),
  status: z.enum(['pending', 'saving', 'saved', 'discarded']) })
const settingsSchema = z.object({ maxMembers: z.number().int().positive(), profiles: z.record(z.string(), profileSchema) })

declare module '@deepseek-ai/cordis' {
  interface Context { teamAuthoring: TeamAuthoring }
}

/** Profile-local drafts survive Host restarts and never dispatch agent work. */
export class TeamAuthoring extends TypertRemoteService {
  private readonly db: DatabaseSync
  private pending: Promise<unknown> = Promise.resolve()

  /** @param ctx - Owner of profile settings and the native preset registry.
   * @param experts - Initialized expert catalogue used to resolve immutable revisions.
   */
  constructor(ctx: Context, private readonly experts: Pick<TeamExperts, 'list'>) {
    super(ctx, 'teamAuthoring')
    this.db = new DatabaseSync(join(ctx.profileContext.dir, 'team-authoring.sqlite'))
    const version = this.db.prepare('PRAGMA user_version').get()?.user_version
    if (version !== 0 && version !== 1) throw new Error(`Unsupported team authoring storage version: ${String(version)}`)
    this.db.exec(`CREATE TABLE IF NOT EXISTS drafts (
      session_id TEXT PRIMARY KEY, call_id TEXT NOT NULL, expected_revision INTEGER NOT NULL, data TEXT NOT NULL
    ); PRAGMA user_version = 1;`)
    ctx.effect(() => async () => { await this.pending; this.db.close() }, 'team authoring drafts')
  }

  private requireOwner(): void {
    if (principalOf(this.ctx.invocation) !== undefined) throw new Error('Expert-team settings require the Host owner.')
  }

  private settings() {
    const descriptor = this.ctx.settings.describe().find(item => item.ns === namespace)
    if (!descriptor) throw new Error('Enable the agent-teams plugin before editing expert teams.')
    return { descriptor, value: settingsSchema.parse(descriptor.value) }
  }

  private enqueue<T>(action: () => Promise<T> | T): Promise<T> {
    const task = this.pending.then(action)
    this.pending = task.catch(() => undefined)
    return task
  }

  private write(sessionId: SessionId, value: TeamAuthoringDraft): TeamAuthoringDraft {
    this.db.prepare('UPDATE drafts SET data=? WHERE session_id=?').run(JSON.stringify(value), sessionId)
    notifyTeamCatalogue(this.ctx)
    return value
  }

  private committed(value: TeamAuthoringDraft): boolean {
    const user = z.object({ profiles: z.record(z.string(), z.json()).optional() }).safeParse(this.settings().descriptor.user)
    return user.success && isDeepStrictEqual(user.data.profiles?.[value.name], value.profile)
  }

  /** Read a conversation's latest draft, including its confirmed outcome.
   * @param sessionId - Conversation that proposed the team.
   * @returns The durable draft, or null when no team was proposed.
   */
  @Remote('read')
  read(sessionId: SessionId): TeamAuthoringDraft | null {
    this.requireOwner()
    const row = this.db.prepare('SELECT data FROM drafts WHERE session_id=?').get(sessionId)
    return row ? stateSchema.parse(JSON.parse(String(row.data))) as TeamAuthoringDraft : null
  }

  private current(sessionId: SessionId, id: string, revision: number): TeamAuthoringDraft {
    const value = this.read(sessionId)
    if (!value || value.id !== id || value.revision !== revision) throw new Error('The team draft changed. Review the latest card.')
    return value
  }

  /** Resolve catalogue references and reject fabricated or unavailable presets.
   * @param input - Definition using saved expert identities or registered preset IDs.
   * @returns A normalized definition with immutable expert revisions.
   */
  async resolve(input: TeamAuthoringInput): Promise<TeamAuthoringInput> {
    const { value } = this.settings()
    const experts = this.experts.list().experts
    const presets = await this.ctx.agentPresets.list()
    const members = input.profile.members.map((member) => {
      const expert = member.expertId ? experts.find(item => item.id === member.expertId) : undefined
      if (member.expertId && !expert) throw new Error(`Expert is unavailable: ${member.expertId}`)
      if (expert && member.agentPreset && member.agentPreset !== expert.preset) {
        // An earlier immutable revision remains valid only when explicitly selected by its preset.
        if (!member.agentPreset.startsWith(`expert-${expert.id}-v`) || !presets.some(item => item.id === member.agentPreset && !item.broken)) throw new Error('The selected expert revision is unavailable.')
      }
      const agentPreset = member.agentPreset || expert?.preset
      if (agentPreset && !presets.some(item => item.id === agentPreset && !item.broken)) throw new Error(`Agent preset is unavailable: ${agentPreset}`)
      return { ...member, ...(agentPreset ? { agentPreset } : {}),
        role: member.role || expert?.description || expert?.name || '',
        executionPrompt: member.executionPrompt || expert?.prompt || '' }
    })
    return normalizeTeamDefinition({ ...input, profile: { ...input.profile, members } }, value.maxMembers)
  }

  /** Stage one proposal; replaying the same tool call returns the same draft.
   * @param sessionId - Conversation requesting creation.
   * @param callId - Durable tool call identity for safe retries.
   * @param input - Proposed reusable team.
   * @returns A pending card, without saving the team directory.
   */
  stage(sessionId: SessionId, callId: string, input: TeamAuthoringInput): Promise<TeamAuthoringDraft> {
    this.requireOwner()
    return this.enqueue(async () => {
      const row = this.db.prepare('SELECT call_id FROM drafts WHERE session_id=?').get(sessionId)
      const current = this.read(sessionId)
      if (row?.call_id === callId && current) return current
      if (current?.status === 'saving') throw new Error('Finish confirming the current team draft first.')
      const normalized = await this.resolve(input)
      const { descriptor, value } = this.settings()
      if (Object.hasOwn(value.profiles, normalized.name) && !normalized.replace) throw new Error('This team already exists. Request an explicit update.')
      const next: TeamAuthoringDraft = { ...normalized, id: current?.status === 'pending' ? current.id : randomUUID(),
        revision: current?.status === 'pending' ? current.revision + 1 : 1, status: 'pending' }
      this.db.prepare(`INSERT INTO drafts VALUES (?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET
        call_id=excluded.call_id,expected_revision=excluded.expected_revision,data=excluded.data`)
        .run(sessionId, callId, descriptor.revision, JSON.stringify(next))
      notifyTeamCatalogue(this.ctx)
      return next
    })
  }

  /** Edit a pending proposal without publishing it as a reusable team.
   * @param sessionId - Draft's conversation.
   * @param id - Draft identity.
   * @param revision - Revision the user reviewed.
   * @param input - Updated fields.
   * @returns The next pending revision.
   */
  @Remote('update')
  update(sessionId: SessionId, id: string, revision: number, input: TeamAuthoringInput): Promise<TeamAuthoringDraft> {
    this.requireOwner()
    return this.enqueue(async () => {
      const current = this.current(sessionId, id, revision)
      if (current.status !== 'pending') throw new Error('This proposal is already closed.')
      const normalized = await this.resolve(inputSchema.parse(input) as TeamAuthoringInput)
      this.db.prepare('UPDATE drafts SET expected_revision=? WHERE session_id=?').run(this.settings().descriptor.revision, sessionId)
      return this.write(sessionId, { ...normalized, id, revision: revision + 1, status: 'pending' })
    })
  }

  /** Save the reviewed definition once. A restart during save reconciles the committed value.
   * @param sessionId - Draft's conversation.
   * @param id - Draft identity.
   * @param revision - Revision the user approved.
   * @returns The saved outcome; repeated confirmation returns the same outcome.
   */
  @Remote('confirm')
  confirm(sessionId: SessionId, id: string, revision: number): Promise<TeamAuthoringDraft> {
    this.requireOwner()
    return this.enqueue(async () => {
      const current = this.current(sessionId, id, revision)
      if (current.status === 'saved') return current
      if (current.status === 'discarded') throw new Error('This proposal was discarded.')
      const { descriptor, value } = this.settings()
      const row = this.db.prepare('SELECT expected_revision FROM drafts WHERE session_id=?').get(sessionId)
      if (current.status === 'saving' && this.committed(current)) {
        return this.write(sessionId, { ...current, status: 'saved' })
      }
      if (descriptor.revision !== row?.expected_revision) throw new Error('Team settings changed. Review a new proposal before saving.')
      if (!current.replace && Object.hasOwn(value.profiles, current.name)) throw new Error('This team already exists.')
      if (!Object.hasOwn(value.profiles, current.name) && Object.keys(value.profiles).length >= 16) throw new Error('The team directory is full.')
      this.write(sessionId, { ...current, status: 'saving' })
      try {
        await this.ctx.settings.mutate(namespace, [{ op: 'set', path: ['profiles', current.name], value: current.profile }], descriptor.revision)
      } catch (error) {
        if (this.committed(current)) return this.write(sessionId, { ...current, status: 'saved' })
        this.write(sessionId, { ...current, status: 'pending' })
        throw error
      }
      return this.write(sessionId, { ...current, status: 'saved' })
    })
  }

  /** Close the pending card without saving the definition.
   * @param sessionId - Draft's conversation.
   * @param id - Draft identity.
   * @param revision - Revision the user dismissed.
   * @returns The discarded draft.
   */
  @Remote('discard')
  discard(sessionId: SessionId, id: string, revision: number): Promise<TeamAuthoringDraft> {
    this.requireOwner()
    return this.enqueue(() => {
      const current = this.current(sessionId, id, revision)
      if (current.status !== 'pending' && current.status !== 'discarded') throw new Error('This proposal is already being saved.')
      return this.write(sessionId, { ...current, status: 'discarded' })
    })
  }
}
