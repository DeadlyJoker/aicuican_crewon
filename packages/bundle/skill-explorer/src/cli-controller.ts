/** Native command-recipe management and bounded, sandbox-aware execution. */
import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { principalOf, Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { SettingsConflictError } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-sandbox'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-working-directory'
import type {} from '@deepseek-ai/dsh-workspace'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import { hostname } from 'node:os'
import { z } from 'zod'
import type {
  CliAvailability, CliCatalogue, CliProbeResult, CliRecipe, CliRemoveRequest, CliRunRequest,
  CliRunResult, CliSaveRequest, CliTarget, CliToolId,
} from './cli-types.ts'

/** Native owner configuration for command recipes and resource bounds. */
export interface ToolboxCliConfig {
  /** Settings namespace of the owning toolbox plugin entry. */
  namespace: string
  /** Live native Settings reference to configured recipes. */
  cliTools: Volatile<Record<string, CliRecipe>>
  /** Maximum duration of an explicit command run. */
  timeoutMs: number
  /** Maximum duration of a configured version probe. */
  probeTimeoutMs: number
  /** Maximum retained UTF-8 bytes per output stream. */
  outputBytes: number
  /** Native subprocess termination grace. */
  graceMs: number
}

const cliIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/).transform(value => value as CliToolId)
const textSchema = z.string().min(1).refine(value => !value.includes('\0'))
const argumentSchema = z.string().refine(value => !value.includes('\0'))
const recipeSchema = z.object({
  name: textSchema, description: textSchema, category: textSchema,
  command: textSchema, args: z.array(argumentSchema), versionArgs: z.array(argumentSchema), enabled: z.boolean(),
})
const recipesSchema = z.record(cliIdSchema, recipeSchema)
const settingsSchema = z.object({ cliTools: recipesSchema })
const targetSchema = z.object({ id: cliIdSchema })
const saveSchema = targetSchema.extend({ recipe: recipeSchema, expectedRevision: z.number().int().nonnegative() })
const removeSchema = targetSchema.extend({ expectedRevision: z.number().int().nonnegative() })
const runSchema = targetSchema.extend({ input: argumentSchema, workspaceId: z.string().min(1).optional() })

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Persisted command recipes and their native execution adapter. */
    toolboxCli: ToolboxCli
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** Only the Host owner can configure or manually invoke local command recipes. */
    'toolbox-cli/owner-required': {}
    /** A recipe or call failed boundary validation. */
    'toolbox-cli/invalid-request': {}
    /** A configured recipe, namespace or execution directory is unavailable. */
    'toolbox-cli/unavailable': {}
    /** A recipe changed after the caller read it. */
    'toolbox-cli/conflict': {}
    /** A recipe belongs to the profile base and supports disabling rather than removal. */
    'toolbox-cli/inherited': {}
    /** Native executable lookup or execution failed. */
    'toolbox-cli/execution': {}
  }
}

/**
 * Stable model-tool name for one recipe, also used by Agent capability restrictions.
 * @param id - Validated lower-kebab recipe identifier.
 * @returns A native tool name that uniquely identifies the configured recipe.
 */
export function cliToolName(id: CliToolId): string {
  return `toolbox_cli_${id}`
}

function fail(code: 'toolbox-cli/owner-required' | 'toolbox-cli/invalid-request' | 'toolbox-cli/unavailable'
  | 'toolbox-cli/conflict' | 'toolbox-cli/inherited' | 'toolbox-cli/execution', message: string): never {
  throw new RemoteError(code, message, {})
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Manage named executable recipes without adding a shell or process runtime. */
export class ToolboxCli extends TypertRemoteService {
  private readonly registrations = new Map<string, { recipe: string; dispose: () => void }>()
  private readonly lifetime = new AbortController()
  private readonly running = new Set<Promise<unknown>>()

  /**
   * @param ctx - Native Settings, tools, execution, sandbox and workspace services.
   * @param config - Live recipe reference and explicit process limits.
   */
  constructor(ctx: Context, private readonly config: ToolboxCliConfig) {
    super(ctx, 'toolboxCli')
    this.reconcileTools()
    ctx.on('loader/volatile-update', () => { this.reconcileTools() })
    ctx.effect(() => async () => {
      this.lifetime.abort(new Error('Toolbox command adapter disposed.'))
      await Promise.allSettled(this.running)
    }, 'toolbox command executions')
  }

  private owner(): void {
    if (principalOf(this.ctx.invocation) !== undefined) fail('toolbox-cli/owner-required', 'Local tools belong to the Host owner.')
  }

  private configured(): Record<string, CliRecipe> {
    return recipesSchema.parse(this.config.cliTools.get())
  }

  private descriptor() {
    const descriptor = this.ctx.settings.describe({ redactSecrets: true }).find(row => row.ns === this.config.namespace)
    if (!descriptor) fail('toolbox-cli/unavailable', 'Toolbox settings are unavailable.')
    return descriptor
  }

  private recipe(id: CliToolId): CliRecipe {
    const recipe = this.configured()[id]
    if (!recipe) fail('toolbox-cli/unavailable', 'This local tool is no longer configured.')
    return recipe
  }

  private async boundary<T>(operation: () => Promise<T>): Promise<T> {
    this.owner()
    try { return await operation() }
    catch (error) {
      if (error instanceof z.ZodError) fail('toolbox-cli/invalid-request', error.issues.map(issue => issue.message).join('. '))
      if (error instanceof SettingsConflictError) fail('toolbox-cli/conflict', 'The tool configuration changed. Reload before saving.')
      if (error instanceof RemoteError) throw error
      return fail('toolbox-cli/execution', failureMessage(error))
    }
  }

  private track<T>(operation: Promise<T>): Promise<T> {
    this.running.add(operation)
    void operation.then(() => this.running.delete(operation), () => this.running.delete(operation))
    return operation
  }

  private reconcileTools(): void {
    const recipes = this.configured()
    for (const [id, registration] of this.registrations) {
      const recipe = recipes[id]
      if (recipe?.enabled && registration.recipe === JSON.stringify(recipe)) continue
      registration.dispose()
      this.registrations.delete(id)
    }
    for (const [id, recipe] of Object.entries(recipes)) {
      if (!recipe.enabled || this.registrations.has(id)) continue
      const toolId = cliIdSchema.parse(id)
      this.registrations.set(id, {
        recipe: JSON.stringify(recipe),
        dispose: this.ctx.tools.register(this.definition(toolId, recipe)),
      })
    }
  }

  private async availability(recipe: CliRecipe, signal?: AbortSignal): Promise<CliAvailability> {
    try {
      const executable = await this.ctx.subprocess.resolveExecutable(recipe.command, undefined, signal)
      return { state: 'ready', executable }
    } catch (error) {
      if (signal?.aborted) throw error
      const missing = error instanceof Error && error.name === 'SubprocessExecutableNotFoundError'
      return { state: missing ? 'missing' : 'failed', message: failureMessage(error) }
    }
  }

  /**
   * Read current recipe configuration and executable presence on the execution Host.
   * @returns Revision-fenced recipes, their availability and Host label.
   */
  @Remote('list')
  async list(): Promise<CliCatalogue> {
    return this.boundary(async () => {
      const descriptor = this.descriptor()
      const recipes = settingsSchema.parse(descriptor.value).cliTools
      const base = settingsSchema.partial().parse(descriptor.base ?? {}).cliTools ?? {}
      const tools = await Promise.all(Object.entries(recipes).map(async ([key, recipe]) => {
        const id = cliIdSchema.parse(key)
        return { ...recipe, id, toolName: cliToolName(id), inherited: Object.hasOwn(base, key),
          availability: await this.availability(recipe, this.lifetime.signal) }
      }))
      return { revision: descriptor.revision, host: hostname(), tools }
    })
  }

  /**
   * Create or update one recipe through the native revision-checked Settings writer.
   * @param request - Recipe identifier, complete value and last-read Settings revision.
   */
  @Remote('save')
  async save(request: CliSaveRequest): Promise<void> {
    return this.boundary(async () => {
      const parsed = saveSchema.parse(request)
      await this.ctx.settings.mutate(this.config.namespace,
        [{ op: 'set', path: ['cliTools', parsed.id], value: parsed.recipe }], parsed.expectedRevision)
      this.reconcileTools()
    })
  }

  /**
   * Remove a user-owned recipe while preserving inherited profile entries.
   * @param request - Recipe identifier and last-read Settings revision.
   */
  @Remote('removeTool')
  async removeTool(request: CliRemoveRequest): Promise<void> {
    return this.boundary(async () => {
      const parsed = removeSchema.parse(request)
      const base = settingsSchema.partial().parse(this.descriptor().base ?? {}).cliTools ?? {}
      if (Object.hasOwn(base, parsed.id)) fail('toolbox-cli/inherited', 'Disable an inherited local tool instead of removing it.')
      await this.ctx.settings.mutate(this.config.namespace,
        [{ op: 'unset', path: ['cliTools', parsed.id] }], parsed.expectedRevision)
      this.reconcileTools()
    })
  }

  /**
   * Locate a configured executable and run its fixed version arguments.
   * @param target - Recipe whose executable is checked, including disabled recipes.
   * @param signal - Cancellation of lookup and the version command.
   * @returns Version output or a distinct missing/failed diagnostic.
   */
  @Remote('probe')
  async probe(target: CliTarget, signal: AbortSignal): Promise<CliProbeResult> {
    return this.boundary(async () => {
      const { id } = targetSchema.parse(target)
      const recipe = this.recipe(id)
      const availability = await this.availability(recipe, signal)
      if (availability.state !== 'ready') return availability
      try {
        const result = await this.execute(id, recipe, recipe.versionArgs, this.ctx.workingDirectory.defaultDirectory,
          this.ctx.sandboxPolicy.resolve(), signal, this.config.probeTimeoutMs)
        if (result.exitCode !== 0 || result.timedOut || result.aborted) {
          return { state: 'failed', message: result.stderr || result.stdout || 'The version command did not complete successfully.' }
        }
        return { state: 'ready', executable: result.executable, version: (result.stdout || result.stderr).trim(), result }
      } catch (error) {
        if (signal.aborted) throw error
        return { state: 'failed', message: failureMessage(error) }
      }
    })
  }

  /**
   * Execute one enabled recipe from the toolbox with its selected workspace.
   * @param request - Recipe, input text and optional selected workspace.
   * @param signal - Cancellation of the native command execution.
   * @returns The bounded command output and independent outcome flags.
   */
  @Remote('run')
  async run(request: CliRunRequest, signal: AbortSignal): Promise<CliRunResult> {
    return this.boundary(async () => {
      runSchema.parse(request)
      const recipe = this.recipe(request.id)
      if (!recipe.enabled) fail('toolbox-cli/unavailable', 'Enable this local tool before running it.')
      const workspace = request.workspaceId ? this.ctx.workspaceRegistry.get(request.workspaceId) : undefined
      if (request.workspaceId && !workspace) fail('toolbox-cli/unavailable', 'The selected workspace is unavailable.')
      const cwd = workspace?.path ?? this.ctx.workingDirectory.defaultDirectory
      const policy = { ...this.ctx.sandboxPolicy.resolve(), workspaceRoot: cwd }
      return this.execute(request.id, recipe, recipe.args.map(arg => arg.replaceAll('{input}', request.input)), cwd,
        policy, signal, this.config.timeoutMs)
    })
  }

  private async execute(id: CliToolId, recipe: CliRecipe, args: readonly string[], cwd: string,
    policy: SandboxExecutionPolicy, signal: AbortSignal, timeoutMs: number): Promise<CliRunResult> {
    return this.track(this.executeCommand(id, recipe, args, cwd, policy, signal, timeoutMs))
  }

  private async executeCommand(id: CliToolId, recipe: CliRecipe, args: readonly string[], cwd: string,
    policy: SandboxExecutionPolicy, signal: AbortSignal, timeoutMs: number): Promise<CliRunResult> {
    const deadline = new AbortController()
    const timer = setTimeout(() => { deadline.abort(new Error('Local tool deadline exceeded.')) }, timeoutMs)
    const combined = AbortSignal.any([signal, this.lifetime.signal, deadline.signal])
    let process: SubprocessHandle | undefined
    try {
      const executable = await this.ctx.subprocess.resolveExecutable(recipe.command, undefined, combined)
      const command = [executable, ...args]
      const argv = policy.mode === 'danger-full-access' ? command
        : (await this.ctx.sandbox.confine(command, { ...policy, mode: policy.mode }, combined)).argv
      combined.throwIfAborted()
      if (JSON.stringify(this.recipe(id)) !== JSON.stringify(recipe)) {
        fail('toolbox-cli/conflict', 'The local tool configuration changed before execution started.')
      }
      process = this.ctx.subprocess.spawn({ argv, cwd, signal: combined, graceMs: this.config.graceMs,
        stdio: { stdin: 'ignore', stdout: { maxBytes: this.config.outputBytes }, stderr: { maxBytes: this.config.outputBytes } } })
      const outcome = await process.done
      const stdout = process.collected.stdout?.readFrom(0)
      const stderr = process.collected.stderr?.readFrom(0)
      return { id, name: recipe.name, cwd, executable, stdout: stdout?.text ?? '', stderr: stderr?.text ?? '',
        exitCode: outcome.exitCode, signal: outcome.signal, timedOut: deadline.signal.aborted,
        aborted: signal.aborted || this.lifetime.signal.aborted, truncated: stdout?.lossy === true || stderr?.lossy === true }
    } catch (error) {
      if (signal.aborted || this.lifetime.signal.aborted) throw error
      return fail('toolbox-cli/execution', failureMessage(error))
    } finally {
      clearTimeout(timer)
      process?.terminate()
      if (process) await process.waitForExit()
    }
  }

  private definition(id: CliToolId, recipe: CliRecipe): ToolDefinition {
    return defineTool({
      name: cliToolName(id),
      description: `${recipe.name}: ${recipe.description} The configured command runs on the current execution Host.`,
      parameters: { input: { type: 'string', description: 'Text or path for the configured command input.' } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: {
          id: { type: 'string', required: true }, name: { type: 'string', required: true },
          cwd: { type: 'string', required: true }, executable: { type: 'string', required: true },
          stdout: { type: 'string', required: true }, stderr: { type: 'string', required: true },
          exitCode: { oneOf: [{ type: 'integer' }, { type: 'null' }], required: true },
          signal: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
          timedOut: { type: 'boolean', required: true }, aborted: { type: 'boolean', required: true },
          truncated: { type: 'boolean', required: true },
        } },
        render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }],
        presentationMeta: (_args, result) => ({ name: result.name, cwd: result.cwd }),
      },
      execute: async (args, execution) => this.runForAgent(id, recipe, args.input ?? '', execution),
      presentCall: args => ({ card: 'generic', title: recipe.name, kind: 'execute', rawInput: args.input ?? '' }),
      presentResult: (_args, result) => ({ card: 'generic', content: result.content }),
    })
  }

  private async runForAgent(id: CliToolId, admittedRecipe: CliRecipe, input: string, execution: ToolRunContext): Promise<CliRunResult> {
    argumentSchema.parse(input)
    const recipe = this.recipe(id)
    if (!recipe.enabled || JSON.stringify(recipe) !== JSON.stringify(admittedRecipe)) {
      fail('toolbox-cli/conflict', 'The local tool configuration changed. Prepare a new request before running it.')
    }
    const cwd = execution.agent ? await this.ctx.workingDirectory.ensure(execution.agent, execution.signal)
      : this.ctx.workingDirectory.defaultDirectory
    const policy = this.ctx.sandboxPolicy.resolve(execution.agent ? { session: execution.agent.session } : {})
    return this.execute(id, recipe, recipe.args.map(arg => arg.replaceAll('{input}', input)), cwd,
      policy, execution.signal, this.config.timeoutMs)
  }
}
