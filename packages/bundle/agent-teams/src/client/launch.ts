/** Single-admission task launch through the existing Session Controller. */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { UiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { teamCommand } from './templates.ts'

/** Launch status retained while the plugin page is remounted. */
export interface LaunchState {
  readonly pending: boolean
  readonly failure?: string
  /** A created session is retained for inspection instead of submitting again after an uncertain outcome. */
  readonly sessionId?: SessionId
}

/** Conversation launch commands and their observable admission state. */
export interface TeamLauncher {
  readonly state: SnapshotStore<LaunchState>
  /** @param name - Saved team. @param goal - Concrete problem. @param workspaceId - Target workspace. */
  launch(this: void, name: string, goal: string, workspaceId: WorkspaceId): Promise<void>
  /** Open the session retained after an uncertain admission. */
  openCreated(this: void): void
  /** Cancel further admission and navigation when the plugin unloads. */
  dispose(this: void): void
}

/**
 * Create one plugin-owned launcher, refusing overlapping submissions.
 * @param sessions - Session creation, retention, and command admission.
 * @param navigation - Existing conversation navigation.
 * @returns Observable launch state and actions for the plugin page.
 */
export function createTeamLauncher(sessions: Pick<ISessions, 'create' | 'using'>, navigation: Pick<UiWorkspace, 'openSession'>): TeamLauncher {
  const state = createSnapshotStore<LaunchState>({ pending: false })
  const lifetime = new AbortController()
  const isActive = () => !lifetime.signal.aborted
  return {
    state,
    async launch(this: void, name: string, goal: string, workspaceId: WorkspaceId): Promise<void> {
      if (!isActive() || state.getSnapshot().pending || state.getSnapshot().sessionId !== undefined) return
      state.set({ pending: true })
      let sessionId: SessionId | undefined
      try {
        sessionId = await sessions.create({ workspaceId })
        await sessions.using(sessionId, { source: 'controllerOperation', signal: lifetime.signal }, async (reference) => {
          const binding = await reference.ready
          if (!isActive()) return
          const result = await binding.session.command(teamCommand(name, goal))
          if (!result.ok) throw new Error(result.error.message)
          if (!result.value.matched) throw new Error('agent-teams/unavailable')
          if (isActive()) navigation.openSession(reference.sessionId)
        })
        if (isActive()) state.set({ pending: false })
      } catch (error) {
        if (isActive()) state.set({
          pending: false,
          failure: error instanceof Error ? error.message : String(error),
          ...sessionId === undefined ? {} : { sessionId },
        })
      }
    },
    openCreated(this: void): void {
      const { sessionId } = state.getSnapshot()
      if (sessionId !== undefined) {
        navigation.openSession(sessionId)
        state.set({ pending: false })
      }
    },
    dispose(this: void): void { lifetime.abort() },
  }
}
