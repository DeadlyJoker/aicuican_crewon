/** Own project assets, storyboard, media attempts, timeline and immutable exports. */
import { diagnosisSchema, assetBriefSchema, shotPlanSchema, mediaReviewSchema, emptyCreativeState, compileShot } from './creative.ts'
import type { CreativeKind, ShotCompilation } from './creative.ts'
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { brandString } from '@deepseek-ai/dsh-brand'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-subprocess'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { principalOf, Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type { DramaProjectId } from './project-types.ts'
import type {
  SharedGenerationSettings, DramaProduction, DramaProductionSettings, DramaAssetDraft, DramaAssetId, DramaShotDraft, DramaShotId,
  DramaJobId, DramaMediaId, DramaExportId, DramaMediaKind, DramaTimelineClip, DramaRoute,
} from './production-types.ts'
import {
  productionDomain, productionIds, productionSettingsSchema, assetDraftSchema, shotDraftSchema, timelineSchema,
  type ProductionRecord, type ArchivedMedia, type GenerationRecord,
} from './production-schema.ts'
import { ProductionFiles, mediaView } from './production-files.ts'
import { executeMedia, observeMedia, type ExecutionConnection, type ExecutionResult } from './production-media.ts'
import type { MediaRequestId } from './media-provider.ts'
import { renderEpisode } from './render-episode.ts'
import { renderMltEpisode, type MltTimeline } from './render-mlt.ts'
import type { DramaEditTimeline } from './edit-types.ts'
import { editTimelineSchema } from './edit-schema.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Native production state and execution operations for short-drama projects. */
    shortDramaProduction: ShortDramaProduction
  }
}
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'short-drama/production-invalid': {}
    'short-drama/production-missing': {}
    'short-drama/script-required': {}
    'short-drama/source-changed': {}
    'short-drama/service-required': {}
    'short-drama/media-unavailable': {}
    'short-drama/media-not-ready': {}
    'short-drama/timeline-invalid': {}
    'short-drama/export-failed': {}
  }
}

/** Deployment policy for media I/O and native encoding. */
export interface ProductionConfig {
  /** Root directory for archived generation inputs and media outputs. */
  mediaDirectory: string
  /** FFmpeg executable used for native encoding and media processing. */
  ffmpeg: string
  /** FFprobe executable used to inspect media streams and duration. */
  ffprobe: string
  /** Optional native MLT executable; required when exporting a multitrack edit. */
  melt?: string
  /** Maximum duration of one generation-service request, in milliseconds. */
  requestTimeoutMs: number
  /** Maximum bytes accepted in one downloaded media result. */
  resultMaxBytes: number
  /** Maximum duration of one native media process, in milliseconds. */
  processTimeoutMs: number
  /** Grace period between cancellation and forced process termination, in milliseconds. */
  processGraceMs: number
  /** Encoded video width in pixels. */
  outputWidth: number
  /** Encoded video height in pixels. */
  outputHeight: number
  /** Encoded video frame rate. */
  fps: number
}
/** All deployment-varying limits are explicit in the profile patch. */
export const productionConfig: Schema<ProductionConfig> = Schema.object({
  mediaDirectory: Schema.string().required(), ffmpeg: Schema.string().required(), ffprobe: Schema.string().required(),
  melt: Schema.string(),
  requestTimeoutMs: Schema.number().step(1).min(1).max(600000).required(),
  resultMaxBytes: Schema.number().step(1).min(1024).max(536870912).required(),
  processTimeoutMs: Schema.number().step(1).min(1).max(600000).required(),
  processGraceMs: Schema.number().step(1).min(1).max(30000).required(),
  outputWidth: Schema.number().step(2).min(64).max(4096).required(), outputHeight: Schema.number().step(2).min(64).max(4096).required(),
  fps: Schema.number().step(1).min(1).max(60).required(),
})

function checked<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new RemoteError('short-drama/production-invalid', 'Check the production fields and try again.', {})
  return result.data
}
function conflict(current: { revision: number }, revision: number): void {
  if (current.revision !== revision) {
    throw new RemoteError('short-drama/revision-conflict', 'Reload the latest production before saving.', {})
  }
}
function missing(): never {
  throw new RemoteError('short-drama/production-missing', 'The production item no longer exists.', {})
}
function allMedia(record: ProductionRecord): ArchivedMedia[] {
  return [
    ...record.jobs.flatMap(job => job.outputs),
    ...record.exports.flatMap(item => item.subtitle ? [item.video, item.subtitle] : [item.video]),
  ]
}

/** Authoritative service shared by native forms and project-scoped Agent tools. */
export class ShortDramaProduction extends TypertRemoteService {
  private readonly table
  private readonly services
  private serviceWrite: Promise<SharedGenerationSettings> | undefined
  private readonly files: ProductionFiles
  private readonly lifetime = new AbortController()
  private readonly initializers = new Map<DramaProjectId, Promise<void>>()
  private readonly operations = new Map<string, Promise<DramaProduction>>()
  private readonly watchers = new Map<DramaProjectId, Set<() => void>>()

  /**
   * @param ctx - Current Host profile.
   * @param domain - Plugin-owned storage.
   * @param config - Validated execution policy.
   */
  constructor(ctx: Context, domain: Domain<typeof productionDomain>, private readonly config: ProductionConfig) {
    super(ctx, 'shortDramaProduction')
    if (!isAbsolute(config.mediaDirectory)) throw new Error('Short-drama mediaDirectory must be absolute.')
    this.table = domain.table('projects')
    this.services = domain.table('services')
    ctx.on('domain/changed', (change) => {
      if (change.domain !== 'short_drama_production' || change.table !== 'projects') return
      for (const changed of this.watchers.get(brandString<DramaProjectId>(change.key)) ?? []) changed()
    })
    this.files = new ProductionFiles(config.mediaDirectory, config.resultMaxBytes)
    this.files.register(ctx, (project, media) => {
      const id = productionIds.project.safeParse(project)
      const file = productionIds.media.safeParse(media)
      if (!id.success || !file.success) return undefined
      const record = this.table.get(id.data)
      return record && allMedia(record).find(item => item.id === file.data)
    })
    ctx.effect(() => async () => {
      this.lifetime.abort()
      await Promise.allSettled([...this.operations.values(), ...this.initializers.values(),
        ...(this.serviceWrite ? [this.serviceWrite] : [])])
      await domain.close()
    }, 'short drama production lifecycle')
  }

  private owner(projectId: DramaProjectId): DramaProjectId {
    if (principalOf(this.ctx.invocation) !== undefined) {
      throw new RemoteError('short-drama/owner-required', 'Production belongs to the Host owner.', {})
    }
    const id = checked(productionIds.project, projectId)
    this.ctx.shortDrama.read(id)
    return id
  }
  /** Read generation defaults managed by the Host owner.
   * @returns Generation defaults shared by Web and Desktop.
   */
  @Remote
  readSharedSettings(): SharedGenerationSettings {
    if (principalOf(this.ctx.invocation) !== undefined) {
      throw new RemoteError('short-drama/owner-required', 'Service settings belong to the Host owner.', {})
    }
    return this.services.get('shared') ?? { revision: 0, settings: { image: null, video: null, voice: null } }
  }

  /**
   * Save defaults without rewriting existing projects or attempts.
   * @param expectedRevision - Last read shared revision.
   * @param settings - Secret-free execution routes.
   * @returns Saved shared settings.
   */
  @Remote
  async saveSharedSettings(expectedRevision: number, settings: DramaProductionSettings): Promise<SharedGenerationSettings> {
    this.readSharedSettings()
    const parsed = checked(productionSettingsSchema, settings)
    if (parsed.video?.adapter === 'openai' || parsed.image?.adapter === 'dashscope' || parsed.voice?.adapter === 'dashscope') {
      throw new RemoteError('short-drama/production-invalid', 'Choose an adapter supporting the output kind.', {})
    }
    const write = async () => {
      conflict(this.services.get('shared') ?? { revision: 0 }, expectedRevision)
      const saved = { revision: expectedRevision + 1, settings: parsed }
      await this.services.put('shared', saved)
      return saved
    }
    const pending = this.serviceWrite ? this.serviceWrite.then(write, write) : write()
    this.serviceWrite = pending
    try { return await pending }
    finally { if (this.serviceWrite === pending) this.serviceWrite = undefined }
  }

  private empty(): ProductionRecord {
    return {
      revision: 0, settings: { image: null, video: null, voice: null }, assets: [], assetHistory: [], shots: [], shotHistory: [],
      jobs: [], timeline: [], exports: [], renders: [], fps: this.config.fps,
    }
  }

  /** Observe committed project changes, including media submission and completion within an Agent turn.
   * @param projectId - Owner's project to observe.
   * @param signal - Remote subscriber cancellation.
   * @returns Current production and subsequent coalesced snapshots until cancellation.
   */
  @Remote({ mode: 'stream' })
  async *watch(projectId: DramaProjectId, signal: AbortSignal): AsyncIterable<DramaProduction> {
    const id = this.owner(projectId), ended = AbortSignal.any([signal, this.lifetime.signal])
    const aborted = (): boolean => ended.aborted
    let wake = Promise.withResolvers<void>(), dirty = true
    const changed = (): void => { dirty = true; wake.resolve() }
    const listeners = this.watchers.get(id) ?? new Set<() => void>()
    this.watchers.set(id, listeners)
    listeners.add(changed)
    ended.addEventListener('abort', changed, { once: true })
    try {
      while (!aborted()) {
        if (!dirty) await wake.promise
        if (aborted()) break
        dirty = false
        wake = Promise.withResolvers<void>()
        yield this.read(id)
      }
    } finally {
      listeners.delete(changed)
      if (!listeners.size) this.watchers.delete(id)
      ended.removeEventListener('abort', changed)
    }
  }
  private async ensure(id: DramaProjectId): Promise<void> {
    if (this.table.get(id)) return
    const pending = this.initializers.get(id)
    if (pending) return pending
    const write = this.table.put(id, this.empty())
    this.initializers.set(id, write)
    try { await write } finally { this.initializers.delete(id) }
  }
  private view(id: DramaProjectId): DramaProduction {
    const record = this.table.get(id) ?? this.empty()
    const adopted = this.ctx.shortDrama.read(id).adoptedScriptId
    return {
      revision: record.revision, settings: record.settings, assets: record.assets, fps: record.fps,
      creative: record.creative ?? emptyCreativeState(),
      shots: record.shots.map(shot => ({
        ...shot,
        needsReview: shot.scriptId !== adopted
          || shot.assetVersions.some(ref => record.assets.find(asset => asset.id === ref.id)?.version !== ref.version),
      })),
      jobs: record.jobs.map(job => ({
        id: job.id, targetType: job.targetType, targetId: job.targetId, targetVersion: job.targetVersion, kind: job.kind,
        state: job.state === 'submitting' && !this.operations.has(`${id}:${job.id}`) ? 'unknown' : job.state,
        reason: job.state === 'submitting' && !this.operations.has(`${id}:${job.id}`) ? 'interrupted' : job.reason,
        createdAt: job.createdAt, outputs: job.outputs.map(media => mediaView(id, media)),
      })),
      timeline: record.timeline,
      ...(record.edit ? { edit: record.edit } : {}),
      exports: record.exports.map(item => ({
        ...item, video: mediaView(id, item.video), subtitle: item.subtitle && mediaView(id, item.subtitle),
      })),
    }
  }
  /**
   * Append a validated source-linked creative decision without overwriting prior decisions.
   * @param projectId - Owning project.
   * @param expectedRevision - Last read production revision.
   * @param kind - Diagnosis, asset brief, director plan or media review.
   * @param document - JSON parsed and validated against the selected record schema.
   * @returns Updated project production and retained decision history.
   */
  @Remote
  async saveCreative(projectId: DramaProjectId, expectedRevision: number, kind: CreativeKind, document: string): Promise<DramaProduction> {
    const id = this.owner(projectId)
    if (document.length > this.config.resultMaxBytes) {
      throw new RemoteError('short-drama/production-invalid', 'The creative record is too large.', {})
    }
    let input: unknown
    try { input = JSON.parse(document) }
    catch (_error) { throw new RemoteError('short-drama/production-invalid', 'Use a valid creative JSON record.', {}) }
    const project = this.ctx.shortDrama.read(id)
    const script = project.scripts.find(item => item.id === project.adoptedScriptId)
    if (!script) throw new RemoteError('short-drama/media-not-ready', 'Adopt the project screenplay first.', {})
    return this.change(id, expectedRevision, (current) => {
      const creative = current.creative ?? emptyCreativeState()
      const invalid = (reason: string): never => { throw new RemoteError('short-drama/production-invalid', reason, {}) }
      if (kind === 'diagnosis') {
        const value = checked(diagnosisSchema, input)
        if (value.scriptId !== script.id || value.issues.some(item => !script.body.includes(item.quote))) invalid('Link findings to exact adopted screenplay quotes.')
        if (creative.diagnoses.some(item => item.id === value.id)) invalid('This decision identity is already saved.')
        return { ...current, creative: { ...creative, diagnoses: [...creative.diagnoses, value] } }
      }
      if (kind === 'asset') {
        const value = checked(assetBriefSchema, input)
        const asset = current.assets.find(item => item.id === value.assetId)
        if (value.scriptId !== script.id || !asset || asset.version !== value.assetVersion || !script.body.includes(value.evidence)) {
          invalid('Use the current asset version and exact screenplay evidence.')
        }
        if (creative.assets.some(item => item.id === value.id)) invalid('This decision identity is already saved.')
        return { ...current, creative: { ...creative, assets: [...creative.assets, value] } }
      }
      if (kind === 'shot') {
        const value = checked(shotPlanSchema, input)
        const shot = current.shots.find(item => item.id === value.shotId)
        if (!shot || shot.version !== value.shotVersion || shot.scriptId !== script.id
          || value.references.some(ref => !shot.assetIds.includes(ref.assetId))) invalid('Use the current shot and its assigned assets.')
        if (creative.plans.some(item => item.id === value.id)) invalid('This decision identity is already saved.')
        return { ...current, creative: { ...creative, plans: [...creative.plans, value] } }
      }
      {
        const value = checked(mediaReviewSchema, input)
        const job = current.jobs.find(item => item.id === value.jobId)
        if (!job || job.state !== 'ready') invalid('Review an archived generation attempt.')
        if (value.replacesJobId && !current.jobs.some(item => item.id === value.replacesJobId && item.targetId === job?.targetId)) {
          invalid('The replaced attempt must belong to this same target.')
        }
        if (new Set(value.dimensions.map(item => item.dimension)).size !== value.dimensions.length) invalid('Review each dimension once.')
        if (creative.reviews.some(item => item.id === value.id)) invalid('This decision identity is already saved.')
        return { ...current, creative: { ...creative, reviews: [...creative.reviews, value] } }
      }
    })
  }

  /**
   * Compile the current director plan without submitting or changing generation inputs.
   * @param projectId - Owner.
   * @param shotId - Existing structured shot.
   * @returns H3 prompt, ordered reference identities and blocking findings.
   */
  @Remote
  compileShot(projectId: DramaProjectId, shotId: DramaShotId): ShotCompilation {
    const id = this.owner(projectId)
    const state = this.table.get(id)
    const shot = state?.shots.find(item => item.id === shotId)
    const plan = state?.creative?.plans.filter(item => item.shotId === shotId).at(-1)
    if (!state || !shot || !plan) throw new RemoteError('short-drama/production-invalid', 'Save a structured director plan first.', {})
    const project = this.ctx.shortDrama.read(id)
    const script = project.scripts.find(item => item.id === project.adoptedScriptId)
    const result = compileShot(plan, shot, state.assets, script?.body ?? '', shot.frames / state.fps)
    if (shot.scriptId !== project.adoptedScriptId) return { ...result, valid: false, errors: [...result.errors, 'script-version-changed'] }
    return result
  }

  private async change(
    id: DramaProjectId, revision: number, action: (current: ProductionRecord) => ProductionRecord,
  ): Promise<DramaProduction> {
    if (!Number.isSafeInteger(revision) || revision < 0) {
      throw new RemoteError('short-drama/production-invalid', 'Invalid production revision.', {})
    }
    await this.ensure(id)
    await this.table.update(id, (current) => {
      conflict(current, revision)
      return { ...action(current), revision: current.revision + 1 }
    })
    return this.view(id)
  }

  /**
   * Read current state and retained media history.
   * @param projectId - Owning project.
   * @returns Production state.
   */
  @Remote
  read(projectId: DramaProjectId): DramaProduction { return this.view(this.owner(projectId)) }

  /**
   * Configure execution only for future attempts.
   * @param projectId - Owner.
   * @param expectedRevision - Read revision.
   * @param settings - Secret-free routes.
   * @returns Saved state.
   */
  @Remote
  async saveSettings(projectId: DramaProjectId, expectedRevision: number, settings: DramaProductionSettings): Promise<DramaProduction> {
    const id = this.owner(projectId)
    const parsed = checked(productionSettingsSchema, settings)
    if ((parsed.video?.adapter === 'openai') || (parsed.image?.adapter === 'dashscope') || (parsed.voice?.adapter === 'dashscope')) {
      throw new RemoteError('short-drama/production-invalid', 'Choose a supported execution protocol for each output type.', {})
    }
    return this.change(id, expectedRevision, current => ({ ...current, settings: parsed }))
  }

  /**
   * Append an asset revision without changing media from older versions.
   * @param projectId - Owner.
   * @param expectedRevision - Read revision.
   * @param draft - Character, scene, prop or voice.
   * @returns Saved state.
   */
  @Remote
  async saveAsset(projectId: DramaProjectId, expectedRevision: number, draft: DramaAssetDraft): Promise<DramaProduction> {
    const id = this.owner(projectId)
    const parsed = checked(assetDraftSchema, draft)
    const assetId = parsed.id ?? brandString<DramaAssetId>(randomUUID())
    return this.change(id, expectedRevision, (current) => {
      const old = current.assets.find(asset => asset.id === assetId)
      if (parsed.id && !old) missing()
      const asset = { ...parsed, id: assetId, version: (old?.version ?? 0) + 1, adoptedMediaId: null }
      return {
        ...current, assets: old ? current.assets.map(item => item.id === assetId ? asset : item) : [...current.assets, asset],
        assetHistory: [...current.assetHistory, asset],
      }
    })
  }

  /**
   * Remove an unused asset from the active catalogue; retain historical versions.
   * @param projectId - Owner.
   * @param expectedRevision - Read revision.
   * @param assetId - Asset to remove.
   * @returns Saved state.
   */
  @Remote
  async removeAsset(projectId: DramaProjectId, expectedRevision: number, assetId: DramaAssetId): Promise<DramaProduction> {
    const id = this.owner(projectId)
    const asset = checked(productionIds.asset, assetId)
    return this.change(id, expectedRevision, (current) => {
      if (current.shots.some(shot => shot.assetIds.includes(asset))) {
        throw new RemoteError('short-drama/source-changed', 'Remove this asset from active shots first.', {})
      }
      if (!current.assets.some(item => item.id === asset)) missing()
      return { ...current, assets: current.assets.filter(item => item.id !== asset) }
    })
  }

  /**
   * Append a shot revision freezing current adopted script and asset versions.
   * @param projectId - Owner.
   * @param expectedRevision - Read revision.
   * @param draft - Shot and reusable references.
   * @returns Saved state.
   */
  @Remote
  async saveShot(projectId: DramaProjectId, expectedRevision: number, draft: DramaShotDraft): Promise<DramaProduction> {
    const id = this.owner(projectId)
    const parsed = checked(shotDraftSchema, draft)
    const scriptId = this.ctx.shortDrama.read(id).adoptedScriptId
    if (!scriptId) throw new RemoteError('short-drama/script-required', 'Adopt a script before defining its shots.', {})
    const shotId = parsed.id ?? brandString<DramaShotId>(randomUUID())
    return this.change(id, expectedRevision, (current) => {
      const old = current.shots.find(shot => shot.id === shotId)
      if (parsed.id && !old) missing()
      const refs = [...new Set(parsed.assetIds)].map((assetId) => {
        const asset = current.assets.find(item => item.id === assetId)
        if (!asset) missing()
        return { id: asset.id, version: asset.version }
      })
      const shot = {
        ...parsed, id: shotId, version: (old?.version ?? 0) + 1, scriptId, assetVersions: refs,
        adoptedImageId: null, adoptedVideoId: null, adoptedVoiceId: null,
      }
      return {
        ...current, shots: old ? current.shots.map(item => item.id === shotId ? shot : item) : [...current.shots, shot],
        shotHistory: [...current.shotHistory, shot],
      }
    })
  }

  /**
   * Remove an untimed shot while preserving historical runs.
   * @param projectId - Owner.
   * @param expectedRevision - Read revision.
   * @param shotId - Shot to remove.
   * @returns Saved state.
   */
  @Remote
  async removeShot(projectId: DramaProjectId, expectedRevision: number, shotId: DramaShotId): Promise<DramaProduction> {
    const id = this.owner(projectId)
    const shot = checked(productionIds.shot, shotId)
    return this.change(id, expectedRevision, (current) => {
      if (current.timeline.some(clip => clip.shotId === shot)) {
        throw new RemoteError('short-drama/timeline-invalid', 'Remove this shot from the edit first.', {})
      }
      if (!current.shots.some(item => item.id === shot)) missing()
      return { ...current, shots: current.shots.filter(item => item.id !== shot) }
    })
  }

  private async connection(route: DramaRoute, kind: DramaMediaKind): Promise<ExecutionConnection> {
    const credential = route.credentialRef ? await this.ctx.credentials.resolve(credentialRef(route.credentialRef)) : undefined
    if (route.credentialRef && !credential) {
      throw new RemoteError('short-drama/service-required', 'Configure the selected API credential in CrewON first.', {})
    }
    return {
      protocol: route.adapter === 'zealman' ? 'zealman' : route.adapter === 'jobs-v1' ? 'jobs-v1'
        : route.adapter === 'dashscope' ? 'dashscope-video' : kind === 'image' ? 'openai-image' : 'openai-speech',
      endpoint: route.endpoint, model: route.model, voice: route.voice,
      ...(credential ? { token: credential.value } : {}), timeoutMs: this.config.requestTimeoutMs,
      maxResponseBytes: this.config.resultMaxBytes,
    }
  }
  private run(key: string, action: () => Promise<DramaProduction>): Promise<DramaProduction> {
    const pending = this.operations.get(key)
    if (pending) return pending
    const operation = action()
    this.operations.set(key, operation)
    return operation.finally(() => { if (this.operations.get(key) === operation) this.operations.delete(key) })
  }
  private media(id: DramaProjectId, mediaId: DramaMediaId): ArchivedMedia {
    const record = this.table.get(id)
    return record && allMedia(record).find(item => item.id === mediaId) || missing()
  }
  private async settle(id: DramaProjectId, job: GenerationRecord, result: ExecutionResult): Promise<DramaProduction> {
    const outputs: ArchivedMedia[] = []
    if (result.state === 'available') {
      for (const output of result.outputs) {
        const expected = job.kind === 'voice' ? 'audio/' : `${job.kind}/`
        if (!output.mimeType.startsWith(expected)) {
          throw new RemoteError('short-drama/media-unavailable', 'The API returned an unexpected media type.', {})
        }
        outputs.push(await this.files.archive(id, job.kind, output.mimeType, output.bytes))
      }
      if (!outputs.length) throw new RemoteError('short-drama/media-unavailable', 'The API returned no output.', {})
    }
    await this.table.update(id, current => ({ ...current, jobs: current.jobs.map(item => item.id === job.id ? {
      ...item, state: result.state === 'available' ? 'ready' : result.state === 'pending' ? 'running' : result.state,
      taskId: result.taskId, reason: result.reason, outputs,
    } : item) }))
    return this.view(id)
  }

  /**
   * Reserve an attempt durably before contacting its execution API. Repeated keys never resubmit.
   * @param projectId - Owner.
   * @param expectedRevision - Read revision.
   * @param jobId - Caller-owned UUID reused for double clicks.
   * @param targetType - Asset or shot.
   * @param targetId - Target identity.
   * @param kind - Requested output.
   * @param referenceMediaIds - Archived project images used to edit an asset; omitted for other execution paths.
   * @returns Current state and API receipt.
   */
  @Remote
  async generate(
    projectId: DramaProjectId, expectedRevision: number, jobId: DramaJobId, targetType: 'asset' | 'shot',
    targetId: string, kind: DramaMediaKind, referenceMediaIds?: DramaMediaId[],
  ): Promise<DramaProduction> {
    const id = this.owner(projectId)
    const key = checked(productionIds.job, jobId)
    if (!['asset', 'shot'].includes(targetType) || !['image', 'video', 'voice'].includes(kind)) {
      throw new RemoteError('short-drama/production-invalid', 'Choose an output type.', {})
    }
    await this.ensure(id)
    const existing = this.table.get(id)?.jobs.find(job => job.id === key)
    if (existing) {
      if (existing.targetType !== targetType || existing.targetId !== targetId || existing.kind !== kind) {
        throw new RemoteError('short-drama/production-invalid', 'This request key already belongs to another operation.', {})
      }
      return this.operations.get(`${id}:${key}`) ?? this.view(id)
    }
    return this.run(`${id}:${key}`, async () => {
      const current = this.table.get(id)
      if (!current) missing()
      conflict(current, expectedRevision)
      const target = targetType === 'asset'
        ? current.assets.find(asset => asset.id === targetId) : current.shots.find(shot => shot.id === targetId)
      if (!target) missing()
      let route = current.settings[kind]
      if (!route) throw new RemoteError('short-drama/service-required', 'Configure an execution API for this output first.', {})
      const references = checked(z.array(productionIds.media).max(12), referenceMediaIds ?? [])
      if (references.length) {
        if (targetType !== 'asset' || kind !== 'image' || new Set(references).size !== references.length) {
          throw new RemoteError('short-drama/production-invalid', 'Select distinct image references for an asset edit.', {})
        }
        for (const reference of references) {
          if (!this.media(id, reference).mimeType.startsWith('image/')) {
            throw new RemoteError('short-drama/production-invalid', 'Asset editing requires archived project images.', {})
          }
        }
      }
      let prompt = target.prompt
      let duration = 5
      if ('kind' in target && (kind === 'video' || ((target.kind === 'voice') !== (kind === 'voice')))) {
        throw new RemoteError('short-drama/production-invalid', 'Choose an output matching the asset type.', {})
      }
      if (targetType === 'shot') {
        const shot = this.view(id).shots.find(item => item.id === target.id)
        if (!shot) missing()
        if (shot.needsReview) {
          throw new RemoteError('short-drama/source-changed', 'Review the changed script or assets and save this shot first.', {})
        }
        duration = shot.frames / current.fps
        if (kind === 'voice') {
          if (!shot.dialogue.trim()) throw new RemoteError('short-drama/production-invalid', 'Add dialogue before generating speech.', {})
          prompt = shot.dialogue
        } else if (kind === 'video' && current.creative?.plans.some(item => item.shotId === shot.id)) {
          const compiled = this.compileShot(id, shot.id)
          if (!compiled.valid) throw new RemoteError('short-drama/production-invalid', `Fix director plan: ${compiled.errors.join(', ')}`, {})
          prompt = compiled.prompt
          references.push(...compiled.references)
        } else if (kind === 'video') {
          if (!shot.adoptedImageId) throw new RemoteError('short-drama/media-not-ready', 'Adopt a shot image before generating video.', {})
          references.push(shot.adoptedImageId)
          prompt = [shot.prompt, `视频时长：${duration} 秒`,
            ...(shot.dialogue.trim() ? [`原生中文对白（保持说话人，不生成字幕）：\n${shot.dialogue}`] : []),
          ].join('\n\n')
        } else {
          for (const ref of shot.assetVersions) {
            const asset = current.assetHistory.find(item => item.id === ref.id && item.version === ref.version)
            if (asset?.kind !== 'voice' && asset?.adoptedMediaId) references.push(asset.adoptedMediaId)
          }
        }
      }
      if (kind === 'image' && references.length && route.referenceModel) route = { ...route, model: route.referenceModel }
      const connection = await this.connection(route, kind)
      const job: GenerationRecord = {
        id: key, targetType, targetId, targetVersion: target.version, kind, state: 'submitting', reason: null, outputs: [],
        createdAt: Date.now(), route, prompt, taskId: null, references, duration,
        ...(kind === 'video' && targetType === 'shot' && current.creative?.plans.some(item => item.shotId === target.id)
          ? { planId: this.compileShot(id, productionIds.shot.parse(target.id)).planId } : {}),
      }
      await this.table.update(id, (state) => {
        conflict(state, expectedRevision)
        return { ...state, revision: state.revision + 1, jobs: [...state.jobs, job] }
      })
      let receipt: ExecutionResult | undefined
      try {
        const resolved = await Promise.all(references.map(async (mediaId) => {
          const media = this.media(id, mediaId)
          return { mimeType: media.mimeType, bytes: await this.files.bytes(id, media) }
        }))
        receipt = await executeMedia(
          connection, { kind, prompt, references: resolved, duration }, brandString<MediaRequestId>(key), this.lifetime.signal,
        )
        return await this.settle(id, job, receipt)
      } catch (error) {
        await this.settle(id, job, {
          state: 'unknown', taskId: receipt?.taskId ?? null,
          reason: this.lifetime.signal.aborted ? 'interrupted' : 'unavailable', outputs: [],
        })
        throw error
      }
    })
  }

  /**
   * Reconcile an existing attempt with its original API; never submit a replacement.
   * @param projectId - Owner.
   * @param jobId - Durable request key.
   * @returns Latest receipt and archived results.
   */
  @Remote
  async observe(projectId: DramaProjectId, jobId: DramaJobId): Promise<DramaProduction> {
    const id = this.owner(projectId)
    const key = checked(productionIds.job, jobId)
    return this.run(`${id}:${key}`, async () => {
      const job = this.table.get(id)?.jobs.find(item => item.id === key)
      if (!job) missing()
      if (job.state === 'ready' || job.state === 'failed') return this.view(id)
      const connection = await this.connection(job.route, job.kind)
      return this.settle(id, job, await observeMedia(
        connection, job.kind, brandString<MediaRequestId>(key), job.taskId, this.lifetime.signal,
      ))
    })
  }

  /**
   * Adopt one successful candidate only while its target revision remains current.
   * @param projectId - Owner.
   * @param expectedRevision - Read revision.
   * @param jobId - Successful attempt.
   * @param mediaId - Candidate file.
   * @returns Saved adoption.
   */
  @Remote
  async adoptMedia(
    projectId: DramaProjectId, expectedRevision: number, jobId: DramaJobId, mediaId: DramaMediaId,
  ): Promise<DramaProduction> {
    const id = this.owner(projectId)
    const jobKey = checked(productionIds.job, jobId)
    const mediaKey = checked(productionIds.media, mediaId)
    return this.change(id, expectedRevision, (current) => {
      const job = current.jobs.find(item => item.id === jobKey)
      if (!job || job.state !== 'ready' || !job.outputs.some(media => media.id === mediaKey)) {
        throw new RemoteError('short-drama/media-not-ready', 'Choose a completed candidate.', {})
      }
      const review = current.creative?.reviews.filter(item => item.jobId === job.id).at(-1)
      if (review?.dimensions.some(item => item.verdict === 'failed')) {
        throw new RemoteError('short-drama/media-not-ready', 'Resolve the failed review before adopting this candidate.', {})
      }
      if (job.targetType === 'asset') {
        const asset = current.assets.find(item => item.id === job.targetId)
        if (!asset || asset.version !== job.targetVersion) {
          throw new RemoteError('short-drama/source-changed', 'This candidate belongs to an older asset revision.', {})
        }
        const adopted = { ...asset, version: asset.version + 1, adoptedMediaId: mediaKey }
        const brief = current.creative?.assets.filter(item => item.assetId === asset.id && item.assetVersion === asset.version).at(-1)
        const creative = current.creative
        const inherited = brief && assetBriefSchema.parse({
          ...brief, id: randomUUID(), assetVersion: adopted.version, inheritedFrom: brief.id,
        })
        return {
          ...current, assets: current.assets.map(item => item.id === asset.id ? adopted : item),
          assetHistory: [...current.assetHistory, adopted],
          ...(creative && inherited ? { creative: { ...creative, assets: [...creative.assets, inherited] } } : {}),
        }
      }
      const shot = current.shots.find(item => item.id === job.targetId)
      if (!shot || shot.version !== job.targetVersion || this.view(id).shots.find(item => item.id === shot.id)?.needsReview) {
        throw new RemoteError('short-drama/source-changed', 'This candidate belongs to an older storyboard revision.', {})
      }
      if (job.kind === 'video' && job.planId) {
        const compiled = this.compileShot(id, shot.id)
        if (!compiled.valid || compiled.planId !== job.planId || JSON.stringify(compiled.references) !== JSON.stringify(job.references)) {
          throw new RemoteError('short-drama/source-changed', 'This video belongs to an older director plan or reference set.', {})
        }
      }
      if (job.kind === 'video' && !job.planId && job.references[0] !== shot.adoptedImageId) {
        throw new RemoteError('short-drama/source-changed', 'This video was generated from a different shot image.', {})
      }
      const adopted = {
        ...shot,
        ...(job.kind === 'image' && mediaKey !== shot.adoptedImageId ? { adoptedVideoId: null } : {}),
        [job.kind === 'image' ? 'adoptedImageId' : job.kind === 'video' ? 'adoptedVideoId' : 'adoptedVoiceId']: mediaKey,
      }
      return { ...current, shots: current.shots.map(item => item.id === shot.id ? adopted : item) }
    })
  }

  /**
   * Save exact adopted files and frame-accurate edit decisions.
   * @param projectId - Owner.
   * @param expectedRevision - Read revision.
   * @param clips - Ordered input snapshots.
   * @returns Saved timeline.
   */
  @Remote
  async saveTimeline(projectId: DramaProjectId, expectedRevision: number, clips: DramaTimelineClip[]): Promise<DramaProduction> {
    const id = this.owner(projectId)
    const parsed = checked(timelineSchema, clips)
    return this.change(id, expectedRevision, (current) => {
      if (current.edit) throw new RemoteError('short-drama/timeline-invalid', 'This project uses multitrack editing. Save its tracks instead.', {})
      for (const clip of parsed) {
        const shot = current.shots.find(item => item.id === clip.shotId)
        if (!shot || shot.adoptedVideoId !== clip.videoId || (clip.voiceId !== null && shot.adoptedVoiceId !== clip.voiceId)
          || this.media(id, clip.videoId).kind !== 'video' || (clip.voiceId && this.media(id, clip.voiceId).kind !== 'voice')) {
          throw new RemoteError('short-drama/timeline-invalid', 'Use an adopted video and voice for each timeline row.', {})
        }
      }
      return { ...current, timeline: parsed }
    })
  }

  /**
   * Save multitrack decisions without rewriting sequential history or source media.
   * @param projectId - Owning project.
   * @param expectedRevision - Last read production revision.
   * @param edit - Validated tracks; media must already be archived in this project.
   * @returns Updated production with the preserved legacy timeline.
   */
  @Remote
  async saveEdit(projectId: DramaProjectId, expectedRevision: number, edit: DramaEditTimeline): Promise<DramaProduction> {
    const id = this.owner(projectId)
    const parsed = checked(editTimelineSchema, edit)
    return this.change(id, expectedRevision, (current) => {
      for (const track of parsed.tracks) {
        if (track.kind === 'subtitle') continue
        for (const clip of track.clips) {
          const media = this.media(id, clip.mediaId)
          if ((track.kind === 'video' && media.kind !== 'video')
            || (track.kind === 'audio' && media.kind !== 'video' && media.kind !== 'voice')) {
            throw new RemoteError('short-drama/timeline-invalid', 'Choose video or audio archived in this project.', {})
          }
        }
      }
      return { ...current, edit: parsed }
    })
  }

  private async resolveEdit(id: DramaProjectId, edit: DramaEditTimeline, directory: string, fps: number): Promise<MltTimeline> {
    const sources = new Map<DramaMediaId, { path: string; hasAudio: boolean; duration: number; hasVideo: boolean }>()
    const source = async (mediaId: DramaMediaId) => {
      const existing = sources.get(mediaId)
      if (existing) return existing
      const path = this.files.path(id, this.media(id, mediaId))
      const facts = z.object({ streams: z.array(z.object({ codec_type: z.string(), duration: z.string().optional() })),
        format: z.object({ duration: z.string(), format_name: z.string() }) }).parse(JSON.parse(await this.command([
        this.config.ffprobe, '-v', 'error', '-protocol_whitelist', 'file',
        '-format_whitelist', 'mov,matroska,webm,wav,mp3,ogg,flac,aac', '-show_entries',
        'stream=codec_type,duration:format=duration,format_name', '-of', 'json', path,
      ], directory, this.lifetime.signal)))
      const result = { path, hasAudio: facts.streams.some(stream => stream.codec_type === 'audio'),
        hasVideo: facts.streams.some(stream => stream.codec_type === 'video'), duration: Number(facts.format.duration) }
      if (!Number.isFinite(result.duration) || result.duration <= 0
        || !facts.format.format_name.split(',').some(name => ['mov', 'mp4', 'matroska', 'webm', 'wav', 'mp3', 'ogg', 'flac', 'aac'].includes(name))) {
        throw new RemoteError('short-drama/timeline-invalid', 'The source duration cannot be read.', {})
      }
      sources.set(mediaId, result)
      return result
    }
    const tracks: MltTimeline['tracks'] = []
    for (const track of edit.tracks) {
      if (track.kind === 'subtitle') { tracks.push(track); continue }
      const resolve = async (clip: import('./edit-types.ts').DramaAudioClip) => {
        const media = await source(clip.mediaId)
        if ((track.kind === 'video' && !media.hasVideo) || (track.kind === 'audio' && !media.hasAudio)
          || (clip.sourceStartFrame + clip.frames) / fps > media.duration + 1 / fps) {
          throw new RemoteError('short-drama/timeline-invalid', 'The clip exceeds its source or has no required stream.', {})
        }
        return media
      }
      if (track.kind === 'video') {
        const clips = []
        for (const clip of track.clips) clips.push({ ...clip, ...await resolve(clip) })
        tracks.push({ ...track, kind: 'video', clips })
      } else {
        const clips = []
        for (const clip of track.clips) clips.push({ ...clip, ...await resolve(clip) })
        tracks.push({ ...track, kind: 'audio', clips })
      }
    }
    return { tracks }
  }

  /**
   * Resolve an archived audio/video source for Host-local analysis without exposing paths remotely.
   * @param projectId - Owning project.
   * @param mediaId - Immutable archived source.
   * @returns Private source path and work directory.
   */
  analysisSource(projectId: DramaProjectId, mediaId: DramaMediaId): { path: string; directory: string } {
    const id = this.owner(projectId)
    const media = this.media(id, checked(productionIds.media, mediaId))
    if (media.kind !== 'video' && media.kind !== 'voice') {
      throw new RemoteError('short-drama/media-unavailable', 'Choose an archived video or audio file.', {})
    }
    return { path: this.files.path(id, media), directory: this.config.mediaDirectory }
  }

  private async command(argv: readonly string[], cwd: string, signal: AbortSignal): Promise<string> {
    const child = this.ctx.subprocess.spawn({
      argv, cwd, signal: AbortSignal.any([signal, AbortSignal.timeout(this.config.processTimeoutMs)]), graceMs: this.config.processGraceMs,
      stdio: { stdin: 'ignore', stdout: { maxBytes: 65536 }, stderr: { maxBytes: 65536 } },
    })
    const outcome = await child.done
    if (outcome.exitCode !== 0) {
      throw new RemoteError('short-drama/export-failed', 'Encoding failed. Check the selected clips and encoder configuration.', {})
    }
    return child.collected.stdout?.readFrom(0).text ?? ''
  }

  /**
   * Render a frozen timeline once per export key; retain every older export.
   * @param projectId - Owner.
   * @param expectedRevision - Read revision.
   * @param exportId - Idempotent caller-owned key.
   * @returns Verified export and history.
   */
  @Remote
  async exportEpisode(projectId: DramaProjectId, expectedRevision: number, exportId: DramaExportId): Promise<DramaProduction> {
    const id = this.owner(projectId)
    const key = checked(productionIds.export, exportId)
    return this.run(`${id}:${key}`, async () => {
      const current = this.table.get(id)
      if (!current) missing()
      if (current.exports.some(item => item.id === key)) return this.view(id)
      let intent = current.renders.find(item => item.id === key)
      if (!intent) {
        conflict(current, expectedRevision)
        if (!current.timeline.length && !current.edit?.tracks.some(track => track.clips.length)) throw new RemoteError('short-drama/timeline-invalid', 'Add clips to the edit first.', {})
        if (current.edit && !this.config.melt) throw new RemoteError('short-drama/service-required', 'Multitrack export requires the configured MLT engine.', {})
        intent = { id: key, clips: structuredClone(current.timeline), ...(current.edit ? { edit: structuredClone(current.edit) } : {}), state: 'rendering' }
        const reserved = intent
        await this.table.update(id, (state) => {
          conflict(state, expectedRevision)
          return { ...state, renders: [...state.renders, reserved] }
        })
      }
      const frozen = intent.clips
      const frozenEdit = intent.edit
      try {
        const clips = []
        const directory = await this.files.directory(id)
        for (const clip of frozenEdit ? [] : frozen) {
          const video = this.media(id, clip.videoId)
          const voice = clip.voiceId && this.media(id, clip.voiceId)
          const path = this.files.path(id, video)
          const facts = JSON.parse(await this.command([
            this.config.ffprobe, '-v', 'error', '-show_entries', 'stream=codec_type,duration:format=duration', '-of', 'json', path,
          ], directory, this.lifetime.signal)) as {
            streams?: { codec_type?: string; duration?: string }[]
            format?: { duration?: string }
          }
          const duration = Number(facts.streams?.find(stream => stream.codec_type === 'video')?.duration ?? facts.format?.duration)
          if (!Number.isFinite(duration) || (clip.startFrame + clip.frames) / current.fps > duration + 1 / current.fps) {
            throw new RemoteError('short-drama/timeline-invalid', 'The edit extends beyond the selected video.', {})
          }
          clips.push({
            video: path, hasAudio: facts.streams?.some(stream => stream.codec_type === 'audio') ?? false,
            ...(voice ? { voice: this.files.path(id, voice) } : {}),
            startFrame: clip.startFrame, frames: clip.frames, subtitle: clip.subtitle,
          })
        }
        const encoder = {
          ffmpeg: this.config.ffmpeg, ffprobe: this.config.ffprobe, run: (argv, cwd, signal) => this.command(argv, cwd, signal),
        } satisfies import('./render-episode.ts').EpisodeEncoder
        const format = {
          width: this.config.outputWidth, height: this.config.outputHeight, fps: current.fps,
        }
        let rendered: import('./render-episode.ts').EpisodeExport
        if (frozenEdit) {
          const melt = this.config.melt
          if (!melt) throw new RemoteError('short-drama/service-required', 'Multitrack export requires the configured MLT engine.', {})
          rendered = await renderMltEpisode({ ...encoder, melt }, directory,
            await this.resolveEdit(id, frozenEdit, directory, current.fps), format, this.lifetime.signal)
        } else rendered = await renderEpisode(encoder, directory, clips, format, this.lifetime.signal)
        const video = await this.files.archive(id, 'video', 'video/mp4', await this.files.readBounded(rendered.video))
        const subtitle = rendered.subtitle
          ? await this.files.archive(id, 'subtitle', 'application/x-subrip', await this.files.readBounded(rendered.subtitle)) : null
        await this.table.update(id, state => ({
          ...state,
          exports: [...state.exports, { id: key, createdAt: Date.now(), clips: frozen,
            ...(frozenEdit ? { edit: frozenEdit } : {}), video, subtitle, frames: rendered.frames }],
          renders: state.renders.map(item => item.id === key ? { ...item, state: 'complete' } : item),
        }))
        try {
          await rm(rendered.video, { force: true })
          if (rendered.subtitle) await rm(rendered.subtitle, { force: true })
        } catch (error) {
          this.ctx.logger('short-drama').warn('Export completed; temporary file cleanup failed: %s', error)
        }
        return this.view(id)
      } catch (error) {
        await this.table.update(id, state => ({
          ...state, renders: state.renders.map(item => item.id === key ? { ...item, state: 'failed' } : item),
        }))
        if (error instanceof RemoteError) throw error
        throw new RemoteError('short-drama/export-failed', 'Export failed. Check the clips and encoder, then try again.', {})
      }
    })
  }
}
