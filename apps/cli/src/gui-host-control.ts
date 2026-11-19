/** Private authenticated control and event transport shared by the Web Host and Electron shell. */
import { randomUUID, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { isLoopbackHost } from '@deepseek-ai/dsh-host-webserver'
import type { PlatformSession } from '@deepseek-ai/dsh-deepseek-account'
import type { PluginOperationRunId } from '@deepseek-ai/dsh-plugin-manager/diagnostic'
import type {} from '@deepseek-ai/dsh-client-connection'
import { localDragResource } from './gui-host/file-drag.ts'
import { installOperationDiagnostics } from './gui-host/operation-diagnostics.ts'
import { installPlatformSessionPublisher } from './gui-host/platform-session.ts'
import { installDesktopQuitInspection } from './gui-host/quit-inspection.ts'
import { installDesktopUpdateTaskControl } from './gui-host/update-tasks.ts'
import type { GuiHostReady, GuiControlRequest, GuiControlResponse, GuiHostEvent } from './gui-host/protocol.ts'

export { parseGuiHostReady, parseGuiHostEvent, parseGuiControlResponse } from './gui-host/protocol.ts'
export type { GuiHostReady, GuiControlRequest, GuiControlResponse, GuiHostEvent } from './gui-host/protocol.ts'

export { localDragResource } from './gui-host/file-drag.ts'
export type { LocalDragResource } from './gui-host/file-drag.ts'
export { installOperationDiagnostics } from './gui-host/operation-diagnostics.ts'
export { installPlatformSessionPublisher } from './gui-host/platform-session.ts'
export { installDesktopQuitInspection } from './gui-host/quit-inspection.ts'
export type { DesktopQuitInspection } from './gui-host/quit-inspection.ts'
export { hasDesktopActiveTasks, installDesktopUpdateTaskControl } from './gui-host/update-tasks.ts'

/** Private control route authenticated independently of browser cookies. */
export const GUI_CONTROL_PATH = '/__dsh/gui-control'
/** Private event stream for an attached native shell. */
export const GUI_EVENTS_PATH = '/__dsh/gui-events'
/** Header carrying the shared Host's local capability token. */
export const GUI_CONTROL_HEADER = 'x-dsh-gui-token'

const MAX_CONTROL_BODY_BYTES = 64 * 1024
const MAX_PENDING_DIAGNOSTICS = 32
// Native SSE sends a comment every 15 seconds, including when no account or plugin event occurs.
const GUI_EVENT_HEARTBEAT_MS = 15_000

/** Stable failure categories for the private HTTP control transport. */
export type GuiControlErrorCode =
  | 'unauthorized' | 'forbidden' | 'invalid-request' | 'request-too-large' | 'operation-failed' | 'unavailable'

/** A failed HTTP request, without credentials or raw provider diagnostics. */
export interface GuiControlError {
  readonly error: { readonly code: GuiControlErrorCode; readonly message: string }
}

/** One installed Host controller, shared by local IPC and authenticated HTTP requests. */
export interface GuiHostControl {
  /** @returns Current native boot metadata; throws once the owning context is disposed. */
  ready(): GuiHostReady
  /**
   * Perform a native operation through the same implementation as the HTTP route.
   * @param input - Native operation and its required fields.
   * @param signal - Optional caller cancellation, combined with Host disposal.
   * @returns The completed operation's discriminated response.
   */
  request(input: GuiControlRequest, signal?: AbortSignal): Promise<GuiControlResponse>
  /**
   * Subscribe to native events, immediately receiving the current platform session.
   * @param listener - Synchronous observer; an exception is contained within delivery.
   * @returns Disposer removing this observer.
   */
  subscribe(listener: (event: GuiHostEvent) => void): () => void
}

class ControlRequestError extends Error {
  constructor(readonly code: GuiControlErrorCode, readonly status: number, message: string) { super(message) }
}

function parseRequest(value: unknown): GuiControlRequest {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    throw new ControlRequestError('invalid-request', 400, 'A control operation is required')
  }
  switch (value.type) {
    case 'quit-inspection': return { type: value.type }
    case 'update-tasks':
      if ('action' in value && (value.action === 'inspect' || value.action === 'lock' || value.action === 'unlock')) {
        return { type: value.type, action: value.action }
      }
      break
    case 'file-drag-resource':
      if ('address' in value && typeof value.address === 'string' && value.address.length > 0) {
        return { type: value.type, address: value.address }
      }
      break
  }
  throw new ControlRequestError('invalid-request', 400, 'The control operation is invalid')
}

async function readRequest(request: IncomingMessage): Promise<GuiControlRequest> {
  const parts: Buffer[] = []
  let size = 0
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    if (typeof chunk !== 'string' && !Buffer.isBuffer(chunk)) throw new ControlRequestError('invalid-request', 400, 'The request body is invalid')
    const part = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    size += part.length
    if (size > MAX_CONTROL_BODY_BYTES) {
      throw new ControlRequestError('request-too-large', 413, 'The control request is too large')
    }
    parts.push(part)
  }
  let value: unknown
  try { value = JSON.parse(Buffer.concat(parts).toString('utf8')) }
  catch { throw new ControlRequestError('invalid-request', 400, 'The control request must contain JSON') }
  return parseRequest(value)
}

function writeJson(response: ServerResponse, status: number, value: GuiHostReady | GuiControlResponse | GuiControlError): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff' })
  response.end(JSON.stringify(value))
}

/**
 * Register one native control implementation and its loopback-only HTTP transport.
 * @param ctx - Booted GUI Host context owning the routes and event listeners.
 * @param token - Random capability token with at least 32 UTF-8 bytes, held only by local launchers.
 * @returns Controller reused by the spawning shell's existing IPC adapter.
 */
export function installGuiHostControl(ctx: Context, token: string): GuiHostControl {
  const secret = Buffer.from(token)
  if (secret.length < 32) throw new RangeError('The GUI Host control token must contain at least 32 bytes')
  const server = ctx.get('webServer')
  const connection = ctx.get('connection')
  if (server === undefined || connection === undefined) throw new Error('GUI Host transport services are unavailable')
  const runId = randomUUID() as PluginOperationRunId
  const lifetime = new AbortController()
  const listeners = new Set<(event: GuiHostEvent) => void>()
  const streams = new Set<ServerResponse>()
  const pending = new Set<Promise<GuiControlResponse>>()
  let platformSession: PlatformSession | null = null
  const inspectQuit = installDesktopQuitInspection(ctx)
  const updateTasks = installDesktopUpdateTaskControl(ctx)

  const deliver = (listener: (event: GuiHostEvent) => void, event: GuiHostEvent): void => {
    try { listener(event) }
    catch (_error) { ctx.logger.warn('GUI Host event observer failed') }
  }
  const publish = (event: GuiHostEvent): void => {
    if (lifetime.signal.aborted) return
    for (const listener of listeners) deliver(listener, event)
  }
  const perform = async (input: GuiControlRequest, signal: AbortSignal): Promise<GuiControlResponse> => {
    signal.throwIfAborted()
    switch (input.type) {
      case 'quit-inspection': return { type: input.type, ...await inspectQuit() }
      case 'update-tasks': return { type: input.type, active: await updateTasks(input.action) }
      case 'file-drag-resource': return { type: input.type, resource: await localDragResource(ctx, input.address, signal) }
    }
  }
  const control: GuiHostControl = {
    ready() {
      lifetime.signal.throwIfAborted()
      return { url: connection.authenticatedUrl(`${server.protocol}//127.0.0.1:${String(server.port)}`),
        injections: server.collectIndexInjections(connection.browserPeer), platformSession, runId }
    },
    async request(input, signal) {
      const cancellation = signal === undefined ? lifetime.signal : AbortSignal.any([lifetime.signal, signal])
      cancellation.throwIfAborted()
      const cancelled = Promise.withResolvers<never>()
      const onAbort = (): void => { cancelled.reject(cancellation.reason) }
      cancellation.addEventListener('abort', onAbort, { once: true })
      const operation = Promise.race([perform(input, cancellation), cancelled.promise])
      pending.add(operation)
      try {
        const result = await operation
        cancellation.throwIfAborted()
        return result
      } finally {
        pending.delete(operation)
        cancellation.removeEventListener('abort', onAbort)
      }
    },
    subscribe(listener) {
      lifetime.signal.throwIfAborted()
      listeners.add(listener)
      deliver(listener, { type: 'platform-session', session: platformSession })
      return () => { listeners.delete(listener) }
    },
  }
  installPlatformSessionPublisher(ctx, (session) => {
    platformSession = session
    publish({ type: 'platform-session', session })
  })
  installOperationDiagnostics(ctx, (record) => {
    publish({ type: 'plugin-operation', record })
    return Promise.resolve()
  }, MAX_PENDING_DIAGNOSTICS, runId)

  const authorize = (request: IncomingMessage): void => {
    if (request.socket.remoteAddress === undefined || !isLoopbackHost(request.socket.remoteAddress)
      || request.headers.origin !== undefined) {
      throw new ControlRequestError('forbidden', 403, 'GUI Host control is restricted to local launchers')
    }
    const supplied = request.headers[GUI_CONTROL_HEADER]
    const candidate = typeof supplied === 'string' ? Buffer.from(supplied) : Buffer.alloc(0)
    if (candidate.length !== secret.length || !timingSafeEqual(candidate, secret)) {
      throw new ControlRequestError('unauthorized', 401, 'GUI Host control authentication failed')
    }
    if (lifetime.signal.aborted) throw new ControlRequestError('unavailable', 503, 'GUI Host control is unavailable')
  }
  const failure = (response: ServerResponse, error: unknown): void => {
    if (response.destroyed || response.writableEnded) return
    if (error instanceof ControlRequestError) writeJson(response, error.status, { error: { code: error.code, message: error.message } })
    else writeJson(response, 500, { error: { code: 'operation-failed', message: 'The GUI Host operation failed' } })
  }
  ctx.effect(() => server.register({ kind: 'exact', path: GUI_CONTROL_PATH, async handler(request, response) {
    const aborted = new AbortController()
    const onClose = (): void => { if (!response.writableEnded) aborted.abort() }
    response.on('close', onClose)
    try {
      authorize(request)
      if (request.method === 'GET') writeJson(response, 200, control.ready())
      else if (request.method === 'POST') writeJson(response, 200, await control.request(await readRequest(request), aborted.signal))
      else throw new ControlRequestError('invalid-request', 405, 'This control method is unsupported')
    } catch (error) { failure(response, error) }
    finally { response.off('close', onClose) }
  } }), 'GUI Host control route')
  ctx.effect(() => server.register({ kind: 'exact', path: GUI_EVENTS_PATH, handler(request, response) {
    try {
      authorize(request)
      if (request.method !== 'GET') throw new ControlRequestError('invalid-request', 405, 'This event method is unsupported')
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store',
        'connection': 'keep-alive', 'x-content-type-options': 'nosniff' })
      streams.add(response)
      const unsubscribe = control.subscribe((event) => {
        if (!response.write(`data: ${JSON.stringify(event)}\n\n`)) response.destroy()
      })
      const heartbeat = setInterval(() => {
        if (!response.write(': keepalive\n\n')) response.destroy()
      }, GUI_EVENT_HEARTBEAT_MS)
      heartbeat.unref()
      response.once('close', () => { clearInterval(heartbeat); streams.delete(response); unsubscribe() })
    } catch (error) { failure(response, error) }
  } }), 'GUI Host event route')
  ctx.effect(() => async () => {
    lifetime.abort()
    listeners.clear()
    for (const response of streams) response.end()
    streams.clear()
    await Promise.allSettled(pending)
  }, 'GUI Host control lifetime')
  return control
}
