/** Connection configuration and ownership shown by the toolbox MCP editor. */
import type { McpManagedServerStatus } from '@deepseek-ai/dsh-mcp-manager/types'

/** Editable connection fields, with null retaining an existing private value. */
export interface ToolboxMcpConfig {
  transport: 'stdio' | 'streamable-http'
  command: string
  args: string[]
  env: Record<string, string | null>
  cwd: string
  url: string
  headers: Record<string, string | null>
  enabled: boolean
  startupTimeoutMs?: number
  toolCallTimeoutMs?: number
  closeTimeoutMs?: number
  reconnect?: {
    enabled?: boolean
    initialDelayMs?: number
    maxDelayMs?: number
    maxAttempts?: number
  }
}

/** A native connection together with the operations its owner permits. */
export interface ToolboxMcpConnection {
  name: string
  origin: 'user' | 'inherited' | 'plugin'
  editable: boolean
  removable: boolean
  status: McpManagedServerStatus
  config?: ToolboxMcpConfig
}

/** Revision-fenced connection editor snapshot. */
export interface ToolboxMcpInventory {
  revision: number
  writable: boolean
  connections: ToolboxMcpConnection[]
}

/** Create a connection, or update the immutable original server identifier. */
export interface ToolboxMcpSaveRequest {
  name: string
  originalName?: string
  revision: number
  config: ToolboxMcpConfig
}

/** Identify a configured connection at the settings revision the user read. */
export interface ToolboxMcpTarget {
  name: string
  revision: number
}

/** Enable or disable a native connection without discarding its settings. */
export interface ToolboxMcpToggleRequest extends ToolboxMcpTarget {
  enabled: boolean
}
