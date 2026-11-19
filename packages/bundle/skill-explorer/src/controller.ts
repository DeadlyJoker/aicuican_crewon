/** Authenticated skill management over the native workspace and skill services. */
import type { Context } from '@deepseek-ai/cordis'
import { principalOf, Remote, RemoteError, remoteErrorOf, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { link, lstat, realpath, rename, unlink } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type {
  ImportReport, ListPayload, SkillCreateRequest, SkillDocument, SkillDraft, SkillEntry, SkillImportRequest,
  SkillScope, SkillTarget, SkillToggleRequest, SkillTrashEntry, SkillUpdateRequest,
} from './types.ts'
import { buildPayload, buildSkillContent, collectSkills, findProjectRoot, isSkillName } from './upstream/collect.ts'
import { parseFrontmatter, setInvocationContent, stripFrontmatter, updateSkillContent } from './upstream/frontmatter.ts'
import { directoryBelow, createSkillFile, readSkillFile } from './upstream/files.ts'
import { importSkills as runImport, ImportRequestError, type ImportLimits } from './upstream/import.ts'

/** Resolved deployment settings for the skill manager. */
export interface SkillExplorerConfig {
  /** User skill home. */
  dshHome: string
  /** Shared agent home. */
  agentsHome: string
  /** Additional local skill roots exposed for management. */
  customSkillDirs: string[]
  /** Additional read-only bundled skill roots. */
  bundledSkillDirs: string[]
  /** Maximum UTF-8 bytes in one managed instruction file. */
  maxSkillBytes: number
  /** Maximum compressed ZIP input bytes. */
  maxImportBytes: number
  /** Maximum entries examined during one import. */
  maxImportEntries: number
  /** Maximum total expanded instruction bytes during one import. */
  maxImportTotalBytes: number
}

type FailureCode = 'skill-explorer/owner-required' | 'skill-explorer/invalid-request' | 'skill-explorer/not-found'
  | 'skill-explorer/conflict' | 'skill-explorer/read-only' | 'skill-explorer/io'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Workspace-scoped skill discovery and local instruction-file editing. */
    skillExplorer: SkillExplorer
  }
}
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** Skill files are available only to the local Host owner. */
    'skill-explorer/owner-required': {}
    /** A skill request failed validation. */
    'skill-explorer/invalid-request': {}
    /** A selected skill or workspace no longer exists. */
    'skill-explorer/not-found': {}
    /** A file changed or a destination was occupied after selection. */
    'skill-explorer/conflict': {}
    /** The selected source does not permit file mutations. */
    'skill-explorer/read-only': {}
    /** The filesystem could not complete the operation. */
    'skill-explorer/io': {}
  }
}

const scopeSchema = z.object({ workspaceId: z.string().min(1).optional() })
const targetSchema = scopeSchema.extend({ name: z.string().refine(isSkillName), path: z.string().min(1), revision: z.string().optional() })
const draftSchema = z.object({
  name: z.string().refine(isSkillName), description: z.string().trim().min(1),
  whenToUse: z.string().optional(), content: z.string().trim().min(1),
})
const destinationSchema = scopeSchema.extend({ scope: z.enum(['user', 'project']) })
interface SkillRoot { anchor: string; segments: string[]; level: string }
const rootPath = (root: SkillRoot) => join(root.anchor, ...root.segments)
const revisionOf = (content: string) => createHash('sha256').update(content).digest('hex')

function canonicalAnchor(path: string): string {
  try {
    return realpathSync(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return resolve(path)
    throw error
  }
}

function fail(code: FailureCode, message: string): never {
  throw new RemoteError(code, message, {})
}

/** Own file mutations while retaining native skill-provider discovery and loading. */
export class SkillExplorer extends TypertRemoteService {
  private readonly config: SkillExplorerConfig

  /** @param ctx - Native services and authenticated invocation scope. @param config - Resolved roots and resource limits. */
  constructor(ctx: Context, config: SkillExplorerConfig) {
    super(ctx, 'skillExplorer')
    const canonicalRoot = (path: string) => join(canonicalAnchor(dirname(resolve(path))), basename(path))
    this.config = { ...config, dshHome: canonicalAnchor(config.dshHome), agentsHome: canonicalAnchor(config.agentsHome),
      customSkillDirs: config.customSkillDirs.map(canonicalRoot), bundledSkillDirs: config.bundledSkillDirs.map(canonicalRoot) }
  }

  private owner(): void {
    if (principalOf(this.ctx.invocation) !== undefined) fail('skill-explorer/owner-required', 'Skill files belong to the Host owner.')
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.owner()
    try {
      return await operation()
    } catch (error) {
      if (remoteErrorOf(error)) throw error
      if (error instanceof z.ZodError || error instanceof ImportRequestError) fail('skill-explorer/invalid-request', error.message)
      if (error instanceof Error && 'code' in error) {
        if (error.code === 'ENOENT') fail('skill-explorer/not-found', 'The selected skill file no longer exists.')
        if (error.code === 'EEXIST') fail('skill-explorer/conflict', 'The destination already exists.')
      }
      fail('skill-explorer/io', error instanceof Error ? error.message : 'The skill operation could not be completed.')
    }
  }

  private workspace(scope: SkillScope) {
    scopeSchema.parse(scope)
    if (scope.workspaceId === undefined) return undefined
    const workspace = this.ctx.workspaceRegistry.get(scope.workspaceId)
    if (!workspace) fail('skill-explorer/not-found', 'The selected workspace no longer exists.')
    return workspace
  }

  private roots(scope: SkillScope): SkillRoot[] {
    const workspace = this.workspace(scope)
    const roots: SkillRoot[] = [
      { anchor: this.config.dshHome, segments: ['skills'], level: 'user-dsh' },
      { anchor: this.config.agentsHome, segments: ['skills'], level: 'user-agents' },
      ...this.config.customSkillDirs.map(path => ({ anchor: dirname(resolve(path)), segments: [basename(path)], level: 'custom' })),
      ...this.config.bundledSkillDirs.map(path => ({ anchor: dirname(resolve(path)), segments: [basename(path)], level: 'bundled' })),
    ]
    if (workspace) {
      const anchor = findProjectRoot(workspace.path)
      roots.push({ anchor, segments: ['.dsh', 'skills'], level: 'project-dsh' },
        { anchor, segments: ['.agents', 'skills'], level: 'project-agents' })
    }
    return roots
  }

  private async collect(scope: SkillScope) {
    const workspace = this.workspace(scope)
    const cwd = workspace?.path ?? this.config.dshHome
    await using preset = await this.ctx.agentPresets.acquireScope()
    return {
      cwd,
      projectRoots: workspace ? [findProjectRoot(workspace.path)] : [],
      ...await collectSkills({ cwd, projectRoots: workspace ? [findProjectRoot(workspace.path)] : [],
        dshHome: this.config.dshHome, agentsHome: this.config.agentsHome,
        customSkillDirs: this.config.customSkillDirs, bundledSkillDirs: this.config.bundledSkillDirs,
        maximumBytes: this.config.maxSkillBytes,
        registry: { snapshot: options => this.ctx.skills.snapshot({ ...(workspace ? options : {}), scope: preset.key }) } }),
    }
  }

  private async filePath(target: SkillTarget, mutable = false): Promise<string> {
    if (!isAbsolute(target.path)) fail('skill-explorer/invalid-request', 'A skill path must be absolute.')
    const root = this.roots(target).find((candidate) => {
      const path = relative(rootPath(candidate), target.path)
      return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)
    })
    if (!root) fail('skill-explorer/read-only', 'This skill is outside editable skill directories.')
    if (mutable && root.level === 'bundled') fail('skill-explorer/read-only', 'Bundled skill files are read-only.')
    const base = await directoryBelow(root.anchor, root.segments)
    const path = relative(rootPath(root), target.path)
    const parent = await directoryBelow(base, dirname(path) === '.' ? [] : dirname(path).split(sep))
    return join(parent, basename(path))
  }

  private async resolveTarget(target: SkillTarget, mutable = false): Promise<{ skill: SkillEntry; path: string }> {
    targetSchema.parse(target)
    const { skills } = await this.collect(target)
    const skill = skills.find(item => item.name === target.name && item.path === target.path)
    if (!skill) fail('skill-explorer/conflict', 'The selected skill changed. Refresh the list and try again.')
    if (mutable && (skill.linked || skill.level === 'bundled' || skill.fileState !== 'editable')) {
      fail('skill-explorer/read-only', 'This skill source is read-only.')
    }
    if (!mutable && (skill.linked || skill.fileState === 'provider-file')) return { skill, path: await realpath(target.path) }
    return { skill, path: await this.filePath(target) }
  }

  private async document(target: SkillTarget, path: string): Promise<SkillDocument> {
    const file = await readSkillFile(path, this.config.maxSkillBytes)
    const metadata = parseFrontmatter(file.content)
    if (metadata.name !== target.name || !metadata.description) fail('skill-explorer/conflict', 'The skill identity changed. Refresh the list.')
    return { name: target.name, path: target.path, description: metadata.description,
      ...(metadata.whenToUse === undefined ? {} : { whenToUse: metadata.whenToUse }),
      content: stripFrontmatter(file.content), revision: revisionOf(file.content) }
  }

  private validateDraft(draft: SkillDraft): void {
    draftSchema.parse(draft)
    const content = buildSkillContent(draft.name, draft.description, draft.whenToUse, draft.content, false)
    if (Buffer.byteLength(content) > this.config.maxSkillBytes) {
      fail('skill-explorer/invalid-request', 'The skill exceeds the configured size limit.')
    }
  }

  private validateSelection(content: string, target: SkillTarget): void {
    if (parseFrontmatter(content).name !== target.name) fail('skill-explorer/conflict', 'The skill identity changed. Refresh the list.')
    if (target.revision && revisionOf(content) !== target.revision) fail('skill-explorer/conflict', 'The skill changed. Read it again before saving.')
  }

  private async destination(request: SkillCreateRequest | SkillImportRequest): Promise<string> {
    destinationSchema.parse(request)
    if (request.scope === 'user') return directoryBelow(this.config.dshHome, ['skills'], true)
    const workspace = this.workspace(request)
    if (!workspace) fail('skill-explorer/invalid-request', 'Choose a workspace for project skills.')
    return directoryBelow(findProjectRoot(workspace.path), ['.dsh', 'skills'], true)
  }

  /** List the selected workspace's native and filesystem-backed skills.
   * @param request - Workspace whose skill providers and roots are queried.
   * @returns Grouped native and editable skill summaries.
   */
  @Remote('list')
  async list(request: SkillScope): Promise<ListPayload> {
    return this.execute(async () => {
      const collection = await this.collect(request)
      return {
        ...buildPayload(collection.skills, collection.complete, collection.cwd, collection.projectRoots),
        importLimitBytes: this.config.maxImportBytes,
      }
    })
  }

  /** Read an exact listed skill file and return its content revision.
   * @param target - Displayed skill identity and workspace.
   * @returns Editable fields and the current content revision.
   */
  @Remote('read')
  async read(target: SkillTarget): Promise<SkillDocument> {
    return this.execute(async () => this.document(target, (await this.resolveTarget(target)).path))
  }

  /** Create a new complete instruction file without replacing any existing file.
   * @param request - Destination and validated draft fields.
   * @returns The created skill and its initial revision.
   */
  @Remote('create')
  async create(request: SkillCreateRequest): Promise<SkillDocument> {
    return this.execute(async () => {
      this.validateDraft(request.draft)
      const base = await this.destination(request)
      const directory = await directoryBelow(base, [request.draft.name], true)
      const path = await createSkillFile(directory, 'SKILL.md', buildSkillContent(
        request.draft.name, request.draft.description, request.draft.whenToUse, request.draft.content, false))
      return this.document({ ...request, name: request.draft.name, path }, path)
    })
  }

  /** Replace selected fields only when the last-read file revision still matches.
   * @param request - File identity, expected revision and new editable fields.
   * @returns The committed document with its new revision.
   */
  @Remote('update')
  async update(request: SkillUpdateRequest): Promise<SkillDocument> {
    return this.execute(async () => {
      this.validateDraft(request.draft)
      if (request.draft.name !== request.name) fail('skill-explorer/invalid-request', 'Renaming a skill is not supported.')
      if (!request.revision) fail('skill-explorer/invalid-request', 'Read the skill before saving changes.')
      const { path } = await this.resolveTarget(request, true)
      return withFileLock(path, async () => {
        const file = await readSkillFile(await this.filePath(request), this.config.maxSkillBytes)
        this.validateSelection(file.content, request)
        const content = updateSkillContent(file.content, request.draft)
        if (Buffer.byteLength(content) > this.config.maxSkillBytes) fail('skill-explorer/invalid-request', 'The skill exceeds the configured size limit.')
        await writeFileAtomic(path, content, { mode: file.mode })
        return this.document(request, path)
      })
    })
  }

  /** Change the native model-invocation flag without dropping other skill metadata.
   * @param request - Exact file identity and target invocation state.
   */
  @Remote('setEnabled')
  async setEnabled(request: SkillToggleRequest): Promise<void> {
    return this.execute(async () => {
      z.object({ enabled: z.boolean() }).parse(request)
      const { path } = await this.resolveTarget(request, true)
      await withFileLock(path, async () => {
        const file = await readSkillFile(await this.filePath(request), this.config.maxSkillBytes)
        this.validateSelection(file.content, request)
        const content = setInvocationContent(file.content, request.enabled)
        if (Buffer.byteLength(content) > this.config.maxSkillBytes) fail('skill-explorer/invalid-request', 'The skill exceeds the configured size limit.')
        await writeFileAtomic(path, content, { mode: file.mode })
      })
    })
  }

  /** Move an exact listed instruction file into its local recovery directory.
   * @param target - Displayed file identity and optional revision fence.
   * @returns The identity required to restore the removed instruction file.
   */
  @Remote('trash')
  async trash(target: SkillTarget): Promise<SkillTrashEntry> {
    return this.execute(async () => {
      const { path } = await this.resolveTarget(target, true)
      return withFileLock(path, async () => {
        const file = await readSkillFile(await this.filePath(target), this.config.maxSkillBytes)
        this.validateSelection(file.content, target)
        const trash = await directoryBelow(dirname(path), ['.trash'], true)
        const trashedPath = join(trash, `${randomUUID()}-SKILL.md`)
        await rename(path, trashedPath)
        return { name: target.name, path: target.path, trashedPath,
          ...(target.workspaceId === undefined ? {} : { workspaceId: target.workspaceId }) }
      })
    })
  }

  /** Restore one returned recovery entry without overwriting a replacement skill.
   * @param entry - Recovery identity returned by trash.
   */
  @Remote('restore')
  async restore(entry: SkillTrashEntry): Promise<void> {
    return this.execute(async () => {
      targetSchema.parse(entry)
      z.object({ trashedPath: z.string().min(1) }).parse(entry)
      const path = await this.filePath(entry, true)
      const trash = await directoryBelow(dirname(path), ['.trash'])
      if (dirname(entry.trashedPath) !== trash || !/^[a-f\d-]{36}-SKILL\.md$/u.test(basename(entry.trashedPath))) {
        fail('skill-explorer/invalid-request', 'The recovery entry is invalid.')
      }
      await withFileLock(path, async () => {
        const file = await readSkillFile(entry.trashedPath, this.config.maxSkillBytes)
        if (parseFrontmatter(file.content).name !== entry.name) fail('skill-explorer/conflict', 'The recovery file identity changed.')
        try {
          await link(entry.trashedPath, path)
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
          const [current, previous] = await Promise.all([lstat(path), lstat(entry.trashedPath)])
          if (current.ino !== previous.ino || current.dev !== previous.dev) throw error
        }
        await unlink(entry.trashedPath)
      })
    })
  }

  /** Import validated skills with bounded reads and a separate result for every candidate.
   * @param request - Selected destination and directory or base64 archive source.
   * @returns Per-candidate outcomes, including files committed before a later failure.
   */
  @Remote('importSkills')
  async importSkills(request: SkillImportRequest): Promise<ImportReport> {
    return this.execute(async () => {
      const source = z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('directory'), path: z.string().min(1) }),
        z.object({ kind: z.literal('archive'), data: z.string().min(1) }),
      ]).parse(request.source)
      const limits: ImportLimits = { archiveBytes: this.config.maxImportBytes, entries: this.config.maxImportEntries,
        skillBytes: this.config.maxSkillBytes, totalBytes: this.config.maxImportTotalBytes }
      if (source.kind === 'archive' && source.data.length > Math.ceil(limits.archiveBytes / 3) * 4) {
        fail('skill-explorer/invalid-request', 'The archive exceeds the configured size limit.')
      }
      if (source.kind === 'archive' && !/^[A-Za-z0-9+/]+={0,2}$/u.test(source.data)) fail('skill-explorer/invalid-request', 'The archive encoding is invalid.')
      const baseDir = await this.destination(request)
      const { skills } = await this.collect(request)
      return runImport({ baseDir, targetLevel: request.scope === 'project' ? 'project-dsh' : 'user-dsh', existing: skills,
        source: source.kind === 'archive' ? { kind: 'archive', data: Buffer.from(source.data, 'base64') } : source, limits })
    })
  }
}
