import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { managerProfile } from '../../../mcp/mcp-manager/tests/profile-fixture.ts'
import { ToolboxMcpController } from '../src/mcp-controller.ts'
import type { ToolboxMcpConfig } from '../src/mcp-types.ts'

const basic: ToolboxMcpConfig = {
  transport: 'stdio', command: 'node', args: [], env: {}, cwd: '', url: '', headers: {}, enabled: false,
}

function context(): Context {
  const ctx = new Context()
  Reflect.apply(ctx.provide.bind(ctx), ctx, ['tools', {}])
  return ctx
}

async function fixture(base: object = { servers: {} }) {
  const ctx = context()
  const profile = await managerProfile(ctx, { base })
  const service = new ToolboxMcpController(ctx, 'mcp')
  return { ctx, service, profile }
}

it('projects native connection ownership and withholds existing credential values', async () => {
  const { service } = await fixture({ servers: {
    local: { transport: 'stdio', command: 'node', enabled: false,
      env: { PRIVATE: 'literal-secret', REFERENCED: '${credential:MCP_TOKEN}' } },
    remote: { transport: 'streamable-http', url: 'https://example.test/mcp', enabled: false },
  } })
  const inventory = service.inventory()
  expect(inventory.connections).toHaveLength(2)
  expect(inventory.connections[0]).toMatchObject({ name: 'local', origin: 'inherited', removable: false,
    config: { command: 'node', url: '', headers: {}, env: { PRIVATE: null, REFERENCED: '${credential:MCP_TOKEN}' } } })
  expect(inventory.connections[1]?.config).toMatchObject({ command: '', args: [], env: {}, url: 'https://example.test/mcp' })
  expect(JSON.stringify(inventory)).not.toContain('literal-secret')
})

it('adds and edits through native Settings while retaining siblings and masked credentials', async () => {
  const { ctx, service } = await fixture({ servers: {
    kept: { transport: 'stdio', command: 'node', enabled: false, env: { SECRET: 'private' } },
  } })
  const before = service.inventory()
  await service.save({ name: 'added', revision: before.revision, config: { ...basic } })
  const afterAdd = service.inventory()
  const original = afterAdd.connections.find(entry => entry.name === 'kept')!
  await service.save({ name: 'kept', originalName: 'kept', revision: afterAdd.revision,
    config: { ...original.config!, args: ['--version'] } })
  const descriptor = ctx.settings.describe().find(entry => entry.ns === 'mcp')!
  expect(descriptor.value).toMatchObject({ servers: {
    kept: { args: ['--version'], env: { SECRET: 'private' } }, added: { enabled: false },
  } })
})

it('refuses a stale editor and never replaces the later saved connection', async () => {
  const { service } = await fixture()
  const { revision } = service.inventory()
  await service.save({ name: 'first', revision, config: { ...basic } })
  await expect(service.save({ name: 'second', revision, config: { ...basic } })).rejects.toMatchObject({ code: 'toolbox-mcp/conflict' })
  expect(service.inventory().connections.map(entry => entry.name)).toEqual(['first'])
})

it('restores saved connections after a new Host composition and removes only a user entry', async () => {
  const { ctx, service, profile } = await fixture({ servers: {
    base: { transport: 'stdio', command: 'node', enabled: false },
  } })
  await service.save({ name: 'added', revision: service.inventory().revision, config: { ...basic } })
  await expect(service.removeConnection({ name: 'base', revision: service.inventory().revision })).rejects.toMatchObject({ code: 'toolbox-mcp/read-only' })
  await ctx.fiber.dispose()
  const restored = context()
  await profile.start(restored)
  const resumed = new ToolboxMcpController(restored, 'mcp')
  expect(resumed.inventory().connections.map(entry => entry.name)).toEqual(['base', 'added'])
  await resumed.removeConnection({ name: 'added', revision: resumed.inventory().revision })
  expect(resumed.inventory().connections.map(entry => entry.name)).toEqual(['base'])
})

it('keeps plugin-contributed connections read-only and prevents identifier collisions', async () => {
  const { ctx, service } = await fixture()
  vi.spyOn(ctx.mcpManager, 'list').mockReturnValue([{ name: 'plugin', configured: true, status: { state: 'disabled' } }])
  expect(service.inventory().connections[0]).toMatchObject({ origin: 'plugin', editable: false, removable: false })
  await expect(service.save({ name: 'plugin', revision: service.inventory().revision, config: basic }))
    .rejects.toMatchObject({ code: 'toolbox-mcp/conflict' })
  await expect(service.setEnabled({ name: 'plugin', revision: service.inventory().revision, enabled: false }))
    .rejects.toMatchObject({ code: 'toolbox-mcp/read-only' })
})

it('rejects invalid requests and private-field preservation without an existing value', async () => {
  const { service } = await fixture()
  await expect(service.save({ name: 'invalid name', revision: 0, config: basic }))
    .rejects.toMatchObject({ code: 'toolbox-mcp/invalid-request' })
  await expect(service.save({ name: 'new', revision: 0, config: { ...basic, env: { TOKEN: null } } }))
    .rejects.toMatchObject({ code: 'toolbox-mcp/invalid-request' })
  expect(service.inventory().connections).toEqual([])
})
