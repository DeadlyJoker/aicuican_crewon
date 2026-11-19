/** Execution adapters pin real protocol fields and recovery without repeating generation. */
import { brandString } from '@deepseek-ai/dsh-brand'
import { afterEach, expect, it, vi } from 'vitest'
import { executeMedia, observeMedia, type ExecutionConnection } from '../src/production-media.ts'
import type { MediaRequestId } from '../src/media-provider.ts'

const id = brandString<MediaRequestId>('request-1')
const signal = new AbortController().signal
const connection: ExecutionConnection = {
  protocol: 'openai-image', endpoint: 'https://api.example/v1/', model: 'image-model',
  token: 'test-only', timeoutMs: 1000, maxResponseBytes: 4096,
}

afterEach(() => vi.unstubAllGlobals())

function bodyOf(fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>, index: number): unknown {
  const body = fetch.mock.calls[index]?.[1]?.body
  if (typeof body !== 'string') throw new Error('Expected a JSON request body.')
  return JSON.parse(body)
}

it('executes the image endpoint and returns bytes without leaking response URLs', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json({ data: [{ b64_json: 'cG5n' }] }))
  vi.stubGlobal('fetch', fetch)
  await expect(executeMedia(connection, { kind: 'image', prompt: 'Station at night' }, id, signal)).resolves.toMatchObject({
    state: 'available', outputs: [{ bytes: Buffer.from('png'), mimeType: 'image/png' }],
  })
  expect(fetch.mock.calls[0]?.[0]).toEqual(new URL('https://api.example/v1/images/generations'))
  expect(bodyOf(fetch, 0)).toEqual({ model: 'image-model', prompt: 'Station at night', n: 1, output_format: 'png' })
  expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('authorization')).toBe('Bearer test-only')
  expect(fetch.mock.calls[0]?.[1]?.redirect).toBe('error')
})

it('sends resolved character and scene references to image edits', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json({ data: [{ b64_json: 'cG5n' }] }))
  vi.stubGlobal('fetch', fetch)
  await executeMedia(connection, {
    kind: 'image', prompt: 'Use the adopted references',
    references: [{ mimeType: 'image/png', bytes: Buffer.from('character') }, { mimeType: 'image/jpeg', bytes: Buffer.from('scene') }],
  }, id, signal)
  expect(fetch.mock.calls[0]?.[0]).toEqual(new URL('https://api.example/v1/images/edits'))
  const body = fetch.mock.calls[0]?.[1]?.body
  if (!(body instanceof FormData)) throw new Error('Expected a multipart edit request.')
  expect(body.getAll('image[]')).toHaveLength(2)
  expect(body.get('prompt')).toBe('Use the adopted references')
})

it('archives speech bytes from the native binary response', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(new Response(Buffer.from('WAV'), {
    headers: { 'content-type': 'application/octet-stream' },
  }))
  vi.stubGlobal('fetch', fetch)
  const speech = { ...connection, protocol: 'openai-speech', model: 'speech-model', voice: 'alloy' } as const
  await expect(executeMedia(speech, { kind: 'voice', prompt: 'Wait for the last light.' }, id, signal)).resolves.toMatchObject({
    state: 'available', outputs: [{ mimeType: 'audio/wav', bytes: Buffer.from('WAV') }],
  })
  expect(bodyOf(fetch, 0)).toEqual({ model: 'speech-model', input: 'Wait for the last light.', voice: 'alloy', response_format: 'wav' })
})

it('keeps the video task after an output outage and retrieves it without a second POST', async () => {
  const video: ExecutionConnection = { ...connection, protocol: 'dashscope-video', endpoint: 'http://127.0.0.1:9000/', model: 'wan2.6-i2v' }
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ output: { task_id: 'task-1', task_status: 'PENDING' } }))
    .mockResolvedValueOnce(Response.json({ output: { task_id: 'task-1', task_status: 'SUCCEEDED', video_url: 'https://cdn.example/clip.mp4' } }))
    .mockRejectedValueOnce(new Error('CDN unavailable'))
    .mockResolvedValueOnce(Response.json({ output: { task_id: 'task-1', task_status: 'SUCCEEDED', video_url: 'https://cdn.example/clip.mp4' } }))
    .mockResolvedValueOnce(new Response(Buffer.from('MP4')))
  vi.stubGlobal('fetch', fetch)
  const submission = { kind: 'video', prompt: 'Slow pan across platform', duration: 5 } as const
  await expect(executeMedia(video, submission, id, signal)).resolves.toMatchObject({ state: 'pending', taskId: 'task-1' })
  expect(bodyOf(fetch, 0)).toEqual({
    model: 'wan2.6-i2v', input: { prompt: submission.prompt }, parameters: { duration: 5, prompt_extend: false },
  })
  await expect(observeMedia(video, 'video', id, 'task-1', signal)).resolves.toMatchObject({
    state: 'pending', taskId: 'task-1', reason: 'output-unavailable',
  })
  await expect(observeMedia(video, 'video', id, 'task-1', signal)).resolves.toMatchObject({
    state: 'available', taskId: 'task-1', outputs: [{ mimeType: 'video/mp4', bytes: Buffer.from('MP4') }],
  })
  expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
  expect(new Headers(fetch.mock.calls[4]?.[1]?.headers).has('authorization')).toBe(false)
})

it('reports a lost synchronous response as unresolved and never resubmits during observation', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValueOnce(new Error('Response lost'))
  vi.stubGlobal('fetch', fetch)
  await expect(executeMedia(connection, { kind: 'image', prompt: 'A lit window' }, id, signal)).resolves.toMatchObject({
    state: 'unknown', reason: 'acceptance-unresolved',
  })
  await expect(observeMedia(connection, 'image', id, null, signal)).resolves.toMatchObject({
    state: 'unknown', reason: 'synchronous-response-lost',
  })
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('bounds the complete response and does not download malformed or private output URLs', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ data: [{ b64_json: 'cG5n' }] }))
    .mockResolvedValueOnce(Response.json({ data: [{ url: 'http://169.254.169.254/metadata' }] }))
  vi.stubGlobal('fetch', fetch)
  await expect(executeMedia({ ...connection, maxResponseBytes: 5 }, { kind: 'image', prompt: 'A light' }, id, signal))
    .resolves.toMatchObject({ state: 'unknown' })
  await expect(executeMedia(connection, { kind: 'image', prompt: 'A light' }, id, signal)).resolves.toMatchObject({ state: 'unknown' })
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('reconciles generic jobs by request key and fetches artifacts with the original route credentials', async () => {
  const jobs = { ...connection, protocol: 'jobs-v1', endpoint: 'https://execution.example/' } as const
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({
      requestId: id, taskId: 'task-2', state: 'succeeded', outputs: [{ artifactId: 'result-2', mimeType: 'image/png' }],
    }))
    .mockResolvedValueOnce(new Response(Buffer.from('png')))
  vi.stubGlobal('fetch', fetch)
  await expect(observeMedia(jobs, 'image', id, null, signal)).resolves.toMatchObject({
    state: 'available', taskId: 'task-2', outputs: [{ bytes: Buffer.from('png'), mimeType: 'image/png' }],
  })
  expect(fetch.mock.calls[0]?.[0]).toEqual(new URL('https://execution.example/v1/jobs/by-request/request-1'))
  expect(fetch.mock.calls[1]?.[0]).toEqual(new URL('https://execution.example/v1/artifacts/result-2'))
  expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get('authorization')).toBe('Bearer test-only')
})

it('rejects an unsupported output before making a billable request', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
  vi.stubGlobal('fetch', fetch)
  await expect(executeMedia(connection, { kind: 'video', prompt: 'A light' }, id, signal)).resolves.toMatchObject({
    state: 'failed', reason: 'unsupported-output-kind',
  })
  expect(fetch).not.toHaveBeenCalled()
})

it('keeps an existing attempt unresolved when polling is unavailable or its receipt expired', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
  vi.stubGlobal('fetch', fetch)
  const video = { ...connection, protocol: 'dashscope-video' } as const
  await expect(observeMedia(video, 'video', id, 'task-1', signal)).resolves.toMatchObject({
    state: 'unknown', taskId: 'task-1', reason: 'task-unavailable',
  })
  await expect(observeMedia({ ...connection, protocol: 'jobs-v1' }, 'image', id, null, signal)).resolves.toMatchObject({
    state: 'unknown', reason: 'observation-unavailable',
  })
  expect(fetch.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true)
})

it('binds the configured workflow fields and uploads references in their reviewed order', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ success: true, api_config: { enabledParams: {
      '403:ref_image_1': true, '403:ref_image_0': true, '403:prompt': true, '403:seconds': true, '411:weight_dtype': false,
    } } }))
    .mockResolvedValueOnce(Response.json({ name: 'first.png' }))
    .mockResolvedValueOnce(Response.json({ name: 'second.png' }))
    .mockResolvedValueOnce(Response.json({ success: true, prompt_id: 'remote-task' }))
  vi.stubGlobal('fetch', fetch)
  await expect(executeMedia({ ...connection, protocol: 'zealman', model: 'U22', endpoint: 'https://api.example/' }, {
    kind: 'video', prompt: '图1为人物，图2为场景', duration: 6,
    references: [{ mimeType: 'image/png', bytes: Buffer.from('first') }, { mimeType: 'image/png', bytes: Buffer.from('second') }],
  }, id, signal)).resolves.toMatchObject({ state: 'pending', taskId: 'remote-task' })
  expect(bodyOf(fetch, 3)).toEqual({ workflow_id: 'U22', client_id: id, input_values: {
    '403:ref_image_0': 'first.png', '403:ref_image_1': 'second.png', '403:prompt': '图1为人物，图2为场景', '403:seconds': 6,
  } })
})

it('marks a lost remote history as unknown without submitting a replacement', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ success: true, pending: true, results: [] }))
    .mockResolvedValueOnce(Response.json({ prompt_ids: [] }))
    .mockResolvedValueOnce(Response.json({ success: true, pending: true, results: [] }))
  vi.stubGlobal('fetch', fetch)
  await expect(observeMedia({ ...connection, protocol: 'zealman' }, 'video', id, 'remote-task', signal))
    .resolves.toMatchObject({ state: 'unknown', taskId: 'remote-task', reason: 'remote-history-unavailable' })
  expect(fetch.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true)
})

it('downloads the completed workflow video into owned bytes', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ success: true, pending: false, prompt_id: 'remote-task', results: [
      { type: 'image', url: '/output/preview.png' }, { type: 'video', url: '/output/episode.mp4' },
    ] }))
    .mockResolvedValueOnce(new Response('video-bytes'))
  vi.stubGlobal('fetch', fetch)
  await expect(observeMedia({ ...connection, protocol: 'zealman' }, 'video', id, 'remote-task', signal))
    .resolves.toMatchObject({ state: 'available', outputs: [{ bytes: Buffer.from('video-bytes'), mimeType: 'video/mp4' }] })
  expect(fetch.mock.calls[1]?.[0]).toEqual(new URL('https://api.example/output/episode.mp4'))
})

it('requires an explicit reference for a voice-cloning workflow before generation', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json({ success: true, api_config: {
    enabledParams: { '21:audio': true, '25:text': true }, customLabels: { '25:text': '提示词' },
  } }))
  vi.stubGlobal('fetch', fetch)
  await expect(executeMedia({ ...connection, protocol: 'zealman' }, { kind: 'voice', prompt: '等风来。' }, id, signal))
    .resolves.toMatchObject({ state: 'failed', reason: 'reference-audio-required' })
  expect(fetch).toHaveBeenCalledTimes(1)
})
