/** Studio conversations share the native workspace without replacing its initial or historical Sessions. */
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SESSION_FORMAT_VERSION, type SessionHeader } from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionCreateRequest } from '@deepseek-ai/dsh-api-session-controller'
import { SessionPersistenceRevision } from '@deepseek-ai/dsh-session-persistence'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import { expect, it, onTestFinished, vi } from 'vitest'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import { canvasDomain } from '../src/canvas.ts'
import { projectDomain, ShortDramaProjects } from '../src/projects.ts'
import { studioDomain } from '../src/studio-domain.ts'
import type { DramaProjectId } from '../src/project-types.ts'
import { brandString } from '@deepseek-ai/dsh-brand'

interface SavedHost {
  pool: MemoryMediaPool
  directory: string
  headers: Map<SessionId, SessionHeader>
}

async function harness(previous?: SavedHost) {
  const pool = previous?.pool ?? new MemoryMediaPool()
  const directory = previous?.directory ?? await mkdtemp(join(tmpdir(), 'dsh-studio-conversations-'))
  if (!previous) onTestFinished(() => rm(directory, { recursive: true, force: true }))
  const headers = previous?.headers ?? new Map<SessionId, SessionHeader>()
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  const snapshot = (header: SessionHeader) => ({ header, revision: SessionPersistenceRevision(`rev-${header.id}`) })
  ctx.provide('sessionPersistence', {
    list: async () => [...headers.values()].map(snapshot),
    stat: async (id: SessionId) => { const header = headers.get(id); return header && snapshot(header) },
  } as never)
  ctx.provide('sessions', {
    list: () => [...headers.values()].map(header => ({ header })),
    get: (id: SessionId) => { const header = headers.get(id); return header && { header } },
  } as never)
  await ctx.plugin(WorkspaceRegistry)
  const create = vi.fn(async (request: SessionCreateRequest) => {
    const workspace = request.workspaceId && ctx.workspaceRegistry.get(request.workspaceId)
    if (!workspace) throw new Error('Missing target workspace')
    const sessionId = request.sessionId ?? SessionId(randomUUID())
    headers.set(sessionId, { version: SESSION_FORMAT_VERSION, id: sessionId, createdAt: Date.now(),
      isSeeded: false, cwd: workspace.path })
    await workspace.attachSession(sessionId)
    return { sessionId, agentPreset: request.agentPreset }
  })
  ctx.provide('sessionController', { create } as never)
  const projects = await facility.open(projectDomain), canvas = await facility.open(canvasDomain)
  const studio = await facility.open(studioDomain)
  let service: ShortDramaProjects | undefined
  const projectFiber = ctx.plugin({
    inject: ['workspaceRegistry', 'sessionController', 'sessions', 'sessionPersistence'],
    apply(scope: Context) {
      service = new ShortDramaProjects(scope, projects, canvas, studio, directory, 1048576, 'deployment-director')
    },
  })
  await projectFiber.await()
  if (!service) throw new Error('Project service did not mount')
  let closed = false
  const close = async () => { if (!closed) { closed = true; await ctx.fiber.dispose() } }
  onTestFinished(close)
  return { pool, directory, headers, ctx, create, service, projects, studio, close,
    closeProjects: () => projectFiber.dispose() }
}

it('adds a director conversation without replacing the initial Session or script history, including after restart', async () => {
  const h = await harness()
  const project = await h.service.create('The last train')
  const saved = await h.service.saveDraft(project.id, project.revision, 'A station at night', 'The keeper lends a lantern.')
  const primary = await h.service.openConversation(project.id)
  const before = h.service.read(project.id)
  const created = await h.service.createConversation(project.id)
  expect(created).not.toBe(primary)
  const catalog = (await h.service.studioCatalogue())[0]!
  expect(catalog.sessionIds).toEqual([created, primary])
  expect(h.create).toHaveBeenLastCalledWith({ workspaceId: catalog.workspaceId, agentPreset: 'deployment-director' })
  expect(h.service.projectForSession(created)?.id).toBe(project.id)
  expect(h.service.read(project.id)).toEqual(before)
  expect(before).toEqual(saved)
  await expect(h.service.openConversation(project.id)).resolves.toBe(primary)
  await h.close()

  const reopened = await harness(h)
  await expect(reopened.service.openConversation(project.id)).resolves.toBe(primary)
  expect(reopened.service.projectForSession(created)?.id).toBe(project.id)
  expect((await reopened.service.studioCatalogue())[0]?.sessionIds).toEqual([created, primary])
  expect(reopened.service.read(project.id)).toEqual(before)
  expect(reopened.create).not.toHaveBeenCalled()
})

it('coalesces simultaneous new-conversation requests and allows another conversation after they settle', async () => {
  const h = await harness(), project = await h.service.create('The last train')
  const gate = Promise.withResolvers<undefined>()
  const create = h.create.getMockImplementation()!
  h.create.mockImplementation(async (request) => { await gate.promise; return create(request) })
  const first = h.service.createConversation(project.id), second = h.service.createConversation(project.id)
  await vi.waitFor(() => { expect(h.create).toHaveBeenCalledOnce() })
  gate.resolve(undefined)
  const ids = await Promise.all([first, second])
  expect(ids[0]).toBe(ids[1])
  const next = await h.service.createConversation(project.id)
  expect(next).not.toBe(ids[0])
  expect(h.create).toHaveBeenCalledTimes(2)
})

it('preserves a legacy conversation at its original directory when the project gains new conversations', async () => {
  const h = await harness(), project = await h.service.create('Legacy project')
  const path = join(h.directory, 'legacy')
  await mkdir(path)
  const workspace = await h.ctx.workspaceRegistry.create(path, 'Legacy workspace')
  const legacy = SessionId(randomUUID())
  h.headers.set(legacy, { version: SESSION_FORMAT_VERSION, id: legacy, createdAt: 1, isSeeded: false, cwd: path })
  await workspace.attachSession(legacy)
  await h.projects.table('projects').update(project.id, record => ({ ...record,
    conversation: { sessionId: legacy, workspaceId: workspace.id } }))
  const current = await h.service.createConversation(project.id)
  const catalog = (await h.service.studioCatalogue())[0]!
  expect(catalog.workspaceId).not.toBe(workspace.id)
  expect(catalog.sessionIds).toEqual([current])
  expect(catalog.historySessionIds).toEqual([legacy])
  expect(h.service.projectForSession(legacy)?.id).toBe(project.id)
  expect(workspace.sessionIds).toEqual([legacy])
  expect(h.headers.get(legacy)?.cwd).toBe(path)
})

it('keeps native reuse protection and permits retry after a failed creation', async () => {
  const h = await harness(), project = await h.service.create('The last train')
  const primary = await h.service.openConversation(project.id)
  h.create.mockRejectedValueOnce(new Error('Creation refused'))
  await expect(h.service.createConversation(project.id)).rejects.toThrow('Creation refused')
  expect((await h.service.studioCatalogue())[0]?.sessionIds).toEqual([primary])
  const created = await h.service.createConversation(project.id)
  expect(h.ctx.waterfall('api-session/reusable', created, () => true)).toBe(false)
  expect(h.ctx.waterfall('api-session/reusable', primary, () => true)).toBe(false)
  expect(h.ctx.waterfall('api-session/reusable', SessionId(randomUUID()), () => true)).toBe(true)
  await expect(h.service.openConversation(project.id)).resolves.toBe(primary)
})

it('rejects unknown projects before making a native Session', async () => {
  const h = await harness()
  await expect(h.service.createConversation(brandString<DramaProjectId>(randomUUID()))).rejects.toThrow('project was not found')
  expect(h.create).not.toHaveBeenCalled()
})

it('waits for a pending conversation before closing its project domains', async () => {
  const h = await harness(), project = await h.service.create('Pending project')
  const gate = Promise.withResolvers<undefined>(), create = h.create.getMockImplementation()!
  h.create.mockImplementation(async (request) => { await gate.promise; return create(request) })
  const opening = h.service.createConversation(project.id)
  await vi.waitFor(() => { expect(h.create).toHaveBeenCalledOnce() })
  let disposed = false
  const closing = h.closeProjects().then(() => { disposed = true })
  await Promise.resolve()
  expect(disposed).toBe(false)
  gate.resolve(undefined)
  await opening
  await closing
  expect(disposed).toBe(true)
})
