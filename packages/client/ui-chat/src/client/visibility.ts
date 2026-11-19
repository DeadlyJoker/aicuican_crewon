/** Optional, session-scoped Chat presentation policies; Session history remains unchanged. */
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ChatNode } from './contract/chat-nodes.ts'

/** Plain presentation decisions contributed by one feature for one Session. */
export interface ChatVisibilityPolicy {
  /** Node kinds hidden from the Chat surface. Failure rows remain visible. */
  readonly hiddenKinds: readonly string[]
  /** Successful command receipts hidden from Chat by command name. */
  readonly hiddenCommands?: readonly string[]
  /** Hide the main Assistant's running indicator when another feature owns progress. */
  readonly hideRunningStatus?: boolean
  /** Keep feature tail cards while omitting generic main-Assistant footer actions. */
  readonly hideAssistantActions?: boolean
}

/** Resolve a feature's Chat policy using its existing domain reader. */
export interface ChatVisibilityRule {
  readonly id: string
  /** @param sessionId - Viewed Session. @returns its policy, or null outside this feature. */
  resolve(sessionId: SessionId): Promise<ChatVisibilityPolicy | null>
}

const EMPTY_POLICIES: readonly ChatVisibilityPolicy[] = Object.freeze([])
interface SessionPolicies {
  readonly source: ReturnType<typeof createSnapshotStore<readonly ChatVisibilityPolicy[]>>
  readonly resolved: Map<ChatVisibilityRule, ChatVisibilityPolicy>
  readonly generations: Map<ChatVisibilityRule, number>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Feature-owned Chat visibility without changing durable events or native trajectories. */
    chatVisibility: ChatVisibilityRegistry
  }
}

/** Registers feature policies and publishes immutable per-Session presentation snapshots. */
export class ChatVisibilityRegistry {
  private readonly rules = new Map<string, ChatVisibilityRule>()
  private readonly sessions = new Map<SessionId, SessionPolicies>()
  /** @param reportFailure - Owning plugin's diagnostic sink for a failed policy read. */
  constructor(private readonly reportFailure: (error: unknown) => void) {}

  /**
   * Register one feature's policy resolver for the registration lifetime.
   * @param rule - Unique feature id and asynchronous domain lookup.
   * @returns Disposer restoring the default presentation for this rule.
   */
  register(rule: ChatVisibilityRule): () => void {
    if (this.rules.has(rule.id)) throw new Error(`Chat visibility rule already registered: ${rule.id}`)
    this.rules.set(rule.id, rule)
    for (const [id, state] of this.sessions) this.resolve(rule, id, state)
    return () => {
      if (this.rules.get(rule.id) !== rule) return
      this.rules.delete(rule.id)
      for (const state of this.sessions.values()) {
        state.generations.delete(rule)
        if (state.resolved.delete(rule)) this.publish(state)
      }
    }
  }

  /**
   * Read the live presentation for one mounted Chat flow.
   * @param sessionId - Viewed Session.
   * @returns Default-visible policies until feature lookups resolve.
   */
  source(sessionId: SessionId): ObservableSnapshot<readonly ChatVisibilityPolicy[]> {
    let state = this.sessions.get(sessionId)
    if (state !== undefined) return state.source
    state = { source: createSnapshotStore(EMPTY_POLICIES), resolved: new Map(), generations: new Map() }
    this.sessions.set(sessionId, state)
    for (const rule of this.rules.values()) this.resolve(rule, sessionId, state)
    return state.source
  }

  /**
   * Re-read feature membership after a Session changes mode.
   * @param sessionId - Changed Session.
   */
  refresh(sessionId: SessionId): void {
    const state = this.sessions.get(sessionId)
    if (state === undefined) return
    for (const rule of this.rules.values()) this.resolve(rule, sessionId, state)
  }

  private resolve(rule: ChatVisibilityRule, sessionId: SessionId, state: SessionPolicies): void {
    const generation = (state.generations.get(rule) ?? 0) + 1
    state.generations.set(rule, generation)
    void rule.resolve(sessionId).then((policy) => {
      if (this.rules.get(rule.id) !== rule || state.generations.get(rule) !== generation) return
      if (policy === null) state.resolved.delete(rule)
      else state.resolved.set(rule, policy)
      this.publish(state)
    }, (error: unknown) => {
      if (this.rules.get(rule.id) === rule && state.generations.get(rule) === generation) this.reportFailure(error)
    })
  }
  private publish(state: SessionPolicies): void {
    state.source.set(Object.freeze([...state.resolved.values()]))
  }
}

/**
 * Apply feature presentation choices while retaining actionable failures.
 * @param policies - Resolved policies for the viewed Session.
 * @param node - Original projected Chat node.
 * @returns Whether the Chat surface should render this node.
 */
export function visibleWithPolicies(policies: readonly ChatVisibilityPolicy[], node: ChatNode): boolean {
  if (node.kind === 'command' && node.data.outcome?.kind === 'error') return true
  if (node.kind === 'tool-call' && 'kind' in node.data.root && node.data.root.isError) return true
  if (node.kind === 'turn-error' || node.kind === 'turn-max-tokens') return true
  return !policies.some(policy => policy.hiddenKinds.includes(node.kind)
    || node.kind === 'command' && node.data.name !== null && policy.hiddenCommands?.includes(node.data.name))
}
