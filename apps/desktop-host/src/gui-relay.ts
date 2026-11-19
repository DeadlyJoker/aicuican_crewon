/** Relay native IPC to the single GUI Host already serving this Harness home. */
import { z } from 'zod'
import { readGuiHost, requestGuiHost, watchGuiHost } from '@deepseek-ai/dsh/gui-runtime-client'
import type { GuiRuntimeRecord } from '@deepseek-ai/dsh/gui-runtime'

const requestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('quit-inspection'), requestId: z.number().int() }),
  z.object({ type: z.literal('update-tasks'), requestId: z.number().int(), action: z.enum(['inspect', 'lock', 'unlock']) }),
  z.object({ type: z.literal('file-drag-resource'), requestId: z.number().int(), address: z.string() }),
  z.object({ type: z.literal('file-drag-cancel'), requestId: z.number().int() }),
  z.object({ type: z.literal('shutdown') }),
])

function send(message: object): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!process.connected || process.send === undefined) { resolve(); return }
    process.send(message, (error) => {
      if (error === null) resolve()
      else reject(error)
    })
  })
}

/**
 * Keep the parent's native IPC while attaching all operations to the existing Host.
 * @param record - Validated, private local Host record.
 * @returns Once the native client detaches, including during the ready handshake. The shared owner retains its lifetime.
 */
export async function relayGuiHost(record: GuiRuntimeRecord): Promise<void> {
  const lifetime = new AbortController()
  const requests = new Map<number, AbortController>()
  const pending = new Set<Promise<void>>()
  const stopped = Promise.withResolvers<void>()
  const isStopping = (): boolean => lifetime.signal.aborted
  const stop = (): void => {
    lifetime.abort()
    for (const request of requests.values()) request.abort()
    stopped.resolve()
  }
  const onMessage = (value: unknown): void => {
    const parsed = requestSchema.safeParse(value)
    if (!parsed.success) return
    const message = parsed.data
    if (message.type === 'shutdown') { stop(); return }
    if (message.type === 'file-drag-cancel') { requests.get(message.requestId)?.abort(); return }
    if (isStopping()) return
    const controller = new AbortController()
    requests.set(message.requestId, controller)
    const task = (async () => {
      try {
        const response = await requestGuiHost(record, message, controller.signal)
        if (!isStopping()) await send({ ...response, requestId: message.requestId })
      } catch (error) {
        const fallback = message.type === 'quit-inspection' ? { activeTasks: true, scheduledTasks: false }
          : message.type === 'update-tasks' ? { active: true } : { resource: null }
        if (!isStopping()) await send({ type: message.type, requestId: message.requestId, ...fallback,
          error: error instanceof Error ? error.message : 'Shared Host operation failed.' })
      } finally { requests.delete(message.requestId) }
    })()
    pending.add(task)
    void task.finally(() => { pending.delete(task) }).catch(() => { stop() })
  }
  process.on('message', onMessage)
  process.once('disconnect', stop)
  try {
    if (!process.connected) { stop(); return }
    const ready = await readGuiHost(record, lifetime.signal).catch((error: unknown) => {
      if (!isStopping()) throw error
      return undefined
    })
    if (ready === undefined || isStopping()) {
      await send({ type: 'shutdown-complete' })
      return
    }
    await send({ type: 'starting', runId: ready.runId })
    await send({ type: 'platform-session', session: ready.platformSession })
    await send({ type: 'ready', url: ready.url, injections: ready.injections })
    const events = (async () => {
      try {
        for await (const event of watchGuiHost(record, lifetime.signal)) await send(event)
      } catch (error) { if (!isStopping()) throw error }
    })()
    await Promise.race([events, stopped.promise])
    await Promise.allSettled(pending)
    await events
    await send({ type: 'shutdown-complete' })
  } finally {
    stop()
    await Promise.allSettled(pending)
    process.off('message', onMessage)
    process.off('disconnect', stop)
    if (process.connected) process.disconnect()
  }
}
