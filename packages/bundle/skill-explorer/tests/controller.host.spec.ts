import { Context } from '@deepseek-ai/cordis'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SkillExplorer, type SkillExplorerConfig } from '../src/controller.ts'
import { parseFrontmatter } from '../src/upstream/frontmatter.ts'
import { collectSkills, type RegistrySkill } from '../src/upstream/collect.ts'
import { readZipEntries } from '../src/upstream/import.ts'
import { buildZip } from './zip-builder.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

function providePartial(ctx: Context, name: string, value: object): void {
  Reflect.apply(ctx.provide.bind(ctx), ctx, [name, value])
}

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'skill-centre-')))
  const home = join(root, 'home')
  const agentsHome = join(root, 'agents')
  const workspace = join(root, 'workspace')
  const bundled = join(root, 'bundled')
  await Promise.all([home, agentsHome, workspace, bundled].map(path => mkdir(path)))
  const workspaceId = WorkspaceId('skill-workspace')
  const ctx = new Context()
  const snapshot = vi.fn(async (): Promise<{ skills: RegistrySkill[]; complete: boolean }> => ({ skills: [], complete: true }))
  providePartial(ctx, 'skills', { snapshot })
  providePartial(ctx, 'agentPresets', {
    acquireScope: async () => ({ key: 'native-skill-scope', [Symbol.asyncDispose]: async () => {} }),
  })
  providePartial(ctx, 'workspaceRegistry', {
    get: (id: WorkspaceId) => id === workspaceId ? { id, path: workspace } : undefined,
    list: () => [{ id: workspaceId, path: workspace }],
  })
  const config: SkillExplorerConfig = { dshHome: home, agentsHome, customSkillDirs: [], bundledSkillDirs: [bundled],
    maxSkillBytes: 65536, maxImportBytes: 4 * 1024 * 1024, maxImportEntries: 512, maxImportTotalBytes: 4 * 1024 * 1024 }
  let service: SkillExplorer | undefined
  const owner = await ctx.plugin({ name: 'skill-centre-fixture', apply(scope: Context) { service = new SkillExplorer(scope, config) } })
  cleanups.push(async () => { await owner.dispose(); await rm(root, { recursive: true, force: true }) })
  if (!service) throw new Error('Skill centre did not mount')
  return { root, home, workspace, workspaceId, bundled, ctx, service, snapshot, config }
}

const draft = { name: 'review-copy', description: 'Review product copy', content: 'Check names and terminology.' }

it('uses the selected workspace and native preset scope for discovery and creation', async () => {
  const { service, workspaceId, workspace, snapshot } = await fixture()
  const created = await service.create({ scope: 'project', workspaceId, draft })
  expect(created.path).toBe(join(workspace, '.dsh', 'skills', draft.name, 'SKILL.md'))
  const listed = await service.list({ workspaceId })
  expect(listed.groups.flatMap(group => group.skills).map(skill => skill.name)).toEqual([draft.name])
  expect(snapshot).toHaveBeenCalledWith({ cwd: workspace, scope: 'native-skill-scope' })
  await expect(service.list({ workspaceId: WorkspaceId('missing') })).rejects.toMatchObject({ code: 'skill-explorer/not-found' })
})

it('allows one concurrent creation and never replaces the first committed file', async () => {
  const { service } = await fixture()
  const outcomes = await Promise.allSettled([
    service.create({ scope: 'user', draft: { ...draft, content: 'First candidate.' } }),
    service.create({ scope: 'user', draft: { ...draft, content: 'Second candidate.' } }),
  ])
  expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1)
  const success = outcomes.find(item => item.status === 'fulfilled')
  if (success?.status !== 'fulfilled') throw new Error('No creation completed')
  expect(await service.read(success.value)).toEqual(success.value)
})

it('keeps personal discovery separate and requires an explicit project destination', async () => {
  const { service, workspaceId, snapshot } = await fixture()
  await service.create({ scope: 'project', workspaceId, draft })
  const personal = await service.list({})
  expect(personal.projectRoots).toEqual([])
  expect(personal.groups.flatMap(group => group.skills)).toEqual([])
  expect(snapshot).toHaveBeenLastCalledWith({ scope: 'native-skill-scope' })
  await expect(service.create({ scope: 'project', draft })).rejects.toMatchObject({ code: 'skill-explorer/invalid-request' })
})

it('preserves unedited metadata, comments and permissions and rejects a stale edit', async () => {
  const { service } = await fixture()
  const created = await service.create({ scope: 'user', draft })
  await writeFile(created.path, '---\n# Keep this comment\nname: review-copy\ndescription: Original\nuser-invocable: false\ninput:\n  hint: Keep input\nmetadata:\n  owner: product\n---\nOriginal body.\n', { mode: 0o600 })
  const read = await service.read(created)
  const changed = await service.update({ ...read, draft: { ...draft, description: 'Updated', content: 'Updated body.\n' } })
  const raw = await readFile(created.path, 'utf8')
  expect(raw).toContain('# Keep this comment')
  expect(raw).toContain('user-invocable: false')
  expect(raw).toContain('owner: product')
  expect(raw).toContain('hint: Keep input')
  expect((await stat(created.path)).mode & 0o777).toBe(0o600)
  await expect(service.update({ ...read, draft })).rejects.toMatchObject({ code: 'skill-explorer/conflict' })
  expect((await service.read(changed)).content).toBe('Updated body.\n')
})

it('changes the real invocation flag and preserves the body', async () => {
  const { service } = await fixture()
  const created = await service.create({ scope: 'user', draft })
  await service.setEnabled({ ...created, enabled: false })
  const disabled = await service.read(created)
  expect(parseFrontmatter(await readFile(created.path, 'utf8')).disableModelInvocation).toBe(true)
  expect(disabled.content).toBe(created.content)
  expect((await service.list({})).groups.flatMap(group => group.skills)[0]?.modelInvocable).toBe(false)
  await service.setEnabled({ ...disabled, enabled: true })
  expect(parseFrontmatter(await readFile(created.path, 'utf8')).disableModelInvocation).toBe(false)
})

it('keeps freshly edited file policy when a native snapshot still has cached metadata', async () => {
  const { service, config } = await fixture()
  const created = await service.create({ scope: 'user', draft })
  await service.setEnabled({ ...created, enabled: false })
  const collection = await collectSkills({
    cwd: config.dshHome, projectRoots: [], dshHome: config.dshHome, agentsHome: config.agentsHome,
    maximumBytes: config.maxSkillBytes,
    registry: { snapshot: async () => ({ complete: true, skills: [{
      name: created.name, description: created.description, path: created.path, source: 'user-dsh', provider: 'filesystem',
      invocation: { modelInvocable: true, userInvocable: true },
    }] }) },
  })
  expect(collection.skills[0]?.modelInvocable).toBe(false)
})

it('retains a removed skill and restores it without overwriting a replacement', async () => {
  const { service } = await fixture()
  const created = await service.create({ scope: 'user', draft })
  const recovery = await service.trash(created)
  expect((await service.list({})).groups).toHaveLength(0)
  expect(await readFile(recovery.trashedPath, 'utf8')).toContain(draft.content)
  await service.restore(recovery)
  expect((await service.read(created)).content).toBe(created.content)
  const again = await service.trash(created)
  await service.create({ scope: 'user', draft: { ...draft, content: 'Replacement.' } })
  await expect(service.restore(again)).rejects.toMatchObject({ code: 'skill-explorer/conflict' })
  expect((await service.read(created)).content).toContain('Replacement.')
  expect(await readFile(again.trashedPath, 'utf8')).toContain(draft.content)
})

it('omits a removed file from cached native results while retaining virtual skills', async () => {
  const { service, snapshot } = await fixture()
  const created = await service.create({ scope: 'user', draft })
  snapshot.mockResolvedValue({ complete: true, skills: [
    { name: created.name, description: created.description, path: created.path, source: 'user-dsh', provider: 'filesystem' },
    { name: 'virtual-helper', description: 'Plugin skill', source: 'runtime', provider: 'plugin' },
  ] })
  await service.trash(created)
  expect((await service.list({})).groups.flatMap(group => group.skills).map(skill => skill.name)).toEqual(['virtual-helper'])
})

it('previews a native provider file outside editable roots and refuses mutations', async () => {
  const { service, snapshot, root } = await fixture()
  const directory = join(root, 'provider-files')
  await mkdir(directory)
  const path = join(directory, 'SKILL.md')
  await writeFile(path, '---\nname: provider-helper\ndescription: Provider instructions\n---\nProvider body.\n')
  snapshot.mockResolvedValue({ complete: true, skills: [
    { name: 'provider-helper', description: 'Provider instructions', path, source: 'bundled', provider: 'external-package' },
  ] })
  const entries = (await service.list({})).groups.flatMap(group => group.skills)
  expect(entries[0]).toMatchObject({ path, fileState: 'provider-file' })
  const document = await service.read({ name: 'provider-helper', path })
  expect(document.content).toBe('Provider body.\n')
  await expect(service.setEnabled({ ...document, enabled: false })).rejects.toMatchObject({ code: 'skill-explorer/read-only' })
  await expect(service.update({ ...document, draft: { ...draft, name: 'provider-helper' } })).rejects.toMatchObject({ code: 'skill-explorer/read-only' })
  await expect(service.trash(document)).rejects.toMatchObject({ code: 'skill-explorer/read-only' })
  await expect(service.read({ name: 'provider-helper', path: join(root, 'secret') })).rejects.toMatchObject({ code: 'skill-explorer/conflict' })
})

it('keeps bundled skills read-only and refuses a forged filesystem target', async () => {
  const { service, bundled, root } = await fixture()
  await mkdir(join(bundled, draft.name))
  const path = join(bundled, draft.name, 'SKILL.md')
  await writeFile(path, `---\nname: ${draft.name}\ndescription: Built in\n---\nBody.\n`)
  const document = await service.read({ name: draft.name, path })
  await expect(service.setEnabled({ ...document, enabled: false })).rejects.toMatchObject({ code: 'skill-explorer/read-only' })
  await expect(service.read({ name: draft.name, path: join(root, 'secret') })).rejects.toMatchObject({ code: 'skill-explorer/conflict' })
})

it('refuses linked instruction files and linked destination directories', async () => {
  const { service, home, root } = await fixture()
  const outside = join(root, 'outside')
  await mkdir(outside)
  const outsideFile = join(outside, 'SKILL.md')
  await writeFile(outsideFile, `---\nname: ${draft.name}\ndescription: Outside\n---\nKeep.\n`)
  await mkdir(join(home, 'skills', draft.name), { recursive: true })
  await symlink(outsideFile, join(home, 'skills', draft.name, 'SKILL.md'))
  const entry = (await service.list({})).groups.flatMap(group => group.skills)[0]
  if (!entry?.path) throw new Error('Linked skill was not listed')
  expect(entry.linked).toBe(true)
  await expect(service.trash({ name: entry.name, path: entry.path })).rejects.toMatchObject({ code: 'skill-explorer/read-only' })
  await symlink(outside, join(home, 'skills', 'new-copy'))
  await expect(service.create({ scope: 'user', draft: { ...draft, name: 'new-copy' } })).rejects.toMatchObject({ code: 'skill-explorer/io' })
  expect(await readFile(outsideFile, 'utf8')).toContain('Keep.')
})

it('imports independent files and reports an unsafe destination without losing successful outcomes', async () => {
  const { service, home, root } = await fixture()
  await mkdir(join(home, 'skills'), { recursive: true })
  const outside = join(root, 'outside')
  await mkdir(outside)
  await symlink(outside, join(home, 'skills', 'blocked'))
  const archive = buildZip([
    { path: 'alpha/SKILL.md', content: '---\nname: alpha\ndescription: Alpha\n---\nFirst.' },
    { path: 'blocked/SKILL.md', content: '---\nname: blocked\ndescription: Blocked\n---\nSecond.' },
    { path: 'gamma/SKILL.md', content: '---\nname: gamma\ndescription: Gamma\n---\nThird.' },
  ])
  const report = await service.importSkills({ scope: 'user', source: { kind: 'archive', data: archive.toString('base64') } })
  expect(report.imported).toBe(2)
  expect(report.outcomes.map(outcome => outcome.reason)).toEqual([undefined, 'write-failed', undefined])
  expect(await readFile(join(home, 'skills', 'gamma', 'SKILL.md'), 'utf8')).toContain('Third.')
})

it('bounds archive inflation before allocating its declared output', () => {
  const archive = buildZip([{ path: 'large/SKILL.md', content: 'x'.repeat(500000) }], { method: 8 })
  const central = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  archive.writeUInt32LE(1, central + 24)
  expect(() => readZipEntries(archive, { archiveBytes: 4096, totalBytes: 65536, skillBytes: 65536, entries: 10 })).toThrow()
})
