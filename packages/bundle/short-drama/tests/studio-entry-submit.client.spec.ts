/** Project creation retries keep native submissions and attachments associated with one project. */
import { expect, it, vi } from 'vitest'
import type { ConversationSubmitRequest } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { DramaProjectId } from '../src/project-types.ts'
import { createStudioEntrySubmission } from '../src/client/studio-entry-submit.ts'

function setup() {
  const entry = 'entry' as SessionId, project = 'project' as DramaProjectId
  const state: { active: boolean; projectId: DramaProjectId | null; entrySessionId: SessionId; creationProjectId?: DramaProjectId } = {
    active: true, projectId: null, entrySessionId: entry,
  }
  const actions = { read: () => state, remember: (id: DramaProjectId) => { state.creationProjectId = id },
    create: vi.fn(async () => project), deliver: vi.fn(async () => ({ kind: 'success' as const })),
    accepted: vi.fn(async (id: DramaProjectId) => { state.projectId = id }), busy: () => new Error('busy') }
  const request: ConversationSubmitRequest = { sessionId: entry, text: 'A story', attachmentIds: [], mode: 'queue', signal: new AbortController().signal }
  return { state, actions, request, project, submit: createStudioEntrySubmission(actions) }
}

it('routes the first input to its project, then delegates ordinary project messages', async () => {
  const { actions, request, project, submit } = setup(), next = vi.fn(async () => ({ kind: 'success' as const }))
  await submit(request, next)
  expect(actions.deliver).toHaveBeenCalledExactlyOnceWith(project, request)
  expect(actions.accepted).toHaveBeenCalledExactlyOnceWith(project)
  expect(next).not.toHaveBeenCalled()
  await submit(request, next)
  expect(next).toHaveBeenCalledOnce()
  expect(actions.create).toHaveBeenCalledOnce()
})

it('retries rejected admission in the remembered project without changing the input', async () => {
  const { actions, request, project, submit } = setup()
  actions.deliver.mockRejectedValueOnce(new Error('offline'))
  await expect(submit(request, vi.fn())).rejects.toThrow('offline')
  expect(actions.accepted).not.toHaveBeenCalled()
  await submit(request, vi.fn())
  expect(actions.create).toHaveBeenCalledOnce()
  expect(actions.deliver).toHaveBeenLastCalledWith(project, request)
})

it('refuses simultaneous creation and delegates another Session', async () => {
  const { actions, request, submit } = setup(), waiting = Promise.withResolvers<undefined>()
  actions.create.mockImplementationOnce(async () => { await waiting.promise; return 'project' as DramaProjectId })
  const first = submit(request, vi.fn())
  await expect(submit(request, vi.fn())).rejects.toThrow('busy')
  const next = vi.fn(async () => ({ kind: 'success' as const }))
  await submit({ ...request, sessionId: 'other' as SessionId }, next)
  expect(next).toHaveBeenCalledOnce()
  waiting.resolve(undefined)
  await first
  expect(actions.create).toHaveBeenCalledOnce()
})

it('does not create a project for cancelled input', async () => {
  const { actions, request, submit } = setup(), controller = new AbortController()
  controller.abort()
  await expect(submit({ ...request, signal: controller.signal }, vi.fn())).rejects.toThrow()
  expect(actions.create).not.toHaveBeenCalled()
})
