/** Studio navigation operations use the native workspace browser. */
import type { DramaProjectId } from '../project-types.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

export interface StudioNavigationActions {
  enter(this: void): Promise<void>
  leave(this: void): Promise<void>
  overview(this: void): Promise<void>
  select(this: void, id: DramaProjectId): Promise<void>
  conversation(this: void, id: SessionId): Promise<void>
}
