/** Existing process and file users must block the one-time GUI profile migration. */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished, vi } from 'vitest'
import { assertNoLegacyGuiHost } from '../src/gui-legacy-hosts.ts'

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), 'gui-old-host-'))
  await mkdir(join(home, 'profiles', 'web'), { recursive: true })
  await writeFile(join(home, 'profiles', 'web', 'package.json'), '{}')
  onTestFinished(() => rm(home, { recursive: true, force: true }))
  return home
}

async function child(args: string[], source = 'process.stdout.write("ready"); setInterval(() => {}, 1000)', home?: string) {
  const worker = spawn(process.execPath, ['-e', source, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...(home === undefined ? {} : { DSH_HOME: home }) },
  })
  const exited = once(worker, 'exit')
  onTestFinished(async () => { if (worker.exitCode === null) worker.kill(); await exited })
  await once(worker.stdout, 'data')
  return worker
}

it.skipIf(process.platform === 'win32')('refuses an older same-home Host from its actual process arguments', async () => {
  const home = await fixture()
  const worker = await child(['dsh', 'web', join(home, 'profiles', 'web')])
  await expect(assertNoLegacyGuiHost(home)).rejects.toThrow(`PID ${String(worker.pid)}`)
})

it.skipIf(process.platform === 'win32')('does not confuse another Harness home with a matching path prefix', async () => {
  const home = await fixture()
  await child(['dsh', 'web', join(`${home}-other`, 'profiles', 'web')])
  await expect(assertNoLegacyGuiHost(home)).resolves.toBeUndefined()
})

it.skipIf(process.platform === 'win32')('detects a Web launcher selecting the same home through its environment', async () => {
  const home = await fixture()
  const worker = await child(['dsh', 'web'], undefined, home)
  await expect(assertNoLegacyGuiHost(home)).rejects.toThrow(`PID ${String(worker.pid)}`)
})

it.skipIf(process.platform === 'win32')('excludes only its own inspector when npm lifecycle environment contains a GUI command', async () => {
  const home = await fixture()
  const previousHome = process.env['DSH_HOME']
  const previousLifecycle = process.env['npm_lifecycle_script']
  process.env['DSH_HOME'] = home
  process.env['npm_lifecycle_script'] = 'node /workspace/apps/cli/src/bin.ts web'
  try {
    await expect(assertNoLegacyGuiHost(home)).resolves.toBeUndefined()
    const worker = await child(['dsh', 'web'], undefined, home)
    await expect(assertNoLegacyGuiHost(home)).rejects.toThrow(`PID ${String(worker.pid)}`)
  } finally {
    if (previousHome === undefined) delete process.env['DSH_HOME']
    else process.env['DSH_HOME'] = previousHome
    if (previousLifecycle === undefined) delete process.env['npm_lifecycle_script']
    else process.env['npm_lifecycle_script'] = previousLifecycle
  }
})

it.skipIf(process.platform === 'win32')('detects a foreign process holding a profile database without Host arguments', async () => {
  const home = await fixture()
  const worker = await child([join(home, 'profiles', 'web', 'team-offices.sqlite')], `
    const { DatabaseSync } = require('node:sqlite');
    const database = new DatabaseSync(process.argv[1]);
    database.exec('CREATE TABLE records(id TEXT PRIMARY KEY)');
    process.stdout.write('ready'); setInterval(() => {}, 1000);
  `)
  await expect(assertNoLegacyGuiHost(home)).rejects.toThrow(`PID ${String(worker.pid)}`)
})

it('refuses Windows legacy desktop migration while preserving fresh and Web-only startup', async () => {
  const home = await fixture()
  vi.stubGlobal('process', { ...process, platform: 'win32' })
  try {
    await expect(assertNoLegacyGuiHost(join(home, 'fresh'))).resolves.toBeUndefined()
    await expect(assertNoLegacyGuiHost(home)).resolves.toBeUndefined()
    await mkdir(join(home, 'profiles', 'desktop'))
    await expect(assertNoLegacyGuiHost(home)).rejects.toThrow('automatic legacy desktop migration')
  } finally { vi.unstubAllGlobals() }
})

it.skipIf(process.platform === 'win32')('fails closed when process inspection cannot run', async () => {
  const home = await fixture()
  vi.stubGlobal('process', { ...process, getuid: () => undefined })
  try { await expect(assertNoLegacyGuiHost(home)).rejects.toThrow('cannot inspect the current process user') }
  finally { vi.unstubAllGlobals() }
})
