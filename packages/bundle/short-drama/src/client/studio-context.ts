/** Product navigation retains the home selection independently from Studio projects. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { UiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { DramaProjectId } from '../project-types.ts'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Draft creation preferences belong to the Studio entry, not an existing project. */
export interface StudioCreationPreferences { mode: 'idea' | 'script' | 'adapt' | 'redraw'; category?: 'create' | 'drama' | 'interactive'; genre?: string; style: string; ratio: string; episodes: string }
/** A Studio project and its native conversations; old histories keep their original identities. */
export interface StudioProjectEntry {
  id: DramaProjectId
  title: string
  workspaceId: WorkspaceId
  sessionIds: readonly SessionId[]
  historySessionIds: readonly SessionId[]
}
/** @returns A root-owned navigation store; persisted bookmarks contain no media or model data. */
export function createStudioContext() {
  const state = createSnapshotStore<{
    active: boolean
    pendingSessionId: SessionId | null
    pendingOpenCanvas?: boolean
    projectId: DramaProjectId | null
    projects: StudioProjectEntry[]
    home: ReturnType<UiWorkspace['captureSelection']> | null
    homePanel: MainPanelId | null
    error: boolean
    creating?: boolean
    entrySessionId?: SessionId
    creationProjectId?: DramaProjectId
    entrySubmission?: { storage: Record<string, string>; sourceIds: string[] }
    creation?: StudioCreationPreferences
    lastSessionIds?: Record<string, SessionId>
  }>({ active: false, pendingSessionId: null, projectId: null, projects: [], home: null, homePanel: null, error: false },
    { persist: { name: 'crewon.studio.navigation.v1' } })
  // An interrupted transition cannot be resumed by its old mounted-session token.
  state.update((value) => { value.pendingSessionId = null; delete value.pendingOpenCanvas })
  return state
}
