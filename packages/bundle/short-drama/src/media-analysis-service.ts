/** Durable, project-scoped media inspection shared by native clients and Agent tools. */
import { basename, isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { principalOf, Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import { analyzeMedia, mediaAnalysisResultSchema, type MediaAnalysisConfig } from './media-analysis.ts'
import { productionIds } from './production-schema.ts'
import type { ProductionConfig, ShortDramaProduction } from './production.ts'
import type { DramaProjectId } from './project-types.ts'
import type { DramaMediaId } from './production-types.ts'

import type { MediaAnalysisId, MediaAnalysisMode, MediaAnalysisRecord } from './media-analysis-types.ts'
export type { MediaAnalysisId, MediaAnalysisMode, MediaAnalysisRecord } from './media-analysis-types.ts'
const analysisIdSchema = z.uuid().transform(brandString<MediaAnalysisId>)
/** Each operation has a distinct frozen input and result. */
export const analysisModeSchema = z.enum(['inspect', 'scenes', 'transcript'])
const recordFields = {
  id: analysisIdSchema, projectId: productionIds.project, mediaId: productionIds.media, mode: analysisModeSchema,
  createdAt: z.number().nonnegative(),
  engine: z.object({ probe: z.literal('ffprobe'), scenes: z.literal('ffmpeg-scene'),
    sceneThreshold: z.number().min(0).max(1), transcription: z.literal('whisper.cpp').nullable(), model: z.string().min(1).nullable() }),
}
const recordSchema = z.discriminatedUnion('state', [
  z.object({ ...recordFields, state: z.literal('running'), reason: z.null(), result: z.null() }),
  z.object({ ...recordFields, state: z.literal('ready'), reason: z.null(), result: mediaAnalysisResultSchema }),
  z.object({ ...recordFields, state: z.literal('failed'), reason: z.literal('execution-failed'), result: z.null() }),
  z.object({ ...recordFields, state: z.literal('interrupted'), reason: z.literal('interrupted'), result: z.null() }),
])
/** Independent storage leaves previously released project and export records unchanged. */
export const mediaAnalysisDomain = defineDomain({ name: 'short_drama_media_analysis', version: 1, layout: 'per-record',
  tables: { records: domainTable<MediaAnalysisId, MediaAnalysisRecord>(recordSchema) },
})

/** Optional local transcription and bounded media analysis policy. */
export interface AnalysisPolicy {
  /** Local Whisper executable used for speech transcription. */
  whisperExecutable: string
  /** Whisper model identifier or path passed to the configured executable. */
  whisperModel: string
  /** Scene-change score threshold used when detecting shot boundaries. */
  analysisSceneThreshold: number
  /** Maximum detected scene boundaries retained by one analysis. */
  analysisMaxScenes: number
  /** Maximum transcription segments retained by one analysis. */
  analysisMaxSegments: number
  /** Maximum media duration accepted for analysis, in seconds. */
  analysisMaxDurationSeconds: number
  /** Maximum serialized bytes retained in one analysis result. */
  analysisMaxResultBytes: number
  /** Maximum analysis records retained per project. */
  analysisHistoryLimit: number
}
/** Defaults retain old profile configurations; no optional model is installed implicitly. */
export const analysisPolicy: Schema<AnalysisPolicy> = Schema.object({
  whisperExecutable: Schema.string().default(''), whisperModel: Schema.string().default(''),
  analysisSceneThreshold: Schema.number().min(0.01).max(1).default(0.35),
  analysisMaxScenes: Schema.number().step(1).min(1).max(10000).default(500),
  analysisMaxSegments: Schema.number().step(1).min(1).max(10000).default(2000),
  analysisMaxDurationSeconds: Schema.number().min(1).max(7200).default(1800),
  analysisMaxResultBytes: Schema.number().step(1).min(1024).max(16777216).default(1048576),
  analysisHistoryLimit: Schema.number().step(1).min(1).max(100).default(20),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Project media analysis without modifying adopted production records. */
    studioMediaAnalysis: StudioMediaAnalysis
  }
}
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'short-drama/analysis-conflict': {}
    'short-drama/analysis-failed': {}
  }
}

/** Executes immutable local inspections, deduplicates live requests and preserves restart outcomes. */
export class StudioMediaAnalysis extends TypertRemoteService {
  private readonly records
  private readonly pending = new Map<MediaAnalysisId, {
    projectId: DramaProjectId
    mediaId: DramaMediaId
    mode: MediaAnalysisMode
    promise: Promise<MediaAnalysisRecord>
  }>()
  private readonly lifetime = new AbortController()
  private readonly runnerConfig: MediaAnalysisConfig

  /**
   * @param ctx - Host owner and managed subprocess provider.
   * @param domain - Independent analysis history.
   * @param config - Deployment executables and resource limits.
   * @param production - Source of validated project media.
   */
  constructor(ctx: Context, domain: Domain<typeof mediaAnalysisDomain>, private readonly config: ProductionConfig & AnalysisPolicy,
    private readonly production: Pick<ShortDramaProduction, 'analysisSource'>) {
    super(ctx, 'studioMediaAnalysis')
    if (config.whisperExecutable !== config.whisperExecutable.trim() || config.whisperModel !== config.whisperModel.trim()
      || !!config.whisperExecutable !== !!config.whisperModel || (config.whisperModel && !isAbsolute(config.whisperModel))) {
      throw new Error('Configure whisperExecutable and an absolute whisperModel path together.')
    }
    this.records = domain.table('records')
    this.runnerConfig = {
      ffmpeg: config.ffmpeg, ffprobe: config.ffprobe, sceneThreshold: config.analysisSceneThreshold,
      maxScenes: config.analysisMaxScenes, maxTranscriptSegments: config.analysisMaxSegments,
      maxResultBytes: config.analysisMaxResultBytes, maxDurationSeconds: config.analysisMaxDurationSeconds,
      ...(config.whisperExecutable ? { whisper: { executable: config.whisperExecutable, model: config.whisperModel, language: 'auto' } } : {}),
    }
    ctx.effect(() => async () => {
      this.lifetime.abort()
      await Promise.allSettled([...this.pending.values()].map(entry => entry.promise))
      await domain.close()
    }, 'Studio media analysis lifecycle')
  }

  private owner(projectId: DramaProjectId, mediaId: DramaMediaId) {
    if (principalOf(this.ctx.invocation) !== undefined) throw new RemoteError('short-drama/owner-required', 'Media belongs to the Host owner.', {})
    return this.production.analysisSource(productionIds.project.parse(projectId), productionIds.media.parse(mediaId))
  }
  private view(record: MediaAnalysisRecord): MediaAnalysisRecord {
    return record.state === 'running' && !this.pending.has(record.id)
      ? { ...record, state: 'interrupted', reason: 'interrupted' } : record
  }

  /**
   * Read recent inspections of this exact archived file, including interrupted requests.
   * @param projectId - Owning project.
   * @param mediaId - Archived audio or video identity.
   * @returns Bounded history in creation order.
   */
  @Remote
  read(projectId: DramaProjectId, mediaId: DramaMediaId): MediaAnalysisRecord[] {
    this.owner(projectId, mediaId)
    return [...this.records.entries()].map(([, value]) => value)
      .filter(record => record.projectId === projectId && record.mediaId === mediaId)
      .sort((a, b) => a.createdAt - b.createdAt).slice(-this.config.analysisHistoryLimit).map(record => this.view(record))
  }

  /**
   * Analyze an archived file once per request identity. Repeating a settled request only reads its result.
   * @param projectId - Owning project.
   * @param mediaId - Exact archived source, independent of later adoption changes.
   * @param mode - Metadata, candidate cuts, or optional local transcription.
   * @param requestId - Stable UUID retained by the caller for duplicate requests.
   * @returns Durable result; failures never alter production or trigger generation.
   */
  @Remote
  async analyze(projectId: DramaProjectId, mediaId: DramaMediaId, mode: MediaAnalysisMode,
    requestId: MediaAnalysisId): Promise<MediaAnalysisRecord> {
    return this.start(projectId, mediaId, mode, requestId)
  }

  /**
   * Analyze from a cancellable Agent turn; only the first caller owns execution cancellation.
   * @param projectId - Owning project.
   * @param mediaId - Exact archived source.
   * @param mode - Requested inspection operation.
   * @param requestId - Stable identity shared with duplicate readers.
   * @param signal - Cancels a new operation; cannot cancel one already owned by another caller.
   * @returns The retained result or interrupted outcome after the owned process settles.
   */
  async analyzeForAgent(projectId: DramaProjectId, mediaId: DramaMediaId, mode: MediaAnalysisMode,
    requestId: MediaAnalysisId, signal: AbortSignal): Promise<MediaAnalysisRecord> {
    signal.throwIfAborted()
    return this.start(projectId, mediaId, mode, requestId, signal)
  }

  private async start(projectId: DramaProjectId, mediaId: DramaMediaId, mode: MediaAnalysisMode,
    requestId: MediaAnalysisId, ownerSignal?: AbortSignal): Promise<MediaAnalysisRecord> {
    this.lifetime.signal.throwIfAborted()
    const source = this.owner(projectId, mediaId)
    const key = analysisIdSchema.parse(requestId), operation = analysisModeSchema.parse(mode)
    const existing = this.records.get(key)
    if (existing && (existing.projectId !== projectId || existing.mediaId !== mediaId || existing.mode !== operation)) {
      throw new RemoteError('short-drama/analysis-conflict', 'This request belongs to another media analysis.', {})
    }
    const running = this.pending.get(key)
    if (running) {
      if (running.projectId !== projectId || running.mediaId !== mediaId || running.mode !== operation) {
        throw new RemoteError('short-drama/analysis-conflict', 'This request belongs to another media analysis.', {})
      }
      return running.promise
    }
    if (existing) return this.view(existing)
    const execute = async (): Promise<MediaAnalysisRecord> => {
      const record: MediaAnalysisRecord = { id: key, projectId, mediaId, mode: operation, createdAt: Date.now(),
        engine: { probe: 'ffprobe', scenes: 'ffmpeg-scene', sceneThreshold: this.runnerConfig.sceneThreshold,
          transcription: this.runnerConfig.whisper ? 'whisper.cpp' : null,
          model: this.runnerConfig.whisper ? basename(this.runnerConfig.whisper.model) : null },
        state: 'running', reason: null, result: null }
      await this.records.put(key, record)
      const signal = AbortSignal.any([
        this.lifetime.signal, AbortSignal.timeout(this.config.processTimeoutMs), ...ownerSignal ? [ownerSignal] : [],
      ])
      try {
        const result = await analyzeMedia({ run: async (argv, cwd, signal) => {
          const child = this.ctx.subprocess.spawn({ argv, cwd, signal, graceMs: this.config.processGraceMs,
            stdio: { stdin: 'ignore', stdout: { maxBytes: this.config.analysisMaxResultBytes }, stderr: { maxBytes: this.config.analysisMaxResultBytes } },
          })
          const outcome = await child.done
          signal.throwIfAborted()
          const output = child.collected.stdout?.readFrom(0)
          if (outcome.exitCode !== 0 || outcome.signal || output?.lossy) throw new Error('Media analysis process failed.')
          return output?.text ?? ''
        } }, this.runnerConfig, { source: source.path, workRoot: source.directory, analyzeScenes: operation === 'scenes', transcribe: operation === 'transcript' }, signal)
        const completed: MediaAnalysisRecord = { ...record, state: 'ready', result }
        await this.records.put(key, completed)
        return completed
      } catch (_error) {
        const failed: MediaAnalysisRecord = this.lifetime.signal.aborted || ownerSignal?.aborted
          ? { ...record, state: 'interrupted', reason: 'interrupted' }
          : { ...record, state: 'failed', reason: 'execution-failed' }
        await this.records.put(key, failed)
        return failed
      }
    }
    const promise = execute()
    this.pending.set(key, { projectId, mediaId, mode: operation, promise })
    try { return await promise } finally { this.pending.delete(key) }
  }
}
