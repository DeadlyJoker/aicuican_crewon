import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { createUserMessage, type UserMessage, type ContentBlock } from '@deepseek-ai/dsh-llm'
import { CommandId, type CommandDefinition, type CommandResult } from '@deepseek-ai/dsh-commands'
import type { SubagentRunEndInfo, SubagentActivationSpec } from '@deepseek-ai/dsh-subagent'
import type { ToolDefinition, ToolRegistrationOptions } from '@deepseek-ai/dsh-tools'
import { TeamOffices } from '../src/office-controller.ts'
import type { Office, OfficeDraft, OfficeId, OfficeMemberId, OfficeMessage, OfficeMessageId, OfficeTopicScope } from '../src/office-types.ts'
import type { OfficeTopicId } from '../src/office-project-types.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

function providePartial(ctx: Context, name: string, value: object): void {
  Reflect.apply(ctx.provide.bind(ctx), ctx, [name, value])
}

async function fixture(directory?: string, earlierContext?: UserMessage, laterPrependContext?: UserMessage) {
  const root = directory ?? await mkdtemp(join(tmpdir(), 'office-topics-'))
  if (!directory) cleanups.push(() => rm(root, { recursive: true, force: true }))
  const ctx = new Context()
  const commands = new Map<string, CommandDefinition>()
  const tools = new Map<string, { definition: ToolDefinition; options: ToolRegistrationOptions }>()
  providePartial(ctx, 'profileContext', { dir: root })
  const commandExecute = vi.fn(async (agent: { id: SessionId }, line: string, _attachments: object[], signal: AbortSignal) => {
    const commandId = CommandId(randomUUID())
    const separator = line.indexOf(' ')
    const result = await invoke(line.slice(1, separator), agent.id, line.slice(separator + 1), commandId, signal)
    return { commandId, result }
  })
  providePartial(ctx, 'commands', { execute: commandExecute, register: (definition: CommandDefinition) => {
    commands.set(definition.name, definition)
    return () => { commands.delete(definition.name) }
  } })
  providePartial(ctx, 'tools', { register: (definition: ToolDefinition, options: ToolRegistrationOptions) => {
    tools.set(definition.name, { definition, options })
    return () => { tools.delete(definition.name) }
  } })
  const scope = (topicId: OfficeTopicId): OfficeTopicScope => ({ topicId,
    projectId: 'project:release' as OfficeTopicScope['projectId'], projectName: 'Release', title: topicId,
    historyThroughSequence: 8 })
  const projects = {
    topicScope: vi.fn(async (_officeId: OfficeId, topicId: OfficeTopicId) => scope(topicId)),
    topicWorkspaceId: vi.fn(async () => WorkspaceId('workspace')),
    submitMemberRequest: vi.fn(async (
      _officeId: OfficeId, _topicId: OfficeTopicId, _memberId: OfficeMemberId, _text: string, id: string,
    ) => ({
      sourceMessageRef: `message:${id}`, sourceMessageSequence: 13,
    })),
    memberInput: vi.fn(async () => ({ text: 'Scoped topic history', revision: 4, readThroughSequence: 13, sourceMessageSequence: 13 })),
    acknowledgeMemberInput: vi.fn(async () => {}), memberReply: vi.fn(async () => undefined),
  }
  providePartial(ctx, 'teamOfficeProjects', projects)
  const children: SessionId[] = []
  const subagents = {
    listDescendants: vi.fn(async () => children.map(id => ({ id }))),
    startActivation: vi.fn(async (request: SubagentActivationSpec & { childId: SessionId }) => {
      children.push(request.childId)
      return { result: new Promise<void>(() => {}) }
    }),
    followup: vi.fn(async (_agent: object, _childId: SessionId, _content: readonly ContentBlock[]) => {}),
    rootOf: vi.fn(), interrupt: vi.fn(),
  }
  providePartial(ctx, 'subagents', subagents)
  if (earlierContext) ctx.on('agent/pre-step', async (_request, next) => {
    const decision = await next()
    return decision.kind === 'enter' ? { ...decision, messages: [...decision.messages, earlierContext] } : decision
  })
  let service: TeamOffices | undefined
  const owner = await ctx.plugin({ name: 'office-topics-fixture', apply: (scope: Context) => { service = new TeamOffices(scope) } })
  if (laterPrependContext) ctx.on('agent/pre-step', async (_request, next) => {
    const decision = await next()
    return decision.kind === 'enter' ? { ...decision, messages: [...decision.messages, laterPrependContext] } : decision
  }, { prepend: true })
  cleanups.push(() => owner.dispose())
  if (!service) throw new Error('Office service did not activate')
  const welcome = vi.fn()
  async function invoke(name: string, sessionId: SessionId, input: string | object,
    commandId = CommandId(randomUUID()), signal = new AbortController().signal): Promise<CommandResult> {
    const command = commands.get(name)
    if (!command) throw new Error(`Unknown command ${name}`)
    return Reflect.apply(command.handler, undefined, [{ commandId,
      agent: { session: { id: sessionId }, followup: welcome },
      attachments: [], signal,
      rawInput: typeof input === 'string' ? input : JSON.stringify(input) }]) as CommandResult | Promise<CommandResult>
  }
  async function open(draft: OfficeDraft = {
    name: 'Office', description: '', members: [{ name: 'Reviewer', role: 'Review', instruction: 'Check evidence' }],
  }) {
    const office = service!.save(draft)
    const rootId = SessionId(randomUUID())
    await invoke('team-office-open', rootId, office.id)
    return service!.read(rootId)!.office
  }
  async function admit(sessionId: SessionId, messages: UserMessage[], admittedMessages = messages) {
    const next = vi.fn(async () => ({ kind: 'enter' as const, messages: admittedMessages }))
    const decision: unknown = await Reflect.apply(ctx.waterfall.bind(ctx), ctx, ['agent/pre-step', {
      agent: { session: { id: sessionId } }, messages, turn: 1, step: 1,
      signal: new AbortController().signal, modelSelection: { provider: 'mock', model: 'mock' },
    }, next])
    return { decision, next }
  }
  async function delegate(agent: { id: SessionId }, member: string, task: string, callId: string,
    signal = new AbortController().signal): Promise<unknown> {
    const tool = tools.get('office_delegate')
    if (!tool) throw new Error('Missing delegation tool')
    return Reflect.apply(tool.definition.execute.bind(tool.definition), tool.definition, [{ member, task }, { agent, callId, signal }])
  }
  return { root, ctx, service, owner, projects, subagents, welcome, invoke, open, scope, admit, delegate, commandExecute, tools }
}

async function delegatedFixture() {
  const f = await fixture()
  const office = await f.open({ name: 'Office', description: '', leaderIndex: 0, members: [
    { name: 'Coordinator', role: 'Coordination', instruction: 'Compare viewpoints' },
    { name: 'Reviewer', role: 'Review', instruction: 'Check evidence' },
  ] })
  const rootId = SessionId(randomUUID())
  await f.invoke('team-office-topic-open', rootId, { officeId: office.id, topicId: 'thread:delegation' })
  await f.invoke('team-office-send', rootId, { id: randomUUID(), text: 'Review the proposal' })
  const discussion = f.service.read(rootId)!
  const leader = discussion.office.members[0]!
  const reviewer = discussion.office.members[1]!
  const rootAgent = { id: rootId, session: { id: rootId }, followup: f.welcome }
  f.subagents.rootOf.mockReturnValue(rootAgent)
  return { ...f, rootId, rootAgent, leader, reviewer, leaderMessage: discussion.messages[0]! }
}

it('excludes current and restored office conversations from New Session reuse', async () => {
  const f = await fixture()
  const canReuse = (sessionId: SessionId) => f.ctx.waterfall('api-session/reusable', sessionId, () => true)
  const office = await f.open()
  const topic = SessionId('bound-topic')
  await f.invoke('team-office-topic-open', topic, { officeId: office.id, topicId: 'thread:reuse' })
  expect(canReuse(SessionId('ordinary-draft'))).toBe(true)
  expect(canReuse(office.sessionId!)).toBe(false)
  expect(canReuse(topic)).toBe(false)

  await f.owner.dispose()
  const restored = await fixture(f.root)
  expect(restored.ctx.waterfall('api-session/reusable', office.sessionId!, () => true)).toBe(false)
  expect(restored.ctx.waterfall('api-session/reusable', topic, () => true)).toBe(false)
  expect(restored.ctx.waterfall('api-session/reusable', SessionId('ordinary-draft'), () => true)).toBe(true)
})

it('delegates through the office root, persists the actual result and deduplicates a repeated tool call', async () => {
  const f = await delegatedFixture()
  const received = f.delegate({ id: f.leader.sessionId! }, f.reviewer.name, 'Check the evidence', 'call-office-one')
  await vi.waitFor(() => { expect(f.subagents.startActivation).toHaveBeenCalledTimes(2) })
  const pending = f.service.read(f.rootId)!.messages[1]!
  expect(pending).toMatchObject({ memberId: f.reviewer.id, requestedBy: f.leader.id,
    requestedFor: f.leaderMessage.id,
    sourceMessageRef: f.leaderMessage.sourceMessageRef, topicId: 'thread:delegation' })
  expect(f.commandExecute).toHaveBeenCalledTimes(1)
  expect(f.commandExecute.mock.calls[0]?.[0]).toBe(f.rootAgent)
  expect(f.subagents.startActivation.mock.calls[1]?.[0].parent.session.id).toBe(f.rootId)
  expect(JSON.stringify(f.subagents.startActivation.mock.calls[1]?.[0].prompt)).toContain('Subtask authored by office leader Coordinator')
  const info: SubagentRunEndInfo = { runId: 'delegated-run' as SubagentRunEndInfo['runId'], provider: 'spawn',
    parentSessionId: f.rootId, id: f.reviewer.sessionId!, local: true, stopReason: 'completed',
    lastAssistantMessage: [{ type: 'text', text: 'Evidence verified' }] }
  await f.ctx.parallel('subagent/end', info)
  expect(await received).toMatchObject({ memberId: f.reviewer.id, name: f.reviewer.name,
    messageId: pending.id, output: 'Evidence verified', topicContext: 'Scoped topic history' })
  expect(f.service.read(f.rootId)!.messages[1]).toMatchObject({
    status: 'completed', output: 'Evidence verified', requestedFor: f.leaderMessage.id,
  })
  expect(f.projects.submitMemberRequest).toHaveBeenCalledTimes(1)
  expect(await f.delegate({ id: f.leader.sessionId! }, f.reviewer.id, 'Check the evidence', 'call-office-one'))
    .toMatchObject({ messageId: pending.id, output: 'Evidence verified' })
  expect(f.subagents.startActivation).toHaveBeenCalledTimes(2)
  expect(f.service.read(f.rootId)!.messages).toHaveLength(2)
})

it('rejects non-leaders and members outside the current office before dispatch', async () => {
  const f = await delegatedFixture()
  const when = f.tools.get('office_delegate')?.options.when
  if (!when) throw new Error('Missing office leader availability condition')
  expect(await Reflect.apply(when, undefined, [{ agent: { id: f.leader.sessionId } }])).toBe(true)
  expect(await Reflect.apply(when, undefined, [{ agent: { id: f.reviewer.sessionId } }])).toBe(false)
  await expect(f.delegate({ id: f.reviewer.sessionId! }, f.leader.id, 'Unauthorized', 'call-denied')).rejects.toThrow('Only the active')
  await expect(f.delegate({ id: f.leader.sessionId! }, randomUUID(), 'Other office', 'call-foreign')).rejects.toThrow('does not belong')
  await expect(f.delegate({ id: f.leader.sessionId! }, f.leader.id, 'Self', 'call-self')).rejects.toThrow('another member')
  f.subagents.rootOf.mockReturnValue({ id: SessionId(randomUUID()) })
  await expect(f.delegate({ id: f.leader.sessionId! }, f.reviewer.id, 'Wrong root', 'call-root')).rejects.toThrow('does not belong')
  expect(f.commandExecute).not.toHaveBeenCalled()
  expect(f.subagents.startActivation).toHaveBeenCalledTimes(1)
})

it('rejects a waiting delegation when the office service is unloaded', async () => {
  const f = await delegatedFixture()
  const result = f.delegate({ id: f.leader.sessionId! }, f.reviewer.id, 'Pending task', 'call-unload')
  await vi.waitFor(() => { expect(f.subagents.startActivation).toHaveBeenCalledTimes(2) })
  const rejected = expect(result).rejects.toThrow('Office service stopped')
  await f.owner.dispose()
  await rejected
})

it('interrupts the delegated member on cancellation and waits for its terminal record', async () => {
  const f = await delegatedFixture()
  const abort = new AbortController()
  const received = f.delegate({ id: f.leader.sessionId! }, f.reviewer.id, 'Cancelable task', 'call-cancel', abort.signal)
  await vi.waitFor(() => { expect(f.subagents.startActivation).toHaveBeenCalledTimes(2) })
  const rejected = expect(received).rejects.toThrow('Canceled delegation')
  abort.abort(new Error('Canceled delegation'))
  expect(f.subagents.interrupt).toHaveBeenCalledWith(f.reviewer.sessionId, { kind: 'ancestor', agent: f.rootAgent })
  const info: SubagentRunEndInfo = { runId: 'canceled-run' as SubagentRunEndInfo['runId'], provider: 'spawn',
    parentSessionId: f.rootId, id: f.reviewer.sessionId!, local: true, stopReason: 'aborted', lastAssistantMessage: [] }
  await f.ctx.parallel('subagent/end', info)
  await rejected
  expect(f.service.read(f.rootId)!.messages[1]?.status).toBe('failed')
})

it('resolves a draft leader index to a stored member identity and rejects invalid indices', async () => {
  const f = await fixture()
  const draft: OfficeDraft = { name: 'Office', description: '', members: [
    { name: 'Coordinator', role: 'Coordination', instruction: 'Compare viewpoints' },
    { name: 'Reviewer', role: 'Review', instruction: 'Check evidence' },
  ], leaderIndex: 1 }
  const office = await f.open(draft)
  expect(office.leaderId).toBe(office.members[1]!.id)
  expect(office).not.toHaveProperty('leaderIndex')
  expect(f.service.list()[0]).not.toHaveProperty('leaderIndex')
  expect(() => f.service.save({ ...draft, leaderIndex: 2 })).toThrow('outside the office roster')
  expect(() => f.service.save({ ...draft, leaderIndex: -1 })).toThrow()
  expect(() => f.service.save({ ...draft, leaderIndex: 0.5 })).toThrow()
  expect(f.service.list()).toHaveLength(1)
})

it('changes and clears the leader while preserving all existing session and member identities', async () => {
  const f = await fixture()
  const office = await f.open()
  expect(office.leaderId).toBeUndefined()
  const selected = f.service.setLeader(office.id, office.members[0]!.id)
  expect(selected).toEqual({ ...office, leaderId: office.members[0]!.id })
  expect(() => f.service.setLeader(office.id, randomUUID() as OfficeMemberId)).toThrow('does not belong')
  expect(f.service.setLeader(office.id)).toEqual(office)
  const topicRoot = SessionId(randomUUID())
  await f.invoke('team-office-topic-open', topicRoot, { officeId: office.id, topicId: 'thread:leader' })
  const topicMembers = f.service.read(topicRoot)!.office.members
  f.service.setLeader(office.id, office.members[0]!.id)
  expect(f.service.read(topicRoot)!.office).toMatchObject({ leaderId: office.members[0]!.id, members: topicMembers })
  await f.owner.dispose()
  const resumed = await fixture(f.root)
  expect(resumed.service.read(office.sessionId!)!.office).toEqual(selected)
  expect(resumed.service.setLeader(office.id)).toEqual(office)
})

it('edits the office roster while preserving member, lobby and topic histories after reopening', async () => {
  const f = await fixture()
  const office = await f.open()
  const topicRoot = SessionId(randomUUID())
  await f.invoke('team-office-topic-open', topicRoot, { officeId: office.id, topicId: 'thread:edit' })
  const originalTopicMember = f.service.read(topicRoot)!.office.members[0]!
  const originalMember = office.members[0]!
  const draft = { name: 'Edited office', description: 'Updated purpose', leaderIndex: 1,
    members: [{ ...originalMember, name: 'Renamed reviewer', role: 'Evidence review', instruction: 'Check the new requirements' },
      { id: randomUUID() as OfficeMemberId, name: 'Writer', role: 'Writing', instruction: 'Write a concise summary', agentPreset: 'standard' }] }
  const updated = f.service.update(office.id, draft)
  expect(f.service.update(office.id, draft)).toEqual(updated)
  expect(updated.sessionId).toBe(office.sessionId)
  expect(updated.members[0]).toMatchObject({ id: originalMember.id, sessionId: originalMember.sessionId,
    name: 'Renamed reviewer', instruction: 'Check the new requirements' })
  expect(updated.members[1]!.sessionId).toBeTruthy()
  expect(updated.leaderId).toBe(updated.members[1]!.id)
  const topic = f.service.read(topicRoot)!
  expect(topic.office.members[0]!.sessionId).toBe(originalTopicMember.sessionId)
  expect(topic.office.members[1]!.sessionId).toBeTruthy()
  expect(topic.office.members[1]!.sessionId).not.toBe(updated.members[1]!.sessionId)
  await f.invoke('team-office-send', topicRoot, { id: randomUUID(), memberId: originalMember.id, text: 'Check' })
  expect(JSON.stringify(f.subagents.startActivation.mock.calls[0]?.[0].prompt)).toContain('Check the new requirements')
  await f.owner.dispose()
  const resumed = await fixture(f.root)
  expect(resumed.service.read(office.sessionId!)!.office).toEqual(updated)
  expect(resumed.service.read(topicRoot)!.office.members).toEqual(topic.office.members)
  expect(resumed.service.read(topicRoot)!.messages).toHaveLength(1)
  const removed = resumed.service.update(office.id, { name: updated.name, description: updated.description,
    members: [updated.members[1]!], leaderIndex: 0 })
  expect(removed.members).toHaveLength(1)
  expect(resumed.service.read(topicRoot)!.messages[0]!.memberId).toBe(originalMember.id)
  expect(resumed.service.read(topicRoot)!.office.members[0]!.sessionId).toBe(topic.office.members[1]!.sessionId)
  expect(() => resumed.service.update(office.id, draft)).toThrow('former member')
})

it('rejects invalid roster edits and removing a busy member without changing the office', async () => {
  const f = await fixture()
  const office = await f.open({ name: 'Office', description: '', members: [
    { name: 'Reviewer', role: 'Review', instruction: 'Check', agentPreset: 'standard' },
    { name: 'Writer', role: 'Write', instruction: 'Draft' },
  ] })
  const draft = { name: office.name, description: office.description, members: office.members }
  const foreign = f.service.save({ name: 'Other office', description: '', members: [{ name: 'Other member', role: 'Other', instruction: 'Other' }] })
  expect(() => f.service.update(office.id, { ...draft, members: [{ ...office.members[0]!, id: foreign.members[0]!.id }] })).toThrow('belongs to another office')
  expect(() => f.service.update(office.id, { ...draft, members: [office.members[0]!, office.members[0]!] })).toThrow('names must be unique')
  expect(() => f.service.update(office.id, { ...draft, leaderIndex: 9 })).toThrow('outside the office roster')
  await f.invoke('team-office-send', office.sessionId!, { id: randomUUID(), memberId: office.members[0]!.id, text: 'Review' })
  expect(() => f.service.update(office.id, { ...draft, members: [office.members[1]!] })).toThrow('still working')
  expect(() => f.service.update(office.id, { ...draft, leaderIndex: 1 })).toThrow('still working')
  expect(f.service.list().find(item => item.id === office.id)).toEqual(office)
})

it('routes unaddressed requests to the leader and keeps retries bound after the leader changes', async () => {
  const f = await fixture()
  const office = await f.open({ name: 'Office', description: '', leaderIndex: 0, members: [
    { name: 'Coordinator', role: 'Coordination', instruction: 'Compare viewpoints' },
    { name: 'Reviewer', role: 'Review', instruction: 'Check evidence' },
  ] })
  const [coordinator, reviewer] = office.members
  if (!coordinator?.sessionId || !reviewer?.sessionId) throw new Error('Member sessions were not allocated')
  const input = { id: randomUUID(), text: 'Compare the options' }
  await f.invoke('team-office-send', office.sessionId!, input)
  expect(f.subagents.startActivation.mock.calls[0]?.[0].childId).toBe(coordinator.sessionId)
  expect(JSON.stringify(f.subagents.startActivation.mock.calls[0]?.[0].prompt)).toContain('act as the office leader')
  expect(JSON.stringify(f.subagents.startActivation.mock.calls[0]?.[0].prompt)).toContain('Never invent another member')
  f.service.setLeader(office.id, reviewer.id)
  await f.invoke('team-office-send', office.sessionId!, input)
  expect(f.subagents.startActivation).toHaveBeenCalledTimes(1)
  expect(f.service.read(office.sessionId!)!.messages[0]!.memberId).toBe(coordinator.id)
  await expect(f.invoke('team-office-send', office.sessionId!, { ...input, memberId: reviewer.id })).rejects.toThrow('another request')
  await f.invoke('team-office-send', office.sessionId!, { id: randomUUID(), text: 'A new request' })
  expect(f.subagents.startActivation.mock.calls[1]?.[0].childId).toBe(reviewer.sessionId)
  const finished: SubagentRunEndInfo = { runId: 'leader-run' as SubagentRunEndInfo['runId'], provider: 'spawn',
    parentSessionId: office.sessionId!, id: coordinator.sessionId, local: true, stopReason: 'completed',
    lastAssistantMessage: [{ type: 'text', text: 'Compared' }] }
  await f.ctx.parallel('subagent/end', finished)
  await f.invoke('team-office-send', office.sessionId!, { id: randomUUID(), memberId: coordinator.id, text: 'Explicit specialist' })
  expect(f.subagents.followup.mock.calls[0]?.[1]).toBe(coordinator.sessionId)
  expect(JSON.stringify(f.subagents.followup.mock.calls[0]?.[2])).toContain('act as the addressed specialist')
  f.service.setLeader(office.id)
  await f.invoke('team-office-send', office.sessionId!, input)
  await expect(f.invoke('team-office-send', office.sessionId!, { id: randomUUID(), text: 'No default recipient' })).rejects.toThrow('no leader')
})

it('binds one canonical topic conversation without dispatching and preserves the original history cutoff', async () => {
  const f = await fixture()
  const office = await f.open()
  const topicId = 'thread:one' as OfficeTopicId
  const rootId = SessionId(randomUUID())
  await Promise.all([
    f.invoke('team-office-topic-open', rootId, { officeId: office.id, topicId }),
    f.invoke('team-office-topic-open', SessionId(randomUUID()), { officeId: office.id, topicId }),
  ])
  f.projects.topicScope.mockResolvedValue({ ...f.scope(topicId), historyThroughSequence: 99 })
  expect(await f.service.resolveTopicSession(office.id, topicId)).toEqual({ sessionId: rootId, workspaceId: WorkspaceId('workspace'), scope: f.scope(topicId) })
  const discussion = f.service.read(rootId)!
  expect(discussion.scope).toEqual(f.scope(topicId))
  expect(discussion.office.members[0]!.sessionId).not.toBe(office.members[0]!.sessionId)
  expect(f.service.list()[0]).toEqual(office)
  expect(f.welcome).toHaveBeenCalledTimes(2)
  expect(f.subagents.startActivation).not.toHaveBeenCalled()
})

it('rejects topic initialization before a model step and preserves subsequent user input', async () => {
  const f = await fixture()
  const office = await f.open()
  const rootId = SessionId(randomUUID())
  const topicId = 'thread:one' as OfficeTopicId
  await f.invoke('team-office-topic-open', rootId, { officeId: office.id, topicId })
  const initialization = createUserMessage({ source: { kind: 'team-office-topic-initialization', officeId: office.id, topicId },
    content: [{ type: 'text', text: 'Initialize' }] })
  const user = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Do not discard this question' }] })
  const runtimeContext = createUserMessage({ source: { kind: 'runtime-context', form: 'snapshot',
    sections: [{ name: 'native-runtime', text: 'Native runtime context' }] },
  content: [{ type: 'text', text: 'Native runtime context' }] })
  const initial = await f.admit(rootId, [initialization])
  expect(initial.decision).toEqual({ kind: 'reject' })
  expect(initial.next).toHaveBeenCalledTimes(1)
  expect((await f.admit(rootId, [initialization], [initialization, runtimeContext])).decision).toEqual({ kind: 'reject' })
  expect((await f.admit(rootId, [initialization, user])).decision).toEqual({ kind: 'enter', messages: [user] })
  expect((await f.admit(rootId, [initialization, user], [initialization, user, runtimeContext])).decision)
    .toEqual({ kind: 'enter', messages: [user, runtimeContext] })
  expect((await f.admit(rootId, [user])).decision).toEqual({ kind: 'enter', messages: [user] })
  expect((await f.admit(office.sessionId!, [initialization])).decision).toEqual({ kind: 'enter', messages: [initialization] })
})

it('rejects lobby initialization without removing real user messages', async () => {
  const f = await fixture()
  const office = await f.open()
  const initialization = createUserMessage({ source: { kind: 'team-office-context', form: 'snapshot',
    sections: [{ name: 'office', text: 'Initialize office' }] }, content: [{ type: 'text', text: 'Initialize office' }] })
  const user = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'A real question' }] })
  expect((await f.admit(office.sessionId!, [initialization])).decision).toEqual({ kind: 'reject' })
  expect((await f.admit(office.sessionId!, [initialization, user])).decision).toEqual({ kind: 'enter', messages: [user] })
  expect((await f.admit(SessionId(randomUUID()), [initialization])).decision).toEqual({ kind: 'enter', messages: [initialization] })
})

it('filters initialization after earlier registered plugins append runtime context', async () => {
  const runtimeContext = createUserMessage({ source: { kind: 'runtime-context', form: 'snapshot',
    sections: [{ name: 'native-runtime', text: 'Native runtime context' }] },
  content: [{ type: 'text', text: 'Native runtime context' }] })
  const f = await fixture(undefined, runtimeContext)
  const office = await f.open()
  const rootId = SessionId(randomUUID())
  const topicId = 'thread:one' as OfficeTopicId
  await f.invoke('team-office-topic-open', rootId, { officeId: office.id, topicId })
  const initialization = createUserMessage({ source: { kind: 'team-office-topic-initialization', officeId: office.id, topicId },
    content: [{ type: 'text', text: 'Initialize' }] })
  const user = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'A real question' }] })
  expect((await f.admit(rootId, [initialization])).decision).toEqual({ kind: 'reject' })
  expect((await f.admit(rootId, [initialization, user])).decision).toEqual({ kind: 'enter', messages: [user, runtimeContext] })
})

it('keeps initialization rejected through a later prepended context plugin', async () => {
  const context = createUserMessage({ source: { kind: 'runtime-context', form: 'snapshot',
    sections: [{ name: 'native-runtime', text: 'Outer runtime context' }] },
  content: [{ type: 'text', text: 'Outer runtime context' }] })
  const f = await fixture(undefined, undefined, context)
  const office = await f.open()
  const rootId = SessionId(randomUUID())
  const topicId = 'thread:one' as OfficeTopicId
  await f.invoke('team-office-topic-open', rootId, { officeId: office.id, topicId })
  const initialization = createUserMessage({ source: { kind: 'team-office-topic-initialization', officeId: office.id, topicId },
    content: [{ type: 'text', text: 'Initialize' }] })
  const user = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'A real question' }] })
  expect((await f.admit(rootId, [initialization])).decision).toEqual({ kind: 'reject' })
  expect((await f.admit(rootId, [initialization, user])).decision).toEqual({ kind: 'enter', messages: [user, context] })
})

it('suppresses only automatic settlement notices from members dispatched in the current office conversation', async () => {
  const f = await fixture()
  const office = await f.open()
  const rootId = SessionId(randomUUID())
  await f.invoke('team-office-topic-open', rootId, { officeId: office.id, topicId: 'thread:one' })
  await f.invoke('team-office-send', rootId, { id: randomUUID(), memberId: office.members[0]!.id, text: 'Review' })
  const childId = f.service.read(rootId)!.office.members[0]!.sessionId!
  const notice = createUserMessage({ source: { kind: 'subagent-settled', form: 'notice', summary: 'Review complete',
    senderSessionId: childId }, content: [{ type: 'text', text: 'Automatic completion' }] })
  const foreign = createUserMessage({ source: { kind: 'subagent-settled', form: 'notice', summary: 'Other complete',
    senderSessionId: SessionId(randomUUID()) }, content: [{ type: 'text', text: 'Unrelated completion' }] })
  const authored = createUserMessage({ source: { kind: 'agent-message', form: 'relay', senderSessionId: childId },
    content: [{ type: 'text', text: 'A message intentionally authored by the member' }] })
  const user = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'A real question' }] })
  expect((await f.admit(rootId, [notice])).decision).toEqual({ kind: 'reject' })
  expect((await f.admit(rootId, [foreign])).decision).toEqual({ kind: 'enter', messages: [foreign] })
  expect((await f.admit(office.sessionId!, [notice])).decision).toEqual({ kind: 'enter', messages: [notice] })
  expect((await f.admit(rootId, [notice, user, authored])).decision).toEqual({ kind: 'enter', messages: [user, authored] })
  expect((await f.admit(rootId, [notice, foreign])).decision).toEqual({ kind: 'enter', messages: [foreign] })
  await f.invoke('team-office-send', office.sessionId!, { id: randomUUID(), memberId: office.members[0]!.id, text: 'Lobby review' })
  const lobbyNotice = createUserMessage({ source: { kind: 'subagent-settled', form: 'notice', summary: 'Lobby complete',
    senderSessionId: office.members[0]!.sessionId! }, content: [{ type: 'text', text: 'Lobby completion' }] })
  expect((await f.admit(office.sessionId!, [lobbyNotice])).decision).toEqual({ kind: 'reject' })
})

it('isolates members by topic, rejects cross-topic sends and dispatches duplicate requests once', async () => {
  const f = await fixture()
  const office = await f.open()
  const memberId = office.members[0]!.id
  const firstRoot = SessionId(randomUUID())
  const secondRoot = SessionId(randomUUID())
  await f.invoke('team-office-topic-open', firstRoot, { officeId: office.id, topicId: 'thread:one' })
  await f.invoke('team-office-topic-open', secondRoot, { officeId: office.id, topicId: 'thread:two' })
  const first = { id: randomUUID(), memberId, text: 'First task' }
  const second = { id: randomUUID(), memberId, text: 'Second task' }
  const firstCommandId = CommandId(randomUUID())
  await Promise.all([f.invoke('team-office-send', firstRoot, first, firstCommandId), f.invoke('team-office-send', secondRoot, second)])
  await f.invoke('team-office-send', firstRoot, first)
  expect(f.subagents.startActivation).toHaveBeenCalledTimes(2)
  expect(f.projects.submitMemberRequest).toHaveBeenCalledTimes(2)
  const firstChild = f.service.read(firstRoot)!.office.members[0]!.sessionId!
  const secondChild = f.service.read(secondRoot)!.office.members[0]!.sessionId!
  expect(firstChild).not.toBe(secondChild)
  expect(f.service.read(firstRoot)!.messages).toMatchObject([{
    commandId: firstCommandId, text: 'First task', topicId: 'thread:one', sourceMessageSequence: 13,
  }])
  expect(f.service.read(secondRoot)!.messages).toMatchObject([{ text: 'Second task', topicId: 'thread:two' }])
  expect(f.service.read(office.sessionId!)!.messages).toEqual([])
  await expect(f.invoke('team-office-send', firstRoot, { ...second, id: randomUUID(), topicId: 'thread:two' })).rejects.toThrow('different office topic')
  await expect(f.invoke('team-office-send', firstRoot, { ...second, id: randomUUID() })).rejects.toThrow('still working')
  const end: SubagentRunEndInfo = { runId: 'run' as SubagentRunEndInfo['runId'], provider: 'spawn',
    parentSessionId: firstRoot, id: firstChild, local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: 'Reviewed' }] }
  await f.ctx.parallel('subagent/end', end)
  await f.invoke('team-office-send', firstRoot, { ...first, id: randomUUID(), text: 'Follow-up' })
  expect(f.subagents.followup).toHaveBeenCalledTimes(1)
  expect(f.service.topicMessages(office.id, 'thread:one' as OfficeTopicId)).toHaveLength(2)
})

it('refuses a failed delivery retry with the same identity and accepts a fresh request', async () => {
  const f = await fixture()
  const office = await f.open()
  const rootId = SessionId(randomUUID())
  await f.invoke('team-office-topic-open', rootId, { officeId: office.id, topicId: 'thread:one' })
  const input = { id: randomUUID(), memberId: office.members[0]!.id, text: 'Retry this task' }
  f.subagents.startActivation.mockRejectedValueOnce(new Error('Admission failed'))
  await expect(f.invoke('team-office-send', rootId, input)).rejects.toThrow('Admission failed')
  await expect(f.invoke('team-office-send', rootId, input)).rejects.toThrow('new request to retry')
  expect(f.service.read(rootId)!.messages[0]!.status).toBe('failed')
  expect(f.subagents.startActivation).toHaveBeenCalledTimes(1)
  await f.invoke('team-office-send', rootId, { ...input, id: randomUUID() })
  expect(f.subagents.startActivation).toHaveBeenCalledTimes(2)
  expect(f.service.read(rootId)!.messages.map(message => message.status)).toEqual(['failed', 'running'])
})

it('restores the topic mapping and member identities after restart while interrupting unfinished deliveries', async () => {
  const f = await fixture()
  const office = await f.open()
  const topicId = 'thread:one' as OfficeTopicId
  const rootId = SessionId(randomUUID())
  await f.invoke('team-office-topic-open', rootId, { officeId: office.id, topicId })
  const before = f.service.read(rootId)!
  const input = { id: randomUUID(), memberId: office.members[0]!.id, text: 'Pending' }
  await f.invoke('team-office-send', rootId, input)
  await f.owner.dispose()
  const resumed = await fixture(f.root)
  expect((await resumed.service.resolveTopicSession(office.id, topicId)).sessionId).toBe(rootId)
  const after = resumed.service.read(rootId)!
  expect(after.scope).toEqual(before.scope)
  expect(after.office.members).toEqual(before.office.members)
  expect(after.messages[0]!.status).toBe('interrupted')
  await expect(resumed.invoke('team-office-send', rootId, input)).rejects.toThrow('new request to retry')
  expect(resumed.subagents.startActivation).not.toHaveBeenCalled()
  expect(resumed.service.read(office.sessionId!)!.office.members).toEqual(office.members)
  await resumed.invoke('team-office-topic-open', rootId, { officeId: office.id, topicId, restore: true })
  expect(resumed.welcome).toHaveBeenCalledTimes(1)
  expect((await resumed.admit(rootId, [createUserMessage({
    source: { kind: 'team-office-topic-initialization', officeId: office.id, topicId }, content: [{ type: 'text', text: 'Restore' }],
  })])).decision).toEqual({ kind: 'reject' })
})

it('migrates v1 records without changing office identities or message JSON', async () => {
  const root = await mkdtemp(join(tmpdir(), 'office-v1-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const office: Office = { id: randomUUID() as OfficeId, name: 'Existing office', description: '', sessionId: SessionId('old-root'),
    members: [{ id: randomUUID() as OfficeMemberId, name: 'Reviewer', role: 'Review', instruction: 'Check', sessionId: SessionId('old-child') }] }
  const message: OfficeMessage = { id: randomUUID() as OfficeMessageId, memberId: office.members[0]!.id, memberName: 'Reviewer',
    text: 'Old question', createdAt: 1, status: 'completed', output: 'Old answer' }
  const serialized = JSON.stringify(message)
  const db = new DatabaseSync(join(root, 'team-offices.sqlite'))
  db.exec(`CREATE TABLE offices (id TEXT PRIMARY KEY, session_id TEXT UNIQUE, data TEXT NOT NULL);
    CREATE TABLE messages (id TEXT PRIMARY KEY, office_id TEXT NOT NULL, member_id TEXT NOT NULL, child_id TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL);
    CREATE UNIQUE INDEX active_member ON messages(office_id,member_id) WHERE status='running'; PRAGMA user_version=1;`)
  db.prepare('INSERT INTO offices VALUES (?,?,?)').run(office.id, office.sessionId!, JSON.stringify(office))
  db.prepare('INSERT INTO messages VALUES (?,?,?,?,?,?)').run(message.id, office.id, message.memberId, 'old-child', 'completed', serialized)
  db.close()
  const f = await fixture(root)
  expect(f.service.read(office.sessionId!)).toEqual({ office, messages: [message] })
  expect(f.service.setLeader(office.id, office.members[0]!.id)).toEqual({ ...office, leaderId: office.members[0]!.id })
  expect(f.service.setLeader(office.id)).toEqual(office)
  const check = new DatabaseSync(join(root, 'team-offices.sqlite'))
  expect(check.prepare('SELECT data,root_session_id FROM messages').get()).toEqual({ data: serialized, root_session_id: 'old-root' })
  expect(check.prepare('PRAGMA user_version').get()?.user_version).toBe(2)
  check.close()
})

it('switches a member preset for new lobby and topic messages while preserving earlier executions and retries', async () => {
  const f = await fixture()
  const office = await f.open({ name: 'Office', description: '', leaderIndex: 0,
    members: [{ name: 'Reviewer', role: 'Review', instruction: 'Check facts', agentPreset: 'expert-v1' }] })
  const member = office.members[0]!
  const root = office.sessionId!
  const topic = SessionId(randomUUID())
  await f.invoke('team-office-topic-open', topic, { officeId: office.id, topicId: 'thread:switch' })
  const oldTopicChild = f.service.read(topic)!.office.members[0]!.sessionId!
  const first = { id: randomUUID(), memberId: member.id, text: 'Old request' }
  await f.invoke('team-office-send', root, first)
  const updated = f.service.update(office.id, { name: office.name, description: '', leaderIndex: 0,
    members: [{ ...member, agentPreset: 'expert-v2', role: 'Independent review', instruction: 'Check evidence' }] })
  const current = updated.members[0]!
  expect(current.id).toBe(member.id)
  expect(current.sessionId).not.toBe(member.sessionId)
  expect(updated.leaderId).toBe(member.id)
  const topicChild = f.service.read(topic)!.office.members[0]!.sessionId!
  expect(topicChild).not.toBe(oldTopicChild)
  expect(f.service.update(office.id, { ...updated, leaderIndex: 0 })).toEqual(updated)
  expect(f.service.read(topic)!.office.members[0]!.sessionId).toBe(topicChild)
  await f.invoke('team-office-send', root, first)
  expect(f.subagents.startActivation).toHaveBeenCalledTimes(1)
  const second = { id: randomUUID(), memberId: member.id, text: 'New request' }
  await f.invoke('team-office-send', root, second)
  expect(f.subagents.startActivation.mock.calls[1]?.[0]).toMatchObject({ childId: current.sessionId, agentPreset: 'expert-v2' })
  const end: SubagentRunEndInfo = { runId: 'old-run' as SubagentRunEndInfo['runId'], provider: 'spawn',
    parentSessionId: root, id: member.sessionId!, local: true, stopReason: 'completed',
    lastAssistantMessage: [{ type: 'text', text: 'Original result' }] }
  await f.ctx.parallel('subagent/end', end)
  expect(f.service.read(root)!.messages).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: first.id, agentPreset: 'expert-v1', output: 'Original result', status: 'completed' }),
    expect.objectContaining({ id: second.id, agentPreset: 'expert-v2', status: 'running' }),
  ]))
  await f.owner.dispose()
  const resumed = await fixture(f.root)
  expect(resumed.service.read(root)!.office).toEqual(updated)
  expect(resumed.service.read(root)!.messages[0]).toMatchObject({ agentPreset: 'expert-v1', output: 'Original result' })
  expect(resumed.service.read(topic)!.office.members[0]!.sessionId).toBe(topicChild)
  await resumed.invoke('team-office-send', topic, { id: randomUUID(), memberId: member.id, text: 'Topic request' })
  expect(resumed.subagents.startActivation.mock.calls[0]?.[0]).toMatchObject({ childId: topicChild, agentPreset: 'expert-v2' })
})
