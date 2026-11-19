/** Exercise toolbox authorization through the shipped headless session runner. */
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { ToolboxAuthorization } from '../src/authorization.ts'
import type { AgentCapabilityPolicy } from '../src/authorization-types.ts'

/** Native services needed by the recorded authorization scenario. */
export const inject = ['agentPresets', 'agents', 'skills', 'tools', 'typert']

function operation(name: string, allowed: boolean): ToolDefinition {
  return {
    name, description: `Recorded authorization operation ${name}.`,
    parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] },
    execute: async () => {
      if (!allowed) throw new Error(`Unauthorized operation executed: ${name}`)
      return `Authorized ${name}`
    },
  }
}

/**
 * Compose a real preset, skills and guarded model tools for deterministic replay.
 * @param ctx - Native headless application context.
 */
export async function apply(ctx: Context): Promise<void> {
  const declaration = await ctx.agentPresets.register({ id: 'toolbox-recording', plugins: [] })
  ctx.effect(() => declaration)
  for (const name of ['allowed-recording', 'denied-recording']) {
    ctx.skills.register({ name, description: `Recorded ${name} instructions.`, content: `Instructions for ${name}.`, source: 'runtime' })
  }
  ctx.tools.register(operation('mcp__docs__lookup', true))
  ctx.tools.register(operation('mcp__admin__write', false))
  ctx.tools.register(operation('toolbox_cli_recording', true))
  const requiredTools = ['agent_teams_claim_task', 'agent_teams_send_message', 'agent_teams_status', 'agent_teams_update_task']
  for (const name of requiredTools) ctx.tools.register(operation(name, true))
  const policies: Record<string, AgentCapabilityPolicy> = {
    'toolbox-recording': { enabled: true, nativeTools: [], skillNames: ['allowed-recording'], mcpServers: ['docs'], cliToolIds: ['recording'] },
  }
  new ToolboxAuthorization(ctx, {
    namespace: 'skill-explorer', policies: () => policies,
    cliToolName: id => id === 'recording' ? 'toolbox_cli_recording' : undefined,
  })
  ctx.on('agent/created', async ({ agent }) => {
    await ctx.agentPresets.select(agent, 'toolbox-recording')
    agent.ctx.on('toolbox/required-tools', (target, next) => {
      const inherited = next()
      return target === agent ? [...inherited, ...requiredTools] : inherited
    })
    const tools = agent.ctx.get('tools')
    if (tools === undefined) throw new Error('Agent tools are unavailable')
    tools.register(operation('local_denied_recording', false))
  })
}
