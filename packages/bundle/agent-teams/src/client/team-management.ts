/** Scoped destinations requested from a conversation's team details. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { OfficeId } from '../office-types.ts'
import type { OfficeProjectId } from '../office-project-types.ts'

/** Open the configuration or history belonging to one existing team object. */
export type TeamManagementTarget =
  | { kind: 'office'; officeId: OfficeId; view: 'projects' | 'settings'; projectId?: OfficeProjectId }
  | { kind: 'workflow'; workflowId: string; view: 'edit' | 'history' }

/** One-shot destinations shared with both management pages through their injected hook. */
export interface TeamManagementNavigation {
  hooks: { management: SnapshotStore<TeamManagementTarget | undefined> }
  consumeManagement(this: void, target: TeamManagementTarget): void
}
