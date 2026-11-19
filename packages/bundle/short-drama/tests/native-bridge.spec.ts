/** Native project updates cannot downgrade a newer production revision or cross project ownership. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

const source = readFileSync(new URL('../studio/native-bridge.js', import.meta.url), 'utf8')

it('retains the newest production across delayed save replies and refresh responses', () => {
  const handlers: ((event: object) => void)[] = [], parent = { postMessage: vi.fn() }, apply = vi.fn()
  const context = { parent, studioNativeApplyProject: apply, location: { origin: 'http://localhost' },
    window: { addEventListener: (name: string, handler: (event: object) => void) => { if (name === 'message') handlers.push(handler) } } }
  runInNewContext(source, context)
  const send = (value: object) => { for (const handler of handlers) handler({ source: parent, data: { channel: 'crewon-studio-v1', ...value } }) }
  send({ type: 'initialize', value: { project: { id: 'first' }, production: { revision: 4 }, document: { storage: {} } } })
  runInNewContext('studioNativeWritable=true', context)
  send({ type: 'production-update', projectId: 'first', production: { revision: 7 } })
  send({ type: 'production-update', projectId: 'first', production: { revision: 6 } })
  send({ type: 'production-update', projectId: 'other', production: { revision: 9 } })
  expect(apply).toHaveBeenCalledOnce()
  send({ type: 'refresh', value: { project: { id: 'first' }, production: { revision: 5 }, document: { storage: {} } } })
  expect(runInNewContext('studioNativeConfig.production.revision', context)).toBe(7)
  send({ type: 'refresh', value: { project: { id: 'second' }, production: { revision: 1 }, document: { storage: {} } } })
  expect(runInNewContext('studioNativeConfig.production.revision', context)).toBe(1)
})
