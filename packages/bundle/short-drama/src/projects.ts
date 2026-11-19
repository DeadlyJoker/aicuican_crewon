/** Project storage, version adoption and native conversation ownership. */
import { entrySourceSchema } from './entry-source.ts'
import type { EntrySourceId } from './project-types.ts'
import { randomUUID } from 'node:crypto'
import { cp, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { studioDocumentSchema, studioWorkspaceSchema, type studioDomain, type StudioDocument } from './studio-domain.ts'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { principalOf, Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type {} from '@deepseek-ai/dsh-workspace'
import { z } from 'zod'
import { canvasLayoutSchema, type canvasDomain, type DramaCanvasLayout } from './canvas.ts'
import type { DramaProject, DramaProjectId, DramaProjectSummary, DramaScriptId } from './project-types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Projects and script history owned by the active Host profile. */
    shortDrama: ShortDramaProjects
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'short-drama/owner-required': {}
    'short-drama/project-missing': {}
    'short-drama/revision-conflict': {}
    'short-drama/script-missing': {}
    'short-drama/workspace-required': {}
    'short-drama/invalid-input': {}
  }
}

const projectIdSchema = z.uuid().transform(brandString<DramaProjectId>)
const scriptIdSchema = z.uuid().transform(brandString<DramaScriptId>)
const titleSchema = z.string().trim().min(1).max(120)
const synopsisSchema = z.string().max(4000)
const scriptSchema = z.string().max(16000)
const revisionSchema = z.number().int().nonnegative()
const storedProject = z.object({
  id: projectIdSchema, title: titleSchema, synopsis: synopsisSchema, revision: revisionSchema,
  scripts: z.array(z.object({ id: scriptIdSchema, body: scriptSchema, createdAt: z.number().int() })),
  adoptedScriptId: scriptIdSchema.nullable(),
  conversation: z.object({
    sessionId: z.uuid().transform(SessionId),
    workspaceId: z.string().min(1).transform(brandString<WorkspaceId>),
  }).nullable(),
})
type StoredProject = z.infer<typeof storedProject>

/** The project history and Session association share one atomic record. */
export const projectDomain = defineDomain({
  name: 'short_drama_projects', version: 1, layout: 'per-record',
  tables: { projects: domainTable<DramaProjectId, StoredProject>(storedProject) },
})

function checked<Output>(schema: z.ZodType<Output>, value: unknown): Output {
  const result = schema.safeParse(value)
  if (!result.success) throw new RemoteError('short-drama/invalid-input', 'The project input is invalid or too long.', {})
  return result.data
}

function view(project: StoredProject): DramaProject {
  const { id, title, revision, synopsis, scripts, adoptedScriptId } = project
  return { id, title, revision, synopsis, scripts, adoptedScriptId }
}

function requireRevision(project: StoredProject, revision: number): void {
  if (project.revision !== revision) {
    throw new RemoteError('short-drama/revision-conflict', 'Reload the project before saving your changes.', {})
  }
}

/** Native Remote service shared by the workbench and the Agent tool executor. */
export class ShortDramaProjects extends TypertRemoteService {
  private readonly projects
  private readonly layouts
  private readonly canvasWrites = new Map<DramaProjectId, Promise<DramaCanvasLayout>>()
  private readonly studioWrites = new Map<DramaProjectId, Promise<StudioDocument>>()
  private readonly studioWorkspaces
  private readonly studioEntry
  private entryOpening: Promise<SessionId> | undefined
  private readonly workspaceOpening = new Map<DramaProjectId, Promise<z.infer<typeof studioWorkspaceSchema>>>()
  private readonly entryDocuments
  private readonly entrySources
  private entryWrite: Promise<StudioDocument> | undefined
  private readonly studioDocuments
  private readonly opening = new Map<DramaProjectId, Promise<SessionId>>()
  private readonly conversationCreating = new Map<DramaProjectId, Promise<SessionId>>()

  /**
   * @param ctx - Host services for authenticated project operations and ordinary Sessions.
   * @param domain - Open storage domain owned by this plugin.
   * @param canvas - Additive canvas layout storage.
   * @param studio - Product workspace links and shared UI documents.
   * @param projectDirectory - Host-owned project directory root.
   * @param documentMaxBytes - Maximum serialized Studio document size.
   * @param directorPreset - Native preset used only when creating new Studio Sessions.
   */
  constructor(ctx: Context, domain: Domain<typeof projectDomain>, canvas: Domain<typeof canvasDomain>,
    studio: Domain<typeof studioDomain>, private readonly projectDirectory: string, private readonly documentMaxBytes: number,
    private readonly directorPreset: string) {
    super(ctx, 'shortDrama')
    this.projects = domain.table('projects')
    this.layouts = canvas.table('layouts')
    this.studioWorkspaces = studio.table('workspaces')
    this.studioEntry = studio.table('entries')
    this.studioDocuments = studio.table('documents')
    this.entryDocuments = studio.table('entry_documents')
    this.entrySources = studio.table('entry_sources')
    ctx.effect(() => async () => {
      await Promise.allSettled([...this.opening.values(), ...this.conversationCreating.values(), ...this.workspaceOpening.values(),
        ...this.canvasWrites.values(), ...this.studioWrites.values(),
        ...(this.entryOpening ? [this.entryOpening] : []), ...(this.entryWrite ? [this.entryWrite] : [])])
      await Promise.all([domain.close(), canvas.close(), studio.close()])
    }, 'short drama projects')
    ctx.on('api-session/reusable', (sessionId, next) => next() && this.projectForSession(sessionId) === undefined)
  }

  private owner(): void {
    if (principalOf(this.ctx.invocation) !== undefined) {
      throw new RemoteError('short-drama/owner-required', 'Short drama projects belong to the Host owner.', {})
    }
  }

  private project(id: DramaProjectId): StoredProject {
    const project = this.projects.get(id)
    if (!project) throw new RemoteError('short-drama/project-missing', 'The project was not found.', {})
    return project
  }

  /**
   * Read the project associated with a native conversation.
   * @param sessionId - Conversation identity.
   * @returns Its project, or null for a conversation outside Studio.
   */
  @Remote
  conversationProject(sessionId: SessionId): DramaProject | null {
    this.owner()
    return this.projectForSession(checked(z.string().min(1).transform(SessionId), sessionId)) ?? null
  }

  /**
   * Read the saved layout without creating or modifying project content.
   * @param projectId - Existing project identity.
   * @returns Saved positions and viewport, or an empty initial layout.
   */
  @Remote
  readCanvas(projectId: DramaProjectId): DramaCanvasLayout {
    this.owner()
    const id = checked(projectIdSchema, projectId)
    this.project(id)
    return this.layouts.get(id) ?? { revision: 0, positions: {}, viewport: { x: 0, y: 0, zoom: 1 } }
  }

  /**
   * Commit layout with optimistic concurrency; a stale client cannot overwrite another editor.
   * @param projectId - Existing project identity.
   * @param layout - Layout and expected revision.
   * @returns Committed layout at its next revision.
   */
  @Remote
  async saveCanvas(projectId: DramaProjectId, layout: DramaCanvasLayout): Promise<DramaCanvasLayout> {
    this.owner()
    const id = checked(projectIdSchema, projectId)
    const next = checked(canvasLayoutSchema, layout)
    this.project(id)
    const write = async () => {
      if ((this.layouts.get(id)?.revision ?? 0) !== next.revision) {
        throw new RemoteError('short-drama/revision-conflict', 'Reload the canvas before saving your changes.', {})
      }
      const saved = { ...next, revision: next.revision + 1 }
      await this.layouts.put(id, saved)
      return saved
    }
    const previous = this.canvasWrites.get(id)
    const pending = previous ? previous.then(write, write) : write()
    this.canvasWrites.set(id, pending)
    try {
      return await pending
    } finally {
      if (this.canvasWrites.get(id) === pending) this.canvasWrites.delete(id)
    }
  }

  /**
   * List projects owned by this Host profile.
   * @returns Projects in title order.
   */
  @Remote
  list(): DramaProjectSummary[] {
    this.owner()
    return [...this.projects.entries()].map(([, { id, title, revision }]) => ({ id, title, revision }))
      .sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id))
  }

  /**
   * Create an empty project with durable identity.
   * @param title - Project title.
   * @returns Newly saved empty project.
   */
  @Remote
  async create(title: string): Promise<DramaProject> {
    this.owner()
    const id = brandString<DramaProjectId>(randomUUID())
    const project: StoredProject = {
      id, title: checked(titleSchema, title), revision: 0, synopsis: '',
      scripts: [], adoptedScriptId: null, conversation: null,
    }
    await this.projects.put(id, project)
    return view(project)
  }

  /**
   * Read the editable project and retained script candidates.
   * @param projectId - Project to open.
   * @returns The project and its candidate history.
   */
  @Remote
  read(projectId: DramaProjectId): DramaProject {
    this.owner()
    return view(this.project(checked(projectIdSchema, projectId)))
  }

  /**
   * Update the synopsis and append a script candidate if supplied.
   * @param projectId - Project to edit.
   * @param expectedRevision - Revision the editor read.
   * @param synopsis - Project synopsis.
   * @param script - Candidate text, or empty to change only the synopsis.
   * @returns The committed project.
   */
  @Remote
  async saveDraft(projectId: DramaProjectId, expectedRevision: number, synopsis: string, script: string): Promise<DramaProject> {
    this.owner()
    return this.save(
      checked(projectIdSchema, projectId), checked(revisionSchema, expectedRevision),
      checked(synopsisSchema, synopsis), checked(scriptSchema, script),
    )
  }

  private async save(id: DramaProjectId, revision: number, synopsis: string | undefined, body: string): Promise<DramaProject> {
    this.project(id)
    const candidate = { id: brandString<DramaScriptId>(randomUUID()), body, createdAt: Date.now() }
    return view(await this.projects.update(id, (project) => {
      requireRevision(project, revision)
      return {
        ...project, revision: revision + 1, synopsis: synopsis ?? project.synopsis,
        scripts: body.trim() ? [...project.scripts, candidate] : project.scripts,
      }
    }))
  }

  /**
   * Adopt one saved candidate while retaining the rest of the history.
   * @param projectId - Project containing the candidate.
   * @param expectedRevision - Revision shown at selection time.
   * @param scriptId - Candidate to adopt.
   * @returns The committed project.
   */
  @Remote
  async adoptScript(projectId: DramaProjectId, expectedRevision: number, scriptId: DramaScriptId): Promise<DramaProject> {
    this.owner()
    const id = checked(projectIdSchema, projectId)
    const revision = checked(revisionSchema, expectedRevision)
    const adopted = checked(scriptIdSchema, scriptId)
    this.project(id)
    return view(await this.projects.update(id, (project) => {
      requireRevision(project, revision)
      if (!project.scripts.some(script => script.id === adopted)) {
        throw new RemoteError('short-drama/script-missing', 'The script candidate was not found in this project.', {})
      }
      return project.adoptedScriptId === adopted ? project : { ...project, revision: revision + 1, adoptedScriptId: adopted }
    }))
  }

  /**
   * Open the same native Session on subsequent calls and after Host restart.
   * @param projectId - Project whose conversation should open.
   * @returns The project Session identity.
   */
  @Remote
  async openConversation(projectId: DramaProjectId): Promise<SessionId> {
    this.owner()
    const id = checked(projectIdSchema, projectId)
    const pending = this.opening.get(id)
    if (pending) return pending
    const opening = this.prepareConversation(id)
    this.opening.set(id, opening)
    try {
      return await opening
    } finally {
      this.opening.delete(id)
    }
  }

  /**
   * Create a new native conversation in the existing project workspace using the configured director preset.
   * Concurrent requests for one project share a single creation; completed conversations remain unchanged.
   * @param projectId - Project whose workspace receives the conversation.
   * @returns The created Session identity, independent from the project's initial conversation.
   */
  @Remote
  async createConversation(projectId: DramaProjectId): Promise<SessionId> {
    this.owner()
    const id = checked(projectIdSchema, projectId)
    this.project(id)
    const pending = this.conversationCreating.get(id)
    if (pending) return pending
    const create = async () => {
      const { workspaceId } = await this.prepareWorkspace(id)
      return (await this.ctx.sessionController.create({ workspaceId, agentPreset: this.directorPreset })).sessionId
    }
    const creating = create()
    this.conversationCreating.set(id, creating)
    try { return await creating }
    finally { this.conversationCreating.delete(id) }
  }

  private async prepareConversation(id: DramaProjectId): Promise<SessionId> {
    const registry = this.ctx.workspaceRegistry
    const { sessionId, workspaceId } = await this.prepareWorkspace(id)
    const workspace = registry.get(workspaceId)
    if (!workspace) throw new RemoteError('short-drama/workspace-required', 'The Studio project workspace is missing.', {})
    if (registry.archivedSessionIds.includes(sessionId)) {
      throw new RemoteError('short-drama/workspace-required', 'Restore the archived project conversation before opening it.', {})
    }
    const header = this.ctx.sessions.get(sessionId)?.header ?? (await this.ctx.sessionPersistence.stat(sessionId))?.header
    if (header) {
      if (header.cwd !== workspace.path) {
        throw new RemoteError('short-drama/workspace-required', 'The project conversation belongs to a different workspace.', {})
      }
      if (!workspace.sessionIds.includes(sessionId)) await workspace.attachSession(sessionId)
    } else {
      const result = await this.ctx.sessionController.create({ sessionId, workspaceId, agentPreset: this.directorPreset })
      if (result.sessionId !== sessionId) throw new Error('The reserved project conversation could not be created.')
    }
    return sessionId
  }

  /**
   * Find the project explicitly associated with one Agent Session.
   * @param sessionId - Current Agent Session.
   * @returns Its bound project, or undefined for an ordinary Session.
   */
  projectForSession(sessionId: SessionId): DramaProject | undefined {
    for (const [, project] of this.projects.entries()) {
      const link = this.studioWorkspaces.get(project.id)
      if (project.conversation?.sessionId === sessionId || link?.sessionId === sessionId
        || (link && this.ctx.workspaceRegistry.get(link.workspaceId)?.sessionIds.includes(sessionId))) return view(project)
    }
    return undefined
  }

  /** Ensure every existing project has a separate native workspace without rewriting old conversations. */
  async initializeStudioWorkspaces(): Promise<void> {
    for (const [id] of this.projects.entries()) await this.prepareWorkspace(id)
  }

  private async prepareWorkspace(id: DramaProjectId) {
    const pending = this.workspaceOpening.get(id)
    if (pending) return pending
    const opening = this.createStudioWorkspace(id)
    this.workspaceOpening.set(id, opening)
    try { return await opening }
    finally { if (this.workspaceOpening.get(id) === opening) this.workspaceOpening.delete(id) }
  }

  private async createStudioWorkspace(id: DramaProjectId) {
    const existing = this.studioWorkspaces.get(id)
    if (existing) return existing
    const project = this.project(id)
    const path = join(this.projectDirectory, id)
    await mkdir(path, { recursive: true })
    const workspace = await this.ctx.workspaceRegistry.create(path, project.title, 'crewon-studio',
      project.conversation ? [project.conversation.sessionId] : [])
    const link = { workspaceId: workspace.id, sessionId: SessionId(randomUUID()) }
    await this.studioWorkspaces.put(id, link)
    return link
  }

  /** Open the private Studio entry conversation.
   * @returns The entry conversation; it never belongs to the home workspace.
   */
  @Remote
  async openStudioEntry(): Promise<SessionId> {
    this.owner()
    if (this.entryOpening) return this.entryOpening
    const opening = async () => {
      let entry = this.studioEntry.get('landing')
      if (!entry) {
        const path = join(this.projectDirectory, '.entry')
        await mkdir(path, { recursive: true })
        const workspace = await this.ctx.workspaceRegistry.create(path, 'CrewON Studio', 'crewon-studio')
        entry = { workspaceId: workspace.id, sessionId: SessionId(randomUUID()) }
        await this.studioEntry.put('landing', entry)
      }
      const header = this.ctx.sessions.get(entry.sessionId)?.header ?? (await this.ctx.sessionPersistence.stat(entry.sessionId))?.header
      if (!header) await this.ctx.sessionController.create({ ...entry, agentPreset: this.directorPreset })
      return entry.sessionId
    }
    this.entryOpening = opening()
    try { return await this.entryOpening }
    finally { this.entryOpening = undefined }
  }

  /** Read the shared Studio creation draft.
   * @returns The creation draft, including all mode-specific settings.
   */
  @Remote
  readEntryDocument(): StudioDocument {
    this.owner()
    return this.entryDocuments.get('landing') ?? { revision: 0, storage: {} }
  }

  /** Save the shared creation draft, rejecting stale revisions.
   * @param document - Creation draft and last observed revision.
   * @returns The committed shared draft.
   */
  @Remote
  async saveEntryDocument(document: StudioDocument): Promise<StudioDocument> {
    this.owner()
    const value = checked(studioDocumentSchema, document)
    if (Buffer.byteLength(JSON.stringify(value)) > this.documentMaxBytes) {
      throw new RemoteError('short-drama/invalid-input', 'The Studio draft exceeds the configured storage limit.', {})
    }
    const write = async () => {
      const current = this.entryDocuments.get('landing')
      if ((current?.revision ?? 0) !== value.revision) {
        throw new RemoteError('short-drama/revision-conflict', 'The creation draft changed in another client.', {})
      }
      const saved = { revision: value.revision + 1, storage: value.storage }
      await this.entryDocuments.put('landing', saved)
      return saved
    }
    const pending = this.entryWrite ? this.entryWrite.then(write, write) : write()
    this.entryWrite = pending
    try { return await pending }
    finally { if (this.entryWrite === pending) this.entryWrite = undefined }
  }

  /** Copy imported entry sources into an allocated project.
   * @param projectId - Allocated project.
   * @param ids - Imported source identities.
   * @returns Project-relative original-file references.
   */
  @Remote
  async copyEntrySources(projectId: DramaProjectId, ids: EntrySourceId[]): Promise<{ id: EntrySourceId; name: string; path: string }[]> {
    this.owner()
    const id = checked(projectIdSchema, projectId)
    const sources = checked(z.array(entrySourceSchema.shape.id).max(100), ids)
    this.project(id)
    const directory = join(this.projectDirectory, id, 'source')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const copied: { id: EntrySourceId; name: string; path: string }[] = []
    for (const sourceId of sources) {
      const source = this.entrySources.get(sourceId)
      if (!source) throw new RemoteError('short-drama/invalid-input', 'An imported source is missing.', {})
      await cp(join(this.projectDirectory, '.entry', 'originals', source.file), join(directory, source.file), { force: false })
      copied.push({ id: sourceId, name: source.name, path: `source/${source.file}` })
    }
    return copied
  }

  /** List Studio projects and their native conversation associations.
   * @returns Projects with their native workspace and retained historical conversations.
   */
  @Remote
  async studioCatalogue(): Promise<{
    id: DramaProjectId
    title: string
    workspaceId: WorkspaceId
    sessionIds: readonly SessionId[]
    historySessionIds: readonly SessionId[]
  }[]> {
    this.owner()
    await this.initializeStudioWorkspaces()
    return [...this.projects.entries()].map(([id, project]) => {
      const link = this.studioWorkspaces.get(id)
      if (!link) throw new Error('Studio workspace association is missing.')
      const workspace = this.ctx.workspaceRegistry.get(link.workspaceId)
      if (!workspace) throw new Error('Studio workspace is missing.')
      return { id, title: project.title, workspaceId: link.workspaceId, sessionIds: [...workspace.sessionIds],
        historySessionIds: project.conversation ? [project.conversation.sessionId] : [] }
    })
  }

  /** Read the shared Studio view state for a project.
   * @param projectId - Owning project.
   * @returns Its complete shared Studio view document.
   */
  @Remote
  readStudio(projectId: DramaProjectId): StudioDocument {
    this.owner()
    const id = checked(projectIdSchema, projectId)
    this.project(id)
    return this.studioDocuments.get(id) ?? { revision: 0, storage: {} }
  }

  /** Save a project’s shared Studio view state, rejecting stale revisions.
   * @param projectId - Owning project.
   * @param document - Expected revision and replacement view state.
   * @returns Committed view document.
   */
  @Remote
  async saveStudio(projectId: DramaProjectId, document: StudioDocument): Promise<StudioDocument> {
    this.owner()
    const id = checked(projectIdSchema, projectId)
    this.project(id)
    const value = checked(studioDocumentSchema, document)
    if (Buffer.byteLength(JSON.stringify(value)) > this.documentMaxBytes) {
      throw new RemoteError('short-drama/invalid-input', 'Studio document exceeds the configured limit.', {})
    }
    const write = async () => {
      const current = this.studioDocuments.get(id)
      if ((current?.revision ?? 0) !== value.revision) {
        throw new RemoteError('short-drama/revision-conflict', 'Reload Studio before saving changes.', {})
      }
      const saved = { revision: value.revision + 1, storage: value.storage }
      await this.studioDocuments.put(id, saved)
      return saved
    }
    const previous = this.studioWrites.get(id)
    const pending = previous ? previous.then(write, write) : write()
    this.studioWrites.set(id, pending)
    try { return await pending }
    finally { if (this.studioWrites.get(id) === pending) this.studioWrites.delete(id) }
  }

  /**
   * Save a candidate from the bound Session without changing the adopted version.
   * @param sessionId - Current Agent Session.
   * @param expectedRevision - Project revision observed by the Agent.
   * @param script - Proposed script.
   * @returns The committed project.
   */
  async saveFromSession(sessionId: SessionId, expectedRevision: number, script: string): Promise<DramaProject> {
    const project = this.projectForSession(sessionId)
    if (!project) throw new RemoteError('short-drama/project-missing', 'Open a short drama project conversation first.', {})
    const body = checked(scriptSchema.refine(value => value.trim() !== ''), script)
    return this.save(project.id, checked(revisionSchema, expectedRevision), undefined, body)
  }
}
