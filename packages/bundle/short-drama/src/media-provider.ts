/** Versioned HTTP adapter for the short-drama media capability. */
import { isIPv4 } from 'node:net'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { z } from 'zod'

/** Host-issued idempotency key used to submit and reconcile one generation. */
export type MediaRequestId = Branded<'MediaRequestId'>

/** Opaque job identity issued by the selected execution API. */
export type MediaTaskId = Branded<'MediaTaskId'>

/** Opaque artifact reference on the route that produced the media. */
export type MediaArtifactId = Branded<'MediaArtifactId'>

/** Immutable API address. A referenced credential is resolved separately by the Host. */
export interface MediaRoute {
  readonly endpoint: string
  /** Omit for anonymous execution. */
  readonly credentialRef?: CredentialRef
}

/** Business inputs resolved before dispatch. */
export interface MediaSubmission {
  readonly kind: 'image' | 'video' | 'voice'
  readonly input: Readonly<Record<string, JsonValue>>
}

/** Query by the original request ID until the execution API returns a task ID. */
export interface MediaLookup {
  readonly requestId: MediaRequestId
  readonly taskId?: MediaTaskId
}

/** Evidence missing from an unsuccessful API exchange. */
export type MediaUncertainty = 'unavailable' | 'invalid-response'

/** An inconclusive receipt leaves the original request eligible for lookup. */
export type MediaReceipt =
  | { state: 'accepted'; taskId: MediaTaskId }
  | { state: 'rejected'; code: string }
  | { state: 'unknown'; reason: MediaUncertainty }

/** Artifact metadata to resolve on the original route and archive in the project. */
export interface MediaOutput {
  artifactId: MediaArtifactId
  mimeType: string
}

/** A missing observation is inconclusive and cannot authorize a new attempt. */
export type MediaObservation =
  | { state: 'pending'; taskId: MediaTaskId }
  | { state: 'unknown'; reason: MediaUncertainty | 'not-found' }
  | { state: 'failed'; taskId: MediaTaskId; code: string }
  | { state: 'succeeded'; taskId: MediaTaskId; outputs: readonly MediaOutput[] }

/** Execution capability consumed by the durable media job controller. */
export interface MediaProvider {
  /**
   * Dispatch the already journaled request once.
   * @param id - Request ID retained by the execution API for reconciliation.
   * @param submission - Generation kind and resolved inputs.
   * @param signal - Host lifetime or user cancellation.
   * @returns The accepted task, definitive rejection, or uncertainty.
   */
  submit(id: MediaRequestId, submission: MediaSubmission, signal: AbortSignal): Promise<MediaReceipt>
  /**
   * Read the original request or its assigned task.
   * @param lookup - Original request ID and, when known, its assigned task ID.
   * @param signal - Host lifetime or user cancellation.
   * @returns A matched observation or the reason it could not be established.
   */
  observe(lookup: MediaLookup, signal: AbortSignal): Promise<MediaObservation>
}

/** Operator-configured HTTP policy for one connection. */
export interface MediaConnection {
  readonly route: MediaRoute
  /** Host-only bearer token, present when the route declares a credential reference. */
  readonly token?: string
  readonly timeoutMs: number
  readonly maxResponseBytes: number
}

const opaqueId = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/u)
const requestId = opaqueId.transform(brandString<MediaRequestId>)
const taskId = opaqueId.transform(brandString<MediaTaskId>)
const code = z.string().regex(/^[A-Za-z0-9_-]{1,48}$/u)
const receipt = z.discriminatedUnion('state', [
  z.object({ requestId, state: z.literal('accepted'), taskId }),
  z.object({ requestId, state: z.literal('rejected'), code }),
])
const observation = z.discriminatedUnion('state', [
  z.object({ requestId, taskId, state: z.literal('pending') }),
  z.object({ requestId, taskId, state: z.literal('failed'), code }),
  z.object({
    requestId, taskId, state: z.literal('succeeded'),
    outputs: z.array(z.object({
      artifactId: opaqueId.transform(brandString<MediaArtifactId>),
      mimeType: z.string().regex(/^(image|video|audio)\/[a-zA-Z0-9.+-]{1,64}$/u),
    })).min(1),
  }),
])

function endpointOf(value: string): URL {
  const endpoint = URL.parse(value)
  if (endpoint === null) throw new Error('Media API endpoint must be an absolute URL.')
  const host = endpoint.hostname
  const loopback = host === 'localhost' || host === '[::1]' || (isIPv4(host) && host.startsWith('127.'))
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash
    || (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && loopback))) {
    throw new Error('Media API requires HTTPS or loopback HTTP, without embedded credentials, query, or fragment.')
  }
  endpoint.pathname = endpoint.pathname.replace(/\/*$/u, '/')
  return endpoint
}

async function readBoundedJson(response: Response, limit: number): Promise<unknown> {
  if (response.body === null) return undefined
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let complete = false
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) {
        complete = true
        break
      }
      size += next.value.byteLength
      if (size > limit) return undefined
      chunks.push(next.value)
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)))
  } finally {
    if (!complete) void reader.cancel().catch((_error: unknown) => { /* A failed stream is already closed. */ })
    reader.releaseLock()
  }
}

type HttpReply =
  | { kind: 'response'; status: number; body: unknown }
  | { kind: 'unavailable' }

/**
 * Transport for a configured execution API. The Host owns credentials and
 * rejects redirects. The API accepts POST v1/jobs and serves GET v1/jobs/:taskId
 * and GET v1/jobs/by-request/:requestId.
 */
export class MediaProviderClient implements MediaProvider {
  private readonly endpoint: URL
  private readonly headers: Headers

  /** @param connection - Trusted route, resolved credential and HTTP budgets. */
  constructor(private readonly connection: MediaConnection) {
    this.endpoint = endpointOf(connection.route.endpoint)
    if ((connection.route.credentialRef === undefined) !== (connection.token === undefined)
      || (connection.token !== undefined && !/^[\x21-\x7e]+$/u.test(connection.token))) {
      throw new Error('The media API credential configuration is incomplete or invalid.')
    }
    if (!Number.isInteger(connection.timeoutMs) || connection.timeoutMs < 1 || connection.timeoutMs > 0x7fffffff
      || !Number.isSafeInteger(connection.maxResponseBytes) || connection.maxResponseBytes < 1) {
      throw new Error('Media API HTTP budgets must be positive integers.')
    }
    this.headers = new Headers({ accept: 'application/json' })
    if (connection.token !== undefined) this.headers.set('authorization', `Bearer ${connection.token}`)
  }

  private async request(path: string, signal: AbortSignal, body?: string): Promise<HttpReply> {
    signal.throwIfAborted()
    const headers = new Headers(this.headers)
    if (body !== undefined) headers.set('content-type', 'application/json')
    let response: Response
    try {
      response = await fetch(new URL(path, this.endpoint), {
        method: body === undefined ? 'GET' : 'POST',
        body: body ?? null,
        headers,
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.connection.timeoutMs)]),
      })
    } catch (_error) {
      // A transport failure can occur after the API accepts the job.
      return { kind: 'unavailable' }
    }
    let value: unknown
    try {
      value = await readBoundedJson(response, this.connection.maxResponseBytes)
    } catch (_error) {
      // The response status does not establish a receipt when the body cannot be read.
      value = undefined
    }
    return { kind: 'response', status: response.status, body: value }
  }

  async submit(id: MediaRequestId, submission: MediaSubmission, signal: AbortSignal): Promise<MediaReceipt> {
    const body = JSON.stringify({ ...submission, requestId: id })
    const reply = await this.request('v1/jobs', signal, body)
    if (reply.kind === 'unavailable' || reply.status >= 500) return { state: 'unknown', reason: 'unavailable' }
    const decoded = receipt.safeParse(reply.body)
    if (!decoded.success || decoded.data.requestId !== id) return { state: 'unknown', reason: 'invalid-response' }
    const result = decoded.data
    const ok = reply.status >= 200 && reply.status < 300
    if (result.state === 'accepted' && ok) return { state: 'accepted', taskId: result.taskId }
    if (result.state === 'rejected' && (ok || reply.status >= 400)) return { state: 'rejected', code: result.code }
    return { state: 'unknown', reason: 'invalid-response' }
  }

  async observe(lookup: MediaLookup, signal: AbortSignal): Promise<MediaObservation> {
    const path = lookup.taskId === undefined
      ? `v1/jobs/by-request/${encodeURIComponent(lookup.requestId)}`
      : `v1/jobs/${encodeURIComponent(lookup.taskId)}`
    const reply = await this.request(path, signal)
    if (reply.kind === 'unavailable' || reply.status >= 500) return { state: 'unknown', reason: 'unavailable' }
    if (reply.status === 404) return { state: 'unknown', reason: 'not-found' }
    const decoded = observation.safeParse(reply.body)
    if (reply.status < 200 || reply.status >= 300 || !decoded.success
      || decoded.data.requestId !== lookup.requestId
      || (lookup.taskId !== undefined && decoded.data.taskId !== lookup.taskId)) {
      return { state: 'unknown', reason: 'invalid-response' }
    }
    const { requestId: _requestId, ...result } = decoded.data
    return result
  }
}
