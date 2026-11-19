import { expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { ChatVisibilityRegistry } from '../../../client/ui-chat/src/client/visibility.ts'
import { installOfficeChatPresentation } from '../src/client/office-chat-presentation.ts'
import type { OfficeDiscussion, OfficeId, OfficeMemberId, OfficeMessageId } from '../src/office-types.ts'
import type { DraftAttachmentId } from '@deepseek-ai/dsh-client-ui-conversation/client'

const officeId = SessionId('office-session')
const ordinaryId = SessionId('ordinary-session')
const leaderId = 'leader' as OfficeMemberId

function fixture(leader = false) {
  const ctx = new Context()
  const registry = new ChatVisibilityRegistry(vi.fn())
  ctx.provide('chatVisibility', registry)
  const office: OfficeDiscussion = { office: { id: 'office' as OfficeId, name: 'Office', description: '', members: [],
    ...(leader ? { leaderId } : {}) }, messages: [] }
  const read = vi.fn(async (id: SessionId) => id === officeId ? office : null)
  const execute = vi.fn(async (_sessionId: SessionId, _text: string, _id: string) => {})
  const prompt = vi.fn(async () => ({ kind: 'success' as const }))
  installOfficeChatPresentation(ctx, read, () => '先选择成员或设置组长', execute, () => '保留附件')
  const send = (id: SessionId, text: string, attachmentIds: readonly DraftAttachmentId[] = [], signal = new AbortController().signal) =>
    ctx.waterfall('conversation/input-submit', { sessionId: id, text, attachmentIds, mode: 'queue', signal }, prompt)
  return { ctx, registry, office, read, execute, prompt, send }
}

it('requires a recipient without a leader and preserves ordinary sessions and commands', async () => {
  const f = fixture()
  await expect(f.send(officeId, 'hello')).rejects.toThrow('先选择成员或设置组长')
  await f.send(ordinaryId, 'hello')
  await f.send(officeId, '/help')
  expect(f.prompt).toHaveBeenCalledTimes(2)
  expect(f.execute).not.toHaveBeenCalled()
  const source = f.registry.source(officeId)
  await vi.waitFor(() => { expect(source.getSnapshot()).toHaveLength(1) })
  expect(source.getSnapshot()[0]).toMatchObject({ hideAssistantActions: true, hideRunningStatus: true })
  expect(source.getSnapshot()[0]?.hiddenKinds).not.toContain('turn-tail')
  await f.ctx.fiber.dispose()
})

it('routes plain questions to the leader and keeps the same identity across a failed retry', async () => {
  const f = fixture(true)
  f.execute.mockRejectedValueOnce(new Error('disconnected'))
  await expect(f.send(officeId, '安排工作')).rejects.toThrow('disconnected')
  await expect(f.send(officeId, '安排工作')).resolves.toEqual({ kind: 'success' })
  expect(f.execute.mock.calls[0]).toEqual(f.execute.mock.calls[1])
  expect(f.prompt).not.toHaveBeenCalled()
  await f.send(officeId, '安排工作')
  expect(f.execute.mock.calls[2]?.[2]).not.toBe(f.execute.mock.calls[0]?.[2])
  await f.ctx.fiber.dispose()
})

it('reads current settings and retains unsupported attachments and unresolved mentions', async () => {
  const f = fixture(true)
  await expect(f.send(officeId, '@unknown hello')).rejects.toThrow('先选择成员或设置组长')
  await expect(f.send(officeId, 'hello', ['file' as DraftAttachmentId])).rejects.toThrow('保留附件')
  delete f.office.office.leaderId
  await expect(f.send(officeId, 'hello')).rejects.toThrow('先选择成员或设置组长')
  expect(f.execute).not.toHaveBeenCalled()
  await f.ctx.fiber.dispose()
})

it('lets the next user retry a recorded failed delivery with a new identity', async () => {
  const f = fixture(true)
  f.execute.mockImplementationOnce(async (_sessionId, text, id) => {
    f.office.messages.push({ id: id as OfficeMessageId, memberId: leaderId, memberName: 'Leader', text,
      createdAt: 0, status: 'failed' })
    throw new Error('delivery failed')
  })
  await expect(f.send(officeId, 'retry this')).rejects.toThrow('delivery failed')
  await f.send(officeId, 'retry this')
  expect(f.execute.mock.calls[1]?.[2]).not.toBe(f.execute.mock.calls[0]?.[2])
  await f.ctx.fiber.dispose()
})

it('does not dispatch after cancellation during the settings read', async () => {
  const f = fixture(true)
  const pending = Promise.withResolvers<OfficeDiscussion | null>()
  f.read.mockReturnValueOnce(pending.promise)
  const abort = new AbortController()
  const sending = f.send(officeId, 'hello', [], abort.signal)
  abort.abort()
  pending.resolve(f.office)
  await expect(sending).rejects.toThrow()
  expect(f.execute).not.toHaveBeenCalled()
  await f.ctx.fiber.dispose()
})
