/** Durable form drafts and idempotent delivery through native session admission. */
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-commands'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { CardState, FormValues } from './types.ts'

const SCHEMA_VERSION = 1

const valuesSchema = z.record(z.string().max(100), z.union([z.string().max(16000), z.boolean()]))
const requestSchema = z.object({ sessionId: z.string().min(1), key: z.string().min(1).max(600) })
const saveSchema = requestSchema.extend({ values: valuesSchema, revision: z.number().int().nonnegative() })
const submitSchema = requestSchema.extend({ values: valuesSchema, revision: z.number().int().nonnegative(),
  title: z.string().min(1).max(160), labels: z.record(z.string(), z.string().max(160)).optional(), recipient: z.object({ namespace: z.literal('office'), id: z.uuid() }).optional() })
const stateSchema = z.object({ values: valuesSchema, status: z.enum(['draft', 'pending', 'submitted']), revision: z.number().int().nonnegative() })

declare module '@deepseek-ai/cordis' { interface Context { interactiveCards: InteractiveCards } }

/** Persist before dispatch; retries reuse the native request identity and frozen payload. */
export class InteractiveCards extends TypertRemoteService {
  private readonly db: DatabaseSync
  private readonly pending = new Map<string, Promise<CardState>>()

  /** @param ctx - Profile storage and native conversation delivery services. */
  constructor(ctx: Context) {
    super(ctx, 'interactiveCards')
    this.db = new DatabaseSync(join(ctx.profileContext.dir, 'interactive-ui.sqlite'))
    const version = this.db.prepare('PRAGMA user_version').get()?.user_version
    if (version !== 0 && version !== SCHEMA_VERSION) {
      this.db.close()
      throw new Error(`Unsupported interactive UI database version: ${String(version)}`)
    }
    this.db.exec('CREATE TABLE IF NOT EXISTS cards (session TEXT NOT NULL, key TEXT NOT NULL, data TEXT NOT NULL, request_id TEXT, payload TEXT, PRIMARY KEY(session,key))')
    this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    ctx.effect(() => async () => { await Promise.allSettled(this.pending.values()); this.db.close() }, 'interactive card storage')
  }

  private async authorize(sessionId: string) {
    const result = await this.ctx.sessionController.resolveAgent(sessionId as SessionId)
    if ('error' in result) throw new Error(result.error.message)
    return result.agent
  }

  private state(sessionId: string, key: string): CardState {
    const row = this.db.prepare('SELECT data FROM cards WHERE session=? AND key=?').get(sessionId, key)
    return row ? stateSchema.parse(JSON.parse(String(row.data))) : { values: {}, status: 'draft', revision: 0 }
  }

  /** Read the current form draft or submission status.
   * @param request - Conversation and stable message/card identity.
   * @returns Saved draft or submission status.
   */
  @Remote('read')
  async read(request: { sessionId: string; key: string }): Promise<CardState> {
    const input = requestSchema.parse(request)
    await this.authorize(input.sessionId)
    return this.state(input.sessionId, input.key)
  }

  /** Save edited form values, rejecting stale draft revisions.
   * @param request - Edited values and the last observed revision.
   * @returns Current saved state; stale writes fail.
   */
  @Remote('save')
  async save(request: { sessionId: string; key: string; values: FormValues; revision: number }): Promise<CardState> {
    const input = saveSchema.parse(request)
    await this.authorize(input.sessionId)
    const current = this.state(input.sessionId, input.key)
    if (current.status !== 'draft') return current
    if (current.revision !== input.revision) throw new Error('This form changed in another view. Reload it before editing.')
    const next: CardState = { values: input.values, status: 'draft', revision: current.revision + 1 }
    this.db.prepare('INSERT INTO cards(session,key,data) VALUES(?,?,?) ON CONFLICT(session,key) DO UPDATE SET data=excluded.data')
      .run(input.sessionId, input.key, JSON.stringify(next))
    return next
  }

  /** Submit a form to its original conversation or office recipient.
   * @param request - Frozen form payload and its original reply destination.
   * @returns Persisted admission status.
   */
  @Remote('submit')
  async submit(request: { sessionId: string; key: string; values: FormValues; revision: number; title: string; labels?: Record<string, string>; recipient?: { namespace: 'office'; id: string } }): Promise<CardState> {
    const input = submitSchema.parse(request)
    const agent = await this.authorize(input.sessionId)
    const id = `${input.sessionId}\0${input.key}`
    const active = this.pending.get(id)
    if (active) return active
    const current = this.state(input.sessionId, input.key)
    if (current.status === 'submitted') return current
    const row = this.db.prepare('SELECT request_id,payload FROM cards WHERE session=? AND key=?').get(input.sessionId, input.key)
    if (current.status === 'draft' && current.revision !== input.revision) throw new Error('This form changed. Reload it before submitting.')
    const requestId = row?.request_id ? String(row.request_id) : randomUUID()
    const payload = row?.payload ? submitSchema.parse(JSON.parse(String(row.payload))) : input
    const next: CardState = { values: payload.values, status: 'pending', revision: current.revision + 1 }
    this.db.prepare('INSERT INTO cards(session,key,data,request_id,payload) VALUES(?,?,?,?,?) ON CONFLICT(session,key) DO UPDATE SET data=excluded.data,request_id=excluded.request_id,payload=excluded.payload')
      .run(input.sessionId, input.key, JSON.stringify(next), requestId, JSON.stringify(payload))
    const operation = (async () => {
      const text = [payload.title, ...Object.entries(payload.values).map(([key, value]) =>
        `${payload.labels?.[key] ?? key}：${typeof value === 'boolean' ? (value ? '✓' : '—') : value}`)].join('\n')
      if (payload.recipient) {
        const result = await this.ctx.commands.execute(agent, '/team-office-send ' + JSON.stringify({
          id: requestId, memberId: payload.recipient.id, text,
        }), [], new AbortController().signal)
        if (!result || result.result.kind !== 'success') throw new Error(result?.result.text ?? 'Office delivery failed.')
      } else {
        await this.ctx.sessionController.prompt({ sessionId: input.sessionId as SessionId,
          requestId: requestId as SessionRequestId, mode: 'queue', content: [{ type: 'text', text }] }, new AbortController().signal)
      }
      const submitted: CardState = { ...next, status: 'submitted' }
      this.db.prepare('UPDATE cards SET data=? WHERE session=? AND key=?').run(JSON.stringify(submitted), input.sessionId, input.key)
      return submitted
    })()
    this.pending.set(id, operation)
    try { return await operation } finally { this.pending.delete(id) }
  }
}
