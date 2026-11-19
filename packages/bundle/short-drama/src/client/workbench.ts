/** Panel state retains unsaved edits while the user works in a project conversation. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { DramaCanvasLayout, DramaProject, DramaProjectId, DramaProjectSummary, DramaScriptId } from '../project-types.ts'
import type {
  DramaAssetDraft, DramaAssetId, DramaExportId, DramaJobId, DramaMediaId, DramaMediaKind, DramaProduction,
  DramaProductionSettings, DramaShotDraft, DramaShotId, DramaTimelineClip,
} from '../production-types.ts'
import type { DramaLocaleKey } from './locales.ts'

/** Authenticated operations supplied by the client entry. */
export interface DramaActions {
  list(this: void): Promise<readonly DramaProjectSummary[]>
  create(this: void, title: string): Promise<DramaProject>
  read(this: void, id: DramaProjectId): Promise<DramaProject>
  saveDraft(this: void, id: DramaProjectId, revision: number, synopsis: string, script: string): Promise<DramaProject>
  adoptScript(this: void, id: DramaProjectId, revision: number, scriptId: DramaScriptId): Promise<DramaProject>
  openConversation(this: void, id: DramaProjectId): Promise<void>
  readCanvas(this: void, id: DramaProjectId): Promise<DramaCanvasLayout>
  saveCanvas(this: void, id: DramaProjectId, layout: DramaCanvasLayout): Promise<DramaCanvasLayout>
  requestAgent(this: void, id: DramaProjectId, task: { kind: 'script' | DramaMediaKind; name: string }): Promise<void>
  production: DramaProductionActions
}

/** Project-scoped production operations supplied by generated Host calls. */
export interface DramaProductionActions {
  read(this: void, projectId: DramaProjectId): Promise<DramaProduction>
  saveSettings(this: void, projectId: DramaProjectId, revision: number, settings: DramaProductionSettings): Promise<DramaProduction>
  saveAsset(this: void, projectId: DramaProjectId, revision: number, draft: DramaAssetDraft): Promise<DramaProduction>
  removeAsset(this: void, projectId: DramaProjectId, revision: number, id: DramaAssetId): Promise<DramaProduction>
  saveShot(this: void, projectId: DramaProjectId, revision: number, draft: DramaShotDraft): Promise<DramaProduction>
  removeShot(this: void, projectId: DramaProjectId, revision: number, id: DramaShotId): Promise<DramaProduction>
  generate(this: void, projectId: DramaProjectId, revision: number, id: DramaJobId, targetType: 'asset' | 'shot', targetId: string, kind: DramaMediaKind): Promise<DramaProduction>
  observe(this: void, projectId: DramaProjectId, id: DramaJobId): Promise<DramaProduction>
  adoptMedia(this: void, projectId: DramaProjectId, revision: number, jobId: DramaJobId, mediaId: DramaMediaId): Promise<DramaProduction>
  saveTimeline(this: void, projectId: DramaProjectId, revision: number, clips: DramaTimelineClip[]): Promise<DramaProduction>
  exportEpisode(this: void, projectId: DramaProjectId, revision: number, id: DramaExportId): Promise<DramaProduction>
}

interface Draft {
  revision: number
  synopsis?: string
  script: string
}

interface Feedback {
  kind: 'error' | 'status'
  key: DramaLocaleKey
}

type Operation = 'list' | 'open' | 'create' | 'refresh' | 'save' | 'adopt' | 'conversation' | 'production'

/** Native project stages; selection survives temporary navigation to a conversation. */
export type DramaStage = 'script' | 'assets' | 'shots' | 'edit'

function failureKey(error: unknown, fallback: DramaLocaleKey): DramaLocaleKey {
  if (typeof error !== 'object' || error === null || !('code' in error)) return fallback
  switch (error.code) {
    case 'short-drama/agent-busy': return 'studioAgentBusy'
    case 'short-drama/revision-conflict': return 'revisionConflict'
    case 'short-drama/workspace-required': return 'workspaceRequired'
    case 'short-drama/project-missing': return 'projectMissing'
    case 'short-drama/script-missing': return 'scriptMissing'
    case 'short-drama/invalid-input': return 'invalidInput'
    case 'short-drama/owner-required': return 'ownerRequired'
    case 'short-drama/production-invalid': return 'productionInvalid'
    case 'short-drama/production-missing': return 'projectMissing'
    case 'short-drama/script-required': return 'adoptScriptFirst'
    case 'short-drama/source-changed': return 'sourceChanged'
    case 'short-drama/service-required': return 'settingsMissing'
    case 'short-drama/media-unavailable': return 'mediaUnavailable'
    case 'short-drama/media-not-ready': return 'mediaNotReady'
    case 'short-drama/timeline-invalid': return 'timelineInvalid'
    case 'short-drama/export-failed': return 'exportFailed'
    default: return fallback
  }
}

/** Local state and actions owned by one workbench slot registration. */
export interface DramaWorkbenchState {
  screen: 'workbench' | 'canvas'
  canvas: DramaCanvasLayout | null
  projects: DramaProjectSummary[] | null
  project: DramaProject | null
  drafts: Partial<Record<DramaProjectId, Draft>>
  viewed: DramaScriptId | null
  operation: Operation | null
  feedback: Feedback | null
  production: DramaProduction | null
  stage: DramaStage
  timelineDraft: DramaTimelineClip[] | null
  timelineDrafts: Partial<Record<DramaProjectId, DramaTimelineClip[]>>
}

/**
 * Bind UI operations to their project revision and preserve a draft on failure.
 * @param api - Narrow project calls from the host client.
 * @returns The workbench snapshot and mutation actions.
 */
export function createDramaWorkbench(api: DramaActions) {
  const store = createSnapshotStore<DramaWorkbenchState>({
    screen: 'workbench', canvas: null, projects: null, project: null, drafts: {}, viewed: null, operation: null, feedback: null,
    production: null, stage: 'script', timelineDraft: null, timelineDrafts: {},
  })

  function show(project: DramaProject, viewed: DramaScriptId | null): void {
    const { id, title, revision } = project
    store.update((state) => {
      const summary = { id, title, revision }
      const projects = state.projects ?? []
      state.projects = projects.some(item => item.id === id)
        ? projects.map(item => item.id === id ? summary : item)
        : [summary, ...projects]
      state.project = project
      state.viewed = viewed
      state.timelineDraft = state.timelineDrafts[project.id] ?? null
    })
  }

  async function run(operation: Operation, failure: DramaLocaleKey, task: () => Promise<void>): Promise<boolean> {
    if (store.getSnapshot().operation) return false
    store.update((state) => {
      state.operation = operation
      state.feedback = null
    })
    try {
      await task()
      return true
    } catch (error) {
      store.update((state) => { state.feedback = { kind: 'error', key: failureKey(error, failure) } })
      return false
    } finally {
      store.update((state) => { state.operation = null })
    }
  }

  function status(key: DramaLocaleKey): void {
    store.update((state) => { state.feedback = { kind: 'status', key } })
  }

  function production(task: (id: DramaProjectId, current: DramaProduction) => Promise<DramaProduction>): Promise<boolean> {
    return run('production', 'productionError', async () => {
      const state = store.getSnapshot()
      if (!state.project || !state.production) return
      const current = await task(state.project.id, state.production)
      store.update((value) => { value.production = current })
    })
  }

  const actions = {
    screen(screen: 'workbench' | 'canvas') { store.update((state) => { state.screen = screen }) },
    saveCanvas(layout: DramaCanvasLayout) {
      return run('production', 'productionError', async () => {
        const state = store.getSnapshot()
        if (!state.project) return
        const canvas = await api.saveCanvas(state.project.id, layout)
        store.update((value) => { value.canvas = canvas })
      })
    },
    load() {
      return run('list', 'listError', async () => {
        const projects = await api.list()
        store.update((state) => { state.projects = [...projects] })
      })
    },
    async create(title: string, synopsis = '') {
      let createdId: DramaProjectId | undefined
      const success = await run('create', 'createError', async () => {
        const created = await api.create(title)
        createdId = created.id
        const project = synopsis.trim() ? await api.saveDraft(created.id, created.revision, synopsis, '') : created
        show(project, null)
        const [current, awaitLayout] = await Promise.all([api.production.read(project.id), api.readCanvas(project.id)])
        store.update((state) => { state.canvas = awaitLayout; state.production = current; state.stage = 'script'; state.timelineDraft = null })
      })
      return success ? createdId : undefined
    },
    open(id: DramaProjectId) {
      return run('open', 'openError', async () => {
        const [project, current, canvas] = await Promise.all([api.read(id), api.production.read(id), api.readCanvas(id)])
        show(project, project.adoptedScriptId ?? project.scripts.at(-1)?.id ?? null)
        store.update((state) => { state.production = current; state.canvas = canvas })
      })
    },
    back() {
      store.update((state) => {
        state.project = null
        state.viewed = null
        state.feedback = null
        state.canvas = null
        state.production = null
        state.timelineDraft = null
      })
      return actions.load()
    },
    edit(project: DramaProject, change: Partial<Pick<Draft, 'synopsis' | 'script'>>) {
      store.update((state) => {
        const draft = state.drafts[project.id] ?? { revision: project.revision, script: '' }
        state.drafts[project.id] = { ...draft, ...change }
      })
    },
    view(id: DramaScriptId) {
      store.update((state) => { state.viewed = id })
    },
    refresh(project: DramaProject, viewed: DramaScriptId | null) {
      return run('refresh', 'refreshError', async () => {
        const [current, nextProduction, canvas] = await Promise.all([
          api.read(project.id), api.production.read(project.id), api.readCanvas(project.id),
        ])
        const nextViewed = current.scripts.some(script => script.id === viewed)
          ? viewed : current.adoptedScriptId ?? current.scripts.at(-1)?.id ?? null
        show(current, nextViewed)
        store.update((state) => { state.production = nextProduction; state.canvas = canvas })
        const draft = store.getSnapshot().drafts[project.id]
        if (draft) {
          store.update((state) => { state.drafts[project.id] = { ...draft, revision: current.revision } })
        }
        status(draft ? 'refreshedWithEdits' : 'refreshed')
      })
    },
    save(project: DramaProject, draft: Draft, viewed: DramaScriptId | null) {
      return run('save', 'saveError', async () => {
        const saved = await api.saveDraft(project.id, draft.revision, draft.synopsis ?? project.synopsis, draft.script)
        show(saved, saved.scripts.find(script => !project.scripts.some(prior => prior.id === script.id))?.id ?? viewed)
        store.update((state) => { state.drafts[project.id] = undefined })
        status(draft.script.trim() ? 'saved' : 'synopsisSaved')
      })
    },
    adopt(project: DramaProject, id: DramaScriptId) {
      return run('adopt', 'adoptError', async () => {
        const adopted = await api.adoptScript(project.id, project.revision, id)
        show(adopted, id)
        store.update((state) => {
          const draft = state.drafts[project.id]
          if (draft?.revision === project.revision) draft.revision = adopted.revision
        })
        status('adoptSuccess')
      })
    },
    openConversation(id: DramaProjectId) {
      return run('conversation', 'conversationError', async () => { await api.openConversation(id) })
    },
    stage(stage: DramaStage) { store.update((state) => { state.stage = stage }) },
    saveSettings(settings: DramaProductionSettings) {
      return production((id, current) => api.production.saveSettings(id, current.revision, settings))
    },
    saveAsset(draft: DramaAssetDraft) {
      return production((id, current) => api.production.saveAsset(id, current.revision, draft))
    },
    removeAsset(assetId: DramaAssetId) {
      return production((id, current) => api.production.removeAsset(id, current.revision, assetId))
    },
    saveShot(draft: DramaShotDraft) {
      return production((id, current) => api.production.saveShot(id, current.revision, draft))
    },
    removeShot(shotId: DramaShotId) {
      return production((id, current) => api.production.removeShot(id, current.revision, shotId))
    },
    requestScript(projectId = store.getSnapshot().project?.id) {
      return run('conversation', 'conversationError', async () => {
        if (!projectId) return
        await api.requestAgent(projectId, { kind: 'script', name: '' })
        const [project, current, canvas] = await Promise.all([
          api.read(projectId), api.production.read(projectId), api.readCanvas(projectId),
        ])
        show(project, project.scripts.at(-1)?.id ?? null)
        store.update((state) => { state.production = current; state.canvas = canvas })
      })
    },
    generate(targetType: 'asset' | 'shot', targetId: string, kind: DramaMediaKind) {
      return run('conversation', 'conversationError', async () => {
        const { project, production } = store.getSnapshot()
        if (!project || !production) return
        const target = targetType === 'asset' ? production.assets.find(item => item.id === targetId)
          : production.shots.find(item => item.id === targetId)
        if (!target) return
        await api.requestAgent(project.id, { kind, name: 'name' in target ? target.name : target.title })
      })
    },
    observe(jobId: DramaJobId) { return production(id => api.production.observe(id, jobId)) },
    adoptMedia(jobId: DramaJobId, mediaId: DramaMediaId) {
      return production((id, current) => api.production.adoptMedia(id, current.revision, jobId, mediaId))
    },
    editTimeline(clips: DramaTimelineClip[]) {
      store.update((state) => {
        if (!state.project) return
        state.timelineDraft = clips
        state.timelineDrafts[state.project.id] = clips
      })
    },
    saveTimeline() {
      const clips = store.getSnapshot().timelineDraft
      if (!clips) return Promise.resolve(false)
      return production((id, current) => api.production.saveTimeline(id, current.revision, clips)).then((saved) => {
        if (saved) store.update((state) => {
          state.timelineDraft = null
          if (state.project) state.timelineDrafts[state.project.id] = undefined
        })
        return saved
      })
    },
    exportEpisode() {
      const exportId = randomUUID() as DramaExportId
      return production((id, current) => api.production.exportEpisode(id, current.revision, exportId))
    },
  }

  return { store, actions }
}
