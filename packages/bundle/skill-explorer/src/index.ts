/** Native skill-centre bundle adapted from dsh-web's BSD-licensed explorer. */
import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { resolveAgentsHome, resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { SkillExplorer, type SkillExplorerConfig } from './controller.ts'
import { ToolboxMcpController } from './mcp-controller.ts'
import { ToolboxCli } from './cli-controller.ts'
import { CliToolsSchema, type CliRecipe } from './cli-types.ts'
import { AgentPermissionsSchema, ToolboxAuthorization } from './authorization.ts'
import type { AgentCapabilityPolicy } from './authorization-types.ts'
import { ToolboxCatalog } from './catalog-controller.ts'
import type { ToolPresentation } from './types.ts'

/** Deployment-owned skill roots and bounded import limits. */
export interface Config {
  /** User skill home; defaults to the current Harness home. */
  dshHome?: string
  /** Shared agent home; defaults to the current agent home. */
  agentsHome?: string
  /** Additional local skill roots exposed for management. */
  customSkillDirs?: string[]
  /** Additional read-only bundled skill roots. */
  bundledSkillDirs?: string[]
  /** Maximum UTF-8 bytes in one managed instruction file. */
  maxSkillBytes?: number
  /** Maximum compressed ZIP input bytes. */
  maxImportBytes?: number
  /** Maximum entries examined during one import. */
  maxImportEntries?: number
  /** Maximum total expanded instruction bytes during one import. */
  maxImportTotalBytes?: number
  /** Native MCP Settings namespace used by the connection editor. */
  mcpSettingsNamespace?: string
  /** Named command recipes available on the current execution device. */
  cliTools?: Record<string, CliRecipe>
  /** Maximum duration of one local tool run. */
  cliTimeoutMs?: number
  /** Maximum duration of executable version detection. */
  cliProbeTimeoutMs?: number
  /** Retained bytes for each command output stream. */
  cliOutputBytes?: number
  /** Grace period before forcibly stopping a command. */
  cliGraceMs?: number
  /** Per-preset capability restrictions; missing entries inherit normal behavior. */
  agentPermissions?: Record<string, AgentCapabilityPolicy>
  /** Display names and purposes for stable native resource identities. */
  catalog?: Record<string, ToolPresentation>
}

/** Fully resolved toolbox settings shared by its native service adapters. */
export interface ResolvedConfig extends SkillExplorerConfig {
  /** Native MCP Settings namespace used by the connection editor. */
  mcpSettingsNamespace: string
  /** Reactive command recipes for the current execution device. */
  cliTools: Volatile<Record<string, CliRecipe>>
  /** Maximum duration of one command run in milliseconds. */
  cliTimeoutMs: number
  /** Maximum duration of a version probe in milliseconds. */
  cliProbeTimeoutMs: number
  /** Maximum retained bytes in each command output stream. */
  cliOutputBytes: number
  /** Grace period before forcibly stopping a command in milliseconds. */
  cliGraceMs: number
  /** Reactive capability restrictions keyed by native Agent preset. */
  agentPermissions: Volatile<Record<string, AgentCapabilityPolicy>>
  /** Reactive display names and purposes keyed by resource identity. */
  catalog: Volatile<Record<string, ToolPresentation>>
}

/** Root paths and limits resolved before the Host service starts. */
export const Config: z<Config, ResolvedConfig> = z.object({
  dshHome: z.string().default(resolveDshHome()),
  agentsHome: z.string().default(resolveAgentsHome()),
  customSkillDirs: z.array(z.string()).default([]),
  bundledSkillDirs: z.array(z.string()).default(process.env.DSH_BUNDLED_SKILL_DIR ? [process.env.DSH_BUNDLED_SKILL_DIR] : []),
  maxSkillBytes: z.natural().min(1).default(64 * 1024),
  maxImportBytes: z.natural().min(1).default(4 * 1024 * 1024),
  maxImportEntries: z.natural().min(1).default(512),
  maxImportTotalBytes: z.natural().min(1).default(4 * 1024 * 1024),
  mcpSettingsNamespace: z.string().default('mcp-manager'),
  cliTools: CliToolsSchema.volatile(),
  cliTimeoutMs: z.natural().min(1).default(30_000),
  cliProbeTimeoutMs: z.natural().min(1).default(5_000),
  cliOutputBytes: z.natural().min(1).default(64 * 1024),
  cliGraceMs: z.natural().default(250),
  agentPermissions: AgentPermissionsSchema.default({}).volatile(),
  catalog: z.dict(z.object({
    title: z.string().required(), description: z.string().default(''),
    purpose: z.union(['writing', 'research', 'data', 'development', 'media', 'general']).default('general'),
  })).default({}).volatile(),
})

/** Services required for authenticated, workspace-aware skill management. */
export const inject = [
  'typert', 'skills', 'workspaceRegistry', 'agentPresets', 'agents', 'settings',
  'mcpManager', 'tools', 'subprocess', 'sandbox', 'sandboxPolicy', 'workingDirectory',
]

/**
 * Mount the skill manager beside the existing skill providers.
 * @param ctx - Current Host registry and authenticated Remote services.
 * @param config - Validated roots and import limits.
 */
export function apply(ctx: Context, config: ResolvedConfig): void {
  new SkillExplorer(ctx, config)
  new ToolboxCatalog(ctx, 'skill-explorer')
  new ToolboxMcpController(ctx, config.mcpSettingsNamespace)
  new ToolboxCli(ctx, { namespace: 'skill-explorer', cliTools: config.cliTools,
    timeoutMs: config.cliTimeoutMs, probeTimeoutMs: config.cliProbeTimeoutMs,
    outputBytes: config.cliOutputBytes, graceMs: config.cliGraceMs })
  new ToolboxAuthorization(ctx, { namespace: 'skill-explorer', policies: () => config.agentPermissions.get(),
    cliToolName: id => config.cliTools.get()[id] ? `toolbox_cli_${id}` : undefined })
}
