// @vitest-environment jsdom
/** Project navigation, draft preservation and interrupted route recovery. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MainPanelId, PanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { UiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { DramaProjectId } from '../src/project-types.ts'
import { createStudioContext, type StudioProjectEntry } from '../src/client/studio-context.ts'
import { createStudioNavigation } from '../src/client/studio-navigation.ts'

const panelId = 'studio' as MainPanelId
const otherPanelId = 'other' as MainPanelId
const a = brandString<DramaProjectId>('project-a'), b = brandString<DramaProjectId>('project-b')
const a1 = SessionId('a1'), a2 = SessionId('a2'), b1 = SessionId('b1'), b2 = SessionId('b2')
const home = SessionId('home'), entry = SessionId('entry'), legacy = SessionId('legacy-a')

afterEach(() => { localStorage.clear() })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function bench(state = createStudioContext()) {
  const events: string[] = []
  let selected: ReturnType<UiWorkspace['captureSelection']> = { sessionId: home }
  let pending = new AbortController()
  const lifetime = new AbortController()
  const info = createSnapshotStore<PanelInfo>({ activePanelId: null })
  const projects: StudioProjectEntry[] = [
    { id: a, title: 'A', workspaceId: brandString<WorkspaceId>('workspace-a'), sessionIds: [a1, a2], historySessionIds: [legacy] },
    { id: b, title: 'B', workspaceId: brandString<WorkspaceId>('workspace-b'), sessionIds: [b1, b2], historySessionIds: [] },
  ]
  const beginNavigation = () => { pending.abort(); pending = new AbortController(); return pending.signal }
  const layout = {
    beginNavigation,
    panelInfo: info,
    setWorkspaceContext: (context: string | undefined, launcher?: MainPanelId) => {
      info.set({ ...info.getSnapshot(), workspaceContext: context, workspacePanelId: launcher })
      events.push(`context:${context ?? 'home'}`)
    },
    selectPanel: (id: MainPanelId | null) => {
      beginNavigation()
      info.set({ ...info.getSnapshot(), activePanelId: id })
      events.push(`panel:${id ?? 'conversation'}`)
    },
  }
  const workspace = {
    captureSelection: () => selected,
    restoreCapturedSelection: (value: ReturnType<UiWorkspace['captureSelection']>) => {
      beginNavigation(); selected = value; events.push(`restore:${value.sessionId ?? 'blank'}`)
    },
    openSession: (id: Parameters<UiWorkspace['openSession']>[0]) => {
      if (typeof id !== 'string') throw new Error('This fixture opens root sessions only')
      beginNavigation(); selected = { sessionId: id }; info.set({ ...info.getSnapshot(), activePanelId: null })
      events.push(`open:${id}`)
    },
  }
  const readProjects = vi.fn(async (): Promise<StudioProjectEntry[]> => projects.map(project => ({ ...project,
    sessionIds: [...project.sessionIds], historySessionIds: [...project.historySessionIds] })))
  const openConversation = vi.fn(async (id: DramaProjectId) => id === a ? a1 : b1)
  const createConversation = vi.fn(async (id: DramaProjectId) => {
    const sessionId = SessionId(`${id}-new`)
    const project = projects.find(item => item.id === id)!
    project.sessionIds = [...project.sessionIds, sessionId]
    events.push(`create:${id}`)
    return sessionId
  })
  const openEntry = vi.fn(async () => entry)
  const flush = vi.fn<() => Promise<void> | undefined>(() => undefined)
  const failed = vi.fn()
  const navigator = createStudioNavigation({ state, layout, workspace, panelId, lifetime: lifetime.signal,
    readProjects, openConversation, createConversation, openEntry, flush, failed, hasPanel: id => id === panelId })
  return { state, events, layout, workspace, projects, lifetime, info, readProjects, openConversation,
    createConversation, openEntry, flush, failed, navigator, selected: () => selected }
}

describe('Studio project navigation', () => {
  it('creates conversations in the same project and retains each project selection across restart', async () => {
    const h = bench()
    await h.navigator.actions.enter()
    await h.navigator.actions.select(a)
    await h.navigator.newConversation()
    const newA = h.selected().sessionId
    await h.navigator.actions.select(b)
    await h.navigator.newConversation(b)
    const newB = h.selected().sessionId
    await h.navigator.actions.select(a)
    expect(h.selected().sessionId).toBe(newA)
    await h.navigator.actions.select(b)
    expect(h.selected().sessionId).toBe(newB)
    expect(h.state.getSnapshot().active).toBe(true)
    expect(h.info.getSnapshot().workspacePanelId).toBe(panelId)
    h.navigator.show(newB!, () => { h.events.push('canvas') })
    expect(h.events).toMatchInlineSnapshot(`
      [
        "context:crewon-studio",
        "open:entry",
        "open:a1",
        "create:project-a",
        "open:project-a-new",
        "open:b1",
        "create:project-b",
        "open:project-b-new",
        "open:project-a-new",
        "open:project-b-new",
        "canvas",
      ]
    `)
    const resumed = bench(createStudioContext())
    resumed.projects[1]!.sessionIds = [...resumed.projects[1]!.sessionIds, newB!]
    resumed.workspace.openSession(newB!)
    await resumed.navigator.changed(newB!)
    expect(resumed.selected().sessionId).toBe(newB)
    expect(resumed.openConversation).not.toHaveBeenCalled()
    expect(resumed.state.getSnapshot().home).toEqual({ sessionId: home })
  })

  it('opens the creation entry from a project and preserves its conversation and sidebar layout', async () => {
    const h = bench()
    await h.navigator.actions.enter()
    await h.navigator.newConversation()
    expect(h.createConversation).not.toHaveBeenCalled()
    expect(h.state.getSnapshot()).toMatchObject({ active: true, creating: true, projectId: null })
    expect(h.selected().sessionId).toBe(entry)
    await h.navigator.actions.select(a)
    await h.navigator.actions.conversation(a2)
    const closeEntryCanvas = vi.fn()
    h.navigator.show(a2, () => {}, closeEntryCanvas)
    expect(closeEntryCanvas).not.toHaveBeenCalled()
    await h.navigator.actions.overview()
    expect(h.selected().sessionId).toBe(entry)
    expect(h.createConversation).not.toHaveBeenCalled()
    expect(h.state.getSnapshot().lastSessionIds?.[a]).toBe(a2)
    h.navigator.show(a2, () => {}, closeEntryCanvas)
    expect(closeEntryCanvas).not.toHaveBeenCalled()
    h.navigator.show(entry, () => {}, closeEntryCanvas)
    expect(closeEntryCanvas).toHaveBeenCalledOnce()
    await h.navigator.actions.leave()
    expect(h.events).toMatchInlineSnapshot(`
      [
        "context:crewon-studio",
        "open:entry",
        "open:entry",
        "open:a1",
        "open:a2",
        "open:entry",
        "context:home",
        "restore:home",
        "panel:conversation",
      ]
    `)
    expect(h.selected().sessionId).toBe(home)
    expect(h.state.getSnapshot().pendingSessionId).toBeNull()
  })

  it('remembers directly opened legacy history and restores it instead of the primary session', async () => {
    const h = bench()
    await h.navigator.actions.enter()
    await h.navigator.actions.conversation(legacy)
    h.navigator.show(legacy, () => {})
    await h.navigator.changed(legacy)
    await h.navigator.actions.select(b)
    await h.navigator.actions.select(a)
    expect(h.selected().sessionId).toBe(legacy)
    expect(h.state.getSnapshot().lastSessionIds?.[a]).toBe(legacy)
  })

  it('recovers old bookmarks, discards stale pending targets and never captures the creation entry as home', async () => {
    localStorage.setItem('crewon.studio.navigation.v1', JSON.stringify({
      active: true, projectId: a, projects: [], home: { sessionId: home }, homePanel: null,
      pendingSessionId: 'stale', pendingOpenCanvas: true, error: false,
    }))
    const h = bench()
    expect(h.state.getSnapshot().pendingSessionId).toBeNull()
    h.workspace.openSession(a2)
    await h.navigator.changed(a2)
    expect(h.selected().sessionId).toBe(a2)
    expect(h.openConversation).not.toHaveBeenCalled()
    await h.navigator.actions.overview()
    await h.navigator.actions.leave()
    h.workspace.openSession(entry)
    await h.navigator.actions.enter()
    expect(h.state.getSnapshot().home).toEqual({ sessionId: home })
  })

  it('falls back to the conversation when the home panel has been unregistered', async () => {
    const h = bench()
    h.layout.selectPanel(otherPanelId)
    await h.navigator.actions.enter()
    await h.navigator.actions.leave()
    expect(h.info.getSnapshot()).toMatchObject({ activePanelId: null, workspaceContext: undefined })
    expect(h.selected().sessionId).toBe(home)
  })

  it('keeps the actual restored project session when its bookmark lags behind', async () => {
    const state = createStudioContext()
    state.update((value) => {
      value.active = true
      value.projectId = a
      value.lastSessionIds = { [a]: a1 }
    })
    const h = bench(state)
    h.workspace.openSession(a2)
    await h.navigator.changed(a2)
    expect(h.selected().sessionId).toBe(a2)
    expect(h.state.getSnapshot().lastSessionIds?.[a]).toBe(a2)
    expect(h.openConversation).not.toHaveBeenCalled()
  })

  it('ignores a late entry response after another global panel wins navigation', async () => {
    const h = bench(), projects = deferred<StudioProjectEntry[]>()
    h.readProjects.mockReturnValueOnce(projects.promise)
    const entering = h.navigator.actions.enter()
    await vi.waitFor(() => { expect(h.readProjects).toHaveBeenCalledOnce() })
    h.layout.selectPanel(otherPanelId)
    projects.resolve(h.projects)
    await entering
    expect(h.selected().sessionId).toBe(home)
    expect(h.state.getSnapshot().active).toBe(false)
    expect(h.info.getSnapshot().activePanelId).toBe(otherPanelId)
    expect(h.failed).not.toHaveBeenCalled()
  })

  it('ignores late project and new-conversation responses after leaving or disposing', async () => {
    const h = bench(), opening = deferred<SessionId>()
    await h.navigator.actions.enter()
    h.openConversation.mockReturnValueOnce(opening.promise)
    const selecting = h.navigator.actions.select(a)
    await vi.waitFor(() => { expect(h.openConversation).toHaveBeenCalledOnce() })
    await h.navigator.actions.leave()
    opening.resolve(a1)
    await selecting
    expect(h.selected().sessionId).toBe(home)
    await h.navigator.actions.enter()
    const creating = deferred<SessionId>()
    h.createConversation.mockReturnValueOnce(creating.promise)
    const next = h.navigator.newConversation(a)
    await vi.waitFor(() => { expect(h.createConversation).toHaveBeenCalledOnce() })
    h.lifetime.abort()
    creating.resolve(a2)
    await next
    expect(h.selected().sessionId).toBe(entry)
    expect(h.failed).not.toHaveBeenCalled()
  })

  it('shares an in-flight draft flush and opens only the latest requested project', async () => {
    const h = bench(), saving = deferred<undefined>()
    await h.navigator.actions.enter()
    h.flush.mockClear().mockReturnValueOnce(saving.promise)
    const first = h.navigator.actions.select(a)
    const second = h.navigator.actions.select(b)
    await vi.waitFor(() => { expect(h.flush).toHaveBeenCalledOnce() })
    saving.resolve(undefined)
    await Promise.all([first, second])
    expect(h.selected().sessionId).toBe(b1)
    expect(h.openConversation).toHaveBeenCalledExactlyOnceWith(b)
  })

  it('retains the current project when saving fails before navigation', async () => {
    const h = bench()
    await h.navigator.actions.enter()
    await h.navigator.actions.select(a)
    h.flush.mockRejectedValueOnce(new Error('unsaved draft'))
    await h.navigator.actions.leave()
    expect(h.selected().sessionId).toBe(a1)
    expect(h.state.getSnapshot()).toMatchObject({ active: true, projectId: a, error: true })
    expect(h.failed).toHaveBeenCalledOnce()
  })

  it('coalesces repeated new-conversation clicks through creation and catalogue refresh', async () => {
    const h = bench(), created = deferred<SessionId>(), refreshed = deferred<StudioProjectEntry[]>()
    await h.navigator.actions.enter()
    await h.navigator.actions.select(a)
    h.createConversation.mockReturnValueOnce(created.promise)
    const first = h.navigator.newConversation()
    expect(h.navigator.newConversation()).toBe(first)
    await vi.waitFor(() => { expect(h.createConversation).toHaveBeenCalledOnce() })
    h.readProjects.mockReturnValueOnce(refreshed.promise)
    created.resolve(a2)
    await vi.waitFor(() => { expect(h.readProjects).toHaveBeenCalledTimes(3) })
    expect(h.navigator.newConversation()).toBe(first)
    refreshed.resolve(h.projects)
    await first
    expect(h.createConversation).toHaveBeenCalledOnce()
    expect(h.selected().sessionId).toBe(a2)
  })

  it('keeps the refreshed project list when an older mounted-session lookup returns late', async () => {
    const h = bench(), old = deferred<StudioProjectEntry[]>()
    await h.navigator.actions.enter()
    await h.navigator.actions.select(a)
    h.navigator.show(a1, () => {})
    h.readProjects.mockReturnValueOnce(old.promise)
    const observing = h.navigator.changed(a1)
    await h.navigator.newConversation(a)
    const newSession = h.selected().sessionId!
    old.resolve([{ ...h.projects[0]!, sessionIds: [a1, a2] }, h.projects[1]!])
    await observing
    expect(h.state.getSnapshot().projects[0]!.sessionIds).toContain(newSession)
    expect(h.state.getSnapshot().lastSessionIds?.[a]).toBe(newSession)
  })
})
