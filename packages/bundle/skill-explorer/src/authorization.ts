/** Per-preset capability authorization through native scoped registries and Settings. */
import type { Context, Volatile } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-settings'
import { principalOf, Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import schema from '@deepseek-ai/schemastery'
import { z } from 'zod'
import type { AgentCapabilityPolicy, AuthorizationState, AuthorizationUpdate } from './authorization-types.ts'

/** Persisted capability policy fields accepted by the toolbox configuration. */
export const AgentCapabilityPolicySchema: schema<AgentCapabilityPolicy> = schema.object({
  enabled: schema.boolean().default(false),
  nativeTools: schema.array(String).default([]),
  skillNames: schema.array(String).default([]),
  mcpServers: schema.array(String).default([]),
  cliToolIds: schema.array(String).default([]),
})

/** Policies keyed by native preset identity. */
export const AgentPermissionsSchema: schema<Record<string, AgentCapabilityPolicy>> = schema.dict(AgentCapabilityPolicySchema)

type PermissionSnapshot = ReturnType<Volatile<Record<string, AgentCapabilityPolicy>>['get']>
type PolicySnapshot = PermissionSnapshot[string]

const policyInput = z.object({
  enabled: z.boolean(),
  nativeTools: z.array(z.string().min(1)),
  skillNames: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  mcpServers: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,32}$/)),
  cliToolIds: z.array(z.string().min(1)),
})
const updateInput = z.object({ agentPreset: z.string().min(1), policy: policyInput, revision: z.number().int().nonnegative() })
const resourceTools = new Set(['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'])

/** Dependencies owned by the toolbox configuration and CLI registry. */
export interface ToolboxAuthorizationOptions {
  /** Native Settings namespace containing agentPermissions. */
  namespace: string
  /** Current resolved policy map, including persisted profile overrides. */
  policies(): PermissionSnapshot
  /** Exact registered model tool name for one CLI tool, or undefined after removal. */
  cliToolName(id: string): string | undefined
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Supply protocol tools required by an authenticated runtime role. Providers
     * must validate the exact Agent's role and delegate unrelated Agents.
     * These defaults supplement only toolbox policies, never other tool masks,
     * sandbox checks, approvals or the tool's own authorization.
     * @param agent - Agent whose current runtime role is being queried.
     * @mode waterfall
     */
    'toolbox/required-tools'(agent: Agent, next: () => readonly string[]): readonly string[]
  }

  interface Context {
    /** Enforces the toolbox capabilities granted to each native Agent preset. */
    toolboxAuthorization: ToolboxAuthorization
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** Agent authorization is editable only by the Host owner. */
    'toolbox-authorization/owner-required': {}
    /** The authorization editor submitted invalid fields. */
    'toolbox-authorization/invalid': {}
    /** The requested preset or configuration namespace is unavailable. */
    'toolbox-authorization/not-found': {}
  }
}

interface AgentRestrictions {
  fingerprint: string
  releaseTools: () => void
  releaseSkills: () => void
}

function serverTool(name: string, policy: PolicySnapshot): boolean {
  return policy.mcpServers.some(server => name.startsWith(`mcp__${server}__`))
}

function requestedName(args: unknown, key: string): string | undefined {
  if (typeof args !== 'object' || args === null || !(key in args)) return undefined
  const value: unknown = Reflect.get(args, key)
  return typeof value === 'string' ? value : undefined
}

/** Authorize each Agent's advertised skills, tool schemas and actual dispatch. */
export class ToolboxAuthorization extends TypertRemoteService {
  private readonly restrictions = new WeakMap<Agent, AgentRestrictions>()

  /**
   * Install profile-owned capability guards and authenticated editing methods.
   * @param ctx - Native Settings, Agent, preset, skill and tool services.
   * @param options - Live profile policies and the current CLI tool mapping.
   */
  constructor(ctx: Context, private readonly options: ToolboxAuthorizationOptions) {
    super(ctx, 'toolboxAuthorization')
    ctx.on('agent/created', ({ agent }) => { this.apply(agent) })
    ctx.on('agent/pre-step', async ({ agent }, next) => {
      const decision = await next()
      this.apply(agent)
      return decision
    })
    ctx.on('tools/change', () => {
      for (const agent of ctx.agents.list()) this.apply(agent)
    })
    ctx.on('settings/document-updated', (namespace) => {
      if (namespace !== options.namespace) return
      for (const agent of ctx.agents.list()) this.apply(agent)
    })
    ctx.tools.guard((execution) => {
      const agent = execution.agent
      if (agent === undefined) return undefined
      const policy = this.policy(agent)
      if (policy === undefined || this.permits(execution.name, policy, execution.arguments)
        || this.requiredTools(agent).has(execution.name)) return undefined
      return `This Agent is not authorized to use ${execution.name}. Update its toolbox permissions.`
    })
    for (const agent of ctx.agents.list()) this.apply(agent)
  }

  private policy(agent: Agent): PolicySnapshot | undefined {
    const preset = this.ctx.agentPresets.composedPreset(agent.ctx)
    const policy = preset === undefined ? undefined : this.options.policies()[preset]
    return policy?.enabled === true ? policy : undefined
  }

  private requiredTools(agent: Agent): ReadonlySet<string> {
    return new Set(agent.ctx.waterfall('toolbox/required-tools', agent, () => []))
  }

  private permits(name: string, policy: PolicySnapshot, args?: unknown): boolean {
    if (name === 'run_code') return true
    if (name === 'skill') return args === undefined
      ? policy.skillNames.length > 0 : policy.skillNames.includes(requestedName(args, 'name') ?? '')
    if (resourceTools.has(name)) return args === undefined
      ? policy.mcpServers.length > 0 : policy.mcpServers.includes(requestedName(args, 'server') ?? '')
    if (name.startsWith('mcp__')) return serverTool(name, policy)
    if (name.startsWith('toolbox_cli_')) return policy.cliToolIds.some(id => this.options.cliToolName(id) === name)
    return policy.nativeTools.includes(name)
  }

  private apply(agent: Agent): void {
    const policy = this.policy(agent)
    const previous = this.restrictions.get(agent)
    if (policy === undefined) {
      if (previous === undefined) return
      this.restrictions.delete(agent)
      previous.releaseTools()
      previous.releaseSkills()
      return
    }
    const required = this.requiredTools(agent)
    const allowed = this.ctx.tools.registeredNames(agent).filter(name => required.has(name) || this.permits(name, policy)).sort()
    const fingerprint = JSON.stringify({ policy, allowed })
    if (previous?.fingerprint === fingerprint) return
    const tools = agent.ctx.get('tools')
    const skills = agent.ctx.get('skills')
    if (tools === undefined || skills === undefined) throw new Error('Agent capability registries are unavailable')
    // Publish the identity before registry effects notify tools/change listeners.
    const record: AgentRestrictions = { fingerprint, releaseTools: () => {}, releaseSkills: () => {} }
    this.restrictions.set(agent, record)
    record.releaseTools = tools.restrict({ allow: allowed, includeLocal: true })
    record.releaseSkills = skills.restrict({ allow: policy.skillNames })
    previous?.releaseTools()
    previous?.releaseSkills()
  }

  private owner(): void {
    if (principalOf(this.ctx.invocation) !== undefined) {
      throw new RemoteError('toolbox-authorization/owner-required', 'Agent permissions belong to the Host owner.', {})
    }
  }

  /**
   * Read current preset policies and ordinary native tools for the editor.
   * @returns Preset identities, profile revision and current explicit policies.
   */
  @Remote('list')
  async list(): Promise<AuthorizationState> {
    this.owner()
    const descriptor = this.ctx.settings.describe().find(row => row.ns === this.options.namespace)
    if (descriptor === undefined) throw new RemoteError('toolbox-authorization/not-found', 'Toolbox configuration is unavailable.', {})
    const presets = await this.ctx.agentPresets.list()
    const nativeTools = new Map<string, { name: string; description: string }>()
    for (const preset of presets) {
      if (preset.broken !== undefined) continue
      await using scope = await this.ctx.agentPresets.acquireScope(preset.id)
      for (const tool of this.ctx.tools.definitions(scope.key)) {
        if (tool.name === 'skill' || resourceTools.has(tool.name)
          || tool.name.startsWith('mcp__') || tool.name.startsWith('toolbox_cli_')) continue
        nativeTools.set(tool.name, { name: tool.name, description: tool.description })
      }
    }
    return {
      revision: descriptor.revision,
      presets,
      policies: Object.fromEntries(Object.entries(this.options.policies()).map(([id, policy]) => [id, {
        enabled: policy.enabled,
        nativeTools: [...policy.nativeTools], skillNames: [...policy.skillNames],
        mcpServers: [...policy.mcpServers], cliToolIds: [...policy.cliToolIds],
      }])),
      nativeTools: [...nativeTools.values()].sort((left, right) => left.name.localeCompare(right.name)),
    }
  }

  /**
   * Persist one preset's capability policy using the native revision fence.
   * @param request - Preset identity, explicit selections and last-read profile revision.
   * @returns The refreshed authorization editor state after the write commits.
   */
  @Remote('save')
  async save(request: AuthorizationUpdate): Promise<AuthorizationState> {
    this.owner()
    const input = updateInput.safeParse(request)
    if (!input.success) throw new RemoteError('toolbox-authorization/invalid', input.error.message, {})
    const available = await this.ctx.agentPresets.list()
    if (!available.some(preset => preset.id === input.data.agentPreset)) {
      throw new RemoteError('toolbox-authorization/not-found', 'The selected Agent preset is unavailable.', {})
    }
    await this.ctx.settings.mutate(this.options.namespace, [{ op: 'set',
      path: ['agentPermissions', input.data.agentPreset], value: input.data.policy,
    }], input.data.revision)
    for (const agent of this.ctx.agents.list()) this.apply(agent)
    return this.list()
  }
}
