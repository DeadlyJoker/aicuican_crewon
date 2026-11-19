/** Private local transport used when a second GUI attaches to the active Host. */
import type { GuiRuntimeRecord } from './gui-runtime.ts'
import {
  GUI_CONTROL_HEADER, GUI_CONTROL_PATH, GUI_EVENTS_PATH,
  parseGuiHostReady, parseGuiHostEvent, parseGuiControlResponse,
  type GuiHostReady, type GuiHostEvent, type GuiControlRequest, type GuiControlResponse,
} from './gui-host-control.ts'

/**
 * Read ready metadata from the authenticated local GUI owner.
 * @param record - Validated owner discovery record.
 * @param signal - Caller cancellation.
 * @returns Boot metadata supplied by the running Host.
 */
export async function readGuiHost(record: GuiRuntimeRecord, signal?: AbortSignal): Promise<GuiHostReady> {
  const response = await fetch(new URL(GUI_CONTROL_PATH, record.url), {
    headers: { [GUI_CONTROL_HEADER]: record.token }, redirect: 'error',
    signal: AbortSignal.any([AbortSignal.timeout(10_000), ...signal ? [signal] : []]),
  })
  if (!response.ok) throw new Error(`The active GUI Host refused attachment (${response.status}).`)
  return parseGuiHostReady(await response.json())
}

/**
 * Forward one native operation to the active GUI Host.
 * @param record - Validated owner discovery record.
 * @param request - Native operation.
 * @param signal - Caller cancellation.
 * @returns Validated native result.
 */
export async function requestGuiHost(
  record: GuiRuntimeRecord, request: GuiControlRequest, signal?: AbortSignal,
): Promise<GuiControlResponse> {
  const response = await fetch(new URL(GUI_CONTROL_PATH, record.url), {
    method: 'POST', headers: { [GUI_CONTROL_HEADER]: record.token, 'content-type': 'application/json' },
    redirect: 'error', body: JSON.stringify(request),
    signal: AbortSignal.any([AbortSignal.timeout(12_000), ...signal ? [signal] : []]),
  })
  if (!response.ok) throw new Error(`The GUI Host operation failed (${response.status}).`)
  const result = parseGuiControlResponse(await response.json())
  if (result.type !== request.type) throw new Error('The GUI Host answered a different operation.')
  return result
}

/**
 * Follow private native events without exposing the transport token to page scripts.
 * @param record - Validated owner discovery record.
 * @param signal - Lifetime of the attached client.
 * @yields Validated account or plugin diagnostic events.
 */
export async function* watchGuiHost(record: GuiRuntimeRecord, signal: AbortSignal): AsyncGenerator<GuiHostEvent> {
  const response = await fetch(new URL(GUI_EVENTS_PATH, record.url), {
    headers: { [GUI_CONTROL_HEADER]: record.token }, redirect: 'error', signal,
  })
  if (!response.ok || response.body === null) throw new Error('The GUI Host event stream is unavailable.')
  const decoder = new TextDecoder()
  let pending = ''
  for await (const chunk of response.body) {
    pending += decoder.decode(chunk, { stream: true })
    if (pending.length > 1024 * 1024) throw new Error('The GUI Host event exceeded its size limit.')
    let boundary: number
    while ((boundary = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, boundary).replace(/\r$/, '')
      pending = pending.slice(boundary + 1)
      if (line.startsWith('data:')) yield parseGuiHostEvent(JSON.parse(line.slice(5).trim()))
    }
  }
  if (!signal.aborted) throw new Error('The GUI Host event stream ended.')
}
