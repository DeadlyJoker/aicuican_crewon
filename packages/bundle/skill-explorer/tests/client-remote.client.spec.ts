// @vitest-environment jsdom
/** Generated Remote smoke. Run after build:artifacts to exercise the shipped descriptors. */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { URL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { apply as applyGateway, inject as gatewayInject } from '@deepseek-ai/dsh-api-gateway/client'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { ToolboxActions } from '../src/client/toolbox-actions.ts'
import type { CliToolId } from '../src/cli-types.ts'

const artifactUrls = [
  '../lib/typert.remote-client.js',
  '../../../mcp/mcp-manager/lib/typert.remote-client.js',
  '../../../api/settings-controller/lib/typert.remote-client.js',
].map(path => new URL(path, import.meta.url))

async function loadContribution(url: URL): Promise<TypertRemoteContribution> {
  const loaded = await import(url.href) as { default: TypertRemoteContribution }
  return loaded.default
}

describe.skipIf(!artifactUrls.every(url => existsSync(url)))('Toolbox generated Remote integration', () => {
  it('mounts legal delete endpoints and declares native connection services used by its real actions', async () => {
    const ctx = new Context()
    onTestFinished(async () => { await ctx.fiber.dispose() })
    const call = vi.fn<ConnectionHandle['rpc']['call']>(async (_channel, endpoint) => {
      switch (endpoint) {
        case 'toolboxCli/list':
          return { ok: true, value: { revision: 2, host: 'test-device', tools: [] } }
        case 'toolboxMcp/removeConnection':
          return { ok: true, value: { revision: 2, writable: true, connections: [] } }
        case 'mcpManager/probe':
          return { ok: true, value: { ok: true, toolNames: ['calculate'], truncated: false, durationMs: 1, closeConfirmed: true } }
        case 'toolboxCli/removeTool':
        case 'mcpManager/restart':
        case 'credentials/set':
          return { ok: true, value: undefined }
        default:
          throw new Error(`Unexpected fixture RPC ${endpoint}`)
      }
    })
    const open = vi.fn<NonNullable<ConnectionHandle['rpc']['open']>>(async function* (_channel, endpoint, _payload, signal) {
      assert.equal(endpoint, 'mcpManager/watch')
      yield []
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve()
        else signal.addEventListener('abort', () => { resolve() }, { once: true })
      })
    })
    ctx.provide('connection', {
      interactions: 'answer', isLoopback: true,
      openWebSocket: () => { throw new Error('The fixture uses an in-process stream') },
      generation: { getSnapshot: () => ({ id: 1, host: { home: '/fixture' } }), subscribe: () => () => {} },
      state: { getSnapshot: () => 'connected', subscribe: () => () => {} },
      reconnect: () => {}, registerGenerationSource: () => () => {}, start: () => ({ stop: () => {} }),
      rpc: { call, open },
    } satisfies ConnectionHandle)
    await ctx.plugin(TypertRegistry).await()
    await ctx.plugin({ inject: gatewayInject, apply: applyGateway }).await()
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.slots.register({ name: 'root', children: {
      main: { kind: 'keyed', scope: 'root' }, 'sidebar.panellist': { kind: 'list', scope: 'root' },
      'toolbox.expert-capabilities': { kind: 'single', scope: 'root' },
    } } as never, () => null)

    const client = await import('../src/client/index.ts')
    const plugin = ctx.plugin({ inject: client.inject, apply: client.apply })
    await plugin.await()
    expect(ctx.slots.entries('main')).toHaveLength(0)
    await ctx.remote.$mount(await loadContribution(artifactUrls[1]!))
    expect(ctx.slots.entries('main')).toHaveLength(0)
    await ctx.remote.$mount(await loadContribution(artifactUrls[2]!))
    await vi.waitFor(() => { expect(ctx.slots.entries('main')).toHaveLength(1) })
    expect(ctx.slots.entries('toolbox.expert-capabilities')).toHaveLength(1)
    const injected = ctx.slots.entries('main')[0]!.inject!()
    assert(typeof injected.actions === 'object' && injected.actions !== null)
    const actions = injected.actions as ToolboxActions

    await actions.cli.remove({ id: 'demo' as CliToolId, expectedRevision: 1 })
    await actions.mcp.remove({ name: 'calculator', revision: 1 })
    await expect(actions.mcp.probe('calculator', new AbortController().signal)).resolves.toMatchObject({ ok: true })
    await actions.mcp.restart('calculator')
    await actions.mcp.setCredential('DEMO_TOKEN', 'fixture-token')
    expect(call.mock.calls.map(([, endpoint]) => endpoint)).toEqual([
      'toolboxCli/removeTool', 'toolboxCli/list', 'toolboxMcp/removeConnection',
      'mcpManager/probe', 'mcpManager/restart', 'credentials/set',
    ])
    expect(call.mock.calls[0]?.[2]).toEqual({ args: { request: { id: 'demo', expectedRevision: 1 } } })
    expect(call.mock.calls[2]?.[2]).toEqual({ args: { request: { name: 'calculator', revision: 1 } } })
    await vi.waitFor(() => { expect(open).toHaveBeenCalledOnce() })
    await plugin.dispose()
    expect(ctx.slots.entries('main')).toHaveLength(0)
    expect(ctx.slots.entries('toolbox.expert-capabilities')).toHaveLength(0)
  })
})
