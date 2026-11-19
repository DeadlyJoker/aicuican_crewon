import { expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { ChatVisibilityRegistry, visibleWithPolicies, type ChatVisibilityPolicy } from '../src/client/visibility.ts'
import type { ChatNode } from '../src/client/contract/chat-nodes.ts'
import '../src/client/conversation-nodes/assistant.ts'
import '../src/client/conversation-nodes/command.ts'
import '../src/client/conversation-nodes/turn-error.ts'

const policy: ChatVisibilityPolicy = { hiddenKinds: ['assistant-step', 'turn-error', 'command'] }
const node = <Kind extends ChatNode['kind']>(kind: Kind, data: Extract<ChatNode, { kind: Kind }>['data']) => ({
  kind, data, key: 'row', id: 'row', target: 'chat', anchorSeq: 1,
  location: { kind: 'session' }, visibility: 'visible',
}) as Extract<ChatNode, { kind: Kind }>

it('keeps ordinary Chat visible until a feature policy resolves and after its registration is removed', async () => {
  const errors = vi.fn()
  const registry = new ChatVisibilityRegistry(errors)
  const source = registry.source(SessionId('office'))
  let resolve!: (value: ChatVisibilityPolicy) => void
  const dispose = registry.register({ id: 'office', resolve: () => new Promise((done) => { resolve = done }) })
  expect(source.getSnapshot()).toEqual([])
  resolve(policy)
  await Promise.resolve()
  expect(source.getSnapshot()).toEqual([policy])
  dispose()
  expect(source.getSnapshot()).toEqual([])
  expect(errors).not.toHaveBeenCalled()
})

it('ignores stale policy reads and keeps unrelated sessions on the default presentation', async () => {
  const registry = new ChatVisibilityRegistry(vi.fn())
  let resolve!: (value: ChatVisibilityPolicy) => void
  const dispose = registry.register({ id: 'office', resolve: session => session === 'office'
    ? new Promise((done) => { resolve = done }) : Promise.resolve(null) })
  const office = registry.source(SessionId('office'))
  const ordinary = registry.source(SessionId('ordinary'))
  dispose()
  resolve(policy)
  await Promise.resolve()
  expect(office.getSnapshot()).toEqual([])
  expect(ordinary.getSnapshot()).toEqual([])
})

it('filters requested presentation kinds without changing nodes or suppressing command errors', () => {
  const assistant = node('assistant-step', { status: 'running', turn: 1, step: 1, blocks: [], time: 1 })
  const command = node('command', { kind: 'command', commandId: 'command' as never, name: 'action', args: '', seq: 1,
    time: 1, outcome: { kind: 'error', text: 'Retry' } })
  expect(visibleWithPolicies([], assistant)).toBe(true)
  expect(visibleWithPolicies([policy], assistant)).toBe(false)
  expect(visibleWithPolicies([policy], command)).toBe(true)
  expect(assistant.visibility).toBe('visible')
})
