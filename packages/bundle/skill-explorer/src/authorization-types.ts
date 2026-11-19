/** Agent capability choices shared by the toolbox and its authorization service. */

/** Explicit capabilities for one preset; disabled entries retain inherited behavior. */
export interface AgentCapabilityPolicy {
  /** Apply these selections when true; false uses the preset's inherited capabilities. */
  enabled: boolean
  /** Exact names of ordinary native tools available to this preset. */
  nativeTools: string[]
  /** Skill names this preset may discover and load. */
  skillNames: string[]
  /** Configured MCP server namespaces available to this preset. */
  mcpServers: string[]
  /** Configured CLI recipe ids available to this preset. */
  cliToolIds: string[]
}

/** Editable authorization catalogue for the current profile. */
export interface AuthorizationState {
  /** Native Settings revision required by the next edit. */
  revision: number
  /** Native preset roster, including unavailable declarations. */
  presets: {
    id: string
    name?: string
    description?: string
    broken?: string
  }[]
  /** Explicit user or deployment policies keyed by preset id. */
  policies: Record<string, AgentCapabilityPolicy>
  /** Ordinary tools contributed by current usable presets, excluding managed categories. */
  nativeTools: { name: string; description: string }[]
}

/** One revision-fenced authorization edit. */
export interface AuthorizationUpdate {
  /** Existing native preset whose capabilities change. */
  agentPreset: string
  /** Complete replacement policy for this preset. */
  policy: AgentCapabilityPolicy
  /** Revision returned by the authorization catalogue. */
  revision: number
}
