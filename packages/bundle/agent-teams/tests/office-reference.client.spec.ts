import { expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { createOfficeReferenceSource, officeDeliveryNeedsNewId } from '../src/client/office-reference.ts'
import type { OfficeId, OfficeMemberId, OfficeMessageId } from '../src/office-types.ts'

it('offers only the active office members and submits a selected member through the command channel', async () => {
  const session = SessionId('office-session')
  const memberId = '11111111-1111-4111-8111-111111111111' as OfficeMemberId
  const send = vi.fn().mockResolvedValue(undefined)
  const source = createOfficeReferenceSource(async id => id === session ? {
    office: { id: '22222222-2222-4222-8222-222222222222' as OfficeId, name: 'Office', description: '',
      members: [{ id: memberId, name: 'Reviewer', role: 'Review', instruction: 'Review inputs' }] },
    messages: [],
  } : null, () => 'Office', send)
  const request = { query: 'Review', position: 'leading' as const, drilled: false, signal: new AbortController().signal }
  const rows = await source.candidates({ sessionId: session }, request)
  expect(rows).toHaveLength(1)
  expect(await source.candidates({ sessionId: SessionId('different') }, request)).toEqual([])
  const candidate = rows[0]!
  const outcome = source.onPick({
    candidate, session: { sessionId: session }, position: 'leading', via: 'menu', action: 'pick',
    span: { start: 0, end: 4, draftRev: 0 },
  })
  if (!outcome || outcome === 'handled' || !('claim' in outcome)) throw new Error('Expected an office command claim')
  expect(outcome.claim.token).toBe('@Reviewer ')
  await outcome.claim.submit('Check totals', new Context(), [])
  await outcome.claim.submit('Check totals', new Context(), [])
  expect(send).toHaveBeenCalledWith(session, memberId, 'Check totals', expect.any(String))
  expect(send.mock.calls[0]?.[3]).toBe(send.mock.calls[1]?.[3])
  expect(await source.matchClaim?.({ sessionId: session }, '@Reviewer', request.signal)).toMatchObject({ token: '@Reviewer ' })
  expect(await source.matchClaim?.({ sessionId: session }, '@Missing', request.signal)).toBeUndefined()
})

it('does not claim another conversation or invent members', async () => {
  const source = createOfficeReferenceSource(async () => null, () => 'Office', vi.fn())
  expect(await source.matchClaim?.({ sessionId: SessionId('ordinary') }, '@Reviewer', new AbortController().signal)).toBeUndefined()
})

it('only renews a retry identity for a recorded terminal failure', async () => {
  const id = SessionId('retry-session')
  const discussion = { office: { id: 'office' as OfficeId, name: 'Office', description: '', members: [] },
    messages: [{ id: 'message' as OfficeMessageId, memberId: 'member' as OfficeMemberId, memberName: 'Reviewer',
      text: 'check', createdAt: 0, status: 'running' as const }] }
  expect(await officeDeliveryNeedsNewId(async () => discussion, id, 'message')).toBe(false)
  expect(await officeDeliveryNeedsNewId(async () => ({ ...discussion, messages: discussion.messages.map(message =>
    ({ ...message, status: 'failed' as const })) }), id, 'message')).toBe(true)
  expect(await officeDeliveryNeedsNewId(async () => { throw new Error('offline') }, id, 'message')).toBe(false)
})
