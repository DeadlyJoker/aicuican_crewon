import { expect, it, vi } from 'vitest'
import type { ISessions, SessionBinding, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionInput, SessionInputResolver, DraftAttachmentId } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { expertInitialPrompt, openExpertConversation } from '../src/client/expert-launch.ts'
import type { ExpertCatalogEntry, ExpertDefinition } from '../src/expert-types.ts'

const id = 'expert-conversation' as SessionId
const expert: ExpertDefinition = { id: 'writer', name: 'Writer', description: 'Edit prose', prompt: 'Edit', basePreset: 'standard', revision: 2, preset: 'expert-writer-v2' }
const entry: ExpertCatalogEntry = { key: 'writer', name: 'Writer', description: 'Edit prose', category: 'writing', tags: [], examples: [], expert }
function setup() {
  const binding = { sessionId: id, ctx: {} } as SessionBinding
  const reference: SessionReference = {
    sessionId: id, binding, ready: Promise.resolve(binding), release: vi.fn(), [Symbol.dispose]: vi.fn(),
  }
  const create = vi.fn<ISessions['create']>().mockResolvedValue(id)
  const using: ISessions['using'] = async (_id, _options, operation) => operation(reference)
  const addAttachments = vi.fn().mockReturnValue(true)
  const removeAttachment = vi.fn().mockReturnValue(true)
  const submit = vi.fn()
  const requestDraftInitialization = vi.fn().mockReturnValue('applied')
  const testInput: Partial<SessionInput> = { addAttachments, removeAttachment, submit }
  const input: SessionInputResolver = { for: () => testInput as SessionInput,
    requestDraftInitialization }
  const openSession = vi.fn()
  const activate = vi.fn().mockResolvedValue(expert)
  const cloneAttachments = vi.fn().mockReturnValue([])
  const releaseAttachments = vi.fn()
  return { services: { sessions: { create, using }, input, navigation: { openSession }, activate, cloneAttachments, releaseAttachments },
    create, addAttachments, removeAttachment, submit, input, requestDraftInitialization,
    openSession, activate, cloneAttachments, releaseAttachments }
}

it('clones attachments for the new session and opens the selected preset without submitting', async () => {
  const test = setup()
  const sourceAttachment = 'source-file' as DraftAttachmentId
  const clonedAttachment = 'cloned-file' as DraftAttachmentId
  test.cloneAttachments.mockReturnValue([clonedAttachment])
  await openExpertConversation(test.services, entry, { signal: new AbortController().signal, prompt: 'Review this' })
  expect(test.create).toHaveBeenCalledWith({ agentPreset: 'expert-writer-v2' })
  expect(test.requestDraftInitialization).toHaveBeenCalledWith(expect.anything(), { prompt: 'Review this', whenDraftExists: 'keep' })
  expect(test.cloneAttachments).toHaveBeenCalledWith(id)
  expect(test.addAttachments).toHaveBeenCalledWith([clonedAttachment])
  expect(test.addAttachments).not.toHaveBeenCalledWith([sourceAttachment])
  expect(test.releaseAttachments).not.toHaveBeenCalled()
  expect(test.openSession).toHaveBeenCalledWith(id)
  expect(test.activate).not.toHaveBeenCalled()
  expect(test.submit).not.toHaveBeenCalled()
})

it('activates a bundled expert only on explicit use', async () => {
  const test = setup()
  const { expert: _saved, ...builtin } = entry
  await openExpertConversation(test.services, { ...builtin, builtinSlug: 'writing/editor' }, { signal: new AbortController().signal })
  expect(test.activate).toHaveBeenCalledWith('writing/editor')
  expect(test.create).toHaveBeenCalledOnce()
})

it('keeps the current page when draft initialization is blocked', async () => {
  const test = setup()
  test.requestDraftInitialization.mockReturnValue('blocked')
  await expect(openExpertConversation(test.services, entry, { signal: new AbortController().signal })).rejects.toThrow('draft')
  expect(test.openSession).not.toHaveBeenCalled()
  expect(test.cloneAttachments).not.toHaveBeenCalled()
})

it('does not open a conversation after navigation was cancelled', async () => {
  const test = setup()
  const controller = new AbortController()
  controller.abort()
  const { expert: _saved, ...builtin } = entry
  await expect(openExpertConversation(test.services, { ...builtin, builtinSlug: 'writing/editor' }, {
    signal: controller.signal,
  })).rejects.toThrow()
  expect(test.create).not.toHaveBeenCalled()
  expect(test.activate).not.toHaveBeenCalled()
  expect(test.cloneAttachments).not.toHaveBeenCalled()
})

it('releases newly cloned attachments when navigation is cancelled during cloning', async () => {
  const test = setup()
  const controller = new AbortController()
  const cloned = ['target-file'] as DraftAttachmentId[]
  test.cloneAttachments.mockImplementation(() => { controller.abort(); return cloned })
  await expect(openExpertConversation(test.services, entry, { signal: controller.signal })).rejects.toThrow()
  expect(test.releaseAttachments).toHaveBeenCalledExactlyOnceWith(cloned)
  expect(test.addAttachments).not.toHaveBeenCalled()
  expect(test.openSession).not.toHaveBeenCalled()
  expect(test.submit).not.toHaveBeenCalled()
})

it('releases target clones when their composer rejects attachment admission', async () => {
  const test = setup()
  const cloned = ['target-file'] as DraftAttachmentId[]
  test.cloneAttachments.mockReturnValue(cloned)
  test.addAttachments.mockReturnValue(false)
  await expect(openExpertConversation(test.services, entry, { signal: new AbortController().signal })).rejects.toThrow('attachments')
  expect(test.releaseAttachments).toHaveBeenCalledExactlyOnceWith(cloned)
  expect(test.removeAttachment).not.toHaveBeenCalled()
  expect(test.openSession).not.toHaveBeenCalled()
  expect(test.submit).not.toHaveBeenCalled()
})

it('removes attached clones and releases them if navigation fails', async () => {
  const test = setup()
  const cloned = ['target-file'] as DraftAttachmentId[]
  test.cloneAttachments.mockReturnValue(cloned)
  test.openSession.mockImplementation(() => { throw new Error('Navigation failed') })
  await expect(openExpertConversation(test.services, entry, { signal: new AbortController().signal })).rejects.toThrow('Navigation failed')
  expect(test.removeAttachment).toHaveBeenCalledExactlyOnceWith(cloned[0])
  expect(test.releaseAttachments).toHaveBeenCalledExactlyOnceWith(cloned)
  expect(test.submit).not.toHaveBeenCalled()
})

it('retains the saved revision selected by a stale catalogue entry', async () => {
  const test = setup()
  test.activate.mockResolvedValue({ ...expert, revision: 3, preset: 'expert-writer-v3' })
  await openExpertConversation(test.services, entry, { signal: new AbortController().signal })
  expect(test.create).toHaveBeenCalledExactlyOnceWith({ agentPreset: 'expert-writer-v2' })
  expect(test.activate).not.toHaveBeenCalled()
})

it('retains surrounding text and rejects an obsolete expert pick', () => {
  expect(expertInitialPrompt({ draft: 'Please @writer review this', draftRev: 4 }, { start: 7, end: 14, draftRev: 4 })).toBe('Please  review this')
  expect(() => expertInitialPrompt({ draft: 'Changed', draftRev: 5 }, { start: 0, end: 3, draftRev: 4 })).toThrow('changed')
})
