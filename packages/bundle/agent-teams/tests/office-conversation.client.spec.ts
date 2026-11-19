import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { CommandNode, ConversationNodeContext, ConversationMatch } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { officeMessageDefinition, workflowMessageDefinition } from '../src/client/office-conversation.ts'

const eventBase = { seq: z.number().int().nonnegative(), time: z.number() }
const commandEvents = z.array(z.discriminatedUnion('type', [
  z.object({ ...eventBase, type: z.literal('command/run'), data: z.object({
    commandId: z.string(), name: z.string(), args: z.string().optional(), source: z.object({ kind: z.literal('user') }),
  }) }),
  z.object({ ...eventBase, type: z.literal('command/done'), data: z.object({
    commandId: z.string(), kind: z.enum(['success', 'error']), text: z.string().optional(),
  }) }),
]))
const officeRequest = z.object({ id: z.string(), text: z.string(), memberId: z.string().optional() })

function replayCommands(fixture: string, definition = officeMessageDefinition) {
  const events = commandEvents.parse(
    JSON.parse(readFileSync(new URL(`./fixtures/${fixture}`, import.meta.url), 'utf8')),
  ) as SessionEvent<'command/run' | 'command/done'>[]
  const contexts = new Map<string, ConversationNodeContext<CommandNode>>()
  for (const event of events) {
    const match = definition.match(event)
    if (!match) continue
    const item: ConversationMatch = { ...match, event, location: { kind: 'session' } }
    const previous = contexts.get(match.id)
    if (match.role === 'start') {
      const context: ConversationNodeContext<CommandNode> = { key: match.id, kind: definition.kind, id: match.id,
        matches: [item], start: { ...item, role: 'start' }, state: undefined, current: new Map() }
      const state = definition.start(context, { ...item, role: 'start' }, { previous: () => undefined })
      contexts.set(match.id, { ...context, state })
    } else if (previous?.state) {
      const state = definition.update({ ...previous, state: previous.state }, item)
      contexts.set(match.id, { ...previous, state, matches: [...previous.matches, item] })
    }
  }
  const nodes = [...contexts.values()].map(context => definition.buildViewNode?.(context))
  const commands = [...contexts.values()].flatMap(context => context.state ? [context.state] : [])
  return { nodes, commands }
}

it('replays recorded addressed commands outside collapsed model work and retains their order', () => {
  const { nodes } = replayCommands('office-commands.json')
  expect(nodes).toHaveLength(3)
  expect(nodes).toMatchSnapshot()
})

it('replays a recorded default-leader request followed by its delegated command and an explicit member request', () => {
  // Captured from the local Web leader → reviewer run. Identities and absolute time are normalized in the fixture.
  const { nodes, commands } = replayCommands('office-leader-commands.json')
  expect(nodes).toHaveLength(3)
  expect(commands.map(command => command.commandId)).toEqual([
    'cmd-office-leader-2', 'cmd-office-leader-3', 'cmd-office-leader-4',
  ])
  const requests = commands.map(command => officeRequest.parse(JSON.parse(command.args ?? '{}')))
  expect(requests[0]).not.toHaveProperty('memberId')
  expect(requests[0]?.id).toBe('00000000-0000-4000-8000-000000000101')
  expect(requests[1]).toMatchObject({
    memberId: '00000000-0000-4000-8000-000000000012', id: '00000000-0000-4000-8000-000000000102',
  })
  expect(requests[2]?.memberId).toBe(requests[1]?.memberId)
  expect(commands.map(command => command.outcome?.kind)).toEqual(['success', 'success', 'success'])
  expect(nodes).toMatchSnapshot()
})


it('restores command-only workflow runs as visible chat activity after restart', () => {
  const { nodes } = replayCommands('workflow-expert-command.json', workflowMessageDefinition)
  expect(nodes).toHaveLength(1)
  expect(nodes[0]?.kind).toBe('workflow-message')
  expect(nodes).toMatchSnapshot()
})
