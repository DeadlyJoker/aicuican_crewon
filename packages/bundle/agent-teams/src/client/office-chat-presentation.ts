/** Office-only Chat presentation over the shared visibility extension point. */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ChatVisibilityPolicy } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { OfficeDiscussion } from '../office-types.ts'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { officeDeliveryNeedsNewId } from './office-reference.ts'

const OFFICE_CHAT_POLICY: ChatVisibilityPolicy = Object.freeze({
  hiddenKinds: Object.freeze(['assistant-step', 'turn-trigger', 'turn-process', 'tool-call', 'model-retry']),
  hideRunningStatus: true,
  hideAssistantActions: true,
})

/**
 * Keep addressed user messages and member replies while native traces retain all events.
 * @param ctx - Chat visibility service and registration lifetime.
 * @param readOffice - Existing office membership reader; null keeps ordinary Chat presentation.
 * @param chooseMember - Localized instruction for an office message with no selected member.
 * @param sendToLeader - Logged member delivery with the current office leader as recipient.
 * @param attachmentsUnsupported - Localized refusal retaining unsupported file drafts.
 */
export function installOfficeChatPresentation(
  ctx: Context,
  readOffice: (sessionId: SessionId) => Promise<OfficeDiscussion | null>,
  chooseMember: () => string,
  sendToLeader: (sessionId: SessionId, text: string, id: string) => Promise<void>,
  attachmentsUnsupported: () => string,
): void {
  const submissions = new Map<SessionId, { text: string; id: string }>()
  ctx.on('conversation/input-submit', async (request, next) => {
    if (request.text.trimStart().startsWith('/')) return next()
    const discussion = await readOffice(request.sessionId)
    request.signal.throwIfAborted()
    if (!discussion) return next()
    if (!discussion.office.leaderId || request.text.trimStart().startsWith('@')) throw new Error(chooseMember())
    if (request.attachmentIds.length > 0) throw new Error(attachmentsUnsupported())
    let submission = submissions.get(request.sessionId)
    if (submission?.text !== request.text) {
      submission = { text: request.text, id: randomUUID() }
      submissions.set(request.sessionId, submission)
    }
    try {
      await sendToLeader(request.sessionId, request.text, submission.id)
    } catch (error) {
      if (await officeDeliveryNeedsNewId(readOffice, request.sessionId, submission.id)
        && submissions.get(request.sessionId) === submission) submissions.delete(request.sessionId)
      throw error
    }
    if (submissions.get(request.sessionId) === submission) submissions.delete(request.sessionId)
    return { kind: 'success' }
  })
  ctx.effect(() => () => { submissions.clear() }, 'office draft delivery lifetime')
  ctx.effect(() => ctx.chatVisibility.register({
    id: 'office-member-messages',
    resolve: async (sessionId) => {
      const office = await readOffice(sessionId)
      return office === null ? null : OFFICE_CHAT_POLICY
    },
  }), 'office Chat presentation')
}
