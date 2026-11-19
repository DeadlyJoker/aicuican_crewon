import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readGuiHost, requestGuiHost, watchGuiHost } from '@deepseek-ai/dsh/gui-runtime-client'
import type { GuiRuntimeRecord } from '@deepseek-ai/dsh/gui-runtime'
import type { GuiHostEvent, GuiHostReady, GuiControlResponse } from '@deepseek-ai/dsh/gui-host-control'
import type { PluginOperation } from '@deepseek-ai/dsh-plugin-manager/types'
import type { PluginOperationRunId } from '@deepseek-ai/dsh-plugin-manager/diagnostic'
import { relayGuiHost } from '../src/gui-relay.ts'

vi.mock('@deepseek-ai/dsh/gui-runtime-client', () => ({
  readGuiHost: vi.fn(), requestGuiHost: vi.fn(), watchGuiHost: vi.fn(),
}))

const record: GuiRuntimeRecord = { id: '6d39001c-5154-4f41-bcaa-f5e69e80a975', pid: 101,
  version: 'test', url: 'http://127.0.0.1:3080/', token: 'a'.repeat(64) }
const ready: GuiHostReady = { url: record.url, runId: '6135fb69-cd2d-44b4-9838-914b6ab8ef76' as PluginOperationRunId,
  injections: [{ kind: 'global', name: 'nativeTest', value: true }],
  platformSession: { origin: 'https://platform.example', token: 'session-token', userId: null } }
const cleanup: (() => Promise<void>)[] = []
let watching: ReturnType<typeof Promise.withResolvers<AbortSignal>>

function untilAborted(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return }
    signal.addEventListener('abort', () => { resolve() }, { once: true })
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  watching = Promise.withResolvers<AbortSignal>()
  vi.mocked(readGuiHost).mockResolvedValue(ready)
  vi.mocked(watchGuiHost).mockImplementation(async function* (_record, signal) {
    watching.resolve(signal)
    await untilAborted(signal)
  })
})
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
  vi.restoreAllMocks()
})

function nativeIpc() {
  const events = new EventEmitter()
  const sent: object[] = []
  let connected = true
  const original = new Map(['connected', 'send', 'disconnect'].map(key => [key, Object.getOwnPropertyDescriptor(process, key)]))
  const disconnect = vi.fn(() => { connected = false; events.emit('disconnect') })
  Object.defineProperty(process, 'connected', { configurable: true, get: () => connected })
  Object.defineProperty(process, 'send', { configurable: true, value: (message: object, callback: (error: Error | null) => void) => {
    sent.push(message)
    callback(null)
    return true
  } })
  Object.defineProperty(process, 'disconnect', { configurable: true, value: disconnect })
  const on = process.on.bind(process)
  const once = process.once.bind(process)
  const off = process.off.bind(process)
  vi.spyOn(process, 'on').mockImplementation((event, listener) => {
    if (event === 'message' || event === 'disconnect') { events.on(event, listener); return process }
    return on(event, listener)
  })
  vi.spyOn(process, 'once').mockImplementation((event, listener) => {
    if (event === 'disconnect') { events.once(event, listener); return process }
    return once(event, listener)
  })
  vi.spyOn(process, 'off').mockImplementation((event, listener) => {
    if (event === 'message' || event === 'disconnect') { events.off(event, listener); return process }
    return off(event, listener)
  })
  let result: Promise<void> | undefined
  cleanup.push(async () => {
    events.emit('message', { type: 'shutdown' })
    await result?.catch(() => {})
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(process, key, descriptor)
      else Reflect.deleteProperty(process, key)
    }
  })
  const run = () => {
    result = relayGuiHost(record)
    // Attach a rejection observer while test assertions control when the result is awaited.
    void result.catch(() => {})
    return result
  }
  return {
    events, sent, disconnect, run,
    async start() {
      const finished = run()
      return { finished, signal: await watching.promise }
    },
    detach() { connected = false; events.emit('disconnect') },
  }
}

it('publishes the shared Host boot metadata before starting native event delivery', async () => {
  const ipc = nativeIpc()
  await ipc.start()
  expect(readGuiHost).toHaveBeenCalledWith(record, expect.any(AbortSignal))
  expect(ipc.sent).toEqual([
    { type: 'starting', runId: ready.runId },
    { type: 'platform-session', session: ready.platformSession },
    { type: 'ready', url: ready.url, injections: ready.injections },
  ])
  expect(watchGuiHost).toHaveBeenCalledWith(record, expect.any(AbortSignal))
  expect(JSON.stringify(ipc.sent)).not.toContain(record.token)
})

it.each([
  { input: { type: 'quit-inspection', requestId: 1 }, response: { type: 'quit-inspection', activeTasks: false, scheduledTasks: true } },
  ...(['inspect', 'lock', 'unlock'] as const).map(action => ({
    input: { type: 'update-tasks', action, requestId: 2 }, response: { type: 'update-tasks' as const, active: false },
  })),
  { input: { type: 'file-drag-resource', address: 'file:///tmp/report.txt', requestId: 3 },
    response: { type: 'file-drag-resource', resource: { path: '/tmp/report.txt', sha256: 'b'.repeat(64), size: 20 } } },
] satisfies { input: object; response: GuiControlResponse }[])('forwards $input.type and retains its native request identity', async ({ input, response }) => {
  const ipc = nativeIpc()
  await ipc.start()
  vi.mocked(requestGuiHost).mockResolvedValue(response)
  ipc.events.emit('message', input)
  await vi.waitFor(() => { expect(ipc.sent).toContainEqual({ ...response, requestId: input.requestId }) })
  expect(requestGuiHost).toHaveBeenCalledWith(record, input, expect.any(AbortSignal))
})

it.each([
  { input: { type: 'quit-inspection', requestId: 1 }, expected: { activeTasks: true, scheduledTasks: false } },
  { input: { type: 'update-tasks', requestId: 2, action: 'lock' }, expected: { active: true } },
  { input: { type: 'file-drag-resource', requestId: 3, address: 'file:///tmp/missing' }, expected: { resource: null } },
])('returns the failure fields required by native $input.type callers', async ({ input, expected }) => {
  const ipc = nativeIpc()
  await ipc.start()
  vi.mocked(requestGuiHost).mockRejectedValue(new Error('Owner unavailable'))
  ipc.events.emit('message', input)
  await vi.waitFor(() => { expect(ipc.sent).toContainEqual({ type: input.type, requestId: input.requestId,
    ...expected, error: 'Owner unavailable' }) })
})

it('cancels only the matching file request while keeping the shared event subscription alive', async () => {
  const ipc = nativeIpc()
  const { signal } = await ipc.start()
  const requested = Promise.withResolvers<AbortSignal>()
  vi.mocked(requestGuiHost).mockImplementation(async (_record, _input, requestSignal) => {
    if (!requestSignal) throw new Error('Missing request cancellation')
    requested.resolve(requestSignal)
    await untilAborted(requestSignal)
    throw new Error('File drag cancelled')
  })
  ipc.events.emit('message', { type: 'file-drag-resource', requestId: 10, address: 'file:///tmp/report' })
  const dragSignal = await requested.promise
  ipc.events.emit('message', { type: 'file-drag-cancel', requestId: 999 })
  expect(dragSignal.aborted).toBe(false)
  ipc.events.emit('message', { type: 'file-drag-cancel', requestId: 10 })
  expect(dragSignal.aborted).toBe(true)
  expect(signal.aborted).toBe(false)
  await vi.waitFor(() => { expect(ipc.sent).toContainEqual({ type: 'file-drag-resource', requestId: 10,
    resource: null, error: 'File drag cancelled' }) })
  expect(requestGuiHost).toHaveBeenCalledTimes(1)
})

it('detaches on native shutdown, cancels pending requests and leaves the shared Host running', async () => {
  const ipc = nativeIpc()
  const { signal, finished } = await ipc.start()
  const requested = Promise.withResolvers<AbortSignal>()
  vi.mocked(requestGuiHost).mockImplementation(async (_record, _input, requestSignal) => {
    if (!requestSignal) throw new Error('Missing request cancellation')
    requested.resolve(requestSignal)
    await untilAborted(requestSignal)
    throw new Error('Client detached')
  })
  ipc.events.emit('message', { type: 'file-drag-resource', requestId: 8, address: 'file:///tmp/report' })
  const requestSignal = await requested.promise
  ipc.events.emit('message', { type: 'shutdown' })
  await finished
  expect(signal.aborted).toBe(true)
  expect(requestSignal.aborted).toBe(true)
  expect(ipc.sent.at(-1)).toEqual({ type: 'shutdown-complete' })
  expect(ipc.sent).not.toContainEqual(expect.objectContaining({ requestId: 8 }))
  expect(requestGuiHost).toHaveBeenCalledTimes(1)
  expect(ipc.disconnect).toHaveBeenCalledTimes(1)
  expect(ipc.events.listenerCount('message')).toBe(0)
  expect(ipc.events.listenerCount('disconnect')).toBe(0)
})

it('stops its subscription after the parent disconnects without sending a Host shutdown request', async () => {
  const ipc = nativeIpc()
  const { signal, finished } = await ipc.start()
  ipc.detach()
  await finished
  expect(signal.aborted).toBe(true)
  expect(requestGuiHost).not.toHaveBeenCalled()
  expect(ipc.disconnect).not.toHaveBeenCalled()
  expect(ipc.sent).toHaveLength(3)
  expect(ipc.events.listenerCount('message')).toBe(0)
})

it('forwards private account and plugin events and releases the native relay after stream failure', async () => {
  const update: GuiHostEvent = { type: 'platform-session', session: null }
  const diagnostic: GuiHostEvent = { type: 'plugin-operation', record: {
    runId: ready.runId, transportDropped: 0, operation: {
      id: '04b2b464-e5e5-47de-9a98-e51a63b421f0' as PluginOperation['id'],
      time: '2026-11-06T00:00:00Z', reason: 'plugin', target: 'team', stage: 'enable', phase: 'started',
    },
  } }
  const fail = Promise.withResolvers<undefined>()
  vi.mocked(watchGuiHost).mockImplementation(async function* (_record, signal) {
    watching.resolve(signal)
    yield update
    yield diagnostic
    await fail.promise
    throw new Error('Owner event stream failed')
  })
  const ipc = nativeIpc()
  const { finished, signal } = await ipc.start()
  await vi.waitFor(() => { expect(ipc.sent.slice(-2)).toEqual([update, diagnostic]) })
  fail.resolve(undefined)
  await expect(finished).rejects.toThrow('Owner event stream failed')
  expect(signal.aborted).toBe(true)
  expect(ipc.disconnect).toHaveBeenCalledTimes(1)
  expect(requestGuiHost).not.toHaveBeenCalled()
  expect(ipc.events.listenerCount('message')).toBe(0)
})

it('ignores malformed and unsupported native messages', async () => {
  const ipc = nativeIpc()
  await ipc.start()
  for (const input of [null, {}, { type: 'unknown' }, { type: 'update-tasks', requestId: 1, action: 'restart' },
    { type: 'quit-inspection', requestId: 1.2 }, { type: 'file-drag-resource', requestId: 1 }]) {
    ipc.events.emit('message', input)
  }
  expect(requestGuiHost).not.toHaveBeenCalled()
  expect(ipc.sent).toHaveLength(3)
})


it.each(['disconnect', 'shutdown'] as const)('cancels a pending ready handshake on native %s before opening the event stream', async (event) => {
  const requested = Promise.withResolvers<AbortSignal>()
  vi.mocked(readGuiHost).mockImplementation(async (_record, signal) => {
    if (!signal) throw new Error('Missing handshake cancellation')
    requested.resolve(signal)
    await untilAborted(signal)
    throw new Error('Ready handshake cancelled')
  })
  const ipc = nativeIpc()
  const finished = ipc.run()
  const signal = await requested.promise
  if (event === 'disconnect') ipc.detach()
  else ipc.events.emit('message', { type: 'shutdown' })
  await finished
  expect(signal.aborted).toBe(true)
  expect(watchGuiHost).not.toHaveBeenCalled()
  expect(requestGuiHost).not.toHaveBeenCalled()
  expect(ipc.sent).toEqual(event === 'shutdown' ? [{ type: 'shutdown-complete' }] : [])
  expect(ipc.events.listenerCount('message')).toBe(0)
  expect(ipc.events.listenerCount('disconnect')).toBe(0)
})

it('returns without contacting the Host when native IPC is already disconnected', async () => {
  const ipc = nativeIpc()
  ipc.detach()
  await ipc.run()
  expect(readGuiHost).not.toHaveBeenCalled()
  expect(watchGuiHost).not.toHaveBeenCalled()
  expect(ipc.sent).toEqual([])
  expect(ipc.events.listenerCount('message')).toBe(0)
})

it('discards ready metadata delivered after the native client already detached', async () => {
  const handshake = Promise.withResolvers<GuiHostReady>()
  vi.mocked(readGuiHost).mockReturnValue(handshake.promise)
  const ipc = nativeIpc()
  const finished = ipc.run()
  ipc.detach()
  handshake.resolve(ready)
  await finished
  expect(watchGuiHost).not.toHaveBeenCalled()
  expect(ipc.sent).toEqual([])
})

it('drains an admitted request without sending its late answer after shutdown', async () => {
  const ipc = nativeIpc()
  const { finished } = await ipc.start()
  const response = Promise.withResolvers<GuiControlResponse>()
  vi.mocked(requestGuiHost).mockReturnValue(response.promise)
  ipc.events.emit('message', { type: 'quit-inspection', requestId: 21 })
  ipc.events.emit('message', { type: 'shutdown' })
  response.resolve({ type: 'quit-inspection', activeTasks: false, scheduledTasks: false })
  await finished
  expect(ipc.sent).not.toContainEqual(expect.objectContaining({ requestId: 21 }))
  expect(ipc.sent.at(-1)).toEqual({ type: 'shutdown-complete' })
  expect(ipc.disconnect).toHaveBeenCalledTimes(1)
})
