/** Narrow native operations used by the toolbox page and its dialogs. */
import type { McpProbeResult } from '@deepseek-ai/dsh-mcp-client/types'
import type { ToolboxMcpInventory, ToolboxMcpSaveRequest, ToolboxMcpTarget, ToolboxMcpToggleRequest } from '../mcp-types.ts'
import type { CliCatalogue, CliSaveRequest, CliRemoveRequest, CliTarget, CliProbeResult, CliRunRequest, CliRunResult } from '../cli-types.ts'
import type { AuthorizationState, AgentCapabilityPolicy } from '../authorization-types.ts'
import type { ToolPresentation, ToolboxCatalogSnapshot } from '../types.ts'
import type { SkillExplorerActions } from './actions.ts'

/** Operations retain the native configuration and execution owners. */
export interface ToolboxActions {
  skills: SkillExplorerActions
  catalog: {
    read(this: void): Promise<ToolboxCatalogSnapshot>
    save(this: void, key: string, value: ToolPresentation, revision: number): Promise<ToolboxCatalogSnapshot>
  }
  mcp: {
    inventory(this: void): Promise<ToolboxMcpInventory>
    save(this: void, request: ToolboxMcpSaveRequest): Promise<ToolboxMcpInventory>
    setEnabled(this: void, request: ToolboxMcpToggleRequest): Promise<ToolboxMcpInventory>
    remove(this: void, request: ToolboxMcpTarget): Promise<ToolboxMcpInventory>
    probe(this: void, name: string, signal: AbortSignal): Promise<McpProbeResult>
    restart(this: void, name: string): Promise<void>
    setCredential(this: void, ref: string, value: string): Promise<void>
  }
  cli: {
    list(this: void): Promise<CliCatalogue>
    save(this: void, request: CliSaveRequest): Promise<CliCatalogue>
    remove(this: void, request: CliRemoveRequest): Promise<CliCatalogue>
    probe(this: void, request: CliTarget, signal: AbortSignal): Promise<CliProbeResult>
    run(this: void, request: CliRunRequest, signal: AbortSignal): Promise<CliRunResult>
  }
  authorization: {
    list(this: void): Promise<AuthorizationState>
    save(this: void, request: { agentPreset: string; policy: AgentCapabilityPolicy; revision: number }): Promise<AuthorizationState>
  }
}
