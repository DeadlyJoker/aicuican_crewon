import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { JsonStorageBackend } from '@deepseek-ai/dsh-storage-json'
import { SessionId } from '@deepseek-ai/dsh-session'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { AgentTeamLedger, agentTeamHumanActor } from '../src/contexera-domain/ledger.ts'
import { agentTeamDomainSpec } from '../src/contexera-domain/spec.ts'
import type { AgentTeamMemberId, AgentTeamRequestId } from '../src/contexera-domain/types.ts'

const request = (id: string) => id as AgentTeamRequestId
async function open(root: string) {
  const ctx = new Context()
  const fiber = ctx.plugin(Storage)
  await fiber
  const backend = new JsonStorageBackend(root)
  ctx.storage.backend.register('json', backend)
  const facility = new DomainFacility(ctx, { backend: 'json' })
  const domain = await facility.open({ ...agentTeamDomainSpec, name: 'office_fixture' })
  const ledger = new AgentTeamLedger(domain.table('operations'))
  await ledger.initialize()
  return { ledger, close: async () => { await domain.close(); await backend.close(); await fiber.dispose() } }
}

it('retains imported member sessions, project discussions and unread markers after reopening current DSH storage', async () => {
  const root = await mkdtemp(join(tmpdir(), 'office-projects-'))
  const workspaceId = WorkspaceId('workspace-fixture')
  const memberId = 'member:legacy-office-member' as AgentTeamMemberId
  const sessionId = SessionId('legacy-member-session')
  const actor = { kind: 'member' as const, memberId, handle: 'Reviewer' }
  let runtime = await open(root)
  try {
    const ledger = runtime.ledger
    await ledger.addMember({ requestId: request('import-legacy'), actor: agentTeamHumanActor(), workspaceId,
      handle: 'Reviewer', description: 'Review', presetId: 'standard', projectRefs: [],
      member: { memberId, sessionId, workspaceId, handle: 'Reviewer', description: 'Review', presetId: 'standard', state: 'enabled', privateMemoryPath: root },
    })
    const create = { requestId: request('project'), actor: agentTeamHumanActor(), workspaceId, name: 'Launch', description: '', memberIds: [memberId] }
    const project = (await ledger.createProject(create)).value.project
    expect((await ledger.createProject(create)).value.project.projectRef).toBe(project.projectRef)
    expect(ledger.view({ workspaceId }).projects).toHaveLength(1)
    const start = { requestId: request('topic'), actor: agentTeamHumanActor(), workspaceId, projectRef: project.projectRef, kind: 'discussion' as const, body: 'Check totals\n@Reviewer please calculate 17 + 25.' }
    const topic = (await ledger.startThread(start)).value
    expect((await ledger.startThread(start)).value.thread.threadRef).toBe(topic.thread.threadRef)
    expect(ledger.inbox(actor, { workspaceId }).totalUnreadCount).toBe(1)
    await ledger.readThread({ requestId: request('member-read'), actor, workspaceId, threadRef: topic.thread.threadRef })
    expect(ledger.inbox(actor, { workspaceId }).totalUnreadCount).toBe(0)
    const reply = { requestId: request('result'), actor, workspaceId, threadRef: topic.thread.threadRef, baseRevision: topic.thread.revision, body: '42', replyToMessageRef: topic.message.messageRef }
    expect((await ledger.reply(reply)).value.kind).toBe('committed')
    expect((await ledger.reply(reply)).committed).toBe(false)
    expect(ledger.inbox(agentTeamHumanActor(), { workspaceId }).totalUnreadCount).toBe(1)
    await runtime.close()
    runtime = await open(root)
    runtime.ledger.validateAtMount()
    expect(runtime.ledger.getMember(memberId)?.sessionId).toBe(sessionId)
    const restored = runtime.ledger.threadHistory(agentTeamHumanActor(), { workspaceId, threadRef: topic.thread.threadRef })
    expect(restored.facts.flatMap(fact => fact.kind === 'message' ? [fact.message.body] : [])).toEqual([start.body, '42'])
    expect({ memberSession: runtime.ledger.getMember(memberId)?.sessionId,
      unread: runtime.ledger.inbox(agentTeamHumanActor(), { workspaceId }).totalUnreadCount,
      messages: restored.facts.flatMap(fact => fact.kind === 'message' ? [fact.message.body] : []),
    }).toMatchInlineSnapshot(`
      {
        "memberSession": "legacy-member-session",
        "messages": [
          "Check totals
      @Reviewer please calculate 17 + 25.",
          "42",
        ],
        "unread": 1,
      }
    `)
    await runtime.ledger.readThread({ requestId: request('human-read'), actor: agentTeamHumanActor(), workspaceId, threadRef: topic.thread.threadRef })
    expect(runtime.ledger.inbox(agentTeamHumanActor(), { workspaceId }).totalUnreadCount).toBe(0)
    const rejected = await runtime.ledger.reply({ ...reply, requestId: request('stale'), body: 'outdated', baseRevision: 0 })
    expect(rejected.value.kind).toBe('stale_revision')
  } finally { await runtime.close(); await rm(root, { recursive: true, force: true }) }
})
