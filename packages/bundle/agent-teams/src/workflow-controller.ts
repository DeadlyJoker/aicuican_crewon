/** Own the workflow library and the durable gate between native workflow invocations. */
import type { Context } from '@deepseek-ai/cordis'
import { principalOf, Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/dsh-api-session-controller/types'
import type {} from '@deepseek-ai/dsh-session'
import type { CommandInvocation } from '@deepseek-ai/dsh-commands'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { createUserMessage, ToolCallId, type ContextFormed } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-tool-workflow/types'
import { withWorkflowAgentPresets } from '@deepseek-ai/dsh-tool-workflow'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type {
  WorkflowDefinition, WorkflowDraft, WorkflowHistory, WorkflowHistoryCursor, WorkflowHistoryPage, WorkflowLibrary,
  WorkflowStatus, WorkflowTrace, WorkflowTraceDetail, WorkflowAgentLog, WorkflowTraceNode,
} from './workflow-types.ts'

import { orderWorkflowSteps } from './workflow-graph.ts'
import { notifyTeamCatalogue } from './catalogue.ts'

const SCHEMA_VERSION = 1
const stepSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1).max(80),
  instruction: z.string().trim().max(4000),
  kind: z.enum(['agent', 'approval']).optional(),
  stage: z.enum(['prepare', 'deliver']),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  dependsOn: z.array(z.string()).max(24),
  agentPreset: z.string().trim().min(1).optional(),
})
const definition = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400),
  steps: z.array(stepSchema).min(1).max(24).optional(),
  draft: z.string().trim().max(4000),
  review: z.string().trim().max(4000),
  secondReview: z.string().trim().max(4000),
  delivery: z.string().trim().max(4000),
  agentPresets: z.partialRecord(z.enum(['draft', 'review', 'secondReview', 'delivery']), z.string().trim().min(1)).optional(),
})
const launch = z.object({ id: z.uuid(), input: z.string().trim().min(1).max(12000) })
const prepared = z.object({ draft: z.string().min(1), reviews: z.array(z.string().min(1)).min(1) })
const historyCursor = z.object({ createdAt: z.number().int(), sessionId: z.string().min(1) })
const prepareScript = `
phase('Draft')
const draft = await agent(args.instruction + '\\n\\nInput:\\n' + args.input, { label: 'Draft', ...args.draftPreset ? { agentPreset: args.draftPreset } : {} })
if (!draft) throw new Error('Draft agent returned no result')
phase('Review')
const reviews = await parallel(args.reviews.map((review, index) => () =>
  agent(review + '\\n\\nInput:\\n' + args.input + '\\n\\nDraft:\\n' + draft, { label: 'Reviewer ' + (index + 1), ...args.reviewPresets[index] ? { agentPreset: args.reviewPresets[index] } : {} })))
if (reviews.some(review => !review)) throw new Error('A reviewer returned no result')
return { draft, reviews }
`
const deliveryScript = `
phase('Delivery')
const output = await agent(args.instruction + '\\n\\nInput:\\n' + args.input
  + '\\n\\nApproved draft:\\n' + args.draft + '\\n\\nReviews:\\n' + args.reviews.join('\\n\\n'), { label: 'Delivery', ...args.deliveryPreset ? { agentPreset: args.deliveryPreset } : {} })
if (!output) throw new Error('Delivery agent returned no result')
return output
`

const stepsScript = `
const outputs = new Map(Object.entries(args.previous ?? {}))
const pending = new Map(args.steps.map(step => [step.id, step]))
const results = {}
while (pending.size) {
  const ready = [...pending.values()].filter(step => step.dependsOn.every(id => outputs.has(id)))
  if (!ready.length) throw new Error('Workflow dependencies cannot be resolved')
  const values = await parallel(ready.map(step => () => {
    const upstream = step.dependsOn.map(id => outputs.get(id)).join('\\n\\n')
    return agent(step.instruction + '\\n\\nInput:\\n' + args.input
      + (upstream ? '\\n\\nDependency outputs:\\n' + upstream : ''),
      { label: step.name, phase: step.id, ...(step.agentPreset ? { agentPreset: step.agentPreset } : {}) })
  }))
  ready.forEach((step, index) => {
    if (!values[index]) throw new Error('Step failed: ' + step.name)
    outputs.set(step.id, values[index])
    results[step.id] = values[index]
    pending.delete(step.id)
  })
}
return results
`
const stepOutputs = z.record(z.string(), z.string().min(1))
const formatOutputs = (steps: NonNullable<WorkflowDefinition['steps']>, outputs: Record<string, string>) =>
  steps.map(step => `## ${step.name}\n\n${outputs[step.id] ?? ''}`).join('\n\n')

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Workflow context retained with its original message content. @persistenceAttribution */
    'team-workflow-context': { kind: 'team-workflow-context' } & ContextFormed
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'team-workflow/owner-required': {}
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Durable team workflow library and approval controller. */
    teamWorkflows: TeamWorkflows
  }
}

/** Profile-local workflow definitions and execution state. */
export class TeamWorkflows extends TypertRemoteService {
  private readonly db: DatabaseSync

  /** @param ctx - Profile and command services. */
  constructor(ctx: Context) {
    super(ctx, 'teamWorkflows')
    this.db = new DatabaseSync(join(ctx.profileContext.dir, 'team-workflows.sqlite'))
    ctx.effect(() => () => { this.db.close() }, 'close workflow database')
    const version = this.db.prepare('PRAGMA user_version').get()?.user_version
    if (version !== 0 && version !== SCHEMA_VERSION) {
      throw new Error(`Unsupported team workflow database version: ${String(version)}`)
    }
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS definitions (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runs (
        session_id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, status TEXT NOT NULL,
        definition TEXT NOT NULL, data TEXT NOT NULL
      );
      UPDATE runs SET status = 'interrupted' WHERE status IN ('preparing', 'delivering');
      PRAGMA user_version = ${SCHEMA_VERSION};
    `)
    ctx.on('api-session/reusable', (sessionId, next) => {
      const allowed = next()
      return allowed && this.db.prepare('SELECT 1 FROM runs WHERE session_id=?').get(sessionId) === undefined
    })
    ctx.on('agent/pre-step', async ({ agent, step }, next) => {
      const decision = await next()
      if (decision.kind !== 'enter' || step !== 1) return decision
      const row = this.db.prepare('SELECT status, data, definition FROM runs WHERE session_id = ?').get(agent.session.id)
      if (!row) return decision
      const run = this.history(row)
      const text = [
        `Workflow: ${run.name} (${run.status})`,
        `Original request:\n${run.input}`,
        run.delivery ? `Final delivery:\n${run.delivery}` : run.draft ? `Draft:\n${run.draft}` : '',
      ].filter(Boolean).join('\n\n')
      const { events } = await ctx.sessionQuery.readSession(agent.session.id)
      const recorded = events.some(event => event.type === 'user/message'
        && event.data.source.kind === 'team-workflow-context'
        && event.data.content.some(block => block.type === 'text' && block.text === text))
      if (recorded) return decision
      return {
        ...decision,
        messages: [
          createUserMessage({ source: { kind: 'team-workflow-context', form: 'snapshot',
            sections: [{ name: 'team-workflow', text }] }, content: [{ type: 'text', text }] }),
          ...decision.messages,
        ],
      }
    })
    ctx.effect(() => ctx.commands.register({
      name: 'team-workflow-run',
      description: 'Run a saved workflow from the Teams page.',
      handler: request => this.run(request),
    }), 'run team workflow')
    ctx.effect(() => ctx.commands.register({
      name: 'team-workflow-decide',
      description: 'Decide a pending workflow approval in its conversation.',
      handler: request => this.decide(request),
    }), 'decide team workflow')
  }

  /** Return saved definitions and the most recent executions.
   * @returns The profile library and up to 100 recent runs.
   */
  @Remote('list')
  list(): WorkflowLibrary {
    this.requireOwner()
    return {
      definitions: this.db.prepare('SELECT data FROM definitions ORDER BY rowid DESC').all()
        .map(row => JSON.parse(String(row.data)) as WorkflowDefinition),
      runs: this.db.prepare('SELECT status, data, definition FROM runs ORDER BY created_at DESC LIMIT 100').all()
        .map(row => this.history(row)),
    }
  }

  /** Read one workflow's history independently of the global recent-run limit.
   * @param workflowId - Saved workflow identity recorded in each run's definition snapshot.
   * @param before - Exclusive oldest position from the previous page; omission starts at the newest run.
   * @returns Up to 50 runs and the next page cursor when additional runs remain.
   */
  @Remote('listHistory')
  listHistory(workflowId: string, before?: WorkflowHistoryCursor): WorkflowHistoryPage {
    this.requireOwner()
    const cursor = before === undefined ? undefined : historyCursor.parse(before)
    let query = "SELECT session_id,created_at,status,data,definition FROM runs WHERE json_extract(definition,'$.id')=?"
    const parameters: (string | number)[] = [workflowId]
    if (cursor) {
      query += ' AND (created_at < ? OR (created_at = ? AND session_id < ?))'
      parameters.push(cursor.createdAt, cursor.createdAt, cursor.sessionId)
    }
    query += ' ORDER BY created_at DESC,session_id DESC LIMIT 51'
    const rows = this.db.prepare(query).all(...parameters)
    const retained = rows.slice(0, 50)
    const last = retained.at(-1)
    return {
      runs: retained.map(row => this.history(row)),
      ...(rows.length > 50 && last ? { next: {
        createdAt: Number(last.created_at), sessionId: String(last.session_id) as SessionId,
      } } : {}),
    }
  }

  /** Read the approval attached to one conversation.
   * @param sessionId - Owning conversation.
   * @returns The execution, when the conversation was created for a workflow.
   */
  @Remote('read')
  read(sessionId: SessionId): WorkflowHistory | null {
    this.requireOwner()
    const row = this.db.prepare('SELECT status, data, definition FROM runs WHERE session_id = ?').get(sessionId)
    return row ? this.history(row) : null
  }

  /** Read execution nodes for a Teams workflow.
   * @param sessionId - Owning conversation.
   * @returns Native member lifecycle records and the approval state.
   */
  @Remote('trace')
  async trace(sessionId: SessionId): Promise<WorkflowTrace | null> {
    const run = this.read(sessionId)
    if (!run) return null
    const { events } = await this.ctx.sessionQuery.readSession(sessionId)
    const nodes = new Map<string, WorkflowTraceNode>()
    const commands = new Set<string>()
    const runs = new Set<string>()
    for (const event of events) {
      if (event.type === 'command/run' && ['team-workflow-run', 'team-workflow-decide'].includes(event.data.name)) {
        commands.add(event.data.commandId)
      } else if (event.type === 'command/done') {
        commands.delete(event.data.commandId)
      } else if (event.type === 'tool-workflow/run-start' && commands.size > 0) {
        runs.add(event.data.runId)
      }
      if (event.type === 'tool-workflow/agent-start' && runs.has(event.data.runId)) {
        const { runId, seq, childId, phase, label } = event.data
        nodes.set(`${runId}:${seq}`, { id: childId, label, phase: phase ?? '', state: 'running', startedAt: event.time })
      } else if (event.type === 'tool-workflow/agent-end') {
        const node = nodes.get(`${event.data.runId}:${event.data.seq}`)
        if (node) {
          node.state = event.data.outcome
          node.finishedAt = event.time
        }
      } else if (event.type === 'tool-workflow/run-end') {
        for (const [key, node] of nodes) {
          if (key.startsWith(`${event.data.runId}:`) && node.state === 'running') node.state = 'interrupted'
        }
      }
    }
    if (run.status === 'interrupted' || run.status === 'failed') {
      for (const node of nodes.values()) if (node.state === 'running') node.state = 'interrupted'
    }
    const row = this.db.prepare('SELECT definition FROM runs WHERE session_id = ?').get(sessionId)
    const steps = row ? (JSON.parse(z.string().parse(row.definition)) as WorkflowDefinition).steps : undefined
    return { status: run.status, completedSteps: Object.keys(run.stepOutputs ?? {}), pendingApprovalId: run
      .pendingApproval?.id, nodes: [...nodes.values()], ...(steps ? { steps } : {}) }
  }

  /** Read one recorded child Agent's task and answer.
   * @param sessionId - Owning conversation.
   * @param childId - Child identity selected from the execution records.
   * @returns Recorded model route, task input and assistant text.
   */
  @Remote('traceDetail')
  async traceDetail(sessionId: SessionId, childId: SessionId): Promise<WorkflowTraceDetail | null> {
    const trace = await this.trace(sessionId)
    if (!trace?.nodes.some(node => node.id === childId)) return null
    const { events } = await this.ctx.sessionQuery.readSession(childId)
    const inputs: string[] = []
    const outputs: string[] = []
    let model = ''
    let agentPreset: string | undefined
    const logs: WorkflowAgentLog[] = []
    const tools = new Map<string, WorkflowAgentLog>()
    for (const event of events) {
      if (event.type === 'agent-preset/selected') agentPreset = event.data.agentPreset
      if (event.type === 'request/context') model = `${event.data.provider}/${event.data.model}`
      if (event.type === 'assistant/message') {
        const { source, content } = event.data.message
        const route = `${source.provider}/${source.model}`
        if (route) logs.push({ seq: event.seq, time: event.time, kind: 'model', name: route,
          output: content.filter(block => block.type === 'text').map(block => block.text).join('\n') })
      }
      if (event.type === 'tool/call') {
        const entry: WorkflowAgentLog = { seq: event.seq, time: event.time, kind: 'tool',
          name: event.data.name, input: event.data.arguments }
        logs.push(entry)
        tools.set(event.data.callId, entry)
      }
      if (event.type === 'tool/result') {
        const { message } = event.data
        const entry = tools.get(message.toolCallId)
        if (entry) {
          entry.failed = Boolean(message.isError)
          entry.output = message.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
        }
      }
      if (event.type === 'user/message' && event.data.source.kind === 'user') {
        for (const block of event.data.content) if (block.type === 'text') inputs.push(block.text)
      }
      if (event.type === 'assistant/message') {
        for (const block of event.data.message.content) if (block.type === 'text') outputs.push(block.text)
      }
    }
    return { ...(agentPreset ? { agentPreset } : {}), model, logs, input: inputs.join('\n\n'), output: outputs.join('\n\n') }
  }

  /** Save a new definition.
   * @param draft - User-authored instructions for each stage.
   * @returns The newly saved definition.
   */
  @Remote('save')
  save(draft: WorkflowDraft): WorkflowDefinition {
    this.requireOwner()
    const saved = this.normalizeDefinition(randomUUID(), draft)
    this.db.prepare('INSERT INTO definitions VALUES (?, ?)').run(saved.id, JSON.stringify(saved))
    notifyTeamCatalogue(this.ctx)
    return saved
  }

  /**
   * Replace a saved definition while preserving its identity and run snapshots.
   * @param id - Existing workflow ID.
   * @param draft - Updated workflow definition.
   * @returns The saved definition.
   */
  @Remote('update')
  update(id: string, draft: WorkflowDraft): WorkflowDefinition {
    this.requireOwner()
    const saved = this.normalizeDefinition(id, draft)
    const result = this.db.prepare('UPDATE definitions SET data = ? WHERE id = ?').run(JSON.stringify(saved), id)
    if (result.changes !== 1) throw new Error('The saved workflow was not found.')
    notifyTeamCatalogue(this.ctx)
    return saved
  }

  private normalizeDefinition(id: string, draft: WorkflowDraft): WorkflowDefinition {
    const { agentPresets, steps, ...fields } = definition.parse(draft)
    if (steps) {
      const graph = steps.every(step => step.kind !== undefined)
      if (!graph && steps.some(step => step.kind !== undefined)) throw new Error('All graph nodes must declare a kind.')
      if (!steps.some(step => step.kind !== 'approval') || steps.some(step => step.kind !== 'approval' && !step
        .instruction)) throw new Error('Add at least one Agent with instructions.')
      if (!graph && (!steps.some(step => step.stage === 'prepare') || !steps.some(step => step.stage === 'deliver'))) {
        throw new Error('Add at least one step before approval and one after approval.')
      }
      const seen = new Map<string, string>()
      for (const step of steps) {
        if (seen.has(step.id) || (!graph && step.dependsOn.some(dependency =>
          !seen.has(dependency) || (step.stage === 'prepare' && seen.get(dependency) === 'deliver')))) {
          throw new Error('Each step must have a unique ID and depend only on earlier, available steps.')
        }
        seen.set(step.id, step.stage)
      }
      const ordered = graph ? orderWorkflowSteps(steps) : steps
      if (!ordered) throw new Error('Workflow dependencies must form an acyclic graph.')
      return { ...fields, id, steps: ordered.map(({ agentPreset, position, ...step }) =>
        ({ ...step, ...(position ? { position } : {}), ...(agentPreset ? { agentPreset } : {}) })) }
    }
    if (!fields.draft || !fields.review || !fields.delivery) throw new Error('Complete draft, review and delivery instructions.')
    const selected = agentPresets && Object.fromEntries(Object.entries(agentPresets).filter(
      ([role]) => (role !== 'secondReview' || fields.secondReview),
    ))
    return { ...fields, ...(selected ? { agentPresets: selected } : {}), id }
  }

  private requireOwner(): void {
    if (principalOf(this.ctx.invocation) !== undefined) {
      throw new RemoteError('team-workflow/owner-required', 'The team workflow library belongs to the Host owner.', {})
    }
  }

  private history(row: Record<string, unknown>): WorkflowHistory {
    const history = JSON.parse(String(row.data)) as WorkflowHistory
    const workflowId = history.workflowId ?? (row.definition ? (JSON.parse(z.string().parse(row
      .definition)) as WorkflowDefinition).id : undefined)
    return { ...history, ...(workflowId ? { workflowId } : {}), status: row.status as WorkflowStatus }
  }

  private commit(run: WorkflowHistory, from: WorkflowStatus): boolean {
    const changed = this.db.prepare('UPDATE runs SET status = ?, data = ? WHERE session_id = ? AND status = ?')
      .run(run.status, JSON.stringify(run), run.sessionId, from).changes === 1
    if (changed) notifyTeamCatalogue(this.ctx)
    return changed
  }

  private async execute(request: CommandInvocation, name: string, script: string, args: Record<string, unknown>,
    presets: readonly (string | undefined)[]): Promise<unknown> {
    const { agent, signal } = request
    const allowed = presets.filter((id): id is string => id !== undefined)
    const callId = ToolCallId(randomUUID())
    const result = await withWorkflowAgentPresets(callId, allowed, () => this.ctx.tools.execute({
      agent, signal, calls: [{
        type: 'tool-call', id: callId, name: 'workflow',
        arguments: JSON.stringify({ meta: { name, description: name }, script, args }),
      }],
    }))
    await this.ctx.sessions.flush(agent.session)
    const outcome = result.results[0]?.result
    if (outcome?.isError) throw new Error(outcome.error.message)
    return z.object({ kind: z.literal('foreground'), result: z.unknown() }).parse(outcome?.value).result
  }

  private async unavailablePreset(ids: readonly (string | undefined)[]): Promise<string | undefined> {
    for (const id of new Set(ids)) {
      if (id === undefined) continue
      try {
        const preset = await this.ctx.get('agentPresets')?.resolve(id)
        if (preset && !preset.broken) continue
      } catch {
        // A saved reference may have been removed since the workflow was authored.
      }
      return id
    }
    return undefined
  }

  private async advanceGraph(request: CommandInvocation, saved: WorkflowDefinition, initial: WorkflowHistory) {
    const steps = saved.steps
    if (steps === undefined) throw new Error('Graph workflow has no steps')
    let run = initial
    try {
      for (;;) {
        const outputs = run.stepOutputs ?? {}
        const pending = steps.filter(step => !Object.hasOwn(outputs, step.id))
        if (!pending.length) {
          const terminal = steps.filter(step => step.kind !== 'approval' && !steps.some(next => next.dependsOn.includes(step.id)))
          const result = terminal.length ? terminal : steps.filter(step => step.kind !== 'approval')
          this.commit({ ...run, delivery: formatOutputs(result, outputs), pendingApproval: undefined, status: 'delivered' }, run.status)
          return { kind: 'success' as const }
        }
        const ready = pending.filter(step => step.dependsOn.every(id => Object.hasOwn(outputs, id)))
        const agents = ready.filter(step => step.kind !== 'approval')
        if (!agents.length) {
          const gate = ready[0]
          if (!gate) throw new Error('Workflow dependencies cannot be resolved')
          this.commit({ ...run, status: 'pending',
            draft: formatOutputs(steps.filter(step => gate.dependsOn.includes(step.id)), outputs),
            pendingApproval: { id: gate.id, name: gate.name, instruction: gate.instruction },
          }, run.status)
          return { kind: 'success' as const }
        }
        const result = stepOutputs.parse(await this.execute(request, saved.name, stepsScript,
          { steps: agents, previous: outputs, input: run.input }, agents.map(step => step.agentPreset)))
        const next = { ...run, stepOutputs: { ...outputs, ...result } }
        if (!this.commit(next, run.status)) throw new Error('Workflow state changed while running')
        run = next
      }
    } catch (error) {
      this.commit({ ...run, status: 'failed' }, run.status)
      this.ctx.logger.warn('Workflow execution failed: %s', error)
      return { kind: 'error' as const, text: 'Workflow execution failed. Inspect the run trajectory.' }
    }
  }

  private async run(request: CommandInvocation) {
    const args = launch.parse(JSON.parse(request.rawInput))
    const found = this.db.prepare('SELECT data FROM definitions WHERE id = ?').get(args.id)
    if (!found) return { kind: 'error' as const, text: 'The saved workflow was not found.' }
    const saved = JSON.parse(String(found.data)) as WorkflowDefinition
    const run: WorkflowHistory = {
      sessionId: request.agent.session.id,
      name: saved.name,
      workflowId: saved.id,
      input: args.input,
      createdAt: Date.now(),
      status: 'preparing',
    }
    const claimed = this.db.prepare('INSERT OR IGNORE INTO runs VALUES (?, ?, ?, ?, ?)')
      .run(run.sessionId, run.createdAt, run.status, JSON.stringify(saved), JSON.stringify(run))
    if (!claimed.changes) return { kind: 'error' as const, text: 'This conversation already owns a workflow run.' }
    notifyTeamCatalogue(this.ctx)
    const roles = saved.agentPresets ?? {}
    const reviewPresets = saved.secondReview ? [roles.review, roles.secondReview] : [roles.review]
    const presets = [roles.draft, ...reviewPresets]
    try {
      const unavailable = await this.unavailablePreset(saved.steps ? saved.steps.map(step => step
        .agentPreset) : [...presets, roles.delivery])
      if (unavailable) {
        this.commit({ ...run, status: 'failed' }, 'preparing')
        return { kind: 'error' as const,
          text: `Agent preset "${unavailable}" is unavailable. Restore the preset or create a workflow using an available preset.` }
      }
      if (saved.steps?.every(step => step.kind !== undefined)) return await this.advanceGraph(request, saved, run)
      if (saved.steps) {
        const steps = saved.steps.filter(step => step.stage === 'prepare')
        const outputs = stepOutputs.parse(await this.execute(request, saved.name, stepsScript, {
          steps, input: run.input,
        }, steps.map(step => step.agentPreset)))
        this.commit({ ...run, draft: formatOutputs(steps, outputs), stepOutputs: outputs, status: 'pending' }, 'preparing')
        return { kind: 'success' as const }
      }
      const output = prepared.parse(await this.execute(request, saved.name, prepareScript, {
        input: run.input, instruction: saved.draft, reviews: [saved.review, saved.secondReview].filter(Boolean),
        draftPreset: roles.draft, reviewPresets,
      }, presets))
      this.commit({ ...run, ...output, status: 'pending' }, 'preparing')
      return { kind: 'success' as const }
    } catch (error) {
      this.commit({ ...run, status: 'failed' }, 'preparing')
      this.ctx.logger.warn('Workflow preparation failed: %s', error)
      return { kind: 'error' as const, text: 'Workflow preparation failed. Open Teams to start a new run.' }
    }
  }

  private async decide(request: CommandInvocation) {
    const [action, approvalId] = request.rawInput.trim().split(/\s+/)
    const decision = z.enum(['approve', 'reject']).parse(action)
    const row = this.db.prepare('SELECT status, definition, data FROM runs WHERE session_id = ?').get(request.agent.session.id)
    if (!row || row.status !== 'pending') return { kind: 'success' as const }
    const run = this.history(row)
    if (run.pendingApproval && run.pendingApproval.id !== approvalId) return { kind: 'success' as const }
    if (decision === 'reject') {
      this.commit({ ...run, status: 'rejected' }, 'pending')
      return { kind: 'success' as const }
    }
    const saved = JSON.parse(String(row.definition)) as WorkflowDefinition
    const deliveryPreset = saved.agentPresets?.delivery
    const steps = saved.steps?.filter(step => step.stage === 'deliver')
    const unavailable = await this.unavailablePreset(steps ? steps.map(step => step.agentPreset) : [deliveryPreset])
    if (unavailable) return { kind: 'error' as const,
      text: `Agent preset "${unavailable}" is unavailable. Restore the preset before approving.` }
    if (!this.commit({ ...run, status: 'delivering' }, 'pending')) return { kind: 'success' as const }
    if (saved.steps?.every(step => step.kind !== undefined)) {
      const outputs = { ...run.stepOutputs }
      if (run.pendingApproval) outputs[run.pendingApproval.id] = 'Approved'
      return this.advanceGraph(request, saved, { ...run, status: 'delivering', pendingApproval: undefined, stepOutputs: outputs })
    }
    try {
      if (steps) {
        const outputs = stepOutputs.parse(await this.execute(request, saved.name, stepsScript, {
          steps, input: run.input, previous: run.stepOutputs ?? {},
        }, steps.map(step => step.agentPreset)))
        this.commit({ ...run, delivery: formatOutputs(steps, outputs), status: 'delivered' }, 'delivering')
        return { kind: 'success' as const }
      }
      const delivery = z.string().min(1).parse(await this.execute(request, saved.name, deliveryScript, {
        input: run.input, instruction: saved.delivery, draft: run.draft, reviews: run.reviews, deliveryPreset,
      }, [deliveryPreset]))
      this.commit({ ...run, delivery, status: 'delivered' }, 'delivering')
      return { kind: 'success' as const }
    } catch (error) {
      this.commit({ ...run, status: 'failed' }, 'delivering')
      this.ctx.logger.warn('Workflow delivery failed: %s', error)
      return { kind: 'error' as const, text: 'Delivery stopped. Open Teams to inspect the run.' }
    }
  }
}
