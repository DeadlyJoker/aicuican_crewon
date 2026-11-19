import { Context, type Volatile } from '@deepseek-ai/cordis'
import { SettingsConflictError, type SettingsPathOp } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings/types'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { afterEach, expect, it, vi } from 'vitest'
import { ToolboxCli, cliToolName } from '../src/cli-controller.ts'
import type { CliRecipe, CliToolId } from '../src/cli-types.ts'
import { CliToolsSchema } from '../src/cli-types.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })
const id = 'document-info' as CliToolId
const recipe: CliRecipe = {
  name: 'Document information', description: 'Read document metadata.', category: 'documents',
  command: 'document-info', args: ['--input', '{input}'], versionArgs: ['--version'], enabled: true,
}

it('rejects invalid recipe identifiers and NUL arguments in native configuration validation', () => {
  expect(() => CliToolsSchema({ bad_id: recipe })).toThrow()
  expect(() => CliToolsSchema({ [id]: { ...recipe, command: '' } })).toThrow()
  expect(() => CliToolsSchema({ [id]: { ...recipe, args: ['bad\0argument'] } })).toThrow()
})

function provide(ctx: Context, name: string, service: object): void {
  Reflect.apply(ctx.provide.bind(ctx), ctx, [name, service])
}

async function setup(options: { enabled?: boolean; inherited?: boolean; missing?: boolean; holdUntilAbort?: boolean } = {}) {
  const ctx = new Context()
  let recipes: Record<string, CliRecipe> = { [id]: { ...recipe, enabled: options.enabled ?? true } }
  let revision = 0
  const cliTools: Volatile<Record<string, CliRecipe>> = { get: () => recipes }
  const definitions = new Map<string, ToolDefinition>()
  const spawned: SubprocessSpawnSpec[] = []
  const terminate = vi.fn()
  const waitForExit = vi.fn(async () => true)
  const confine = vi.fn(async (argv: string[]) => ({ argv: ['sandbox', ...argv], enforcement: 'full',
    denialSignatures: [], runnerFailureRules: [] }))
  provide(ctx, 'tools', { register: (definition: ToolDefinition) => {
    definitions.set(definition.name, definition)
    return () => definitions.delete(definition.name)
  } })
  provide(ctx, 'sandbox', { confine })
  provide(ctx, 'sandboxPolicy', { resolve: () => ({ mode: 'read-only', workspaceRoot: '/work' }) })
  provide(ctx, 'workingDirectory', { defaultDirectory: '/work' })
  provide(ctx, 'workspaceRegistry', { get: () => undefined })
  provide(ctx, 'subprocess', {
    resolveExecutable: async (command: string) => {
      if (options.missing) { const error = new Error('Program is missing'); error.name = 'SubprocessExecutableNotFoundError'; throw error }
      return `/usr/bin/${command}`
    },
    spawn: (spec: SubprocessSpawnSpec): SubprocessHandle => {
      spawned.push(spec)
      return { stdin: undefined, stdout: undefined, stderr: undefined, control: undefined,
        done: options.holdUntilAbort ? new Promise((resolve) => {
          spec.signal?.addEventListener('abort', () => { resolve({ exitCode: 0, signal: null }) }, { once: true })
        }) : Promise.resolve({ exitCode: 0, signal: null }), terminate, waitForExit,
        collected: { stdout: { readFrom: () => ({ text: 'document-info 1.0', nextOffset: 17, lossy: false }) },
          stderr: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) } } }
    },
  })
  const mutate = vi.fn(async (_namespace: string, operations: readonly SettingsPathOp[], expected?: number) => {
    if (expected !== revision) throw new SettingsConflictError('skill-explorer' as SettingsNamespace, expected ?? -1, revision)
    for (const operation of operations) {
      const key = operation.path[1]
      if (!key) throw new Error('Expected recipe key')
      if (operation.op === 'unset') { const next = { ...recipes }; Reflect.deleteProperty(next, key); recipes = next }
      else recipes = { ...recipes, [key]: operation.value as CliRecipe }
    }
    revision += 1
  })
  provide(ctx, 'settings', {
    describe: () => [{ ns: 'skill-explorer', revision, value: { cliTools: recipes },
      base: options.inherited ? { cliTools: { [id]: recipe } } : {} }], mutate,
  })
  let service: ToolboxCli | undefined
  const owner = await ctx.plugin({ name: 'cli-fixture', apply: (scope: Context) => {
    service = new ToolboxCli(scope, { namespace: 'skill-explorer', cliTools, timeoutMs: options.holdUntilAbort ? 5 : 1000,
      probeTimeoutMs: 1000, outputBytes: 1024, graceMs: 100 })
  } })
  cleanups.push(async () => { await owner.dispose() })
  if (!service) throw new Error('CLI service did not activate')
  return { service, mutate, spawned, definitions, confine, terminate, waitForExit }
}

it('substitutes user input as one argument and passes exact argv through native confinement', async () => {
  const { service, spawned, confine, terminate, waitForExit } = await setup()
  const input = 'a file; $(touch unexpected)\nwith spaces.pdf'
  const result = await service.run({ id, input }, new AbortController().signal)
  expect(confine.mock.calls[0]?.[0]).toEqual(['/usr/bin/document-info', '--input', input])
  expect(spawned[0]?.argv).toEqual(['sandbox', '/usr/bin/document-info', '--input', input])
  expect(spawned[0]?.stdio).toEqual({ stdin: 'ignore', stdout: { maxBytes: 1024 }, stderr: { maxBytes: 1024 } })
  expect(result).toMatchObject({ stdout: 'document-info 1.0', exitCode: 0, timedOut: false, aborted: false })
  expect(terminate).toHaveBeenCalledOnce()
  expect(waitForExit).toHaveBeenCalledOnce()
})

it('checks disabled recipes without advertising or executing them as normal tools', async () => {
  const { service, definitions, spawned } = await setup({ enabled: false })
  expect(definitions.size).toBe(0)
  await expect(service.run({ id, input: 'file.pdf' }, new AbortController().signal)).rejects.toMatchObject({ code: 'toolbox-cli/unavailable' })
  expect(spawned).toHaveLength(0)
  await expect(service.probe({ id }, new AbortController().signal)).resolves.toMatchObject({ state: 'ready', version: 'document-info 1.0' })
  expect(spawned[0]?.argv).toEqual(['sandbox', '/usr/bin/document-info', '--version'])
})

it('reports missing executables without pretending installation is complete', async () => {
  const { service, spawned } = await setup({ missing: true })
  expect((await service.list()).tools[0]?.availability).toEqual({ state: 'missing', message: 'Program is missing' })
  await expect(service.probe({ id }, new AbortController().signal)).resolves.toEqual({ state: 'missing', message: 'Program is missing' })
  expect(spawned).toHaveLength(0)
})

it('passes settings revisions to writes and preserves inherited recipes', async () => {
  const { service, mutate } = await setup({ inherited: true })
  await expect(service.removeTool({ id, expectedRevision: 0 })).rejects.toMatchObject({ code: 'toolbox-cli/inherited' })
  expect(mutate).not.toHaveBeenCalled()
  await service.save({ id, recipe: { ...recipe, name: 'Updated' }, expectedRevision: 0 })
  expect(mutate).toHaveBeenCalledWith('skill-explorer',
    [{ op: 'set', path: ['cliTools', id], value: { ...recipe, name: 'Updated' } }], 0)
  await expect(service.save({ id, recipe, expectedRevision: 0 })).rejects.toMatchObject({ code: 'toolbox-cli/conflict' })
  expect((await service.list()).tools[0]?.name).toBe('Updated')
})

it('reports an elapsed deadline even when the terminated command returns exit code zero', async () => {
  const { service, waitForExit } = await setup({ holdUntilAbort: true })
  const result = await service.run({ id, input: 'test' }, new AbortController().signal)
  expect(result).toMatchObject({ exitCode: 0, timedOut: true, aborted: false })
  expect(waitForExit).toHaveBeenCalledOnce()
})

it('withdraws disabled model tools and refuses execution with a stale captured recipe', async () => {
  const { service, definitions, spawned } = await setup()
  const definition = definitions.get(cliToolName(id))
  if (!definition) throw new Error('Model tool missing')
  await service.save({ id, recipe: { ...recipe, args: ['new', '{input}'] }, expectedRevision: 0 })
  const execution = { signal: new AbortController().signal } as ToolRunContext
  await expect(definition.execute({ input: 'report' }, execution)).rejects.toMatchObject({ code: 'toolbox-cli/conflict' })
  expect(spawned).toHaveLength(0)
  await service.save({ id, recipe: { ...recipe, enabled: false }, expectedRevision: 1 })
  expect(definitions.has(cliToolName(id))).toBe(false)
})
