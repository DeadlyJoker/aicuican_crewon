/** Open immutable expert presets through the native conversation lifecycle. */
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionInputResolver, DraftAttachmentId, InputState, TokenSpan } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { UiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ExpertCatalogEntry, ExpertDefinition } from '../expert-types.ts'

/** Preserve the picked draft while excluding its unsubmitted expert-search token.
 * @param state - Current source composer state.
 * @param span - Revision-fenced token selected by the user.
 * @returns Plain initial prompt for the new conversation.
 */
export function expertInitialPrompt(state: Pick<InputState, 'draft' | 'draftRev'>, span: TokenSpan): string {
  if (state.draftRev !== span.draftRev) throw new Error('The draft changed. Select the expert again.')
  return (state.draft.slice(0, span.start) + state.draft.slice(span.end)).trim()
}

/** Create a normal conversation using the selected immutable revision without submitting.
 * Saved entries retain their selected preset even if the catalogue changes during navigation.
 * An unactivated bundled entry resolves to the Host's current activated revision.
 * @param services - Native services and callbacks that clone attachments for the target session and release failed clones.
 * @param entry - Selected catalogue entry.
 * @param options - Optional draft and explicit workspace; cancellation suppresses navigation.
 * @returns Completion after the prepared conversation has been opened.
 */
export async function openExpertConversation(services: {
  sessions: Pick<ISessions, 'create' | 'using'>
  input: SessionInputResolver
  navigation: Pick<UiWorkspace, 'openSession'>
  activate(slug: string): Promise<ExpertDefinition>
  cloneAttachments(targetId: SessionId): readonly DraftAttachmentId[]
  releaseAttachments(ids: readonly DraftAttachmentId[]): void
}, entry: ExpertCatalogEntry, options: {
  signal: AbortSignal
  workspaceId?: WorkspaceId
  prompt?: string
}): Promise<void> {
  options.signal.throwIfAborted()
  const expert = entry.expert ?? (entry.builtinSlug ? await services.activate(entry.builtinSlug) : undefined)
  if (!expert) throw new Error('This expert is no longer available. Refresh the catalogue.')
  options.signal.throwIfAborted()
  const id = await services.sessions.create({ agentPreset: expert.preset,
    ...(options.workspaceId === undefined ? {} : { workspaceId: options.workspaceId }) })
  await services.sessions.using(id, { source: 'controllerOperation', signal: options.signal }, async (reference) => {
    const binding = await reference.ready
    options.signal.throwIfAborted()
    if (services.input.requestDraftInitialization(binding, { prompt: options.prompt ?? '', whenDraftExists: 'keep' }) === 'blocked') {
      throw new Error('The expert conversation could not accept the draft. Open it and retry.')
    }
    options.signal.throwIfAborted()
    const input = services.input.for(binding.ctx)
    const attachments = services.cloneAttachments(id)
    let attached = false
    let opened = false
    try {
      options.signal.throwIfAborted()
      if (attachments.length) {
        attached = input.addAttachments(attachments)
        if (!attached) throw new Error('The expert conversation could not accept the attachments. Your original draft is retained.')
      }
      options.signal.throwIfAborted()
      services.navigation.openSession(id)
      opened = true
    } finally {
      if (!opened && attachments.length) {
        try {
          if (attached) for (const attachment of attachments) input.removeAttachment(attachment)
        } finally { services.releaseAttachments(attachments) }
      }
    }
  })
}
