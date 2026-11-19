import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { InteractiveCards } from '../src/cards.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

it('restores drafts and admits a repeated submission only once after reopening storage', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'interactive-ui-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const prompt = vi.fn().mockResolvedValue({ accepted: true })
  const execute = vi.fn().mockResolvedValue({ result: { kind: 'success' } })
  const mount = async () => {
    const ctx = new Context()
    Reflect.apply(ctx.provide.bind(ctx), ctx, ['profileContext', { dir }])
    Reflect.apply(ctx.provide.bind(ctx), ctx, ['sessionController', { resolveAgent: async () => ({ agent: {} }), prompt }])
    Reflect.apply(ctx.provide.bind(ctx), ctx, ['commands', { execute }])
    let cards!: InteractiveCards
    const owner = await ctx.plugin({ name: 'interactive-fixture', apply: (scope: Context) => { cards = new InteractiveCards(scope) } })
    cleanups.push(() => owner.dispose())
    return { cards, owner }
  }
  const request = { sessionId: 'session', key: 'message:0' }
  const first = await mount()
  await first.cards.save({ ...request, values: { goal: 'Compare' }, revision: 0 })
  await first.owner.dispose()
  const second = await mount()
  expect(await second.cards.read(request)).toEqual({ values: { goal: 'Compare' }, revision: 1, status: 'draft' })
  const input = { ...request, values: { goal: 'Compare' }, revision: 1, title: 'Plan' }
  await Promise.all([second.cards.submit(input), second.cards.submit(input)])
  expect(prompt).toHaveBeenCalledTimes(1)
  await second.owner.dispose()
  const third = await mount()
  expect((await third.cards.read(request)).status).toBe('submitted')
  await third.cards.submit(input)
  expect(prompt).toHaveBeenCalledTimes(1)
  await third.cards.submit({ ...input, key: 'office:1', revision: 0, recipient: { namespace: 'office', id: 'be413bfa-eb0f-40b3-bb19-5e2ca8832376' } })
  expect(execute).toHaveBeenCalledTimes(1)
  expect(execute.mock.calls[0]?.[1]).toContain('be413bfa-eb0f-40b3-bb19-5e2ca8832376')
})

it('retains a frozen pending payload after an uncertain delivery and reuses its request identity', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'interactive-retry-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const ctx = new Context()
  const prompt = vi.fn().mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue({ accepted: true })
  Reflect.apply(ctx.provide.bind(ctx), ctx, ['profileContext', { dir }])
  Reflect.apply(ctx.provide.bind(ctx), ctx, ['sessionController', { resolveAgent: async () => ({ agent: {} }), prompt }])
  let cards!: InteractiveCards
  const owner = await ctx.plugin({ name: 'retry-fixture', apply: (scope: Context) => { cards = new InteractiveCards(scope) } })
  cleanups.push(() => owner.dispose())
  const input = { sessionId: 'session', key: 'reply:1', values: { goal: 'Original' }, revision: 0, title: 'Plan' }
  await expect(cards.submit(input)).rejects.toThrow('connection lost')
  await cards.submit({ ...input, values: { goal: 'Changed' } })
  expect(prompt.mock.calls[0]?.[0]).toEqual(prompt.mock.calls[1]?.[0])
})
