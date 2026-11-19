import { brandString } from '@deepseek-ai/dsh-brand'
import { expect, it, vi } from 'vitest'
import { MediaJobs, type MediaJob, type MediaJobRequest, type MediaTargetId } from '../src/media-jobs.ts'
import type { MediaArtifactId, MediaProvider, MediaRequestId, MediaRoute, MediaTaskId } from '../src/media-provider.ts'
import type { DramaProjectId } from '../src/project-types.ts'

const first: MediaRoute = { endpoint: 'http://127.0.0.1:8188' }
const replacement: MediaRoute = { endpoint: 'https://execution.example' }
const request: MediaJobRequest = {
  id: brandString<MediaRequestId>('request-1'),
  projectId: brandString<DramaProjectId>('drama-1'),
  targetId: brandString<MediaTargetId>('shot-1'),
  sourceRevision: 3,
  workflowRevision: 'video-1',
  route: first,
  submission: { kind: 'video', input: { prompt: 'Slow pan' } },
}
const taskId = brandString<MediaTaskId>('task-1')
const outputs = [{ artifactId: brandString<MediaArtifactId>('clip-1'), mimeType: 'video/mp4' }]
const signal = new AbortController().signal

it('resubmits neither a repeated click nor an old job after the project changes providers', async () => {
  const records = new Map<MediaRequestId, MediaJob>()
  const table = {
    get: (id: MediaRequestId) => records.get(id),
    put: async (id: MediaRequestId, job: MediaJob) => { records.set(id, structuredClone(job)) },
  }
  const submit = vi.fn<MediaProvider['submit']>().mockImplementation(async (id) => {
    expect(records.get(id)?.status).toEqual({ state: 'submitting' })
    return { state: 'accepted', taskId }
  })
  const observe = vi.fn<MediaProvider['observe']>().mockResolvedValue({ state: 'succeeded', taskId, outputs })
  const resolve = vi.fn(async (_route: MediaRoute) => ({ submit, observe }))
  const jobs = new MediaJobs(table, resolve)
  await Promise.all([jobs.submit(request, signal), jobs.submit(request, signal)])
  expect(submit).toHaveBeenCalledTimes(1)

  const reopened = new MediaJobs(table, resolve)
  await expect(reopened.submit({ ...request, route: replacement }, signal)).rejects.toThrow('different inputs')
  await expect(reopened.observe(request.id, signal)).resolves.toMatchObject({
    route: first, status: { state: 'available', taskId, outputs },
  })
  expect(resolve).toHaveBeenLastCalledWith(first)
  expect(observe).toHaveBeenCalledWith({ requestId: request.id, taskId }, signal)
  expect(submit).toHaveBeenCalledTimes(1)
})

it('reconciles an interrupted submission by request ID without submitting again', async () => {
  let stored: MediaJob = { ...request, status: { state: 'submitting' } }
  const table = {
    get: () => stored,
    put: async (_id: MediaRequestId, job: MediaJob) => { stored = structuredClone(job) },
  }
  const submit = vi.fn<MediaProvider['submit']>()
  const observe = vi.fn<MediaProvider['observe']>()
    .mockResolvedValueOnce({ state: 'unknown', reason: 'not-found' })
    .mockResolvedValueOnce({ state: 'pending', taskId })
  const reopened = new MediaJobs(table, async () => ({ submit, observe }))
  await expect(reopened.submit(request, signal)).resolves.toMatchObject({
    status: { state: 'unknown', reason: 'interrupted' },
  })
  await expect(reopened.observe(request.id, signal)).resolves.toMatchObject({
    status: { state: 'unknown', reason: 'interrupted' },
  })
  await expect(reopened.observe(request.id, signal)).resolves.toMatchObject({
    status: { state: 'accepted', taskId },
  })
  expect(observe).toHaveBeenLastCalledWith({ requestId: request.id }, signal)
  expect(submit).not.toHaveBeenCalled()
})
