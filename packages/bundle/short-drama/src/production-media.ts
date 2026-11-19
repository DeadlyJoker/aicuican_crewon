/** Concrete execution APIs return media bytes; project ownership stays in CrewON. */
import { isIPv4, isIPv6 } from 'node:net'
import type { MediaRequestId } from './media-provider.ts'
import type { DramaMediaKind } from './production-types.ts'
import { z } from 'zod'

/** Resolved Host-only connection captured for one media attempt. */
export interface ExecutionConnection {
  protocol: 'openai-image' | 'openai-speech' | 'dashscope-video' | 'jobs-v1' | 'zealman'
  endpoint: string
  model: string
  voice?: string
  token?: string
  timeoutMs: number
  maxResponseBytes: number
}

/** Resolved bytes are supplied instead of public platform asset references. */
export interface ExecutionSubmission {
  kind: DramaMediaKind
  prompt: string
  references?: readonly { mimeType: string; bytes: Uint8Array }[]
  duration?: number
  size?: string
}

/** Only archived bytes or task identities leave the API adapter. */
export interface ExecutionResult {
  state: 'available' | 'pending' | 'unknown' | 'failed'
  taskId: string | null
  reason: string | null
  outputs: { bytes: Uint8Array; mimeType: string }[]
}

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u)
const codeSchema = z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/u)
const imageReply = z.object({
  data: z.array(z.object({ b64_json: z.string().optional(), url: z.string().optional() })).min(1).max(1),
})
const nativeVideoReply = z.object({
  output: z.object({
    task_id: idSchema, task_status: z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'UNKNOWN']),
    video_url: z.string().optional(), code: z.string().optional(),
  }),
})
const genericReply = z.discriminatedUnion('state', [
  z.object({ requestId: z.string(), taskId: idSchema, state: z.literal('accepted') }),
  z.object({ requestId: z.string(), state: z.literal('rejected'), code: codeSchema }),
  z.object({ requestId: z.string(), taskId: idSchema, state: z.literal('pending') }),
  z.object({ requestId: z.string(), taskId: idSchema, state: z.literal('failed'), code: codeSchema }),
  z.object({
    requestId: z.string(), taskId: idSchema, state: z.literal('succeeded'),
    outputs: z.array(z.object({ artifactId: idSchema, mimeType: z.string() })).min(1).max(1),
  }),
])

function result(state: ExecutionResult['state'], taskId: string | null = null, reason: string | null = null): ExecutionResult {
  return { state, taskId, reason, outputs: [] }
}

function loopback(host: string): boolean {
  return host === 'localhost' || host === '[::1]' || isIPv4(host) && host.startsWith('127.')
}

function apiUrl(value: string): URL {
  const url = URL.parse(value)
  if (url === null || url.username || url.password || url.search || url.hash
    || url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback(url.hostname))) {
    throw new Error('Media API requires HTTPS or loopback HTTP without URL credentials, query or fragment.')
  }
  url.pathname = url.pathname.replace(/\/*$/u, '/')
  return url
}

function outputUrl(value: string, endpoint: URL): URL {
  const url = URL.parse(value)
  if (url === null || url.username || url.password || url.hash) throw new Error('Invalid media output URL.')
  if (url.origin === endpoint.origin) return url
  const host = url.hostname
  if (url.protocol !== 'https:' || loopback(host) || isIPv6(host.replace(/^\[|\]$/gu, ''))
    || isIPv4(host) && /^(?:0\.|10\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)/u.test(host)) {
    throw new Error('Media output must use a public HTTPS URL or the configured API origin.')
  }
  return url
}

async function bytesOf(response: Response, limit: number): Promise<Uint8Array> {
  if (response.body === null) throw new Error('The media API returned no content.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let complete = false
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) { complete = true; break }
      size += chunk.value.byteLength
      if (size > limit) throw new Error('The media response exceeds its configured byte limit.')
      chunks.push(chunk.value)
    }
    if (size === 0) throw new Error('The media API returned empty content.')
    return Buffer.concat(chunks, size)
  } finally {
    if (!complete) void reader.cancel().catch((_error: unknown) => { /* A failed or cancelled stream is already closed. */ })
    reader.releaseLock()
  }
}

async function jsonOf(response: Response, limit: number): Promise<unknown> {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await bytesOf(response, limit)))
}

class MediaHttp {
  readonly endpoint: URL
  private readonly headers: Headers

  constructor(readonly connection: ExecutionConnection) {
    this.endpoint = apiUrl(connection.endpoint)
    if (!connection.model.trim() || !Number.isSafeInteger(connection.timeoutMs) || connection.timeoutMs < 1
      || connection.timeoutMs > 0x7fffffff || !Number.isSafeInteger(connection.maxResponseBytes) || connection.maxResponseBytes < 1
      || connection.token !== undefined && !/^[\x21-\x7e]+$/u.test(connection.token)) {
      throw new Error('The media API connection is incomplete or its budgets are invalid.')
    }
    this.headers = new Headers()
    if (connection.token !== undefined) this.headers.set('authorization', `Bearer ${connection.token}`)
  }

  async request(path: string, signal: AbortSignal, body?: string | FormData, extra?: HeadersInit): Promise<Response> {
    signal.throwIfAborted()
    const headers = new Headers(this.headers)
    if (typeof body === 'string') headers.set('content-type', 'application/json')
    new Headers(extra).forEach((value, key) => { headers.set(key, value) })
    return fetch(new URL(path, this.endpoint), {
      method: body === undefined ? 'GET' : 'POST', headers, body: body ?? null, redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(this.connection.timeoutMs)]),
    })
  }

  async download(value: string, signal: AbortSignal): Promise<Uint8Array> {
    const url = outputUrl(value, this.endpoint)
    const response = await fetch(url, {
      redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(this.connection.timeoutMs)]),
    })
    if (!response.ok) throw new Error('The generated media could not be downloaded.')
    return bytesOf(response, this.connection.maxResponseBytes)
  }
}

function mediaType(response: Response, kind: DramaMediaKind): string {
  const raw = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  const expected = kind === 'voice' ? 'audio/' : `${kind}/`
  if (!raw?.startsWith(expected)) throw new Error('The media API returned an unexpected content type.')
  return raw
}

function rejected(response: Response): ExecutionResult | undefined {
  return response.status >= 400 && response.status < 500 && response.status !== 408
    ? result('failed', null, `http-${response.status}`) : response.ok ? undefined : result('unknown', null, 'upstream-unavailable')
}

function imageBody(submission: ExecutionSubmission, connection: ExecutionConnection): string | FormData {
  const references = submission.references ?? []
  if (!references.length) {
    return JSON.stringify({ model: connection.model, prompt: submission.prompt, n: 1, output_format: 'png', ...submission.size ? { size: submission.size } : {} })
  }
  const form = new FormData()
  form.set('model', connection.model)
  form.set('prompt', submission.prompt)
  form.set('n', '1')
  form.set('output_format', 'png')
  if (submission.size) form.set('size', submission.size)
  for (const [index, reference] of references.entries()) {
    if (!/^image\/(png|jpeg|webp)$/u.test(reference.mimeType)) throw new Error('Image references must be PNG, JPEG or WebP.')
    form.append('image[]', new Blob([Uint8Array.from(reference.bytes)], { type: reference.mimeType }), `reference-${index}.${reference.mimeType.split('/')[1]}`)
  }
  return form
}

async function image(http: MediaHttp, submission: ExecutionSubmission, id: MediaRequestId, signal: AbortSignal): Promise<ExecutionResult> {
  const path = submission.references?.length ? 'images/edits' : 'images/generations'
  const response = await http.request(path, signal, imageBody(submission, http.connection), { 'X-Client-Request-Id': id })
  const denied = rejected(response)
  if (denied) return denied
  const decoded = imageReply.parse(await jsonOf(response, http.connection.maxResponseBytes))
  const item = decoded.data[0]
  if (item === undefined) throw new Error('No image output.')
  let bytes: Uint8Array
  if (item.b64_json !== undefined) {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(item.b64_json)) throw new Error('Invalid encoded image.')
    bytes = Buffer.from(item.b64_json, 'base64')
  } else if (item.url !== undefined) bytes = await http.download(item.url, signal)
  else throw new Error('No image output.')
  if (!bytes.byteLength || bytes.byteLength > http.connection.maxResponseBytes) throw new Error('Invalid image output size.')
  return { state: 'available', taskId: null, reason: null, outputs: [{ bytes, mimeType: 'image/png' }] }
}

async function speech(http: MediaHttp, submission: ExecutionSubmission, id: MediaRequestId, signal: AbortSignal): Promise<ExecutionResult> {
  if (!http.connection.voice?.trim()) throw new Error('A voice must be selected for speech generation.')
  const response = await http.request('audio/speech', signal, JSON.stringify({
    model: http.connection.model, input: submission.prompt, voice: http.connection.voice, response_format: 'wav',
  }), { 'X-Client-Request-Id': id })
  const denied = rejected(response)
  if (denied) return denied
  // Speech APIs also use application/octet-stream for the requested WAV payload.
  const mimeType = response.headers.get('content-type')?.split(';')[0] === 'application/octet-stream' ? 'audio/wav' : mediaType(response, 'voice')
  return { state: 'available', taskId: null, reason: null, outputs: [{ bytes: await bytesOf(response, http.connection.maxResponseBytes), mimeType }] }
}

async function videoResult(http: MediaHttp, response: Response, signal: AbortSignal, taskId: string | null): Promise<ExecutionResult> {
  const denied = rejected(response)
  if (denied) return { ...denied, taskId }
  const { output } = nativeVideoReply.parse(await jsonOf(response, http.connection.maxResponseBytes))
  if (taskId !== null && output.task_id !== taskId) throw new Error('The video task identity does not match the saved attempt.')
  if (output.task_status === 'SUCCEEDED') {
    if (output.video_url === undefined) throw new Error('The finished video has no output URL.')
    try {
      const bytes = await http.download(output.video_url, signal)
      return { state: 'available', taskId: output.task_id, reason: null, outputs: [{ bytes, mimeType: 'video/mp4' }] }
    } catch (_error) {
      // Keep the accepted task so a later observation can download its output.
      return result('pending', output.task_id, 'output-unavailable')
    }
  }
  if (output.task_status === 'FAILED' || output.task_status === 'CANCELED') {
    const code = codeSchema.safeParse(output.code)
    return result('failed', output.task_id, code.success ? code.data : 'video-generation-failed')
  }
  return result(output.task_status === 'UNKNOWN' ? 'unknown' : 'pending', output.task_id, output.task_status === 'UNKNOWN' ? 'task-unavailable' : null)
}

async function genericResult(
  http: MediaHttp, response: Response, requestId: MediaRequestId, signal: AbortSignal, taskId: string | null,
): Promise<ExecutionResult> {
  const denied = rejected(response)
  if (denied) return { ...denied, taskId }
  const decoded = genericReply.parse(await jsonOf(response, http.connection.maxResponseBytes))
  if (decoded.requestId !== requestId || ('taskId' in decoded && taskId !== null && decoded.taskId !== taskId)) throw new Error('The media receipt does not match its request.')
  switch (decoded.state) {
    case 'accepted':
    case 'pending': return result('pending', decoded.taskId)
    case 'rejected': return result('failed', null, decoded.code)
    case 'failed': return result('failed', decoded.taskId, decoded.code)
    case 'succeeded': {
      const outputs = []
      try {
        for (const output of decoded.outputs) {
          const artifact = await http.request(`v1/artifacts/${encodeURIComponent(output.artifactId)}`, signal)
          if (!artifact.ok) throw new Error('The finished media artifact is not available.')
          outputs.push({ bytes: await bytesOf(artifact, http.connection.maxResponseBytes), mimeType: output.mimeType })
        }
      } catch (_error) {
        // An accepted task may be queried again when artifact download fails.
        return result('pending', decoded.taskId, 'output-unavailable')
      }
      return { state: 'available', taskId: decoded.taskId, reason: null, outputs }
    }
  }
}

const workflowConfig = z.object({
  success: z.literal(true),
  api_config: z.object({ enabledParams: z.record(z.string(), z.boolean()), customLabels: z.record(z.string(), z.string()).optional() }),
})
const workflowResult = z.object({
  success: z.boolean(), pending: z.boolean().optional(), prompt_id: idSchema.optional(), error: z.unknown().optional(),
  results: z.array(z.object({ type: z.string(), url: z.string().optional() })).optional(),
})

async function zealmanSubmit(
  http: MediaHttp, submission: ExecutionSubmission, requestId: MediaRequestId, signal: AbortSignal,
): Promise<ExecutionResult> {
  const configReply = await http.request(`api/workflow/config/${encodeURIComponent(http.connection.model)}`, signal)
  if (!configReply.ok) return result('failed', null, 'workflow-unavailable')
  const config = workflowConfig.parse(await jsonOf(configReply, http.connection.maxResponseBytes))
  const fields = Object.entries(config.api_config.enabledParams).filter(([, enabled]) => enabled).map(([key]) => key)
  const fieldName = (key: string) => key.slice(key.indexOf(':') + 1)
  const prompts = fields.filter(key => ['prompt', 'text', 'positive'].includes(fieldName(key))
    && (['prompt', 'positive'].includes(fieldName(key)) || /提示词/u.test(config.api_config.customLabels?.[key] ?? '')))
  if (prompts.length !== 1) return result('failed', null, 'workflow-prompt-ambiguous')
  const promptField = prompts[0]
  if (promptField === undefined) return result('failed', null, 'workflow-prompt-missing')
  const inputs: Record<string, string | number | boolean> = { [promptField]: submission.prompt }
  const refs = submission.references ?? []
  for (const kind of ['image', 'audio', 'video'] as const) {
    const media = refs.filter(ref => ref.mimeType.startsWith(kind + '/'))
    const slots = fields.filter(key => new RegExp(`^ref_${kind}_\\d+$`, 'u').test(fieldName(key))
      || kind === 'audio' && fieldName(key) === 'audio' || kind === 'image' && fieldName(key) === 'image')
      .sort((a, b) => (config.api_config.customLabels?.[a] ?? a).localeCompare(config.api_config.customLabels?.[b] ?? b, 'en', { numeric: true }))
    for (const [index, slot] of slots.entries()) {
      const toggle = slot.slice(0, slot.lastIndexOf(':') + 1) + 'enabled'
      if (fields.includes(toggle)) inputs[toggle] = index < media.length
    }
    if (kind === 'image' && submission.kind === 'video' && slots.length && !media.length) {
      return result('failed', null, 'workflow-reference-required')
    }
    if (media.length > slots.length) return result('failed', null, 'workflow-reference-unsupported')
    if (kind === 'audio' && submission.kind === 'voice' && slots.length && !media.length) {
      return result('failed', null, 'reference-audio-required')
    }
    for (const [index, ref] of media.entries()) {
      const form = new FormData()
      form.set('file', new Blob([Uint8Array.from(ref.bytes)], { type: ref.mimeType }), `${requestId}-${kind}-${index}.${ref.mimeType.split('/')[1]}`)
      const upload = await http.request('api/comfy/upload/file', signal, form)
      if (!upload.ok) return result('failed', null, 'reference-upload-failed')
      const saved = z.object({ name: z.string().min(1) }).parse(await jsonOf(upload, http.connection.maxResponseBytes))
      const slot = slots[index]
      if (slot === undefined) throw new Error('Workflow reference slot missing.')
      inputs[slot] = saved.name
    }
  }
  for (const key of fields) {
    if (fieldName(key) === 'seconds' && submission.duration !== undefined) inputs[key] = submission.duration
    if (fieldName(key) === 'aspect_ratio' && submission.size) inputs[key] = submission.size
  }
  const response = await http.request('api/workflow/generate', signal, JSON.stringify({
    workflow_id: http.connection.model, input_values: inputs, client_id: requestId,
  }))
  const denied = rejected(response)
  if (denied) return denied
  const receiptSchema = z.object({ success: z.boolean(), prompt_id: idSchema.optional() })
  const receipt = receiptSchema.parse(await jsonOf(response, http.connection.maxResponseBytes))
  return receipt.success && receipt.prompt_id ? result('pending', receipt.prompt_id)
    : result('failed', null, 'workflow-rejected')
}

async function zealmanObserve(http: MediaHttp, kind: DramaMediaKind, taskId: string | null, signal: AbortSignal): Promise<ExecutionResult> {
  if (taskId === null) return result('unknown', null, 'acceptance-unresolved')
  const path = `api/workflow/result?prompt_id=${encodeURIComponent(taskId)}`
  const read = async () => {
    const response = await http.request(path, signal)
    if (!response.ok) throw new Error('Workflow observation unavailable.')
    return workflowResult.parse(await jsonOf(response, http.connection.maxResponseBytes))
  }
  let observed = await read()
  if (observed.prompt_id !== undefined && observed.prompt_id !== taskId) throw new Error('Workflow task mismatch.')
  if (observed.pending) {
    const queueReply = await http.request('api/comfy/queue-status', signal)
    if (!queueReply.ok) return result('unknown', taskId, 'observation-unavailable')
    const queue = z.object({ prompt_ids: z.array(z.string()) }).parse(await jsonOf(queueReply, http.connection.maxResponseBytes))
    if (queue.prompt_ids.includes(taskId)) return result('pending', taskId)
    observed = await read()
    if (observed.pending) return result('unknown', taskId, 'remote-history-unavailable')
  }
  if (!observed.success || observed.error !== undefined) return result('failed', taskId, 'workflow-execution-failed')
  const expected = kind === 'voice' ? 'audio' : kind
  const output = observed.results?.filter(item => item.type === expected && item.url).at(-1)
  if (!output?.url) return result('failed', taskId, 'workflow-output-missing')
  const url = new URL(output.url, http.endpoint)
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.flac': 'audio/flac' }
  const extension = /\.[a-z0-9]+$/u.exec(url.pathname)?.[0]
  const mimeType = extension && Object.entries(mime).find(([key]) => key === extension)?.[1]
  if (!mimeType?.startsWith(expected + '/')) return result('failed', taskId, 'workflow-output-type')
  try {
    return { state: 'available', taskId, reason: null, outputs: [{ bytes: await http.download(url.href, signal), mimeType }] }
  } catch (_error) {
    // Retain the completed remote task when download fails so archival can be retried.
    return result('pending', taskId, 'output-unavailable')
  }
}

/**
 * Submit once after the Host has persisted its attempt. Never automatically retry a POST.
 * @param connection - Captured API route with its currently resolved credential.
 * @param submission - Creative inputs resolved by the owning project.
 * @param requestId - Stable identity of the journaled attempt.
 * @param signal - Owning Host or user cancellation.
 * @returns Media bytes, an accepted task, a definitive rejection, or unresolved acceptance.
 */
export async function executeMedia(
  connection: ExecutionConnection, submission: ExecutionSubmission, requestId: MediaRequestId, signal: AbortSignal,
): Promise<ExecutionResult> {
  const http = new MediaHttp(connection)
  signal.throwIfAborted()
  const kinds = { 'openai-image': 'image', 'openai-speech': 'voice', 'dashscope-video': 'video', 'jobs-v1': submission.kind, zealman: submission.kind }
  if (kinds[connection.protocol] !== submission.kind) return result('failed', null, 'unsupported-output-kind')
  if (!submission.prompt.trim()) return result('failed', null, 'missing-prompt')
  if (connection.protocol === 'openai-speech' && !connection.voice?.trim()) return result('failed', null, 'missing-voice')
  if (connection.protocol === 'dashscope-video' && (submission.references?.length ?? 0) > 1) {
    return result('failed', null, 'use-adopted-first-frame')
  }
  try {
    switch (connection.protocol) {
      case 'zealman': return await zealmanSubmit(http, submission, requestId, signal)
      case 'openai-image':
        return await image(http, submission, requestId, signal)
      case 'openai-speech':
        return await speech(http, submission, requestId, signal)
      case 'dashscope-video': {
        const reference = submission.references?.[0]
        const imgUrl = reference ? `data:${reference.mimeType};base64,${Buffer.from(reference.bytes).toString('base64')}` : undefined
        const currentProtocol = /^wan(?:2\.7|3\.)/u.test(connection.model)
        const inputReference = imgUrl
          ? currentProtocol ? { media: [{ type: 'image', url: imgUrl }] } : { img_url: imgUrl }
          : {}
        const parameters = {
          prompt_extend: false,
          ...submission.duration !== undefined ? { duration: submission.duration } : {},
          ...submission.size ? { size: submission.size } : {},
        }
        const response = await http.request('api/v1/services/aigc/video-generation/video-synthesis', signal, JSON.stringify({
          model: connection.model, input: { prompt: submission.prompt, ...inputReference }, parameters,
        }), { 'X-DashScope-Async': 'enable', 'X-Client-Request-Id': requestId })
        return await videoResult(http, response, signal, null)
      }
      case 'jobs-v1': {
        const references = submission.references?.map(reference => ({
          mimeType: reference.mimeType, base64: Buffer.from(reference.bytes).toString('base64'),
        }))
        const response = await http.request('v1/jobs', signal, JSON.stringify({
          requestId, kind: submission.kind, input: { model: connection.model, prompt: submission.prompt,
            ...connection.voice ? { voice: connection.voice } : {}, ...references ? { references } : {},
            ...submission.duration !== undefined ? { duration: submission.duration } : {},
            ...submission.size ? { size: submission.size } : {},
          },
        }))
        return await genericResult(http, response, requestId, signal, null)
      }
    }
  } catch (_error) {
    // The server may have accepted the request before the connection or output archival failed.
    return result('unknown', null, signal.aborted ? 'interrupted' : 'acceptance-unresolved')
  }
}

/**
 * Query a persisted task without issuing another generation request.
 * @param connection - The original attempt's API settings and current credential.
 * @param kind - Requested output kind.
 * @param requestId - Original request identity.
 * @param taskId - Assigned task identity, when an acceptance receipt was saved.
 * @param signal - Owning Host or user cancellation.
 * @returns Latest output bytes or task state. Synchronous APIs cannot reconcile a lost response.
 */
export async function observeMedia(
  connection: ExecutionConnection, kind: DramaMediaKind, requestId: MediaRequestId, taskId: string | null, signal: AbortSignal,
): Promise<ExecutionResult> {
  const http = new MediaHttp(connection)
  signal.throwIfAborted()
  try {
    if (connection.protocol === 'zealman') return await zealmanObserve(http, kind, taskId, signal)
    if (connection.protocol === 'dashscope-video') {
      if (kind !== 'video' || taskId === null) return result('unknown', taskId, 'acceptance-unresolved')
      const response = await http.request(`api/v1/tasks/${encodeURIComponent(taskId)}`, signal)
      if (!response.ok) return result('unknown', taskId, response.status === 404 ? 'task-unavailable' : 'observation-unavailable')
      return await videoResult(http, response, signal, taskId)
    }
    if (connection.protocol === 'jobs-v1') {
      const path = taskId === null ? `v1/jobs/by-request/${encodeURIComponent(requestId)}` : `v1/jobs/${encodeURIComponent(taskId)}`
      const response = await http.request(path, signal)
      if (!response.ok) return result('unknown', taskId, response.status === 404 ? 'task-unavailable' : 'observation-unavailable')
      return await genericResult(http, response, requestId, signal, taskId)
    }
    return result('unknown', taskId, 'synchronous-response-lost')
  } catch (_error) {
    // A failed observation leaves the saved attempt intact and never permits another submission.
    return result('unknown', taskId, signal.aborted ? 'interrupted' : 'observation-unavailable')
  }
}
