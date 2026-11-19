import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it, vi } from 'vitest'
import { TeamExperts } from '../src/expert-controller.ts'
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import type { ExpertConfiguration } from '../src/expert-types.ts'

const configuration: ExpertConfiguration = { maxPromptLength: 32768, builtinBasePreset: 'standard' }

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

it('preserves immutable expert compositions across edits and a restart and refuses stale saves', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'team-experts-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const mount = async () => {
    const ctx = new Context()
    const changed = vi.fn()
    ctx.on('team-catalogue/changed', changed)
    const definitions = new Map<string, PresetDefinition>()
    Reflect.apply(ctx.provide.bind(ctx), ctx, ['profileContext', { dir }])
    Reflect.apply(ctx.provide.bind(ctx), ctx, ['agentPresets', {
      list: async () => [...definitions.values()].map(value => ({ id: value.id })),
      readDocument: async () => ({ content: '- id: persona\n  name: "@deepseek-ai/dsh-persona"\n  config:\n    prefix: old\n- name: "@deepseek-ai/dsh-tool-fs"\n' }),
      register: async (definition: PresetDefinition) => {
        definitions.set(definition.id, definition)
        return async () => { definitions.delete(definition.id) }
      },
    }])
    let experts!: TeamExperts
    const owner = await ctx.plugin({ name: 'expert-fixture', apply: async (scope: Context) => {
      experts = new TeamExperts(scope, configuration)
      await experts.initialize()
    } })
    cleanups.push(() => owner.dispose())
    return { experts, definitions, owner, changed }
  }
  const first = await mount()
  const draft = { name: 'Reviewer', description: 'Review', prompt: 'Only report issues.', basePreset: 'standard' }
  const one = await first.experts.save(draft)
  const two = await first.experts.save({ ...draft, prompt: 'Report issues and evidence.' }, one.id, one.revision)
  expect(two.preset).not.toBe(one.preset)
  expect(first.definitions.get(one.preset)?.plugins).toMatchInlineSnapshot(`
    [
      {
        "name": "@deepseek-ai/dsh-tool-fs",
      },
      {
        "config": {
          "prefix": "Only report issues.",
        },
        "id": "expert-persona",
        "name": "@deepseek-ai/dsh-persona",
      },
    ]
  `)
  expect(JSON.stringify(first.definitions.get(one.preset))).toContain('Only report issues.')
  expect(first.changed).toHaveBeenCalledTimes(2)
  await expect(first.experts.save(draft, one.id, one.revision)).rejects.toThrow('changed')
  expect(first.changed).toHaveBeenCalledTimes(2)
  await first.owner.dispose()
  const restarted = await mount()
  expect(restarted.experts.list().experts).toEqual([two])
  expect(restarted.definitions.has(one.preset)).toBe(true)
  expect(restarted.definitions.has(two.preset)).toBe(true)
})

it('rejects incomplete model selection without creating an expert revision', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'team-experts-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const ctx = new Context()
  Reflect.apply(ctx.provide.bind(ctx), ctx, ['profileContext', { dir }])
  Reflect.apply(ctx.provide.bind(ctx), ctx, ['agentPresets', {}])
  let experts!: TeamExperts
  const owner = await ctx.plugin({ name: 'expert-validation', apply: (scope: Context) => { experts = new TeamExperts(scope, configuration) } })
  cleanups.push(() => owner.dispose())
  await expect(experts.save({ name: 'Reviewer', description: '', prompt: 'Check numbers.', basePreset: 'standard', provider: 'demo' }))
    .rejects.toThrow('both provider and model')
  expect(experts.list()).toEqual({ experts: [] })
})

async function mountCatalogue(dir: string, options = configuration) {
  const ctx = new Context()
  const definitions = new Map<string, PresetDefinition>()
  const readDocument = vi.fn(async () => ({ content: '- name: "@deepseek-ai/dsh-tool-fs"\n' }))
  const register = vi.fn(async (definition: PresetDefinition) => {
    definitions.set(definition.id, definition)
    return async () => { definitions.delete(definition.id) }
  })
  Reflect.apply(ctx.provide.bind(ctx), ctx, ['profileContext', { dir }])
  Reflect.apply(ctx.provide.bind(ctx), ctx, ['agentPresets', {
    readDocument, register, list: async () => [...definitions.values()].map(value => ({ id: value.id })),
  }])
  let experts!: TeamExperts
  const owner = await ctx.plugin({ name: 'expert-catalogue-fixture', apply: async (scope: Context) => {
    experts = new TeamExperts(scope, options)
    await experts.initialize()
  } })
  cleanups.push(() => owner.dispose())
  return { experts, owner, definitions, register, readDocument, ctx }
}

it('reads the expert version from each actual child session after the expert has been revised', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'expert-execution-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const { experts, ctx } = await mountCatalogue(dir)
  const initial = await experts.save({ name: 'Reviewer', description: '', prompt: 'Review.', basePreset: 'standard' })
  const revised = await experts.save({ ...initial, name: 'Senior reviewer' }, initial.id, initial.revision)
  const stored = new DatabaseSync(join(dir, 'team-experts.sqlite'))
  stored.prepare('UPDATE revisions SET name=? WHERE preset=?').run('Reviewer', initial.preset)
  const disposed: string[] = []
  const observeSession = vi.fn(async (id: string) => ({
    header: { agentPreset: id === 'old-child' ? initial.preset : revised.preset },
    projections: { values: id === 'root' ? { subagentCatalog: [
      { id: 'old-child', mode: 'continuable', label: '审阅员' },
      { id: 'new-child', mode: 'continuable', label: '审阅员' },
      { id: 'remote-child', mode: 'external' },
    ] } : { agentPreset: id === 'old-child' ? initial.preset : revised.preset } },
    [Symbol.dispose]: () => { disposed.push(id) },
  }))
  Reflect.apply(ctx.provide.bind(ctx), ctx, ['sessionQuery', { observeSession }])
  const { SessionId } = await import('@deepseek-ai/dsh-session/types')
  expect(await experts.executions(SessionId('root'))).toEqual([
    { sessionId: 'old-child', memberName: '审阅员', preset: initial.preset, expertName: 'Reviewer · v1' },
    { sessionId: 'new-child', memberName: '审阅员', preset: revised.preset, expertName: 'Senior reviewer · v2' },
  ])
  expect(disposed).toEqual(['old-child', 'new-child', 'root'])
  expect(stored.prepare('SELECT name FROM revisions WHERE preset=?').get(initial.preset)?.name).toBe('Reviewer')
  stored.close()
})

it('lists all bundled metadata without activating presets and reads complete instructions only when selected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'expert-catalogue-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const { experts, register, readDocument } = await mountCatalogue(dir)
  const catalogue = experts.catalogue()
  expect(catalogue.entries).toHaveLength(331)
  expect(catalogue.categories).toHaveLength(22)
  expect(new Set(catalogue.entries.map(entry => entry.key)).size).toBe(331)
  expect(catalogue.entries.every(entry => entry.builtinSlug && !entry.expert)).toBe(true)
  for (const entry of catalogue.entries) {
    const full = experts.readBuiltin(entry.builtinSlug!)
    expect(full.name).toBe(entry.name)
    expect(full.prompt.length).toBeGreaterThan(0)
  }
  const aiEngineer = catalogue.entries.find(entry => entry.builtinSlug === 'engineering/engineering-ai-engineer')!
  expect(aiEngineer.tags).toContain('AI Engineer')
  expect(aiEngineer.examples.length).toBeGreaterThan(0)
  expect(experts.list()).toEqual({ experts: [] })
  expect(register).not.toHaveBeenCalled()
  expect(readDocument).not.toHaveBeenCalled()
  const longest = experts.readBuiltin('security/security-threat-intelligence-analyst')
  expect(longest.prompt).toHaveLength(20001)
  expect(longest).toMatchObject({ basePreset: 'standard', sourceSlug: 'security/security-threat-intelligence-analyst', sourceRevision: '3612123844c66162e81084ec931d357398a79864' })
  expect(experts.list().experts).toHaveLength(0)
  expect(() => experts.readBuiltin('../../not-a-persona')).toThrow('no longer exists')
})

it('activates a bundled expert once across concurrent requests, edits and a restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'expert-activation-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const first = await mountCatalogue(dir)
  const slug = 'engineering/engineering-ai-engineer'
  await expect(first.experts.activate('missing/expert')).rejects.toThrow('no longer exists')
  const [one, repeated] = await Promise.all([first.experts.activate(slug), first.experts.activate(slug)])
  expect(repeated).toEqual(one)
  expect(first.register).toHaveBeenCalledTimes(1)
  expect(first.experts.list().experts).toHaveLength(1)
  expect(first.experts.catalogue().entries).toHaveLength(331)
  expect(first.experts.catalogue().entries.find(entry => entry.builtinSlug === slug)?.expert).toEqual(one)
  const two = await first.experts.save({ ...one, description: 'Updated specialization', tags: ['AI Engineer', '定制'] }, one.id, one.revision)
  expect(two.revision).toBe(2)
  expect(await first.experts.activate(slug)).toEqual(two)
  await expect(first.experts.save(first.experts.readBuiltin(slug))).rejects.toThrow('already activated')
  await first.owner.dispose()
  const restarted = await mountCatalogue(dir)
  expect(await restarted.experts.activate(slug)).toEqual(two)
  expect(restarted.register).toHaveBeenCalledTimes(2)
  expect(restarted.definitions.has(one.preset)).toBe(true)
  expect(restarted.definitions.has(two.preset)).toBe(true)
  expect(restarted.experts.list().experts).toEqual([two])
})

it('rejects oversized instructions without truncating them or losing an existing expert after the limit changes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'expert-limit-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const first = await mountCatalogue(dir)
  const saved = await first.experts.activate('security/security-threat-intelligence-analyst')
  await first.owner.dispose()
  const restarted = await mountCatalogue(dir, { ...configuration, maxPromptLength: 16000 })
  expect(restarted.experts.list().experts).toEqual([saved])
  expect(await restarted.experts.activate(saved.sourceSlug!)).toEqual(saved)
  expect(() => restarted.experts.readBuiltin(saved.sourceSlug!)).toThrow('requires 20001 prompt characters')
  await expect(restarted.experts.save({ ...saved, prompt: saved.prompt }, saved.id, saved.revision)).rejects.toThrow('16000 character limit')
  expect(restarted.experts.list().experts).toEqual([saved])
})

it('does not label unrelated engineering experts as UI experts through partial English words', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'expert-tags-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const { experts } = await mountCatalogue(dir)
  const catalogue = experts.catalogue().entries
  expect(catalogue.find(item => item.name === '嵌入式固件工程师')?.tags).not.toContain('UI')
  expect(catalogue.find(item => item.name === '地理处理专家')?.tags).not.toContain('UI')
  expect(catalogue.find(item => item.name === 'UI 设计师')?.tags).toContain('UI')
})
