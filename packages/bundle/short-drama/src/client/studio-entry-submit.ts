/** The first native composer submission creates one project and retains it across failed admissions. */
import type { ConversationSubmitRequest, SubmitOutcome } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { DramaProjectId } from '../project-types.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

interface EntryState { active: boolean; projectId: DramaProjectId | null; entrySessionId?: SessionId; creationProjectId?: DramaProjectId }
interface Actions {
  read(): EntryState
  remember(id: DramaProjectId): void
  create(request: ConversationSubmitRequest): Promise<DramaProjectId>
  deliver(id: DramaProjectId, request: ConversationSubmitRequest): Promise<SubmitOutcome>
  accepted(id: DramaProjectId): Promise<void>
  busy(): Error
}
/**
 * @param actions - Durable project allocation and ordinary native prompt admission.
 * @returns A waterfall listener; unrelated Sessions delegate and rejected prompts retain the same project for retry.
 */
export function createStudioEntrySubmission(actions: Actions) {
  let pending = false
  return async (request: ConversationSubmitRequest, next: () => Promise<SubmitOutcome>): Promise<SubmitOutcome> => {
    const current = actions.read()
    if (!current.active || current.projectId || current.entrySessionId !== request.sessionId) return next()
    if (pending) throw actions.busy()
    pending = true
    try {
      request.signal.throwIfAborted()
      let projectId = current.creationProjectId
      if (!projectId) {
        projectId = await actions.create(request)
        actions.remember(projectId)
      }
      const outcome = await actions.deliver(projectId, request)
      if (outcome.kind === 'success') await actions.accepted(projectId)
      return outcome
    } finally { pending = false }
  }
}

/**
 * @param text - First creative input.
 * @param fallback - Localized title for attachment-only input.
 * @returns A short project label, preferring an explicit work title.
 */
export function studioEntryProjectTitle(text: string, fallback: string): string {
  const named = text.match(/《([^》\n]{1,40})》/u)?.[1]
  return named ?? (text.trim().split(/[\n。！？：:]/u)[0]?.slice(0, 24) || fallback)
}
