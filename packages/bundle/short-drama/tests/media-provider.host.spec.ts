import { brandString } from '@deepseek-ai/dsh-brand'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MediaProviderClient, type MediaConnection, type MediaRequestId, type MediaTaskId,
} from '../src/media-provider.ts'

const requestId = brandString<MediaRequestId>('request-1')
const taskId = brandString<MediaTaskId>('task-1')
const signal = new AbortController().signal
const connection: MediaConnection = {
  route: { endpoint: 'https://execution.example/media' }, timeoutMs: 1000, maxResponseBytes: 4096,
}

function requestUrl(input: Parameters<typeof fetch>[0] | undefined): string {
  if (!(input instanceof URL)) throw new Error('Expected the provider to pass a URL to fetch.')
  return input.href
}

afterEach(() => vi.unstubAllGlobals())

describe('short-drama media API', () => {
  it('reconciles a lost submission response through the original request key', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error('connection lost after request'))
      .mockResolvedValueOnce(Response.json({
        requestId, taskId, state: 'succeeded',
        outputs: [{ artifactId: 'clip-1', mimeType: 'video/mp4' }],
      }))
    vi.stubGlobal('fetch', fetch)
    const client = new MediaProviderClient({
      ...connection, route: { endpoint: 'http://127.0.0.1:8188/media' },
    })
    const submission = { kind: 'video', input: { prompt: 'Slow pan', duration: 4 } } as const

    await expect(client.submit(requestId, submission, signal)).resolves.toEqual({ state: 'unknown', reason: 'unavailable' })
    expect(requestUrl(fetch.mock.calls[0]?.[0])).toBe('http://127.0.0.1:8188/media/v1/jobs')
    const body = fetch.mock.calls[0]?.[1]?.body
    if (typeof body !== 'string') throw new Error('Expected the media submission as JSON.')
    expect(JSON.parse(body)).toEqual({ ...submission, requestId })
    await expect(client.observe({ requestId }, signal)).resolves.toEqual({
      state: 'succeeded', taskId, outputs: [{ artifactId: 'clip-1', mimeType: 'video/mp4' }],
    })
    expect(requestUrl(fetch.mock.calls[1]?.[0])).toBe(`http://127.0.0.1:8188/media/v1/jobs/by-request/${requestId}`)
    expect(fetch.mock.calls[1]?.[1]?.method).toBe('GET')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('uses the assigned task identity and only returns observations matched to the request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ requestId, taskId, state: 'accepted' }, { status: 202 }))
      .mockResolvedValueOnce(Response.json({ requestId: 'different-request', taskId, state: 'pending' }))
      .mockResolvedValueOnce(Response.json({ requestId, taskId, state: 'pending' }))
    vi.stubGlobal('fetch', fetch)
    const client = new MediaProviderClient({
      ...connection, route: { ...connection.route, credentialRef: brandString<CredentialRef>('MEDIA_TOKEN') },
      token: 'fixture',
    })
    const submission = { kind: 'voice', input: { text: 'A line of dialogue' } } as const

    await expect(client.submit(requestId, submission, signal)).resolves.toEqual({ state: 'accepted', taskId })
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('authorization')).toBe('Bearer fixture')
    expect(fetch.mock.calls[0]?.[1]?.redirect).toBe('error')
    await expect(client.observe({ requestId, taskId }, signal)).resolves.toEqual({ state: 'unknown', reason: 'invalid-response' })
    await expect(client.observe({ requestId, taskId }, signal)).resolves.toEqual({ state: 'pending', taskId })
    expect(requestUrl(fetch.mock.calls[2]?.[0])).toBe(`https://execution.example/media/v1/jobs/${taskId}`)
  })

  it('distinguishes an explicit rejection from uncertain acceptance and absent history', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ requestId, state: 'rejected', code: 'quota-exhausted' }, { status: 422 }))
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', fetch)
    const client = new MediaProviderClient(connection)
    const submission = { kind: 'image', input: {} } as const
    await expect(client.submit(requestId, submission, signal)).resolves.toEqual({ state: 'rejected', code: 'quota-exhausted' })
    await expect(client.submit(requestId, submission, signal)).resolves.toEqual({ state: 'unknown', reason: 'unavailable' })
    await expect(client.observe({ requestId }, signal)).resolves.toEqual({ state: 'unknown', reason: 'not-found' })
  })

  it('leaves acceptance unknown when a receipt exceeds the response budget', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(
      Response.json({ requestId, taskId, state: 'accepted' }),
    ))
    const client = new MediaProviderClient({ ...connection, maxResponseBytes: 10 })
    await expect(client.submit(requestId, { kind: 'image', input: {} }, signal))
      .resolves.toEqual({ state: 'unknown', reason: 'invalid-response' })
  })

  it('rejects cleartext remote endpoints, even ones starting with a loopback prefix', () => {
    expect(() => new MediaProviderClient({
      ...connection, route: { endpoint: 'http://127.example/media' },
    })).toThrow('HTTPS or loopback HTTP')
  })
})
