/** JSON messages exchanged by an attached native shell and the shared GUI Host. */
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { isLoopbackHost } from '@deepseek-ai/dsh-host-webserver'
import type { PlatformSession } from '@deepseek-ai/dsh-deepseek-account'
import { parsePluginOperationRecord, type PluginOperationRecord, type PluginOperationRunId } from '@deepseek-ai/dsh-plugin-manager/diagnostic'
import type { LocalDragResource } from './file-drag.ts'

/** Boot metadata read by a native shell attaching to the existing Host. */
export interface GuiHostReady {
  readonly url: string
  readonly injections: readonly IndexInjection[]
  readonly platformSession: PlatformSession | null
  readonly runId: PluginOperationRunId
}

/** Native operations accepted by the shared Host. */
export type GuiControlRequest =
  | { readonly type: 'quit-inspection' }
  | { readonly type: 'update-tasks'; readonly action: 'inspect' | 'lock' | 'unlock' }
  | { readonly type: 'file-drag-resource'; readonly address: string }

/** A completed native operation, discriminated by its originating request. */
export type GuiControlResponse =
  | { readonly type: 'quit-inspection'; readonly activeTasks: boolean; readonly scheduledTasks: boolean }
  | { readonly type: 'update-tasks'; readonly active: boolean }
  | { readonly type: 'file-drag-resource'; readonly resource: LocalDragResource | null }

/** Private events delivered both to local IPC and attached native shells. */
export type GuiHostEvent =
  | { readonly type: 'platform-session'; readonly session: PlatformSession | null }
  | { readonly type: 'plugin-operation'; readonly record: PluginOperationRecord }

function invalid(): never { throw new TypeError('Invalid GUI Host response') }
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function loopbackUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
      && isLoopbackHost(url.hostname.replace(/^\[|\]$/g, ''))
  } catch { return false }
}
function platformSession(value: unknown): value is PlatformSession | null {
  if (value === null) return true
  if (!object(value) || typeof value.origin !== 'string' || typeof value.token !== 'string' || !value.token
    || !(value.userId === null || (typeof value.userId === 'string' && value.userId))) return false
  try {
    const url = new URL(value.origin)
    if (url.origin !== value.origin || url.username || url.password
      || !(url.protocol === 'https:' || (url.protocol === 'http:' && loopbackUrl(value.origin)))) return false
  } catch { return false }
  if (value.embeddedPageDist !== undefined && typeof value.embeddedPageDist !== 'string') return false
  if (value.requestHeaders !== undefined) {
    if (!object(value.requestHeaders) || Object.entries(value.requestHeaders).some(([key, entry]) =>
      typeof entry !== 'string' || key !== key.toLowerCase() || /[\r\n]/.test(entry)
      || ['authorization', 'x-dsh-auth-token', 'host', 'content-length', 'transfer-encoding', 'connection', 'content-type'].includes(key))) return false
  }
  return true
}
function injection(value: unknown): IndexInjection {
  if (!object(value)) return invalid()
  const placed = value.placement === 'head' || value.placement === 'body' ? value.placement : undefined
  switch (value.kind) {
    case 'global':
      if (typeof value.name === 'string') return { kind: value.kind, name: value.name, value: value.value }
      break
    case 'script':
      if (placed && typeof value.text === 'string') return { kind: value.kind, placement: placed, text: value.text }
      break
    case 'script-src':
      if (placed && typeof value.src === 'string') return { kind: value.kind, placement: placed, src: value.src }
      break
    case 'script-preload':
      if (typeof value.src === 'string') return { kind: value.kind, src: value.src }
      break
    case 'style':
      if (typeof value.text === 'string') return { kind: value.kind, text: value.text }
      break
    case 'html':
      if (placed && typeof value.html === 'string') return { kind: value.kind, placement: placed, html: value.html }
      break
  }
  return invalid()
}

/**
 * Validate boot metadata received over the private control transport.
 * @param value - Decoded transport JSON.
 * @returns Native boot metadata with validated discriminator fields and loopback URL.
 */
export function parseGuiHostReady(value: unknown): GuiHostReady {
  if (!object(value) || typeof value.url !== 'string' || !loopbackUrl(value.url) || !Array.isArray(value.injections)
    || !platformSession(value.platformSession) || typeof value.runId !== 'string'
    || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value.runId)) return invalid()
  return { url: value.url, injections: value.injections.map(injection), platformSession: value.platformSession,
    runId: value.runId as PluginOperationRunId }
}

/**
 * Validate an event received from the private SSE or child-IPC transport.
 * @param value - Decoded event JSON.
 * @returns Platform credentials or a whitelisted plugin-operation record.
 */
export function parseGuiHostEvent(value: unknown): GuiHostEvent {
  if (!object(value)) return invalid()
  if (value.type === 'platform-session' && platformSession(value.session)) return { type: value.type, session: value.session }
  if (value.type === 'plugin-operation') {
    const record = parsePluginOperationRecord(value.record)
    if (record !== undefined) return { type: value.type, record }
  }
  return invalid()
}

/**
 * Validate a native operation's answer before exposing it to Electron.
 * @param value - Decoded transport JSON.
 * @returns The completed operation's discriminated answer.
 */
export function parseGuiControlResponse(value: unknown): GuiControlResponse {
  if (!object(value)) return invalid()
  switch (value.type) {
    case 'quit-inspection':
      if (typeof value.activeTasks === 'boolean' && typeof value.scheduledTasks === 'boolean') {
        return { type: value.type, activeTasks: value.activeTasks, scheduledTasks: value.scheduledTasks }
      }
      break
    case 'update-tasks':
      if (typeof value.active === 'boolean') return { type: value.type, active: value.active }
      break
    case 'file-drag-resource': {
      const resource = value.resource
      if (resource === null) return { type: value.type, resource }
      if (object(resource) && typeof resource.path === 'string' && typeof resource.sha256 === 'string'
        && /^[\da-f]{64}$/i.test(resource.sha256) && typeof resource.size === 'number'
        && Number.isSafeInteger(resource.size) && resource.size >= 0) {
        return { type: value.type, resource: { path: resource.path, sha256: resource.sha256, size: resource.size } }
      }
      break
    }
  }
  return invalid()
}
