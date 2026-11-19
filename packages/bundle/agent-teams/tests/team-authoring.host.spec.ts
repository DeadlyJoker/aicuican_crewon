import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { TeamAuthoring } from '../src/team-authoring.ts'
import { normalizeTeamDefinition, type TeamAuthoringInput } from '../src/team-authoring-types.ts'
import { teamScenarios } from '../src/team-scenarios.ts'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })
const session = 'authoring-session' as SessionId
const input: TeamAuthoringInput = { name: 'Review team', profile: { description: 'Review product decisions',
  goal: 'Find material risks', constraints: 'Use supplied evidence', deliverables: 'Three actionable issues', examples: ['Review onboarding'],
  members: [{ name: 'Reviewer', role: 'Researcher', executionPrompt: 'Check evidence and cite findings' }] } }

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'team-authoring-'))
  cleanup.push(() => rm(dir, { recursive: true, force: true }))
  const descriptor = { ns: 'agent-teams', revision: 4, value: { maxMembers: 8, profiles: {} as Record<string, unknown> },
    user: { profiles: {} as Record<string, unknown> } }
  const mutate = vi.fn(async (_namespace: string, operations: Array<{ path: string[]; value: unknown }>, revision: number) => {
    if (descriptor.revision !== revision) throw new Error('Configuration changed')
    for (const operation of operations) {
      descriptor.value.profiles[operation.path[1]!] = operation.value
      descriptor.user.profiles[operation.path[1]!] = operation.value
    }
    descriptor.revision++
  })
  const mount = async () => {
    const ctx = new Context()
    Reflect.apply(ctx.provide.bind(ctx), ctx, ['profileContext', { dir }])
    Reflect.apply(ctx.provide.bind(ctx), ctx, ['settings', { describe: () => [descriptor], mutate }])
    const experts = { list: () => ({ experts: [{ id: 'saved-expert', preset: 'expert-saved-expert-v2',
      name: 'Saved expert', description: 'Fact reviewer', prompt: 'Check factual claims.', revision: 2, basePreset: 'standard' }] }) }
    Reflect.apply(ctx.provide.bind(ctx), ctx, ['agentPresets', { list: async () => [{ id: 'standard' }, { id: 'expert-saved-expert-v1' }, { id: 'expert-saved-expert-v2' }] }])
    let service!: TeamAuthoring
    const owner = await ctx.plugin({ name: 'authoring-test', apply(scope: Context) { service = new TeamAuthoring(scope, experts) } })
    cleanup.push(() => owner.dispose())
    return { service, owner }
  }
  return { dir, descriptor, mutate, mount }
}

it('retains a pending proposal through a restart and saves only once under simultaneous confirmation', async () => {
  const data = await fixture()
  const first = await data.mount()
  const draft = await first.service.stage(session, 'call-1', input)
  expect(data.mutate).not.toHaveBeenCalled()
  expect(await first.service.stage(session, 'call-1', input)).toEqual(draft)
  await first.owner.dispose()
  const second = await data.mount()
  expect(second.service.read(session)).toEqual(draft)
  const outcomes = await Promise.all([
    second.service.confirm(session, draft.id, draft.revision), second.service.confirm(session, draft.id, draft.revision),
  ])
  expect(outcomes.map(value => value.status)).toEqual(['saved', 'saved'])
  expect(data.mutate).toHaveBeenCalledTimes(1)
  expect(data.descriptor.user.profiles[draft.name]).toEqual(input.profile)
})

it('updates the same draft and rejects stale cards and concurrent external changes', async () => {
  const data = await fixture()
  const { service } = await data.mount()
  const one = await service.stage(session, 'call-1', input)
  const two = await service.stage(session, 'call-2', { ...input, profile: { ...input.profile, goal: 'Compare risks' } })
  expect(two.id).toBe(one.id)
  expect(two.revision).toBe(2)
  await expect(service.confirm(session, one.id, one.revision)).rejects.toThrow('latest card')
  data.descriptor.revision++
  await expect(service.confirm(session, two.id, two.revision)).rejects.toThrow('settings changed')
  const three = await service.update(session, two.id, two.revision, input)
  expect((await service.confirm(session, three.id, three.revision)).status).toBe('saved')
})

it('returns to a pending card after a failed write and recognizes a committed write with a lost acknowledgement', async () => {
  const data = await fixture()
  const { service } = await data.mount()
  const draft = await service.stage(session, 'call-1', input)
  data.mutate.mockRejectedValueOnce(new Error('Write refused'))
  await expect(service.confirm(session, draft.id, draft.revision)).rejects.toThrow('Write refused')
  expect(service.read(session)?.status).toBe('pending')
  data.mutate.mockImplementationOnce(async () => {
    data.descriptor.user.profiles[draft.name] = draft.profile
    data.descriptor.value.profiles[draft.name] = draft.profile
    data.descriptor.revision++
    throw new Error('Acknowledgement lost')
  })
  expect((await service.confirm(session, draft.id, draft.revision)).status).toBe('saved')
  expect(data.mutate).toHaveBeenCalledTimes(2)
})

it('recovers a saving marker by comparing the committed raw profile after restart', async () => {
  const data = await fixture()
  const first = await data.mount()
  const draft = await first.service.stage(session, 'call-1', input)
  await first.owner.dispose()
  const db = new DatabaseSync(join(data.dir, 'team-authoring.sqlite'))
  db.prepare('UPDATE drafts SET data=? WHERE session_id=?').run(JSON.stringify({ ...draft, status: 'saving' }), session)
  db.close()
  data.descriptor.user.profiles[draft.name] = draft.profile
  data.descriptor.value.profiles[draft.name] = draft.profile
  data.descriptor.revision++
  const second = await data.mount()
  expect((await second.service.confirm(session, draft.id, draft.revision)).status).toBe('saved')
  expect(data.mutate).not.toHaveBeenCalled()
})

it('resolves real expert revisions, preserves earlier revisions and refuses fabricated or mismatched presets', async () => {
  const data = await fixture()
  const { service } = await data.mount()
  const bound = { ...input, profile: { ...input.profile, members: [{ name: 'Reviewer', expertId: 'saved-expert' }] } }
  expect((await service.resolve(bound)).profile.members[0]).toMatchObject({ agentPreset: 'expert-saved-expert-v2', role: 'Fact reviewer', executionPrompt: 'Check factual claims.' })
  expect((await service.resolve({ ...bound, profile: { ...bound.profile, members: [{ ...bound.profile.members[0]!, agentPreset: 'expert-saved-expert-v1' }] } })).profile.members[0]?.agentPreset).toBe('expert-saved-expert-v1')
  await expect(service.resolve({ ...input, profile: { ...input.profile, members: [{ ...input.profile.members[0]!, agentPreset: 'invented' }] } })).rejects.toThrow('unavailable')
  await expect(service.resolve({ ...bound, profile: { ...bound.profile, members: [{ ...bound.profile.members[0]!, agentPreset: 'standard' }] } })).rejects.toThrow('unavailable')
})

it('discards without saving and starts a distinct draft after the old card closes', async () => {
  const data = await fixture()
  const { service } = await data.mount()
  const first = await service.stage(session, 'call-1', input)
  expect((await service.discard(session, first.id, first.revision)).status).toBe('discarded')
  await expect(service.confirm(session, first.id, first.revision)).rejects.toThrow('discarded')
  const next = await service.stage(session, 'call-2', input)
  expect(next.id).not.toBe(first.id)
  expect(data.mutate).not.toHaveBeenCalled()
})

it('keeps legacy profiles editable and provides five complete original starter teams in both languages', () => {
  const legacy = { name: 'Original', profile: { description: 'Review', legacyOption: 1,
    members: [{ name: 'Reviewer', role: 'Review', executionPrompt: 'Check', reasoning_effort: 'high' }] } }
  expect(normalizeTeamDefinition(legacy, 8)).toEqual(legacy)
  for (const chinese of [true, false]) {
    const scenes = teamScenarios(chinese)
    expect(scenes).toHaveLength(5)
    for (const scene of scenes) {
      expect(normalizeTeamDefinition(scene, 8).profile.members).toHaveLength(3)
      expect(scene.profile.examples?.length).toBeGreaterThan(0)
      expect(scene.profile.goal && scene.profile.constraints && scene.profile.deliverables).toBeTruthy()
    }
  }
})

it('omits cleared optional guidance while retaining the exact selected expert preset', () => {
  const value = normalizeTeamDefinition({ name: 'Saved expert team', profile: {
    description: 'Code review', protocol: '', goal: ' ', constraints: '\n', deliverables: '', executionPrompt: ' ',
    taskPlanning: 'captain', members: [{ name: 'Reviewer', role: 'Code reviewer', executionPrompt: 'Review code',
      expertId: 'saved-expert', agentPreset: 'expert-saved-expert-v1' }],
  } }, 8)
  expect(value.profile).toEqual({ description: 'Code review', taskPlanning: 'captain',
    members: [{ name: 'Reviewer', role: 'Code reviewer', executionPrompt: 'Review code',
      expertId: 'saved-expert', agentPreset: 'expert-saved-expert-v1' }],
  })
})
