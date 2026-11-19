/** Studio navigation keeps project conversations separate from ordinary home selection. */
import type { ILayout, MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { UiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { DramaProjectId } from '../project-types.ts'
import type { createStudioContext, StudioProjectEntry } from './studio-context.ts'

interface NavigationPorts {
  state: ReturnType<typeof createStudioContext>
  layout: Pick<ILayout, 'beginNavigation' | 'setWorkspaceContext' | 'selectPanel' | 'panelInfo'>
  workspace: Pick<UiWorkspace, 'captureSelection' | 'restoreCapturedSelection' | 'openSession'>
  panelId: MainPanelId
  lifetime: AbortSignal
  readProjects(this: void): Promise<StudioProjectEntry[]>
  openConversation(this: void, id: DramaProjectId): Promise<SessionId>
  createConversation(this: void, id: DramaProjectId): Promise<SessionId>
  openEntry(this: void): Promise<SessionId>
  primaryActionLabel?(this: void): string
  hasPanel(this: void, id: MainPanelId): boolean
  flush(this: void): Promise<void> | undefined
  failed(this: void, error: unknown): void
}

/**
 * Create product-owned navigation using native sessions and layout cancellation.
 * @param ports - Native navigation, project persistence and draft-save operations.
 * @returns Studio navigation actions and its mounted-session bridge.
 */
export function createStudioNavigation(ports: NavigationPorts) {
  const { state, layout, workspace, lifetime, panelId } = ports
  let navigating = false, generation = 0, observed = 0, catalogueGeneration = 0
  let resumeRequested = state.getSnapshot().active
  let flushing: Promise<void> | undefined
  let creating: { projectId: DramaProjectId | null; promise: Promise<void> } | undefined
  const isDisposed = () => lifetime.aborted
  const flush = () => {
    if (!flushing) flushing = Promise.resolve().then(ports.flush).finally(() => { flushing = undefined })
    return flushing
  }
  const catalogue = async (signal: AbortSignal = lifetime) => {
    const sequence = ++catalogueGeneration
    const projects = await ports.readProjects()
    signal.throwIfAborted()
    const workspacesChanged = JSON.stringify(state.getSnapshot().projects.map(project => project.workspaceId)) !== JSON
      .stringify(projects.map(project => project.workspaceId))
    if (sequence === catalogueGeneration) state.update((value) => { value.projects = projects })
    if (sequence === catalogueGeneration && workspacesChanged && state.getSnapshot().active) layout
      .setWorkspaceContext('crewon-studio', panelId, { primaryActionLabel: ports.primaryActionLabel,
        visibleWorkspaceIds: projects.map(project => project.workspaceId) })
    return projects
  }
  const remember = (sessionId: SessionId, projects = state.getSnapshot().projects) => {
    const project = projects.find(item => [...item.sessionIds, ...item.historySessionIds].includes(sessionId))
    if (project) state.update((value) => {
      value.projectId = project.id
      value.creating = false
      const lastSessions = value.lastSessionIds ??= {}
      lastSessions[project.id] = sessionId
    })
    return project
  }
  const reveal = (sessionId: SessionId, openCanvas = true, signal: AbortSignal = lifetime) => {
    signal.throwIfAborted()
    remember(sessionId)
    state.update((value) => {
      value.pendingSessionId = sessionId
      value.pendingOpenCanvas = openCanvas
      value.error = false
    })
    workspace.openSession(sessionId)
  }
  const navigate = async (task: (signal: AbortSignal) => void | Promise<void>) => {
    const sequence = ++generation
    const signal = AbortSignal.any([lifetime, layout.beginNavigation()])
    navigating = true
    try {
      await flush()
      signal.throwIfAborted()
      await task(signal)
    } catch (error) {
      if (!signal.aborted) {
        state.update((value) => { value.error = true })
        ports.failed(error)
      }
    } finally { if (sequence === generation) navigating = false }
  }
  const openProject = async (id: DramaProjectId, signal: AbortSignal, projects?: StudioProjectEntry[]) => {
    const available = projects ?? await catalogue(signal)
    signal.throwIfAborted()
    const project = available.find(item => item.id === id)
    const selected = [workspace.captureSelection().sessionId, state.getSnapshot().lastSessionIds?.[id]]
      .find(sessionId => sessionId && project && [...project.sessionIds, ...project.historySessionIds].includes(sessionId))
    const sessionId = selected ?? await ports.openConversation(id)
    signal.throwIfAborted()
    state.update((value) => { value.projectId = id; value.creating = false })
    reveal(sessionId, true, signal)
  }
  const openCreation = async (signal: AbortSignal) => {
    const entry = await ports.openEntry()
    signal.throwIfAborted()
    state.update((value) => { value.projectId = null; value.entrySessionId = entry; value.creating = true })
    reveal(entry, false, signal)
  }
  const restoreHome = (signal: AbortSignal) => {
    signal.throwIfAborted()
    const saved = state.getSnapshot()
    state.update((value) => {
      value.active = false
      value.pendingSessionId = null
      delete value.pendingOpenCanvas
      value.error = false
    })
    layout.setWorkspaceContext(undefined)
    workspace.restoreCapturedSelection(saved.home ?? {})
    layout.selectPanel(saved.homePanel && ports.hasPanel(saved.homePanel) ? saved.homePanel : null)
  }
  const actions = {
    enter: () => navigate(async (signal) => {
      resumeRequested = false
      const projects = await catalogue(signal)
      if (!state.getSnapshot().active) state.update((value) => {
        const selection = workspace.captureSelection()
        const selectedId = selection.sessionId
        const product = selectedId !== undefined && (selectedId === value.entrySessionId
          || projects.some(project => [...project.sessionIds, ...project.historySessionIds].includes(selectedId)))
        if (!product) value.home = selection
        const panel = layout.panelInfo.getSnapshot().activePanelId
        value.homePanel = panel === panelId ? null : panel
        value.active = true
      })
      layout.setWorkspaceContext('crewon-studio', panelId, { primaryActionLabel: ports.primaryActionLabel,
        visibleWorkspaceIds: projects.map(project => project.workspaceId) })
      const selected = state.getSnapshot().projectId
      if (selected) await openProject(selected, signal, projects)
      else await openCreation(signal)
    }),
    leave: () => navigate(restoreHome),
    overview: () => navigate(openCreation),
    select: (id: DramaProjectId) => navigate(signal => openProject(id, signal)),
    conversation: (id: SessionId) => navigate((signal) => { reveal(id, true, signal) }),
  }
  const newConversation = (id?: DramaProjectId) => {
    const projectId = id ?? state.getSnapshot().projectId
    if (creating?.projectId === projectId) return creating.promise
    const promise = navigate(async (signal) => {
      if (!projectId) { await openCreation(signal); return }
      const sessionId = await ports.createConversation(projectId)
      signal.throwIfAborted()
      await catalogue(signal)
      state.update((value) => {
        value.projectId = projectId
        value.creating = false
        const lastSessions = value.lastSessionIds ??= {}
        lastSessions[projectId] = sessionId
      })
      reveal(sessionId, true, signal)
    })
    creating = { projectId, promise }
    void promise.finally(() => { if (creating?.promise === promise) creating = undefined })
    return promise
  }
  const changed = async (sessionId: SessionId) => {
    const sequence = ++observed
    const currentNavigation = generation
    if (!state.getSnapshot().active || isDisposed()) return
    if (resumeRequested) { resumeRequested = false; await actions.enter(); return }
    const pending = state.getSnapshot().pendingSessionId
    if (pending && pending !== sessionId) return
    try {
      const projects = await catalogue()
      if (sequence !== observed || currentNavigation !== generation || !state.getSnapshot().active || isDisposed()) return
      remember(sessionId, projects)
    } catch (error) { if (!isDisposed()) ports.failed(error) }
  }
  return {
    actions, navigate, catalogue, reveal, openProject, openCreation, restoreHome, newConversation, changed,
    isNavigating: () => navigating,
    show: (sessionId: SessionId, openCanvas: () => void, closeEntryCanvas?: () => void) => {
      const current = state.getSnapshot()
      if (!current.active || lifetime.aborted || current.pendingSessionId !== sessionId) return
      if (current.creating && current.entrySessionId === sessionId) closeEntryCanvas?.()
      else if (current.pendingOpenCanvas !== false) openCanvas()
      state.update((value) => { value.pendingSessionId = null; delete value.pendingOpenCanvas })
    },
  }
}
