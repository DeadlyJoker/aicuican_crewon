/** Shared GUI ownership survives disposal until all Host work has stopped. */
import { Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import type { PluginOperationRunId } from '@deepseek-ai/dsh-plugin-manager/diagnostic'
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import { openBrowser } from '@deepseek-ai/dsh-web-app'
import { afterEach, expect, it, vi } from 'vitest'
import { acquireGuiRuntime, type GuiRuntimeOwner } from '../src/gui-runtime.ts'
import { migrateGuiProfile } from '../src/gui-profile-migration.ts'
import { installGuiHostControl } from '../src/gui-host-control.ts'
import { runProfile } from '../src/profile-boot.ts'
import { runSharedWeb } from '../src/shared-web.ts'
import { readGuiHost } from '../src/gui-runtime-client.ts'

vi.mock('@deepseek-ai/dsh-app-boot', () => ({ getDshRuntimeVersion: () => 'test' }))
vi.mock('@deepseek-ai/dsh-home-paths', () => ({ resolveDshHome: () => '/fixture' }))
vi.mock('@deepseek-ai/dsh-web-app', () => ({ openBrowser: vi.fn() }))
vi.mock('../src/gui-runtime.ts', () => ({ acquireGuiRuntime: vi.fn() }))
vi.mock('../src/gui-profile-migration.ts', () => ({ migrateGuiProfile: vi.fn() }))
vi.mock('../src/gui-host-control.ts', () => ({ installGuiHostControl: vi.fn() }))
vi.mock('../src/gui-runtime-client.ts', () => ({ readGuiHost: vi.fn() }))
vi.mock('../src/profile-boot.ts', () => ({ runProfile: vi.fn() }))

const options = { profile: 'web', args: ['--no-open'], patchFiles: [], environment: createLaunchEnvironmentSnapshot([]) }
afterEach(() => { vi.resetAllMocks() })

function fixture() {
  const ctx = new Context()
  const lease = { kind: 'owner', token: 'token', publish: vi.fn(), release: vi.fn() } satisfies GuiRuntimeOwner
  const shutdown = { shutdown: vi.fn(async () => {}), interrupt: vi.fn() }
  vi.mocked(acquireGuiRuntime).mockResolvedValue(lease)
  vi.mocked(runProfile).mockResolvedValue({ ctx, shutdown })
  vi.mocked(installGuiHostControl).mockReturnValue({
    ready: () => ({ url: 'http://127.0.0.1:3080', runId: randomUUID() as PluginOperationRunId, platformSession: null, injections: [] }),
    request: vi.fn(), subscribe: vi.fn(),
  })
  return { ctx, lease, shutdown }
}

it('keeps ownership while the running Host disposes, until its process exits', async () => {
  const { ctx, lease } = fixture()
  const drained = Promise.withResolvers<undefined>()
  ctx.effect(() => () => drained.promise)
  await runSharedWeb(options)
  const disposing = ctx.fiber.dispose()
  expect(lease.release).not.toHaveBeenCalled()
  drained.resolve(undefined)
  await disposing
  expect(lease.release).not.toHaveBeenCalled()
})

it.each(['control', 'publish'] as const)('awaits complete shutdown before releasing after %s failure', async (stage) => {
  const { lease, shutdown } = fixture()
  const drained = Promise.withResolvers<undefined>()
  shutdown.shutdown.mockReturnValue(drained.promise)
  const failure = new Error('startup failure')
  if (stage === 'control') vi.mocked(installGuiHostControl).mockImplementation(() => { throw failure })
  else vi.mocked(lease.publish).mockRejectedValue(failure)
  const pending = runSharedWeb(options)
  const rejected = expect(pending).rejects.toBe(failure)
  await vi.waitFor(() => { expect(shutdown.shutdown).toHaveBeenCalledWith(1) })
  expect(lease.release).not.toHaveBeenCalled()
  drained.resolve(undefined)
  await rejected
  expect(lease.release).toHaveBeenCalledOnce()
})

it('retains ownership when shutdown fails with unknown live resources', async () => {
  const { lease, shutdown } = fixture()
  vi.mocked(lease.publish).mockRejectedValue(new Error('publish failed'))
  shutdown.shutdown.mockRejectedValue(new Error('shutdown failed'))
  await expect(runSharedWeb(options)).rejects.toThrow('shutdown failed')
  expect(lease.release).not.toHaveBeenCalled()
})

it('releases a migration failure before any Host exists', async () => {
  const { lease } = fixture()
  vi.mocked(migrateGuiProfile).mockRejectedValue(new Error('migration conflict'))
  await expect(runSharedWeb(options)).rejects.toThrow('migration conflict')
  expect(runProfile).not.toHaveBeenCalled()
  expect(lease.release).toHaveBeenCalledOnce()
})

it('attaches followers without booting, migrating, or changing ownership', async () => {
  vi.mocked(acquireGuiRuntime).mockResolvedValue({ kind: 'follower', record: {
    id: randomUUID(), pid: process.pid, version: 'test', token: 'token', url: 'http://127.0.0.1:3080',
  } })
  vi.mocked(readGuiHost).mockResolvedValue({
    url: 'http://127.0.0.1:3080/?token=browser', runId: randomUUID() as PluginOperationRunId,
    platformSession: null, injections: [],
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  try { await runSharedWeb({ ...options, args: [] }) }
  finally { output.mockRestore() }
  expect(openBrowser).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:3080/?token=browser')
  expect(runProfile).not.toHaveBeenCalled()
  expect(migrateGuiProfile).not.toHaveBeenCalled()
})

it('rejects follower overlays before reading or starting the running Host', async () => {
  vi.mocked(acquireGuiRuntime).mockResolvedValue({ kind: 'follower', record: {
    id: randomUUID(), pid: process.pid, version: 'test', token: 'token', url: 'http://127.0.0.1:3080',
  } })
  await expect(runSharedWeb({ ...options, patchFiles: ['/fixture/overlay.yml'] })).rejects.toThrow('Restart it')
  expect(readGuiHost).not.toHaveBeenCalled()
  expect(runProfile).not.toHaveBeenCalled()
  expect(migrateGuiProfile).not.toHaveBeenCalled()
})


it.each(['--help', '-h'])('prints %s without acquiring a GUI Host lease or migrating profile data', async (flag) => {
  const request = { ...options, args: [flag] }
  await runSharedWeb(request)
  expect(runProfile).toHaveBeenCalledExactlyOnceWith(request)
  expect(acquireGuiRuntime).not.toHaveBeenCalled()
  expect(migrateGuiProfile).not.toHaveBeenCalled()
  expect(installGuiHostControl).not.toHaveBeenCalled()
})
