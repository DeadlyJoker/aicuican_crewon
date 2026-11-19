/** Ordinary workspace browsing excludes conversations owned by product workspaces. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'

/**
 * Collect conversations retained by product-owned workspaces, including their historical associations.
 * @param workspaces - Complete registry projection.
 * @returns Product-owned current and historical conversations.
 */
export function productSessionIds(workspaces: readonly WorkspaceView[]): ReadonlySet<SessionId> {
  return new Set(workspaces.filter(item => item.namespace !== undefined)
    .flatMap(item => [...item.sessionIds, ...item.historySessionIds ?? []]))
}

/**
 * Filter product-owned conversations out of the ordinary Session catalogue.
 * @param list - Complete Session catalogue.
 * @param hidden - Product-owned identities.
 * @returns Ordinary Session catalogue.
 */
export function ordinarySessions(list: SessionListState, hidden: ReadonlySet<SessionId>): SessionListState {
  return { ...list, ids: list.ids.filter(id => !hidden.has(id)),
    byId: Object.fromEntries(Object.entries(list.byId).filter(([id]) => !hidden.has(id as SessionId))) }
}
