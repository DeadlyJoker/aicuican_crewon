import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createScope, scopeOf } from '@deepseek-ai/dsh-scope'
import SkillRegistry, { type SkillDefinition } from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

function skill(name: string): SkillDefinition {
  return { name, description: name, content: `${name} instructions`, provider: 'fixture', source: 'runtime',
    invocation: { modelInvocable: true, userInvocable: true } }
}

async function setup() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SkillRegistry)
  ctx.skills.register(skill('allowed'))
  ctx.skills.register(skill('denied'))
  return ctx
}

it('restricts scoped discovery and loading while preserving unrestricted callers', async () => {
  const ctx = await setup()
  const selected = createScope(ctx, {})
  const other = createScope(ctx, {})
  const release = selected.ctx.get('skills')!.restrict({ allow: ['allowed', 'arrives-later'] })
  selected.ctx.get('skills')!.register(skill('local-denied'))
  ctx.skills.register(skill('arrives-later'))
  expect((await ctx.skills.list({ scope: scopeOf(selected.ctx) })).map(row => row.name)).toEqual(['allowed', 'arrives-later'])
  expect(await ctx.skills.get('denied', { scope: scopeOf(selected.ctx) })).toBeUndefined()
  expect(await ctx.skills.get('local-denied', { scope: scopeOf(selected.ctx) })).toBeUndefined()
  expect((await ctx.skills.get('denied', { scope: scopeOf(other.ctx) }))?.name).toBe('denied')
  release()
  expect((await ctx.skills.get('denied', { scope: scopeOf(selected.ctx) }))?.name).toBe('denied')
})

it('intersects ancestor permissions and rejects global restrictions', async () => {
  const ctx = await setup()
  expect(() => ctx.skills.restrict({ allow: [] })).toThrow('requires a scoped context')
  const parent = createScope(ctx, {})
  const child = createScope(parent.ctx, {}, { parent: scopeOf(parent.ctx)! })
  parent.ctx.get('skills')!.restrict({ allow: ['allowed'] })
  child.ctx.get('skills')!.restrict({ deny: ['allowed'] })
  expect((await ctx.skills.snapshot({ scope: scopeOf(child.ctx) })).skills).toEqual([])
  expect(await ctx.skills.get('allowed', { scope: scopeOf(child.ctx) })).toBeUndefined()
  expect(() => child.ctx.get('skills')!.restrict({})).toThrow('requires allow or deny')
})

it('does not return a skill body when permission is revoked during loading', async () => {
  const ctx = await setup()
  const selected = createScope(ctx, {})
  const entered = Promise.withResolvers<undefined>()
  const finish = Promise.withResolvers<undefined>()
  ctx.skills.registerProvider(() => ({
    name: 'slow',
    list: async () => [{ ...skill('slow-skill'), provider: 'slow', rank: 1, locator: 'slow-skill' }],
    get: async () => { entered.resolve(undefined); await finish.promise; return { ...skill('slow-skill'), provider: 'slow' } },
  }))
  const pending = ctx.skills.get('slow-skill', { scope: scopeOf(selected.ctx) })
  await entered.promise
  selected.ctx.get('skills')!.restrict({ deny: ['slow-skill'] })
  finish.resolve(undefined)
  expect(await pending).toBeUndefined()
})
