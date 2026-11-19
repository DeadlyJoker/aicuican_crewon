/** Merge the legacy desktop profile into the shared Web profile before either Host starts. */
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cp, lstat, mkdir, open, readFile, readdir, readlink, rename, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { backup, DatabaseSync, type SQLOutputValue } from 'node:sqlite'
import { isDeepStrictEqual } from 'node:util'
import { dump, load } from 'js-yaml'
import { isJsExpr } from '@deepseek-ai/cordis-plugin-loader'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { assertNoLegacyGuiHost } from './gui-legacy-hosts.ts'
export { assertNoLegacyGuiHost } from './gui-legacy-hosts.ts'

type Document = Record<string, unknown>
interface MigrationJournal { backup: string; stage: string; hadWeb: boolean }

const MARKER = 'gui-profile-migration-v1.json'
const JOURNAL = 'gui-profile-migration-v1.pending.json'
const METADATA = new Set(['package.json', 'cordis.patch.yml', 'cordis.yml', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'node_modules'])

/** Legacy desktop preparation owns this PID lock while modifying a profile. */
async function assertProfileOperationsIdle(home: string): Promise<void> {
  for (const profile of ['web', 'desktop']) {
    const path = join(home, 'profiles', profile, 'lock')
    if (!existsSync(path)) continue
    const entry = await lstat(path)
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`GUI profile migration: invalid profile lock at ${path}`)
    const raw = (await readFile(path, 'utf8')).trim()
    const pid = Number(raw)
    if (!/^\d+$/u.test(raw) || !Number.isSafeInteger(pid) || pid <= 0) {
      throw new Error(`GUI profile migration: unrecognized profile lock at ${path}`)
    }
    try { process.kill(pid, 0) }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ESRCH') continue
      throw error
    }
    throw new Error(`GUI profile migration: ${profile} profile is being modified by process ${String(pid)}. Stop the existing application before retrying.`)
  }
}

function record(value: unknown, subject: string): Document {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`GUI profile migration: invalid ${subject}`)
  return value as Document
}

function conflict(subject: string): never {
  throw new Error(`GUI profile migration conflict at ${subject}. Both original profiles remain in the migration backup.`)
}

async function json(path: string): Promise<Document> {
  return record(JSON.parse(await readFile(path, 'utf8')), path)
}

async function saveJson(path: string, value: unknown): Promise<void> {
  await writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
}

function equal(left: unknown, right: unknown): boolean {
  return isDeepStrictEqual(left, right)
}

/** Merge mappings without choosing one side of a business-data conflict. */
function mergeValues(primary: unknown, legacy: unknown, subject: string, preferPrimary = false, overrides: string[] = []): unknown {
  if (primary === undefined) return legacy
  if (legacy === undefined || equal(primary, legacy)) return primary
  if (primary !== null && legacy !== null && typeof primary === 'object' && typeof legacy === 'object'
    && !Array.isArray(primary) && !Array.isArray(legacy) && !isJsExpr(primary) && !isJsExpr(legacy)) {
    const result = { ...record(primary, subject) }
    for (const [key, value] of Object.entries(record(legacy, subject))) {
      result[key] = mergeValues(result[key], value, `${subject}.${key}`, preferPrimary, overrides)
    }
    return result
  }
  if (preferPrimary) {
    overrides.push(subject)
    return primary
  }
  return conflict(subject)
}

async function sqliteFile(path: string): Promise<boolean> {
  const file = await open(path, 'r')
  try {
    const bytes = Buffer.alloc(16)
    await file.read(bytes, 0, bytes.length, 0)
    return bytes.equals(Buffer.from('SQLite format 3\0'))
  } finally { await file.close() }
}

async function snapshotDatabase(source: string, target: string): Promise<void> {
  const database = new DatabaseSync(source, { readOnly: true })
  try { await backup(database, target) } finally { database.close() }
}

/** Backups preserve symlinks and capture committed WAL pages through SQLite's backup API. */
async function snapshotTree(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true, mode: 0o700 })
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    if (entry.isSymbolicLink()) await symlink(await readlink(from), to)
    else if (entry.isDirectory()) await snapshotTree(from, to)
    else if (entry.isFile()) {
      if (/-wal$|-shm$/u.test(entry.name) && existsSync(from.replace(/-(?:wal|shm)$/u, ''))
        && await sqliteFile(from.replace(/-(?:wal|shm)$/u, ''))) continue
      if (await sqliteFile(from)) await snapshotDatabase(from, to)
      else await cp(from, to, { preserveTimestamps: true })
    } else throw new Error(`GUI profile migration: unsupported filesystem entry ${from}`)
  }
}

function dependency(spec: unknown, directory: string, subject: string): string {
  if (typeof spec !== 'string') throw new Error(`GUI profile migration: invalid dependency ${subject}`)
  const local = /^(file:|link:)(.+)$/u.exec(spec)
  return local?.[1] && local[2] ? `${local[1]}${resolve(directory, local[2])}` : spec
}

async function mergeManifest(web: string, desktop: string, stage: string): Promise<void> {
  const webPath = join(web, 'package.json')
  const desktopPath = join(desktop, 'package.json')
  const primary = existsSync(webPath) ? await json(webPath) : { name: 'dsh-profile-web', private: true }
  const legacy = existsSync(desktopPath) ? await json(desktopPath) : {}
  const result = { ...legacy, ...primary }
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const current = record(primary[section] ?? {}, section)
    const incoming = record(legacy[section] ?? {}, section)
    const merged = { ...current }
    for (const [name, spec] of Object.entries(incoming)) {
      const resolved = dependency(spec, desktop, `${section}.${name}`)
      if (merged[name] !== undefined && dependency(merged[name], web, `${section}.${name}`) !== resolved) conflict(`${section}.${name}`)
      if (merged[name] === undefined) merged[name] = resolved
    }
    if (Object.keys(merged).length > 0 || primary[section] !== undefined || legacy[section] !== undefined) result[section] = merged
  }
  const currentDsh = record(primary.dsh ?? {}, 'dsh')
  const legacyDsh = record(legacy.dsh ?? {}, 'dsh')
  const currentProfile = record(currentDsh.profile ?? {}, 'dsh.profile')
  const legacyProfile = record(legacyDsh.profile ?? {}, 'dsh.profile')
  const bundles: string[] = []
  for (const value of [currentProfile.bundles ?? [], legacyProfile.bundles ?? []]) {
    if (!Array.isArray(value)) throw new Error('GUI profile migration: invalid bundle list')
    for (const item of value) {
      if (typeof item !== 'string') throw new Error('GUI profile migration: invalid bundle list')
      if (!bundles.includes(item)) bundles.push(item)
    }
  }
  result.dsh = { ...legacyDsh, ...currentDsh, profile: { ...legacyProfile, ...currentProfile, bundles } }
  await saveJson(join(stage, 'package.json'), result)
}

function nativePatch(row: Document): boolean {
  return (typeof row.id === 'string' && /^(desktop|native)-/u.test(row.id))
    || (typeof row.name === 'string' && row.name.startsWith('@deepseek-ai/dsh-desktop-'))
}

async function patchRows(directory: string): Promise<Document[]> {
  const path = join(directory, 'cordis.patch.yml')
  if (!existsSync(path)) return []
  const value: unknown = load(await readFile(path, 'utf8'), { schema: entryListSchema })
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error(`GUI profile migration: invalid patch ${path}`)
  return value.map((row, index) => record(row, `${path}[${index}]`))
}

async function mergePatches(web: string, desktop: string, stage: string): Promise<string[]> {
  const overrides: string[] = []
  const primary = await patchRows(web)
  const legacy = await patchRows(desktop)
  const merged = [...primary]
  for (const row of legacy) {
    if (nativePatch(row)) continue
    const index = merged.findIndex(candidate => typeof row.id === 'string' && candidate.id === row.id)
    const previous = merged[index]
    if (previous === undefined) { merged.push(row); continue }
    if (row.name !== undefined && previous.name !== undefined && row.name !== previous.name) conflict(`patch.${String(row.id)}.name`)
    const preferPrimary = typeof row.id === 'string' && row.id.startsWith('ui-')
    merged[index] = record(mergeValues(previous, row, `patch.${String(row.id)}`, preferPrimary, overrides), 'merged patch')
  }
  await writeFile(join(stage, 'cordis.patch.yml'), dump(merged, { schema: entryListSchema, noRefs: true, lineWidth: -1 }), { mode: 0o600 })
  return overrides
}

function quoted(name: string): string { return `"${name.replaceAll('"', '""')}"` }

function cell(row: Record<string, SQLOutputValue>, key: string): SQLOutputValue {
  const value = row[key]
  if (value === undefined) throw new Error(`GUI profile migration: missing SQL column ${key}`)
  return value
}

function tableNames(database: DatabaseSync): string[] {
  return database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all().map(row => String(row.name))
}

function upgradeOffice(database: DatabaseSync, name: string): void {
  if (name !== 'team-offices.sqlite') return
  const version = Number(database.prepare('PRAGMA user_version').get()?.user_version)
  if (version !== 1) return
  database.exec(`BEGIN IMMEDIATE;
    ALTER TABLE messages ADD COLUMN root_session_id TEXT;
    UPDATE messages SET root_session_id=(SELECT session_id FROM offices WHERE offices.id=messages.office_id);
    PRAGMA user_version=2; COMMIT;`)
}

function equalCell(left: unknown, right: unknown): boolean {
  if (equal(left, right)) return true
  if (typeof left !== 'string' || typeof right !== 'string') return false
  try { return equal(JSON.parse(left), JSON.parse(right)) } catch (error) {
    // Non-JSON text columns compare by their exact text above.
    if (error instanceof SyntaxError) return false
    throw error
  }
}

/** Merge every table by its declared primary key, preserving immutable revisions and run snapshots. */
async function mergeDatabase(source: string, target: string, scratch: string): Promise<void> {
  if (!existsSync(target)) { await snapshotDatabase(source, target); return }
  const normalized = join(scratch, `${randomUUID()}.sqlite`)
  await snapshotDatabase(source, normalized)
  const incoming = new DatabaseSync(normalized)
  const current = new DatabaseSync(target)
  try {
    upgradeOffice(incoming, basename(source))
    upgradeOffice(current, basename(target))
    const incomingTables = tableNames(incoming)
    const currentTables = tableNames(current)
    if (incomingTables.length === 0) return
    if (!equal(incomingTables, currentTables)) conflict(`${basename(source)} schema`)
    const incomingVersion = incoming.prepare('PRAGMA user_version').get()?.user_version
    const currentVersion = current.prepare('PRAGMA user_version').get()?.user_version
    if (incomingVersion !== currentVersion) conflict(`${basename(source)} version`)
    current.exec('BEGIN IMMEDIATE')
    for (const table of incomingTables) {
      const columns = incoming.prepare(`PRAGMA table_info(${quoted(table)})`).all()
      if (!equal(columns, current.prepare(`PRAGMA table_info(${quoted(table)})`).all())) conflict(`${basename(source)}.${table} columns`)
      const keys = columns.filter(column => Number(column.pk) > 0)
        .sort((a, b) => Number(a.pk) - Number(b.pk)).map(column => String(column.name))
      const rows = incoming.prepare(`SELECT * FROM ${quoted(table)}`).all()
      if (rows.length > 0 && keys.length === 0) conflict(`${basename(source)}.${table} has no primary key`)
      if (keys.length === 0) continue
      const names = columns.map(column => String(column.name))
      const find = current.prepare(`SELECT * FROM ${quoted(table)} WHERE ${keys.map(key => `${quoted(key)} IS ?`).join(' AND ')}`)
      const insert = current.prepare(`INSERT INTO ${quoted(table)} (${names.map(quoted).join(',')}) VALUES (${names.map(() => '?').join(',')})`)
      for (const row of rows) {
        const prior = find.get(...keys.map(key => cell(row, key)))
        if (prior) {
          if (!names.every(name => equalCell(prior[name], row[name]))) {
            const fingerprint = createHash('sha256').update(JSON.stringify(keys.map(key => row[key]))).digest('hex').slice(0, 12)
            conflict(`${basename(source)}.${table} key ${fingerprint}`)
          }
        } else insert.run(...names.map(name => cell(row, name)))
      }
    }
    current.exec('COMMIT')
  } catch (error) {
    if (current.isTransaction) current.exec('ROLLBACK')
    throw error
  } finally { incoming.close(); current.close() }
}

async function mergeFiles(source: string, target: string, scratch: string, root = true): Promise<void> {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if ((root && METADATA.has(entry.name)) || /-wal$|-shm$/u.test(entry.name)) continue
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    if (!existsSync(to)) {
      if (entry.isFile() && await sqliteFile(from)) await snapshotDatabase(from, to)
      else await cp(from, to, { recursive: true, dereference: false, verbatimSymlinks: true, preserveTimestamps: true })
      continue
    }
    const existing = await lstat(to)
    if (entry.isDirectory() && existing.isDirectory()) await mergeFiles(from, to, scratch, false)
    else if (entry.isFile() && existing.isFile()) {
      if (await sqliteFile(from) && await sqliteFile(to)) await mergeDatabase(from, to, scratch)
      else if (!(await readFile(from)).equals(await readFile(to))) conflict(to)
    } else if (entry.isSymbolicLink() && existing.isSymbolicLink()) {
      if (await readlink(from) !== await readlink(to)) conflict(to)
    } else conflict(to)
  }
}

async function restorePending(home: string): Promise<void> {
  const path = join(home, JOURNAL)
  if (!existsSync(path)) return
  const journal = await json(path)
  if (typeof journal.backup !== 'string' || typeof journal.stage !== 'string' || typeof journal.hadWeb !== 'boolean') {
    throw new Error('GUI profile migration: malformed recovery journal')
  }
  const backupRoot = resolve(home, 'gui-profile-backups')
  if (dirname(journal.backup) !== backupRoot || dirname(journal.stage) !== resolve(home, 'profiles')) {
    throw new Error('GUI profile migration: recovery paths are outside the migration directories')
  }
  const target = join(home, 'profiles', 'web')
  const original = join(journal.backup, 'original-web')
  if (existsSync(original) || !journal.hadWeb) {
    if (existsSync(target)) await rename(target, join(journal.backup, `uncommitted-web-${randomUUID()}`))
    if (existsSync(original)) await rename(original, target)
  }
  await rm(path)
}

/**
 * Merge the legacy desktop profile into the shared Web profile once.
 * @param home - Absolute Harness home. The caller holds the GUI process lock and has stopped both legacy Hosts.
 * @returns Resolves after a recoverable backup and atomic profile publication, or rejects with both sources retained.
 */
export async function migrateGuiProfile(home: string): Promise<void> {
  if (!isAbsolute(home)) throw new Error('GUI profile migration: Harness home must be absolute')
  const marker = join(home, MARKER)
  if (existsSync(marker)) {
    if ((await json(marker)).version !== 1) throw new Error('GUI profile migration: unsupported completion marker')
    return
  }
  await assertNoLegacyGuiHost(home)
  await assertProfileOperationsIdle(home)
  await restorePending(home)
  const web = join(home, 'profiles', 'web')
  const desktop = join(home, 'profiles', 'desktop')
  if (!existsSync(web) && !existsSync(desktop)) {
    await saveJson(marker, { version: 1 })
    return
  }
  await mkdir(join(home, 'profiles'), { recursive: true, mode: 0o700 })
  for (const path of [web, desktop]) {
    if (existsSync(path) && (!(await stat(path)).isDirectory() || !existsSync(join(path, 'package.json')))) {
      throw new Error(`GUI profile migration: incomplete profile directory: ${path}`)
    }
    if (existsSync(desktop) && existsSync(path) && (await lstat(path)).isSymbolicLink()) {
      throw new Error(`GUI profile migration: linked legacy profiles need a manual merge before publication: ${path}`)
    }
  }
  const backupRoot = join(home, 'gui-profile-backups', randomUUID())
  const stage = join(home, 'profiles', `.gui-profile-web-${randomUUID()}`)
  await mkdir(backupRoot, { recursive: true, mode: 0o700 })
  for (const [name, path] of [['web', web], ['desktop', desktop]]) {
    if (path !== undefined && name !== undefined && existsSync(path)) await snapshotTree(path, join(backupRoot, name))
  }
  if (!existsSync(desktop)) {
    await assertNoLegacyGuiHost(home)
    await assertProfileOperationsIdle(home)
    await saveJson(marker, { version: 1, backup: backupRoot })
    return
  }
  await mkdir(stage, { recursive: true, mode: 0o700 })
  const primary = join(backupRoot, 'web')
  const legacy = join(backupRoot, 'desktop')
  const initial = existsSync(primary) ? primary : legacy
  if (existsSync(initial)) {
    await cp(initial, stage, { recursive: true, dereference: false, verbatimSymlinks: true, preserveTimestamps: true })
  }
  await mergeManifest(web, desktop, stage)
  const retainedPreferences = await mergePatches(existsSync(primary) ? primary : web, existsSync(legacy) ? legacy : desktop, stage)
  await saveJson(join(backupRoot, 'migration-policy.json'), {
    sourceProfiles: ['web', 'desktop'], targetProfile: 'web', uiPreferenceSource: 'web', retainedPreferences,
    nativeEntries: 'desktop and native entries remain in the desktop source backup',
  })
  if (existsSync(legacy)) await mergeFiles(legacy, stage, backupRoot)
  await assertNoLegacyGuiHost(home)
  await assertProfileOperationsIdle(home)
  const journal: MigrationJournal = { backup: backupRoot, stage, hadWeb: existsSync(web) }
  await saveJson(join(home, JOURNAL), journal)
  try {
    if (journal.hadWeb) await rename(web, join(backupRoot, 'original-web'))
    await rename(stage, web)
    await saveJson(marker, { version: 1, backup: backupRoot })
  } catch (error) {
    try { await restorePending(home) } catch (recoveryError) { throw new AggregateError([error, recoveryError], 'GUI profile migration and recovery both failed') }
    throw error
  }
  await rm(join(home, JOURNAL), { force: true }).catch((error: unknown) => {
    process.stderr.write(`GUI profile migration completed. Recovery journal cleanup failed: ${String(error)}\n`)
  })
}
