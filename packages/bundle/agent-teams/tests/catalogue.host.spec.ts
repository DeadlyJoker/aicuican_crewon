import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { notifyTeamCatalogue, TeamCatalogue } from '../src/catalogue.ts'

it('streams current revisions to every client and coalesces changes while a client is reading', async () => {
  const ctx = new Context()
  let catalogue!: TeamCatalogue
  const owner = await ctx.plugin({ name: 'catalogue-stream', apply(scope: Context) { catalogue = new TeamCatalogue(scope) } })
  const firstAbort = new AbortController()
  const secondAbort = new AbortController()
  const first = catalogue.watch(firstAbort.signal)[Symbol.asyncIterator]()
  const second = catalogue.watch(secondAbort.signal)[Symbol.asyncIterator]()
  try {
    expect(await first.next()).toEqual({ done: false, value: 0 })
    expect(await second.next()).toEqual({ done: false, value: 0 })
    const waiting = [first.next(), second.next()]
    notifyTeamCatalogue(ctx)
    expect(await Promise.all(waiting)).toEqual([{ done: false, value: 1 }, { done: false, value: 1 }])
    notifyTeamCatalogue(ctx)
    notifyTeamCatalogue(ctx)
    expect(await first.next()).toEqual({ done: false, value: 3 })
    expect(await second.next()).toEqual({ done: false, value: 3 })
    const firstEnded = first.next()
    firstAbort.abort()
    expect(await firstEnded).toEqual({ done: true, value: undefined })
    const stillConnected = second.next()
    notifyTeamCatalogue(ctx)
    expect(await stillConnected).toEqual({ done: false, value: 4 })
    const hostEnded = second.next()
    await owner.dispose()
    expect(await hostEnded).toEqual({ done: true, value: undefined })
  } finally {
    firstAbort.abort()
    secondAbort.abort()
    await owner.dispose()
  }
})

it('ends an already cancelled subscription without waiting for a change', async () => {
  const ctx = new Context()
  let catalogue!: TeamCatalogue
  const owner = await ctx.plugin({ name: 'cancelled-catalogue-stream', apply(scope: Context) { catalogue = new TeamCatalogue(scope) } })
  const controller = new AbortController()
  controller.abort()
  try {
    expect(await catalogue.watch(controller.signal)[Symbol.asyncIterator]().next()).toEqual({ done: true, value: undefined })
  } finally { await owner.dispose() }
})
