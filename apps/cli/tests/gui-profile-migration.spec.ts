/** Legacy GUI profiles merge once without changing recorded entity identities. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import * as files from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it, vi } from 'vitest'
import { load } from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { migrateGuiProfile } from '../src/gui-profile-migration.ts'
import { assertNoLegacyGuiHost } from '../src/gui-legacy-hosts.ts'

vi.mock('../src/gui-legacy-hosts.ts', () => ({ assertNoLegacyGuiHost: vi.fn(async () => {}) }))

vi.mock('node:fs/promises', async (original) => {
  const module = await original<typeof files>()
  return { ...module, rename: vi.fn(module.rename) }
})

const homes: string[] = []
afterEach(() => {
  vi.mocked(files.rename).mockRestore()
  vi.mocked(assertNoLegacyGuiHost).mockReset().mockResolvedValue(undefined)
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'gui-profile-migration-'))
  homes.push(home)
  const web = join(home, 'profiles', 'web')
  const desktop = join(home, 'profiles', 'desktop')
  for (const directory of [web, desktop]) {
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'package.json'), JSON.stringify({
      name: `dsh-profile-${directory === web ? 'web' : 'desktop'}`, private: true,
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
    }))
    writeFileSync(join(directory, 'cordis.patch.yml'), '[]\n')
  }
  return { home, web, desktop }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected a fixture object')
  return value as Record<string, unknown>
}

function readJson(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  return object(value)
}

function database(path: string, rows: Array<[string, string]> = []) {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE records(id TEXT PRIMARY KEY, data TEXT); PRAGMA user_version=1;')
  for (const row of rows) db.prepare('INSERT INTO records VALUES(?,?)').run(...row)
  return db
}

function rows(path: string) {
  const db = new DatabaseSync(path, { readOnly: true })
  try { return db.prepare('SELECT * FROM records ORDER BY id').all() } finally { db.close() }
}

it('checks old Host usage before creating backups or publishing a marker', async () => {
  const { home, web } = fixture()
  const original = readFileSync(join(web, 'package.json'))
  vi.mocked(assertNoLegacyGuiHost).mockRejectedValueOnce(new Error('older Host is active'))
  await expect(migrateGuiProfile(home)).rejects.toThrow('older Host is active')
  expect(readFileSync(join(web, 'package.json'))).toEqual(original)
  expect(existsSync(join(home, 'gui-profile-backups'))).toBe(false)
  expect(existsSync(join(home, 'gui-profile-migration-v1.json'))).toBe(false)
})

it.each(['web', 'desktop'])('refuses an active %s preparation lock before touching profiles', async (profile) => {
  const { home, web, desktop } = fixture()
  writeFileSync(join(profile === 'web' ? web : desktop, 'lock'), `${String(process.pid)}\n`)
  await expect(migrateGuiProfile(home)).rejects.toThrow('being modified by process')
  expect(existsSync(join(home, 'gui-profile-migration-v1.json'))).toBe(false)
  expect(existsSync(join(home, 'gui-profile-backups'))).toBe(false)
  expect(existsSync(web)).toBe(true)
  expect(existsSync(desktop)).toBe(true)
})

it('refuses malformed preparation locks without assuming the owner stopped', async () => {
  const { home, desktop } = fixture()
  writeFileSync(join(desktop, 'lock'), 'unknown owner')
  await expect(migrateGuiProfile(home)).rejects.toThrow('unrecognized profile lock')
  expect(existsSync(join(home, 'gui-profile-migration-v1.json'))).toBe(false)
})

it('leaves profile initialization to the launcher for a fresh home', async () => {
  const home = mkdtempSync(join(tmpdir(), 'gui-profile-new-'))
  homes.push(home)
  await migrateGuiProfile(home)
  expect(existsSync(join(home, 'profiles', 'web'))).toBe(false)
  expect(readJson(join(home, 'gui-profile-migration-v1.json'))).toEqual({ version: 1 })
})

it('merges bundle selections and preserves Web UI preferences while importing business configuration', async () => {
  const { home, web, desktop } = fixture()
  writeFileSync(join(web, 'package.json'), JSON.stringify({ private: true, dependencies: { one: '1.0.0' },
    dsh: { profile: { bundles: ['base', 'web'] } } }))
  writeFileSync(join(desktop, 'package.json'), JSON.stringify({ dependencies: { two: 'file:../custom' },
    dsh: { profile: { bundles: ['base', 'team'] } } }))
  writeFileSync(join(web, 'cordis.patch.yml'), '- id: ui-theme\n  config:\n    preference: dark\n- id: agent-teams\n  config:\n    profiles:\n      Existing:\n        members: []\n')
  writeFileSync(join(desktop, 'cordis.patch.yml'), '- id: ui-theme\n  config:\n    preference: system\n    fontSize: 16\n- id: agent-teams\n  config:\n    profiles:\n      Imported:\n        members: []\n- id: desktop-native\n  config:\n    enabled: true\n')
  await migrateGuiProfile(home)
  const manifest = readJson(join(web, 'package.json'))
  expect(object(object(manifest.dsh).profile).bundles).toEqual(['base', 'web', 'team'])
  expect(manifest.dependencies).toEqual({ one: '1.0.0', two: `file:${join(home, 'profiles', 'custom')}` })
  expect(load(readFileSync(join(web, 'cordis.patch.yml'), 'utf8'), { schema: entryListSchema })).toEqual([
    { id: 'ui-theme', config: { preference: 'dark', fontSize: 16 } },
    { id: 'agent-teams', config: { profiles: { Existing: { members: [] }, Imported: { members: [] } } } },
  ])
  const backup = String(readJson(join(home, 'gui-profile-migration-v1.json')).backup)
  expect(object(readJson(join(backup, 'desktop', 'package.json')).dependencies).two).toBe('file:../custom')
  expect(existsSync(join(desktop, 'package.json'))).toBe(true)
  expect(readJson(join(backup, 'migration-policy.json')).retainedPreferences).toEqual(['patch.ui-theme.config.preference'])
})

it('captures WAL rows, combines distinct primary keys and keeps expert revision data', async () => {
  const { home, web, desktop } = fixture()
  const current = database(join(web, 'team-experts.sqlite'), [['old-preset', '{"prompt":"original"}']])
  const incoming = database(join(desktop, 'team-experts.sqlite'), [['new-preset', '{"prompt":"revised"}']])
  try {
    expect(existsSync(join(desktop, 'team-experts.sqlite-wal'))).toBe(true)
    await migrateGuiProfile(home)
    expect(rows(join(web, 'team-experts.sqlite'))).toEqual([
      { id: 'new-preset', data: '{"prompt":"revised"}' },
      { id: 'old-preset', data: '{"prompt":"original"}' },
    ])
    const backup = String(readJson(join(home, 'gui-profile-migration-v1.json')).backup)
    expect(rows(join(backup, 'desktop', 'team-experts.sqlite'))).toEqual([{ id: 'new-preset', data: '{"prompt":"revised"}' }])
  } finally { current.close(); incoming.close() }
})

it('accepts semantically equal JSON records without duplicating them', async () => {
  const { home, web, desktop } = fixture()
  database(join(web, 'team-workflows.sqlite'), [['run', '{"a":1,"b":2}']]).close()
  database(join(desktop, 'team-workflows.sqlite'), [['run', '{"b":2, "a":1}']]).close()
  await migrateGuiProfile(home)
  expect(rows(join(web, 'team-workflows.sqlite'))).toEqual([{ id: 'run', data: '{"a":1,"b":2}' }])
})

it('refuses conflicting rows and leaves the original profiles intact without a completion marker', async () => {
  const { home, web, desktop } = fixture()
  database(join(web, 'team-workflows.sqlite'), [['same-id', 'web-value']]).close()
  database(join(desktop, 'team-workflows.sqlite'), [['same-id', 'desktop-value']]).close()
  const before = readFileSync(join(web, 'package.json'))
  await expect(migrateGuiProfile(home)).rejects.toThrow('migration conflict')
  expect(readFileSync(join(web, 'package.json'))).toEqual(before)
  expect(rows(join(web, 'team-workflows.sqlite'))).toEqual([{ id: 'same-id', data: 'web-value' }])
  expect(rows(join(desktop, 'team-workflows.sqlite'))).toEqual([{ id: 'same-id', data: 'desktop-value' }])
  expect(existsSync(join(home, 'gui-profile-migration-v1.json'))).toBe(false)
  expect(readdirSync(join(home, 'gui-profile-backups'))).toHaveLength(1)
})

it.each(['dependency', 'business configuration', 'member memory'])('rejects conflicting %s without choosing a winner', async (kind) => {
  const { home, web, desktop } = fixture()
  if (kind === 'dependency') {
    for (const [directory, version] of [[web, '1'], [desktop, '2']]) {
      const manifest = readJson(join(directory!, 'package.json'))
      manifest.dependencies = { plugin: version }
      writeFileSync(join(directory!, 'package.json'), JSON.stringify(manifest))
    }
  } else if (kind === 'business configuration') {
    for (const [directory, value] of [[web, 'one'], [desktop, 'two']]) {
      writeFileSync(join(directory!, 'cordis.patch.yml'), `- id: agent-teams\n  config:\n    profiles:\n      Team:\n        description: ${value}\n`)
    }
  } else {
    for (const [directory, value] of [[web, 'one'], [desktop, 'two']]) {
      mkdirSync(join(directory!, 'office-members', 'member'), { recursive: true })
      writeFileSync(join(directory!, 'office-members', 'member', 'memory.md'), value!)
    }
  }
  await expect(migrateGuiProfile(home)).rejects.toThrow('migration conflict')
  expect(existsSync(join(home, 'gui-profile-migration-v1.json'))).toBe(false)
})

it('imports member files once and never reapplies an old desktop profile after completion', async () => {
  const { home, web, desktop } = fixture()
  mkdirSync(join(desktop, 'office-members', 'member'), { recursive: true })
  writeFileSync(join(desktop, 'office-members', 'member', 'memory.md'), 'retained memory')
  await migrateGuiProfile(home)
  expect(readFileSync(join(web, 'office-members', 'member', 'memory.md'), 'utf8')).toBe('retained memory')
  writeFileSync(join(desktop, 'office-members', 'member', 'memory.md'), 'stale changes')
  await migrateGuiProfile(home)
  expect(readFileSync(join(web, 'office-members', 'member', 'memory.md'), 'utf8')).toBe('retained memory')
  expect(readdirSync(join(home, 'gui-profile-backups'))).toHaveLength(1)
})

it('rolls back a failed publication and permits retry', async () => {
  const { home, web, desktop } = fixture()
  writeFileSync(join(desktop, 'memory.md'), 'imported')
  const original = readFileSync(join(web, 'package.json'))
  const native = (await vi.importActual<typeof files>('node:fs/promises')).rename
  vi.mocked(files.rename).mockImplementation(async (from, to) => {
    if (String(from).includes('.gui-profile-web-') && to === web) throw new Error('publish failed')
    return native(from, to)
  })
  await expect(migrateGuiProfile(home)).rejects.toThrow('publish failed')
  expect(readFileSync(join(web, 'package.json'))).toEqual(original)
  expect(existsSync(join(home, 'gui-profile-migration-v1.json'))).toBe(false)
  expect(existsSync(join(home, 'gui-profile-migration-v1.pending.json'))).toBe(false)
  vi.mocked(files.rename).mockImplementation(native)
  await migrateGuiProfile(home)
  expect(readFileSync(join(web, 'memory.md'), 'utf8')).toBe('imported')
})

it('retains the recovery journal if restoring the original profile fails and recovers on the next invocation', async () => {
  const { home, web, desktop } = fixture()
  writeFileSync(join(desktop, 'memory.md'), 'imported')
  const native = (await vi.importActual<typeof files>('node:fs/promises')).rename
  vi.mocked(files.rename).mockImplementation(async (from, to) => {
    if (to === web && (String(from).includes('.gui-profile-web-') || String(from).endsWith('original-web'))) throw new Error('rename denied')
    return native(from, to)
  })
  await expect(migrateGuiProfile(home)).rejects.toThrow('migration and recovery both failed')
  expect(existsSync(join(home, 'gui-profile-migration-v1.pending.json'))).toBe(true)
  expect(existsSync(join(home, 'gui-profile-migration-v1.json'))).toBe(false)
  vi.mocked(files.rename).mockImplementation(native)
  await migrateGuiProfile(home)
  expect(readFileSync(join(web, 'memory.md'), 'utf8')).toBe('imported')
})


it('normalizes old office message bindings while retaining their lobby Session IDs', async () => {
  const { home, web, desktop } = fixture()
  for (const [directory, version, office] of [[web, 2, 'web-office'], [desktop, 1, 'desktop-office']] as const) {
    const db = new DatabaseSync(join(directory, 'team-offices.sqlite'))
    db.exec(`CREATE TABLE offices(id TEXT PRIMARY KEY, session_id TEXT UNIQUE, data TEXT NOT NULL);
      CREATE TABLE messages(id TEXT PRIMARY KEY, office_id TEXT NOT NULL, member_id TEXT NOT NULL,
      child_id TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL);
      PRAGMA user_version=${version};`)
    if (version === 2) db.exec('ALTER TABLE messages ADD COLUMN root_session_id TEXT')
    db.prepare('INSERT INTO offices VALUES(?,?,?)').run(office, `${office}-session`, '{}')
    if (version === 1) db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?)').run('message', office, 'member', 'child', 'completed', '{}')
    db.close()
  }
  await migrateGuiProfile(home)
  const merged = new DatabaseSync(join(web, 'team-offices.sqlite'), { readOnly: true })
  try {
    expect(merged.prepare('PRAGMA user_version').get()?.user_version).toBe(2)
    expect(merged.prepare('SELECT root_session_id,status FROM messages').get()).toEqual({
      root_session_id: 'desktop-office-session', status: 'completed',
    })
  } finally { merged.close() }
})


it('initializes the canonical profile from desktop-only data including package-manager metadata', async () => {
  const { home, web, desktop } = fixture()
  rmSync(web, { recursive: true })
  writeFileSync(join(desktop, 'pnpm-workspace.yaml'), 'packages: []\n')
  writeFileSync(join(desktop, 'cordis.yml'), '# existing profile entry\n')
  database(join(desktop, 'team-workflows.sqlite'), [['run', 'delivery']]).close()
  await migrateGuiProfile(home)
  expect(readJson(join(web, 'package.json')).name).toBe('dsh-profile-web')
  expect(readFileSync(join(web, 'pnpm-workspace.yaml'), 'utf8')).toBe('packages: []\n')
  expect(readFileSync(join(web, 'cordis.yml'), 'utf8')).toBe('# existing profile entry\n')
  expect(rows(join(web, 'team-workflows.sqlite'))).toEqual([{ id: 'run', data: 'delivery' }])
})
