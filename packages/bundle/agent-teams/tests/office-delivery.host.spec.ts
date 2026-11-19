import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { JsonStorageBackend } from '@deepseek-ai/dsh-storage-json'
import { SessionId } from '@deepseek-ai/dsh-session'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { CommandId, type CommandDefinition, type CommandResult } from '@deepseek-ai/dsh-commands'
import type { SubagentRunEndInfo } from '@deepseek-ai/dsh-subagent'
import { TeamOfficeProjects } from '../src/office-projects.ts'
import { TeamOffices } from '../src/office-controller.ts'
import type { Office, OfficeId, OfficeMemberId, OfficeMessage, OfficeMessageId } from '../src/office-types.ts'
import type { AgentTeamOperation } from '../src/contexera-domain/types.ts'

// Partial fixtures expose only consumed methods; reflection avoids claiming they implement complete services.
function providePartial(ctx: Context, name: string, value: object): void {
  Reflect.apply(ctx.provide.bind(ctx), ctx, [name, value])
}

// The command carrier deliberately omits Agent facilities that the office handler does not access.
function invokePartialCommand(command: CommandDefinition, request: object): Promise<CommandResult> {
  return Promise.resolve(Reflect.apply(command.handler, undefined, [request]))
}

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function projectFixture() {
  const root = await mkdtemp(join(tmpdir(), 'office-delivery-'))
  const ctx = new Context()
  const changed = vi.fn()
  ctx.on('team-catalogue/changed', changed)
  const storage = await ctx.plugin(Storage)
  const backend = new JsonStorageBackend(root)
  ctx.storage.backend.register('json', backend)
  ctx.provide('storageDomain', new DomainFacility(ctx, { backend: 'json' }))
  const office: Office = { id: randomUUID() as OfficeId, name: 'Product office', description: '',
    sessionId: SessionId('office-session'), members: [{ id: randomUUID() as OfficeMemberId,
      name: 'Reviewer', role: 'Review', instruction: 'Review facts', agentPreset: 'standard',
      sessionId: SessionId('existing-member-session') }] }
  const deliveries: OfficeMessage[] = []
  // These fixtures provide the registry reads consumed by the adapter; native execution has separate tests below.
  providePartial(ctx, 'teamOffices', { list: () => [office], read: () => ({ office, messages: [] }), topicMessages: () => deliveries })
  providePartial(ctx, 'workspaceRegistry', { list: () => [{ id: WorkspaceId('workspace'), sessionIds: [office.sessionId!] }] })
  providePartial(ctx, 'profileContext', { dir: root })
  providePartial(ctx, 'tools', { register: () => () => {} })
  let projects: TeamOfficeProjects | undefined
  const mount = () => ctx.plugin({ name: 'office-delivery-fixture', inject: ['storageDomain'], apply: (scope: Context) => {
    projects = new TeamOfficeProjects(scope)
  } })
  let owner = await mount()
  cleanups.push(async () => { await owner.dispose(); await backend.close(); await storage.dispose(); await rm(root,
    { recursive: true, force: true }) })
  if (!projects) throw new Error('Office projects did not activate')
  const project = await projects.createProject(office.id, 'Release readiness', 'Verify the release', randomUUID())
  const topic = await projects.startTopic(office.id, project, 'Check totals\n@Reviewer calculate 17 + 25.', randomUUID())
  const restart = async () => {
    await owner.dispose()
    owner = await mount()
    if (!projects) throw new Error('Office projects did not reactivate')
    return projects
  }
  return { root, office, projects, topic, deliveries, restart, changed }
}

it('prepares topic scope without marking it read and acknowledges only the delivered snapshot', async () => {
  const { root, office, projects, topic } = await projectFixture()
  const member = office.members[0]!
  const input = await projects.memberInput(office, member.id, topic.topicId, topic.sourceMessageRef)
  expect((await projects.overview(office.id, member.id)).unread).toBe(1)
  expect(input.text).toContain('Project: Release readiness')
  expect(input.text).toContain(`Topic: Check totals (${topic.topicId})`)
  expect(input.text).toContain(`[Human | ${topic.sourceMessageRef}]`)
  expect(input.text).toContain(`Reply to message: ${topic.sourceMessageRef}`)
  const second = await projects.reply(office.id, topic.topicId, '@Reviewer also check the newer request.', input.revision, randomUUID())
  const message: OfficeMessage = { id: randomUUID() as OfficeMessageId, memberId: member.id, memberName: member.name,
    text: 'calculate', createdAt: 1, status: 'running', topicId: topic.topicId, sourceMessageRef: topic.sourceMessageRef,
    topicInputSequence: input.readThroughSequence, topicInputRevision: input.revision }
  await projects.acknowledgeMemberInput(office, message)
  expect((await projects.overview(office.id, member.id)).unread).toBe(1)
  expect(await projects.memberReply(office, message, '42')).toBe('unread_required')
  expect((await projects.overview(office.id, member.id)).unread).toBe(1)
  const newer = await projects.memberInput(office, member.id, topic.topicId, second.sourceMessageRef)
  expect(newer.readThroughSequence).toBeGreaterThan(input.readThroughSequence)
  const newerMessage = { ...message, id: randomUUID() as OfficeMessageId,
    sourceMessageRef: second.sourceMessageRef, topicInputSequence: newer.readThroughSequence }
  await projects.acknowledgeMemberInput(office, newerMessage)
  expect((await projects.overview(office.id, member.id)).unread).toBe(0)
  expect(await projects.memberReply(office, newerMessage, 'New request result')).toBeUndefined()
  const stored = JSON.parse(await readFile(
    join(root, `crewon_office_${office.id.replaceAll('-', '')}.json`),
    'utf8')) as { tables: { operations: Record<string, AgentTeamOperation> } }
  const reply = Object.values(stored.tables.operations).findLast(operation => operation.kind === 'team/thread-replied')
  expect(reply?.kind === 'team/thread-replied' && reply.data.message.replyToMessageRef).toBe(second.sourceMessageRef)
})

it('keeps anchor reply compatibility for older messages without a source reference', async () => {
  const { root, office, projects, topic } = await projectFixture()
  const member = office.members[0]!
  const input = await projects.memberInput(office, member.id, topic.topicId)
  const message: OfficeMessage = { id: randomUUID() as OfficeMessageId, memberId: member.id, memberName: member.name,
    text: 'Legacy request', createdAt: 1, status: 'running', topicId: topic.topicId, topicInputSequence: input.readThroughSequence }
  await projects.acknowledgeMemberInput(office, message)
  expect(await projects.memberReply(office, message, 'Legacy result')).toBeUndefined()
  const stored = JSON.parse(await readFile(
    join(root, `crewon_office_${office.id.replaceAll('-', '')}.json`),
    'utf8')) as { tables: { operations: Record<string, AgentTeamOperation> } }
  const reply = Object.values(stored.tables.operations).findLast(operation => operation.kind === 'team/thread-replied')
  expect(reply?.kind === 'team/thread-replied' && reply.data.message.replyToMessageRef).toBe(topic.sourceMessageRef)
})

it('rejects a source from another topic without marking any input read', async () => {
  const { office, projects, topic } = await projectFixture()
  const project = (await projects.overview(office.id)).projects[0]!
  const other = await projects.startTopic(office.id, project.id, 'Other scope\n@Reviewer review this.', randomUUID())
  await expect(projects.memberInput(office, office.members[0]!.id, topic.topicId, other.sourceMessageRef)).rejects.toThrow('another Thread')
  expect((await projects.overview(office.id, office.members[0]!.id)).unread).toBe(2)
})

it('resolves topic workspace and history scope without acknowledging unread messages', async () => {
  const { office, projects, topic } = await projectFixture()
  const member = office.members[0]!
  const unread = (await projects.overview(office.id, member.id)).unread
  const scope = await projects.topicScope(office.id, topic.topicId)
  expect(scope).toMatchObject({ topicId: topic.topicId, projectName: 'Release readiness', title: 'Check totals' })
  expect(scope.historyThroughSequence).toBeGreaterThanOrEqual(topic.sourceMessageSequence)
  expect(await projects.topicWorkspaceId(office.id)).toBe(WorkspaceId('workspace'))
  expect((await projects.overview(office.id, member.id)).unread).toBe(unread)
})

it('synchronizes edited members and new specialists into already opened projects', async () => {
  const { office, projects, topic, restart } = await projectFixture()
  const original = office.members[0]!
  original.name = 'Evidence reviewer'
  original.role = 'Evidence checks'
  const added = { id: randomUUID() as OfficeMemberId, name: 'Writer', role: 'Drafting', instruction: 'Summarize',
    agentPreset: 'standard', sessionId: SessionId('writer-session') }
  office.members.push(added)
  const posted = await projects.submitMemberRequest(office.id, topic.topicId, added.id, 'Summarize the findings', randomUUID())
  const input = await projects.memberInput(office, added.id, topic.topicId, posted.sourceMessageRef)
  expect(input.text).toContain('@Writer Summarize the findings')
  await projects.overview(office.id, original.id)
  const history = await projects.topic(office.id, topic.topicId)
  expect(history.messages.some(message => message.body.includes('@Writer'))).toBe(true)
  const secondProject = await projects.createProject(office.id, 'Second project', '', randomUUID())
  const secondTopic = await projects.startTopic(office.id, secondProject, '@Evidence reviewer check this.', randomUUID())
  expect((await projects.memberInput(office, original.id, secondTopic.topicId)).text).toContain('@Evidence reviewer')
  office.members = [added]
  await projects.overview(office.id)
  await expect(projects.overview(office.id, original.id)).rejects.toThrow('does not belong')
  expect((await projects.topic(office.id, topic.topicId)).messages).toHaveLength(history.messages.length)
  const resumed = await restart()
  expect((await resumed.topic(office.id, topic.topicId)).messages).toHaveLength(history.messages.length)
  const next = await resumed.submitMemberRequest(office.id, topic.topicId, added.id, 'Continue after restart', randomUUID())
  expect((await resumed.memberInput(office, added.id, topic.topicId, next.sourceMessageRef)).text)
    .toContain('@Writer Continue after restart')
})

it('keeps member identities when existing display names are swapped', async () => {
  const { office, projects } = await projectFixture()
  const first = office.members[0]!
  const second = { id: randomUUID() as OfficeMemberId, name: 'Writer', role: 'Drafting', instruction: 'Summarize',
    sessionId: SessionId('writer-session') }
  office.members.push(second)
  await projects.overview(office.id)
  first.name = 'Writer'
  second.name = 'Reviewer'
  await projects.overview(office.id)
  const project = await projects.createProject(office.id, 'Swapped names', '', randomUUID())
  const topic = await projects.startTopic(office.id, project, '@Writer check the evidence.', randomUUID())
  const input = await projects.memberInput(office, first.id, topic.topicId)
  expect(input.text).toContain('@Writer check the evidence.')
  expect((await projects.overview(office.id, first.id)).unread).toBeGreaterThan(0)
})

it('posts an addressed request once and exposes its exact source sequence to the member', async () => {
  const { office, projects, topic } = await projectFixture()
  const member = office.members[0]!
  const id = randomUUID()
  const posted = await projects.submitMemberRequest(office.id, topic.topicId, member.id, 'Check the second total', id)
  const repeated = await projects.submitMemberRequest(office.id, topic.topicId, member.id, 'Check the second total', id)
  expect(repeated).toEqual(posted)
  const input = await projects.memberInput(office, member.id, topic.topicId, posted.sourceMessageRef)
  expect(input.text).toContain('@Reviewer Check the second total')
  expect(input.sourceMessageSequence).toBe(posted.sourceMessageSequence)
  const history = await projects.topic(office.id, topic.topicId)
  expect(history.messages.filter(message => message.id === posted.sourceMessageRef)).toHaveLength(1)
  await expect(projects.submitMemberRequest(office.id, topic.topicId, member.id, 'Changed request', id)).rejects.toThrow('reused')
})

it('keeps a fixed topic history cutoff after later replies', async () => {
  const { office, projects, topic } = await projectFixture()
  const scope = await projects.topicScope(office.id, topic.topicId)
  const newer = await projects.submitMemberRequest(office.id, topic.topicId, office.members[0]!.id, 'Later request', randomUUID())
  const baseline = await projects.topic(office.id, topic.topicId, scope.historyThroughSequence)
  const current = await projects.topic(office.id, topic.topicId)
  expect(baseline.messages.map(message => message.id)).toContain(topic.sourceMessageRef)
  expect(baseline.messages.map(message => message.id)).not.toContain(newer.sourceMessageRef)
  expect(current.messages.map(message => message.id)).toContain(newer.sourceMessageRef)
})

it('serializes simultaneous addressed posts within one topic and recovers after a rejected post', async () => {
  const { office, projects, topic } = await projectFixture()
  const member = office.members[0]!
  const firstId = randomUUID()
  const [first, second] = await Promise.all([
    projects.submitMemberRequest(office.id, topic.topicId, member.id, 'First concurrent request', firstId),
    projects.submitMemberRequest(office.id, topic.topicId, member.id, 'Second concurrent request', randomUUID()),
  ])
  expect(first.sourceMessageRef).not.toBe(second.sourceMessageRef)
  expect(second.sourceMessageSequence).toBeGreaterThan(first.sourceMessageSequence)
  const afterParallel = await projects.topic(office.id, topic.topicId)
  expect(afterParallel.messages.filter(message => message.id === first.sourceMessageRef)).toHaveLength(1)
  expect(afterParallel.messages.filter(message => message.id === second.sourceMessageRef)).toHaveLength(1)
  const [rejected, subsequent] = await Promise.allSettled([
    projects.submitMemberRequest(office.id, topic.topicId, member.id, 'Changed request', firstId),
    projects.submitMemberRequest(office.id, topic.topicId, member.id, 'After rejection', randomUUID()),
  ])
  expect(rejected.status).toBe('rejected')
  if (rejected.status === 'rejected') expect(rejected.reason).toBeInstanceOf(Error)
  expect(subsequent.status).toBe('fulfilled')
  const recovered = await projects.topic(office.id, topic.topicId)
  expect(recovered.messages.filter(message => message.body === '@Reviewer After rejection')).toHaveLength(1)
  expect(recovered.messages.some(message => message.body === '@Reviewer Changed request')).toBe(false)
})

it('reads topic history without clearing human or member unread markers', async () => {
  const { office, projects, topic } = await projectFixture()
  const member = office.members[0]!
  expect((await projects.overview(office.id, member.id)).unread).toBe(1)
  await projects.topic(office.id, topic.topicId)
  expect((await projects.overview(office.id, member.id)).unread).toBe(1)
  const input = await projects.memberInput(office, member.id, topic.topicId, topic.sourceMessageRef)
  const delivery: OfficeMessage = { id: randomUUID() as OfficeMessageId, memberId: member.id, memberName: member.name,
    text: 'Check totals', createdAt: 1, status: 'completed', topicId: topic.topicId, sourceMessageRef: topic.sourceMessageRef,
    topicInputSequence: input.readThroughSequence }
  expect(await projects.memberReply(office, delivery, '42')).toBeUndefined()
  expect((await projects.overview(office.id)).unread).toBe(1)
  await projects.topic(office.id, topic.topicId)
  expect((await projects.overview(office.id)).unread).toBe(1)
})

it('retains delivery details and associates older pending messages with the topic anchor', async () => {
  const { office, projects, topic, deliveries } = await projectFixture()
  const member = office.members[0]!
  const legacy: OfficeMessage = { id: randomUUID() as OfficeMessageId, memberId: member.id, memberName: member.name,
    text: 'Older request', createdAt: 1, status: 'interrupted', topicId: topic.topicId, output: 'Retained partial output' }
  const current: OfficeMessage = { ...legacy, id: randomUUID() as OfficeMessageId, commandId: CommandId(randomUUID()),
    text: 'Current request', status: 'running', sourceMessageRef: topic.sourceMessageRef }
  deliveries.push(legacy, current, { ...legacy, id: randomUUID() as OfficeMessageId, status: 'completed' })
  expect((await projects.topic(office.id, topic.topicId)).deliveries).toEqual([
    { ...legacy, sourceMessageRef: topic.sourceMessageRef }, current,
  ])
})

it('paginates all topic replies and acknowledges only the displayed history watermark', async () => {
  const { office, projects, topic } = await projectFixture()
  const member = office.members[0]!
  const appendReport = async (index: number) => {
    const input = await projects.memberInput(office, member.id, topic.topicId, topic.sourceMessageRef)
    const delivery: OfficeMessage = { id: randomUUID() as OfficeMessageId, memberId: member.id, memberName: member.name,
      text: 'Check totals', createdAt: index, status: 'completed', topicId: topic.topicId, sourceMessageRef: topic.sourceMessageRef,
      topicInputSequence: input.readThroughSequence }
    expect(await projects.memberReply(office, delivery, `Report ${index}`)).toBeUndefined()
  }
  for (let index = 1; index <= 130; index++) await appendReport(index)
  const history = await projects.topic(office.id, topic.topicId)
  expect(history.messages).toHaveLength(131)
  expect(history.messages.slice(1).map(message => message.body))
    .toEqual(Array.from({ length: 130 }, (_, index) => `Report ${index + 1}`))
  expect((await projects.overview(office.id)).unread).toBe(130)
  const visibleThrough = history.messages[75]!.sequence
  await projects.acknowledgeTopic(office.id, topic.topicId, visibleThrough)
  expect((await projects.overview(office.id)).unread).toBe(55)
  await appendReport(131)
  await projects.acknowledgeTopic(office.id, topic.topicId, visibleThrough)
  expect((await projects.overview(office.id)).unread).toBe(56)
  await projects.acknowledgeTopic(office.id, topic.topicId, history.messages.at(-1)!.sequence)
  expect((await projects.overview(office.id)).unread).toBe(1)
  const current = await projects.topic(office.id, topic.topicId)
  await projects.acknowledgeTopic(office.id, topic.topicId, current.messages.at(-1)!.sequence)
  expect((await projects.overview(office.id)).unread).toBe(0)
})

async function nativeFixture(mode: 'start' | 'followup' = 'start') {
  const root = await mkdtemp(join(tmpdir(), 'office-native-delivery-'))
  const ctx = new Context()
  const commands = new Map<string, CommandDefinition>()
  providePartial(ctx, 'profileContext', { dir: root })
  providePartial(ctx, 'tools', { register: () => () => {} })
  providePartial(ctx, 'commands', { register: (definition: CommandDefinition) => { commands.set(definition.name,
    definition); return () => { commands.delete(definition.name) } } })
  const projects = {
    memberInput: vi.fn().mockResolvedValue({ text: 'Project: Release\nTopic: Totals', revision: 9, readThroughSequence: 8 }),
    acknowledgeMemberInput: vi.fn().mockResolvedValue(undefined), memberReply: vi.fn().mockResolvedValue(undefined),
  }
  providePartial(ctx, 'teamOfficeProjects', projects)
  const accepted = Promise.withResolvers<undefined>()
  const subagents = {
    listDescendants: vi.fn(),
    startActivation: vi.fn(async () => { await accepted.promise; return { result: new Promise(() => {}) } }),
    followup: vi.fn(async () => { await accepted.promise }),
  }
  providePartial(ctx, 'subagents', subagents)
  let service: TeamOffices | undefined
  const owner = await ctx.plugin({ name: 'office-native-fixture', apply: (scope: Context) => { service = new TeamOffices(scope) } })
  if (!service) throw new Error('Office service did not activate')
  const office = service.save({ name: 'Office', description: '', members: [{ name: 'Reviewer', role: 'Review',
    instruction: 'Check work' }] })
  const sessionId = SessionId('existing-office-session')
  const request = { commandId: CommandId('office-command'),
    agent: { session: { id: sessionId }, followup: vi.fn() },
    attachments: [], signal: new AbortController().signal, rawInput: office.id }
  await invokePartialCommand(commands.get('team-office-open')!, request)
  const bound = service.read(sessionId)!.office
  const activeChild = () => {
    const db = new DatabaseSync(join(root, 'team-offices.sqlite'))
    const row = db.prepare('SELECT child_id FROM messages ORDER BY rowid DESC LIMIT 1').get()
    db.close()
    if (!row) throw new Error('No active member delivery')
    return SessionId(String(row.child_id))
  }
  subagents.listDescendants.mockImplementation(async () => mode === 'followup' ? [{ id: activeChild() }] : [])
  cleanups.push(async () => { await owner.dispose(); await rm(root, { recursive: true, force: true }) })
  const rawInput = JSON.stringify({ id: randomUUID(), memberId: bound.members[0]!.id,
    text: 'Check totals', topicId: 'thread:totals', sourceMessageRef: 'message:question' })
  return { ctx, service, projects, subagents, accepted, sessionId, bound, activeChild,
    send: () => invokePartialCommand(commands.get('team-office-send')!, { ...request, rawInput }) }
}

it.each(['start', 'followup'] as const)('marks the snapshot read only after native %s admission succeeds', async (mode) => {
  const fixture = await nativeFixture(mode)
  const sent = fixture.send()
  const admission = mode === 'start' ? fixture.subagents.startActivation : fixture.subagents.followup
  await vi.waitFor(() =>{  expect(admission).toHaveBeenCalledTimes(1) })
  expect(fixture.projects.acknowledgeMemberInput).not.toHaveBeenCalled()
  fixture.accepted.resolve(undefined)
  await sent
  expect(fixture.projects.acknowledgeMemberInput).toHaveBeenCalledTimes(1)
  expect(fixture.service.read(fixture.sessionId)!.messages[0]).toMatchObject({
    sourceMessageRef: 'message:question', topicInputRevision: 9, topicInputSequence: 8,
  })
})

it('retains unread input when native admission fails', async () => {
  const fixture = await nativeFixture()
  const sent = fixture.send()
  await vi.waitFor(() =>{  expect(fixture.subagents.startActivation).toHaveBeenCalledTimes(1) })
  fixture.accepted.reject(new Error('Native admission failed'))
  await expect(sent).rejects.toThrow('Native admission failed')
  expect(fixture.projects.acknowledgeMemberInput).not.toHaveBeenCalled()
  expect(fixture.service.read(fixture.sessionId)!.messages[0]!.status).toBe('failed')
})

it('retains completed output when topic persistence fails and never leaves the message running', async () => {
  const fixture = await nativeFixture()
  fixture.accepted.resolve(undefined)
  await fixture.send()
  fixture.projects.memberReply.mockRejectedValue(new Error('Topic storage unavailable'))
  const info: SubagentRunEndInfo = { runId: 'run' as SubagentRunEndInfo['runId'], provider: 'spawn',
    parentSessionId: fixture.sessionId, id: fixture.activeChild(), local: true,
    stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: 'Result retained' }] }
  await fixture.ctx.parallel('subagent/end', info)
  expect(fixture.service.read(fixture.sessionId)!.messages[0]).toMatchObject({
    status: 'completed', output: 'Result retained', topicDeliveryError: 'delivery_failed',
  })
})

it('still records completion when the accepted-input receipt fails', async () => {
  const fixture = await nativeFixture()
  fixture.projects.acknowledgeMemberInput.mockRejectedValue(new Error('Receipt storage unavailable'))
  fixture.accepted.resolve(undefined)
  await fixture.send()
  expect(fixture.service.read(fixture.sessionId)!.messages[0]!.status).toBe('running')
  const info: SubagentRunEndInfo = { runId: 'run' as SubagentRunEndInfo['runId'], provider: 'spawn',
    parentSessionId: fixture.sessionId, id: fixture.activeChild(), local: true,
    stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: 'Completion retained' }] }
  await fixture.ctx.parallel('subagent/end', info)
  expect(fixture.service.read(fixture.sessionId)!.messages[0]).toMatchObject({ status: 'completed', output: 'Completion retained' })
})


it('announces committed project and topic changes once while preserving retry identities', async () => {
  const { office, projects, changed } = await projectFixture()
  changed.mockClear()
  const project = await projects.createProject(office.id, 'Shared changes', '', 'shared-project')
  await projects.createProject(office.id, 'Shared changes', '', 'shared-project')
  expect(changed).toHaveBeenCalledTimes(1)
  const topic = await projects.startTopic(office.id, project, 'New topic', 'shared-topic')
  await projects.startTopic(office.id, project, 'New topic', 'shared-topic')
  expect(changed).toHaveBeenCalledTimes(2)
  const history = await projects.topic(office.id, topic.topicId)
  await projects.reply(office.id, topic.topicId, 'More context', history.revision, 'shared-reply')
  await projects.reply(office.id, topic.topicId, 'More context', history.revision, 'shared-reply')
  expect(changed).toHaveBeenCalledTimes(3)
  await expect(projects.reply(office.id, topic.topicId, 'Stale context', 0, 'stale-reply')).rejects.toThrow('changed')
  expect(changed).toHaveBeenCalledTimes(3)
})
