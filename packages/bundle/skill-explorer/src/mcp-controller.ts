/** Native MCP configuration editing through revision-fenced Settings writes. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-mcp-manager'
import type {} from '@deepseek-ai/dsh-settings'
import type { SettingsDescriptor } from '@deepseek-ai/dsh-settings'
import { principalOf, Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type {
  ToolboxMcpConfig, ToolboxMcpConnection, ToolboxMcpInventory, ToolboxMcpSaveRequest,
  ToolboxMcpTarget, ToolboxMcpToggleRequest,
} from './mcp-types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Toolbox editing of the profile-owned native MCP connections. */
    toolboxMcp: ToolboxMcpController
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The authenticated caller cannot manage this Host's connections. */
    'toolbox-mcp/owner-required': {}
    /** The requested manager Settings entry is unavailable. */
    'toolbox-mcp/unavailable': {}
    /** A connection request failed validation. */
    'toolbox-mcp/invalid-request': {}
    /** Connection settings changed after the editor loaded them. */
    'toolbox-mcp/conflict': {}
    /** The requested connection is owned by a plugin or inherited configuration. */
    'toolbox-mcp/read-only': {}
    /** Native Settings refused the configuration edit. */
    'toolbox-mcp/rejected': {}
  }
}

const serverName = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/u)
const targetSchema = z.object({ name: serverName, revision: z.number().int().nonnegative() })
const reconnectSchema = z.object({
  enabled: z.boolean().optional(),
  initialDelayMs: z.number().optional(),
  maxDelayMs: z.number().optional(),
  maxAttempts: z.number().optional(),
})
const configSchema = z.object({
  transport: z.enum(['stdio', 'streamable-http']),
  command: z.string(),
  args: z.array(z.string()),
  env: z.record(z.string(), z.string().nullable()),
  cwd: z.string(),
  url: z.string(),
  headers: z.record(z.string(), z.string().nullable()),
  enabled: z.boolean(),
  startupTimeoutMs: z.number().optional(),
  toolCallTimeoutMs: z.number().optional(),
  closeTimeoutMs: z.number().optional(),
  reconnect: reconnectSchema.optional(),
})
const storedEntrySchema = configSchema.extend({
  command: z.string().default(''),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  cwd: z.string().default(''),
  url: z.string().default(''),
  headers: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean().default(true),
}).loose().refine(entry => entry.transport === 'stdio' ? entry.command.length > 0 : entry.url.length > 0)
const storedSettingsSchema = z.object({ servers: z.record(z.string(), storedEntrySchema) })
type StoredEntry = z.infer<typeof storedEntrySchema>

function keysOfServers(value: unknown): Set<string> {
  const parsed = z.object({ servers: z.record(z.string(), z.unknown()).optional() }).safeParse(value)
  return new Set(parsed.success ? Object.keys(parsed.data.servers ?? {}) : [])
}

function privateValues(values: Record<string, string>): Record<string, string | null> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) =>
    [key, value.includes('${credential:') ? value : null]))
}

function editableConfig(entry: StoredEntry): ToolboxMcpConfig {
  const { transport, command, args, env, cwd, url, headers, enabled,
    startupTimeoutMs, toolCallTimeoutMs, closeTimeoutMs, reconnect } = entry
  return {
    transport, command, args, env: privateValues(env), cwd, url, headers: privateValues(headers), enabled,
    ...(startupTimeoutMs === undefined ? {} : { startupTimeoutMs }),
    ...(toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs }),
    ...(closeTimeoutMs === undefined ? {} : { closeTimeoutMs }),
    ...(reconnect === undefined ? {} : { reconnect: {
      ...(reconnect.enabled === undefined ? {} : { enabled: reconnect.enabled }),
      ...(reconnect.initialDelayMs === undefined ? {} : { initialDelayMs: reconnect.initialDelayMs }),
      ...(reconnect.maxDelayMs === undefined ? {} : { maxDelayMs: reconnect.maxDelayMs }),
      ...(reconnect.maxAttempts === undefined ? {} : { maxAttempts: reconnect.maxAttempts }),
    } }),
  }
}

function restoredValues(values: Record<string, string | null>, stored: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => {
    if (value !== null) return [key, value]
    const previous = stored[key]
    if (previous === undefined) {
      throw new RemoteError('toolbox-mcp/invalid-request', 'A retained credential field no longer exists.', {})
    }
    return [key, previous]
  }))
}

/** Edit the native MCP manager's configured entries and retain its lifecycle ownership. */
export class ToolboxMcpController extends TypertRemoteService {
  /**
   * @param ctx - Native Settings, MCP manager and authenticated invocation context.
   * @param namespace - The Settings namespace of the active MCP manager entry.
   */
  constructor(ctx: Context, private readonly namespace: string) {
    super(ctx, 'toolboxMcp')
  }

  private owner(): void {
    if (principalOf(this.ctx.invocation) !== undefined) {
      throw new RemoteError('toolbox-mcp/owner-required', 'Connections belong to the Host owner.', {})
    }
  }

  private descriptor(): SettingsDescriptor {
    const descriptor = this.ctx.settings.describe().find(item => item.ns === this.namespace)
    if (!descriptor) throw new RemoteError('toolbox-mcp/unavailable', 'The connection manager is unavailable.', {})
    return descriptor
  }

  private current() {
    const descriptor = this.descriptor()
    const parsed = storedSettingsSchema.safeParse(descriptor.value)
    if (!parsed.success) throw new RemoteError('toolbox-mcp/unavailable', 'The connection manager has invalid settings.', {})
    return { descriptor, entries: parsed.data.servers }
  }

  private async mutate(revision: number, operations: Parameters<Context['settings']['mutate']>[1]): Promise<ToolboxMcpInventory> {
    try {
      await this.ctx.settings.mutate(this.namespace, operations, revision)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'SETTINGS_CONFLICT') {
        throw new RemoteError('toolbox-mcp/conflict', 'Connection settings changed. Reload and try again.', {}, { cause: error })
      }
      throw new RemoteError('toolbox-mcp/rejected', 'The connection settings could not be saved.', {}, { cause: error })
    }
    return this.inventory()
  }

  /**
   * Read editable configuration, ownership and live native connection state.
   * @returns A Settings revision and safe connection fields with private values withheld.
   */
  @Remote('inventory')
  inventory(): ToolboxMcpInventory {
    this.owner()
    const { descriptor, entries } = this.current()
    const inherited = keysOfServers(descriptor.base)
    const native = this.ctx.mcpManager.list()
    const byName = new Map(native.map(item => [item.name, item]))
    const connections: ToolboxMcpConnection[] = Object.entries(entries).map(([name, entry]) => ({
      name,
      origin: inherited.has(name) ? 'inherited' : 'user',
      editable: this.ctx.settings.writable,
      removable: this.ctx.settings.writable && !inherited.has(name),
      status: byName.get(name)?.status ?? (entry.enabled ? { state: 'connecting', attempt: 0 } : { state: 'disabled' }),
      config: editableConfig(entry),
    }))
    for (const entry of native) {
      if (Object.hasOwn(entries, entry.name)) continue
      connections.push({ name: entry.name, origin: 'plugin', editable: false, removable: false, status: entry.status })
    }
    return { revision: descriptor.revision, writable: this.ctx.settings.writable, connections }
  }

  /**
   * Create or edit one native connection without replacing other configured servers.
   * @param request - Connection fields and the Settings revision shown by the editor.
   * @returns Refreshed ownership and configuration after the native write commits.
   */
  @Remote('save')
  async save(request: ToolboxMcpSaveRequest): Promise<ToolboxMcpInventory> {
    this.owner()
    const parsed = targetSchema.extend({ originalName: serverName.optional(), config: configSchema }).safeParse(request)
    if (!parsed.success) throw new RemoteError('toolbox-mcp/invalid-request', 'The connection fields are invalid.', {})
    const { name, originalName, revision, config } = parsed.data
    const { entries } = this.current()
    const existing = entries[name]
    if (originalName !== undefined && (originalName !== name || existing === undefined)) {
      throw new RemoteError('toolbox-mcp/conflict', 'The connection identity changed. Reload and try again.', {})
    }
    if (originalName === undefined && (existing !== undefined || this.ctx.mcpManager.list().some(item => item.name === name))) {
      throw new RemoteError('toolbox-mcp/conflict', 'A connection with this identifier already exists.', {})
    }
    const value = {
      ...existing, ...config,
      env: restoredValues(config.env, existing?.env ?? {}),
      headers: restoredValues(config.headers, existing?.headers ?? {}),
    }
    return this.mutate(revision, [{ op: 'set', path: ['servers', name], value }])
  }

  /**
   * Change the native enablement flag while retaining the saved connection fields.
   * @param request - Connection identity, requested state and Settings revision.
   * @returns Refreshed ownership and configuration after the native write commits.
   */
  @Remote('setEnabled')
  async setEnabled(request: ToolboxMcpToggleRequest): Promise<ToolboxMcpInventory> {
    this.owner()
    const parsed = targetSchema.extend({ enabled: z.boolean() }).safeParse(request)
    if (!parsed.success) throw new RemoteError('toolbox-mcp/invalid-request', 'The connection identity is invalid.', {})
    if (!Object.hasOwn(this.current().entries, request.name)) {
      throw new RemoteError('toolbox-mcp/read-only', 'This connection is managed by its plugin.', {})
    }
    return this.mutate(request.revision, [{ op: 'set', path: ['servers', request.name, 'enabled'], value: request.enabled }])
  }

  /**
   * Remove one user-added connection through the native Settings layer.
   * @param request - Connection identity and Settings revision.
   * @returns Refreshed ownership and configuration after the native write commits.
   */
  @Remote('removeConnection')
  async removeConnection(request: ToolboxMcpTarget): Promise<ToolboxMcpInventory> {
    this.owner()
    if (!targetSchema.safeParse(request).success) {
      throw new RemoteError('toolbox-mcp/invalid-request', 'The connection identity is invalid.', {})
    }
    const { descriptor, entries } = this.current()
    if (!Object.hasOwn(entries, request.name) || keysOfServers(descriptor.base).has(request.name)) {
      throw new RemoteError('toolbox-mcp/read-only', 'This connection is managed by its plugin or profile.', {})
    }
    return this.mutate(request.revision, [{ op: 'unset', path: ['servers', request.name] }])
  }
}
