import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, expect, it, vi } from 'vitest'
import { TeamWorkflows } from '../src/workflow-controller.ts'
import type { WorkflowHistory, WorkflowHistoryCursor } from '../src/workflow-types.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function fixture(records: { workflowId: string; sessionId: string; createdAt: number }[]) {
  const root = await mkdtemp(join(tmpdir(), 'workflow-history-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const db = new DatabaseSync(join(root, 'team-workflows.sqlite'))
  db.exec(`CREATE TABLE definitions (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE runs (session_id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, status TEXT NOT NULL,
      definition TEXT NOT NULL, data TEXT NOT NULL); PRAGMA user_version=1;`)
  const insert = db.prepare('INSERT INTO runs VALUES (?,?,?,?,?)')
  for (const record of records) {
    const history: WorkflowHistory = { sessionId: SessionId(record.sessionId), name: record.workflowId,
      input: 'Retained input', createdAt: record.createdAt, status: 'delivered', delivery: 'Retained output' }
    insert.run(record.sessionId, record.createdAt, 'delivered', JSON.stringify({ id: record.workflowId }), JSON.stringify(history))
  }
  db.close()
  const ctx = new Context()
  Reflect.apply(ctx.provide.bind(ctx), ctx, ['profileContext', { dir: root }])
  Reflect.apply(ctx.provide.bind(ctx), ctx, ['commands', { register: () => () => {} }])
  let workflows: TeamWorkflows | undefined
  const owner = await ctx.plugin({ name: 'workflow-history-fixture', apply: (scope: Context) => { workflows = new TeamWorkflows(scope) } })
  cleanups.push(() => owner.dispose())
  if (!workflows) throw new Error('Workflow history service did not activate')
  return { workflows, ctx }
}

it('finds a workflow history older than the global recent hundred and restores legacy workflow identities', async () => {
  const newer = Array.from({ length: 125 }, (_, index) => ({ workflowId: 'other', sessionId: `other-${index}`, createdAt: 1000 + index }))
  const { workflows } = await fixture([...newer,
    { workflowId: 'selected', sessionId: 'selected-old', createdAt: 10 },
    { workflowId: 'selected', sessionId: 'selected-new', createdAt: 20 },
  ])
  expect(workflows.list().runs).toHaveLength(100)
  expect(workflows.list().runs.every(run => run.workflowId === 'other')).toBe(true)
  const page = workflows.listHistory('selected')
  expect(page.runs.map(run => run.sessionId)).toEqual(['selected-new', 'selected-old'])
  expect(page.runs.every(run => run.workflowId === 'selected')).toBe(true)
  expect(page.next).toBeUndefined()
  expect(workflows.listHistory('missing')).toEqual({ runs: [] })
})

it('paginates equal timestamps by session identity without gaps, overlaps or another workflow', async () => {
  const expected = Array.from({ length: 125 }, (_, index) => `run-${String(index).padStart(3, '0')}`).reverse()
  const { workflows } = await fixture([
    ...expected.map(sessionId => ({ workflowId: 'selected', sessionId, createdAt: 100 })),
    { workflowId: 'other', sessionId: 'zzz-other', createdAt: 100 },
  ])
  const received: string[] = []
  let cursor: WorkflowHistoryCursor | undefined
  const lengths: number[] = []
  do {
    const page = workflows.listHistory('selected', cursor)
    received.push(...page.runs.map(run => run.sessionId))
    lengths.push(page.runs.length)
    cursor = page.next
  } while (cursor)
  expect(lengths).toEqual([50, 50, 25])
  expect(received).toEqual(expected)
  expect(new Set(received).size).toBe(125)
  expect(workflows.listHistory('selected').next).toEqual({ createdAt: 100, sessionId: 'run-075' })
})

it('excludes persisted workflow runs from New Session reuse', async () => {
  const { ctx } = await fixture([{ workflowId: 'saved-workflow', sessionId: 'old-run', createdAt: 1 }])
  expect(ctx.waterfall('api-session/reusable', SessionId('old-run'), () => true)).toBe(false)
  expect(ctx.waterfall('api-session/reusable', SessionId('ordinary-draft'), () => true)).toBe(true)
  expect(ctx.waterfall('api-session/reusable', SessionId('ordinary-draft'), () => false)).toBe(false)
})


it('announces saved workflow edits after commit and leaves failed updates unannounced', async () => {
  const { workflows, ctx } = await fixture([])
  const changed = vi.fn()
  ctx.on('team-catalogue/changed', changed)
  const draft = { name: 'Research', description: '', draft: '', review: '', secondReview: '', delivery: '',
    steps: [{ id: 'research', name: 'Research', instruction: 'Check facts', stage: 'prepare' as const,
      kind: 'agent' as const, dependsOn: [] }] }
  const created = workflows.save(draft)
  workflows.update(created.id, { ...draft, name: 'Updated research' })
  expect(changed).toHaveBeenCalledTimes(2)
  expect(() => workflows.update('missing', draft)).toThrow()
  expect(changed).toHaveBeenCalledTimes(2)
})

it('reads durable workflow context before injection and avoids repeating recorded context', async () => {
  const { ctx } = await fixture([{ workflowId: 'saved-workflow', sessionId: 'run', createdAt: 1 }])
  const text = 'Workflow: saved-workflow (delivered)\n\nOriginal request:\nRetained input\n\nFinal delivery:\nRetained output'
  const events: { type: string; data: { source: { kind: string }; content: { type: string; text: string }[] } }[] = []
  const readSession = vi.fn(async () => ({ events }))
  Reflect.apply(ctx.provide.bind(ctx), ctx, ['sessionQuery', { readSession }])
  const decision = { kind: 'enter', messages: [] }
  const invoke = async (): Promise<unknown> => Reflect.apply(ctx.waterfall.bind(ctx), ctx, [
    'agent/pre-step', { agent: { session: { id: SessionId('run') } }, step: 1 }, async () => decision,
  ])
  const injected = await invoke()
  expect(readSession).toHaveBeenCalledWith(SessionId('run'))
  expect(injected).toHaveProperty('messages.0.content.0.text', text)
  events.push({ type: 'user/message', data: { source: { kind: 'team-workflow-context' }, content: [{ type: 'text', text }] } })
  expect(await invoke()).toBe(decision)
  expect(readSession).toHaveBeenCalledTimes(2)
})

it('refuses workflow context injection when the durable history cannot be read', async () => {
  const { ctx } = await fixture([{ workflowId: 'saved-workflow', sessionId: 'run', createdAt: 1 }])
  const failure = new Error('History unavailable')
  Reflect.apply(ctx.provide.bind(ctx), ctx, ['sessionQuery', { readSession: async () => { throw failure } }])
  await expect(Reflect.apply(ctx.waterfall.bind(ctx), ctx, [
    'agent/pre-step', { agent: { session: { id: SessionId('run') } }, step: 1 }, async () => ({ kind: 'enter', messages: [] }),
  ])).rejects.toBe(failure)
})
