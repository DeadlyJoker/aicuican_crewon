/** Office @ picks claim the composer's native submit transaction. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CommandClaim, InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { OfficeDiscussion } from '../office-types.ts'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'

/**
 * Distinguish a terminal delivery from an uncertain transport outcome before retrying.
 * @param read - Current persisted office discussion.
 * @param sessionId - Conversation that owns the delivery.
 * @param id - Original request identity.
 * @returns Whether a later user retry needs a fresh identity.
 */
export async function officeDeliveryNeedsNewId(
  read: (id: SessionId) => Promise<OfficeDiscussion | null>, sessionId: SessionId, id: string,
): Promise<boolean> {
  try {
    const status = (await read(sessionId))?.messages.find(message => message.id === id)?.status
    return status === 'failed' || status === 'interrupted'
  } catch (_lookupFailure) {
    // The original identity prevents duplicate dispatch while the outcome remains unknown.
    return false
  }
}

/**
 * Submit a selected member directly through the command channel.
 * @param read - Lookup of the current office.
 * @param label - Localized picker group label.
 * @param send - Logged delivery operation, retaining the same id across retries.
 * @returns The member picker and restorable composer claim.
 */
export function createOfficeReferenceSource(
  read: (id: SessionId) => Promise<OfficeDiscussion | null>, label: () => string,
  send: (sessionId: SessionId, memberId: string, text: string, id: string) => Promise<void>,
): InputTriggerSource {
  const claim = (sessionId: SessionId, memberId: string, name: string): CommandClaim => {
    let id = randomUUID()
    return {
      name: 'team-office-send', token: '@' + name + ' ',
      submit: async (text) => {
        try {
          await send(sessionId, memberId, text.trim(), id)
        } catch (error) {
          if (await officeDeliveryNeedsNewId(read, sessionId, id)) id = randomUUID()
          throw error
        }
        return { kind: 'success' }
      },
    }
  }
  return {
    trigger: '@', name: 'office-members', order: -20,
    candidates: async (session, request) => {
      const discussion = await read(session.sessionId)
      request.signal.throwIfAborted()
      const query = request.query.toLocaleLowerCase()
      return discussion?.office.members.filter(member => (member.name + ' ' + member.role).toLocaleLowerCase().includes(query))
        .map(member => ({ name: member.name, label: member.name, description: member.role, section: label(), value: member.id })) ?? []
    },
    onPick: ({ session, candidate }) => candidate.value
      ? { claim: claim(session.sessionId, candidate.value, candidate.name) } : undefined,
    matchClaim: async (session, token, signal) => {
      const discussion = await read(session.sessionId)
      signal.throwIfAborted()
      const member = discussion?.office.members.find(member => '@' + member.name === token.trim())
      return member ? claim(session.sessionId, member.id, member.name) : undefined
    },
  }
}
