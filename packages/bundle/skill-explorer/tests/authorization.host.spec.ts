import { afterEach, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-app-boot'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { defineContentToolFixture, executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { harness, declare, agentOn } from '../../../preset/agent-preset-registry/tests/harness.ts'
import { ToolboxAuthorization } from '../src/authorization.ts'
import type { AgentCapabilityPolicy } from '../src/authorization-types.ts'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

const strictPolicy: AgentCapabilityPolicy = {
  enabled: true, nativeTools: ['read_file'], skillNames: ['allowed'], mcpServers: ['docs'], cliToolIds: ['convert'],
}

async function setup() {
  const ctx = await harness()
  contexts.push(ctx)
  await ctx.plugin(SkillRegistry)
  await declare(ctx, { id: 'standard', plugins: [] })
  await declare(ctx, { id: 'other', plugins: [] })
  const bodies = new Map<string, ReturnType<typeof vi.fn>>()
  for (const name of ['read_file', 'bash', 'skill', 'mcp__docs__search', 'mcp__admin__write', 'toolbox_cli_convert', 'read_mcp_resource']) {
    const body = vi.fn(async () => [{ type: 'text' as const, text: name }])
    bodies.set(name, body)
    ctx.tools.register(defineContentToolFixture({ name, description: name,
      parameters: { name: { type: 'string' }, server: { type: 'string' } }, execute: body,
    }))
  }
  for (const name of ['allowed', 'denied']) ctx.skills.register({ name, description: name, content: `${name} instructions`, source: 'runtime' })
  const policies: Record<string, AgentCapabilityPolicy> = { standard: { ...strictPolicy } }
  const authorization = new ToolboxAuthorization(ctx, { namespace: 'skill-explorer', policies: () => policies,
    cliToolName: id => id === 'convert' ? 'toolbox_cli_convert' : undefined,
  })
  const agent = await agentOn(ctx, 'restricted')
  const other = await agentOn(ctx, 'inherited', 'other')
  const call = (name: string, args: Record<string, string> = {}) => executeToolFixture(ctx, {
    agent, name, arguments: args, callId: ToolCallId(`${name}-call`), signal: new AbortController().signal,
  })
  return { ctx, agent, other, policies, authorization, bodies, call }
}

it('filters real tool schemas and skill bodies by native preset identity', async () => {
  const h = await setup()
  expect(h.ctx.tools.schemas(h.agent).map(tool => tool.name).sort()).toEqual([
    'mcp__docs__search', 'read_file', 'read_mcp_resource', 'skill', 'toolbox_cli_convert',
  ])
  expect(h.ctx.tools.schemas(h.other)).toHaveLength(7)
  expect((await h.ctx.skills.list({ scope: h.agent })).map(skill => skill.name)).toEqual(['allowed'])
  expect(await h.ctx.skills.get('denied', { scope: h.agent })).toBeUndefined()
  expect((await h.call('mcp__docs__search')).isError).toBe(false)
  expect((await h.call('toolbox_cli_convert')).isError).toBe(false)
  expect((await h.call('mcp__admin__write')).isError).toBe(true)
  expect(h.bodies.get('mcp__admin__write')).not.toHaveBeenCalled()
})

it('blocks denied skill and resource arguments at dispatch', async () => {
  const h = await setup()
  expect((await h.call('skill', { name: 'denied' })).isError).toBe(true)
  expect((await h.call('read_mcp_resource', { server: 'admin' })).isError).toBe(true)
  expect((await h.call('skill', { name: 'allowed' })).isError).toBe(false)
  expect((await h.call('read_mcp_resource', { server: 'docs' })).isError).toBe(false)
})

it('revokes already-admitted tools immediately and refreshes subsequent schemas', async () => {
  const h = await setup()
  const admitted = await h.ctx.tools.resolve({ agent: h.agent, modelSelection: { provider: 'test', model: 'test' }, signal: new AbortController().signal })
  h.policies.standard = { ...strictPolicy, mcpServers: [] }
  const outcome = await executeToolFixture(h.ctx, { agent: h.agent, name: 'mcp__docs__search', arguments: {},
    callId: ToolCallId('revoked'), signal: new AbortController().signal, toolSet: admitted,
  })
  expect(outcome.isError).toBe(true)
  expect(h.bodies.get('mcp__docs__search')).not.toHaveBeenCalled()
  h.ctx.emit('tools/change')
  expect(h.ctx.tools.schemas(h.agent).map(tool => tool.name)).not.toContain('mcp__docs__search')
  admitted.dispose()
})

it('includes a newly connected approved server and restores inheritance when disabled', async () => {
  const h = await setup()
  h.ctx.tools.register(defineContentToolFixture({ name: 'mcp__docs__recent', description: '', parameters: {}, execute: async () => [] }))
  expect(h.ctx.tools.schemas(h.agent).map(tool => tool.name)).toContain('mcp__docs__recent')
  h.policies.standard = { ...strictPolicy, enabled: false }
  h.ctx.emit('tools/change')
  expect(h.ctx.tools.schemas(h.agent).map(tool => tool.name)).toContain('bash')
  expect((await h.ctx.skills.get('denied', { scope: h.agent }))?.name).toBe('denied')
})

it('hides exact Agent-local tools until the policy explicitly grants them', async () => {
  const h = await setup()
  const tools = h.agent.ctx.get('tools')
  if (tools === undefined) throw new Error('Tools service missing')
  tools.register(defineContentToolFixture({ name: 'local_operation', description: '', parameters: {}, execute: async () => [] }))
  expect(h.ctx.tools.schemas(h.agent).map(tool => tool.name)).not.toContain('local_operation')
  expect((await h.call('local_operation')).isError).toBe(true)
  h.policies.standard = { ...strictPolicy, nativeTools: ['read_file', 'local_operation'] }
  h.ctx.emit('tools/change')
  expect(h.ctx.tools.schemas(h.agent).map(tool => tool.name)).toContain('local_operation')
  expect((await h.call('local_operation')).isError).toBe(false)
})

const coordinationTools = [
  'agent_teams_status', 'agent_teams_claim_task', 'agent_teams_send_message', 'agent_teams_update_task',
]

it('adds runtime-required tools only to the exact role holder and revokes admitted calls on disposal', async () => {
  const h = await setup()
  h.policies.standard = { ...strictPolicy, mcpServers: [], cliToolIds: [] }
  for (const name of coordinationTools) {
    const body = vi.fn(async () => [{ type: 'text' as const, text: name }])
    h.bodies.set(name, body)
    h.ctx.tools.register(defineContentToolFixture({ name, description: name, parameters: {}, execute: body }))
  }
  h.ctx.emit('tools/change')
  expect(h.ctx.tools.schemas(h.agent).map(tool => tool.name).sort()).toEqual(['read_file', 'skill'])
  expect((await h.call('agent_teams_claim_task')).isError).toBe(true)
  expect(h.bodies.get('agent_teams_claim_task')).not.toHaveBeenCalled()
  const outsider = await agentOn(h.ctx, 'ordinary-expert')
  const release = h.agent.ctx.on('toolbox/required-tools', (agent, next) => {
    const inherited = next()
    return agent === h.agent ? [...inherited, ...coordinationTools] : inherited
  })
  h.ctx.emit('tools/change')
  expect(h.ctx.tools.schemas(h.agent).map(tool => tool.name).sort()).toEqual([...coordinationTools, 'read_file', 'skill'].sort())
  expect(h.ctx.tools.schemas(outsider).map(tool => tool.name).sort()).toEqual(['read_file', 'skill'])
  for (const name of coordinationTools) expect((await h.call(name)).isError).toBe(false)
  for (const name of ['bash', 'mcp__docs__search', 'mcp__admin__write', 'toolbox_cli_convert']) {
    expect((await h.call(name)).isError).toBe(true)
    expect(h.bodies.get(name)).not.toHaveBeenCalled()
  }
  expect((await h.call('skill', { name: 'denied' })).isError).toBe(true)
  const admitted = await h.ctx.tools.resolve({ agent: h.agent, modelSelection: { provider: 'test', model: 'test' },
    signal: new AbortController().signal })
  release()
  const revoked = await executeToolFixture(h.ctx, { agent: h.agent, name: 'agent_teams_claim_task', arguments: {},
    callId: ToolCallId('revoked-role'), signal: new AbortController().signal, toolSet: admitted })
  expect(revoked.isError).toBe(true)
  expect(h.bodies.get('agent_teams_claim_task')).toHaveBeenCalledTimes(1)
  h.ctx.emit('tools/change')
  expect(h.ctx.tools.schemas(h.agent).map(tool => tool.name).sort()).toEqual(['read_file', 'skill'])
  admitted.dispose()
})

it('keeps other scoped tool restrictions authoritative over runtime defaults', async () => {
  const h = await setup()
  const tools = h.agent.ctx.get('tools')
  if (tools === undefined) throw new Error('Tools service missing')
  h.agent.ctx.on('toolbox/required-tools', (_agent, next) => [...next(), 'bash'])
  const release = tools.restrict({ deny: ['bash'] })
  h.ctx.emit('tools/change')
  expect(h.ctx.tools.schemas(h.agent).map(tool => tool.name)).not.toContain('bash')
  expect((await h.call('bash')).isError).toBe(true)
  expect(h.bodies.get('bash')).not.toHaveBeenCalled()
  release()
})
