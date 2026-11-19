/** Read-only checks for older GUI Hosts that predate shared runtime ownership. */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir, readlink, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, sep } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)
interface ProcessRow { pid: number; parent: number; command: string }

async function processes(): Promise<ProcessRow[]> {
  const uid = process.getuid?.()
  if (uid === undefined) throw new Error('GUI profile migration: cannot inspect the current process user')
  let stdout: string
  let inspectorPid: number | undefined
  try {
    const inspection = execute('/bin/ps', ['eww', process.platform === 'darwin' ? '-U' : '-u', String(uid), '-o', 'pid=,ppid=,command='], {
      encoding: 'utf8', timeout: 5_000, maxBuffer: 16 * 1024 * 1024,
    })
    inspectorPid = inspection.child.pid
    stdout = (await inspection).stdout
  } catch (_error) {
    // execFile errors can retain captured process environments in stdout.
    throw new Error('GUI profile migration: process inspection failed. Close earlier Web and App sessions before retrying.')
  }
  // ps includes itself and inherits the launcher's environment, including npm lifecycle commands.
  return stdout.trim().split('\n').filter(Boolean).map((line) => {
    const fields = /^\s*(\d+)\s+(\d+)\s+(.+)$/u.exec(line)
    if (!fields?.[3]) throw new Error('GUI profile migration: cannot inspect existing GUI processes')
    return { pid: Number(fields[1]), parent: Number(fields[2]), command: fields[3] }
  }).filter(row => row.pid !== inspectorPid)
}

function launchers(rows: readonly ProcessRow[]): Set<number> {
  const parents = new Map(rows.map(row => [row.pid, row.parent]))
  const excluded = new Set<number>()
  let pid = process.pid
  while (pid > 0 && !excluded.has(pid)) {
    excluded.add(pid)
    pid = parents.get(pid) ?? 0
  }
  return excluded
}

function sameHome(command: string, home: string): boolean {
  const profilePrefix = join(home, 'profiles') + sep
  if (command.includes(profilePrefix)) return true
  const variable = `DSH_HOME=${home}`
  const start = command.indexOf(variable)
  if (start !== -1 && (start === 0 || /\s/u.test(command.charAt(start - 1)))) {
    const next = command[start + variable.length]
    if (next === undefined || /\s/u.test(next)) return true
  }
  return home === join(homedir(), '.dsh') && !/(?:^|\s)DSH_HOME=/u.test(command)
}

function guiCommand(command: string): boolean {
  return /(?:^|[/\\\s])dsh(?:\.[cm]?[jt]s)?(?:\s|$)/u.test(command)
    || /[/\\](?:dsh-desktop-host|desktop-host)[/\\](?:src|lib)[/\\]index\.[cm]?[jt]s(?:\s|$)/u.test(command)
    || /[/\\](?:cli[/\\](?:src|lib)|dsh[/\\]lib)[/\\]bin\.[cm]?[jt]s(?:\s|$)/u.test(command)
}

function busy(pid: number): never {
  throw new Error(`GUI profile migration: an existing GUI Host still uses this Harness home (PID ${String(pid)}). Quit that application or stop its Web service, then retry.`)
}

async function profileFiles(directory: string): Promise<string[]> {
  if (!existsSync(directory)) return []
  const paths: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) paths.push(...await profileFiles(path))
    else if (entry.isFile()) paths.push(await realpath(path))
  }
  return paths
}

async function macFileUsers(paths: string[], excluded: ReadonlySet<number>): Promise<void> {
  if (paths.length === 0) return
  let output: string
  try {
    output = (await execute('/usr/sbin/lsof', ['-nP', '-F', 'p', '--', ...paths], {
      encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024,
    })).stdout
  } catch (error) {
    // lsof returns 1 when any supplied file has no open descriptor, including
    // when other supplied files have matches in stdout.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 1
      && 'stdout' in error && typeof error.stdout === 'string' && 'stderr' in error && error.stderr === '') output = error.stdout
    else throw new Error('GUI profile migration: cannot inspect open profile files', { cause: error })
  }
  for (const line of output.split('\n')) {
    if (!/^p\d+$/u.test(line)) continue
    const pid = Number(line.slice(1))
    if (!excluded.has(pid)) busy(pid)
  }
}

async function linuxFileUsers(rows: readonly ProcessRow[], paths: string[], excluded: ReadonlySet<number>): Promise<void> {
  const targets = new Set(paths)
  for (const row of rows) {
    if (excluded.has(row.pid)) continue
    const directory = `/proc/${String(row.pid)}/fd`
    let descriptors: string[]
    try { descriptors = await readdir(directory) }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue
      throw new Error('GUI profile migration: cannot inspect open profile files', { cause: error })
    }
    for (const descriptor of descriptors) {
      let target: string
      try { target = await readlink(join(directory, descriptor)) }
      catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue
        throw error
      }
      if (targets.has(target)) busy(row.pid)
    }
  }
}

/**
 * Refuse migration while another same-user process identifies this GUI home or holds profile files.
 * @param home - Absolute Harness home; the caller already owns the new GUI runtime lease.
 * @returns After supported local inspection finds no older Host; Windows refuses legacy desktop migration.
 */
export async function assertNoLegacyGuiHost(home: string): Promise<void> {
  const web = join(home, 'profiles', 'web')
  const desktop = join(home, 'profiles', 'desktop')
  if (!existsSync(web) && !existsSync(desktop)) return
  if (process.platform === 'win32') {
    if (existsSync(desktop)) throw new Error('GUI profile migration: automatic legacy desktop migration requires a supported process inspection platform. Quit both applications and migrate this profile on macOS or Linux before retrying.')
    return
  }
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    throw new Error('GUI profile migration: this platform cannot verify that older GUI Hosts have stopped')
  }
  const rows = await processes()
  const excluded = launchers(rows)
  const homes = new Set([home, await realpath(home)])
  for (const row of rows) {
    if (!excluded.has(row.pid) && guiCommand(row.command)
      && [...homes].some(candidate => sameHome(row.command, candidate))) busy(row.pid)
  }
  const paths = [...await profileFiles(web), ...await profileFiles(desktop)]
  const current = new Set([process.pid])
  if (process.platform === 'darwin') await macFileUsers(paths, current)
  else await linuxFileUsers(rows, paths, current)
}
