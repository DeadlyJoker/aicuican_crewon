/** Project-scoped creative tools share the workbench's production service. */
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { StudioMediaAnalysis, MediaAnalysisId } from './media-analysis-service.ts'
import type { Context } from '@deepseek-ai/cordis'
import { editTimelineSchema } from './edit-schema.ts'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { DramaProjectId } from './project-types.ts'
import type { ShortDramaProjects } from './projects.ts'
import type { ShortDramaProduction } from './production.ts'
import { productionIds } from './production-schema.ts'

/**
 * Admit creative planning and execution only to the project's bound Session.
 * @param ctx - Current plugin scope, owning every registration effect.
 * @param projects - Authoritative project-to-Session associations.
 * @param production - Production service also used by the native workbench.
 * @param analysis - Read-only media inspection with durable results.
 */
export function registerProductionTools(
  ctx: Context, projects: ShortDramaProjects, production: ShortDramaProduction, analysis: StudioMediaAnalysis,
): void {
  function project(exec: ToolRunContext): DramaProjectId {
    exec.signal.throwIfAborted()
    const owner = exec.agent && projects.projectForSession(exec.agent.session.id)
    if (!owner) throw new Error('Open this short drama project conversation before using its production tools.')
    return owner.id
  }
  const admission = { when: ({ agent }: { agent: NonNullable<ToolRunContext['agent']> }) => projects.projectForSession(agent.session.id) !== undefined }
  const render = (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }]
  const revision = {
    schema: { type: 'object', additionalProperties: false, properties: { revision: { type: 'integer', required: true } } } as const,
    render,
  }
  const generation = {
    schema: {
      type: 'object', additionalProperties: false,
      properties: { revision: { type: 'integer', required: true }, state: { type: 'string', required: true } },
    } as const,
    render,
  }

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'short_drama_read_production',
    description: 'Load native skill studio-director for Studio creative work. Read this project’s asset and shot catalogue, frame rate, execution availability and unresolved media attempts. Use its revision before saving changes. Adopted media remains selected until the human reviews another candidate.',
    parameters: {},
    output: { schema: { type: 'json' }, render },
    execute: (_args, exec) => {
      const state = production.read(project(exec))
      return Promise.resolve(z.json().parse(JSON.parse(JSON.stringify({
        revision: state.revision, fps: state.fps,
        configured: { image: state.settings.image !== null, video: state.settings.video !== null, voice: state.settings.voice !== null },
        assets: state.assets, shots: state.shots, creative: state.creative,
        jobs: state.jobs, timeline: state.timeline, ...(state.edit ? { edit: state.edit } : {}), exports: state.exports,

      }))))
    },
    presentCall: () => ({ card: 'generic', title: 'Read production', kind: 'read' }),
  }), admission), 'short drama production read')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'short_drama_analyze_media',
    description: 'Inspect archived project audio/video, detect candidate scene cuts, or transcribe using the configured local speech model. Reuse requestId for duplicate requests; the result is retained without changing media, dialogue or the timeline. Cuts and recognized words require review and are not proof of artistic quality. A missing transcription model is reported without downloading anything.',
    parameters: {
      mediaId: { type: 'string', required: true, description: 'Archived media UUID from production, never a path or URL.' },
      mode: { type: 'string', enum: ['inspect', 'scenes', 'transcript'], required: true },
      requestId: { type: 'string', required: true, description: 'Stable UUID for this analysis. Reuse it after a lost response; use a new UUID only for an intentional retry.' },
    },
    output: { schema: { type: 'json' }, render },
    execute: async (args, exec) => {
      const result = await analysis.analyzeForAgent(project(exec), productionIds.media.parse(args.mediaId), args.mode,
        brandString<MediaAnalysisId>(z.uuid().parse(args.requestId)), exec.signal)
      return z.json().parse(JSON.parse(JSON.stringify(result)))
    },
    presentCall: () => ({ card: 'generic', title: 'Analyze project media', kind: 'read' }),
  }), admission), 'Studio media analysis')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'short_drama_read_media_analysis',
    description: 'Read retained inspections and transcripts for an exact archived media UUID. Does not start a new analysis or change the edit. Running tasks interrupted by a restart remain interrupted until an explicit new attempt.',
    parameters: { mediaId: { type: 'string', required: true } },
    output: { schema: { type: 'json' }, render },
    execute: (args, exec) => Promise.resolve(z.json().parse(JSON.parse(JSON.stringify(
      analysis.read(project(exec), productionIds.media.parse(args.mediaId)),
    )))),
    presentCall: () => ({ card: 'generic', title: 'Read media analysis', kind: 'read' }),
  }), admission), 'Studio media analysis history')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'short_drama_save_asset',
    description: 'Write a character, scene, prop or voice definition. Supply the complete creative prompt. Omit assetId for a new asset; provide its existing identity to revise it. This does not generate or adopt media.',
    parameters: {
      expectedRevision: { type: 'integer', required: true },
      assetId: { type: 'string', description: 'Existing asset UUID. Omit when creating an asset.' },
      kind: { type: 'string', enum: ['character', 'scene', 'prop', 'voice'], required: true },
      name: { type: 'string', required: true }, prompt: { type: 'string', required: true },
    },
    output: revision,
    async execute(args, exec) {
      const id = project(exec)
      const saved = await production.saveAsset(id, args.expectedRevision, {
        id: args.assetId === undefined ? null : productionIds.asset.parse(args.assetId),
        kind: args.kind, name: args.name, prompt: args.prompt,
      })
      return { revision: saved.revision }
    },
    presentCall: () => ({ card: 'generic', title: 'Save production asset', kind: 'edit' }),
  }), admission), 'short drama asset draft')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'short_drama_save_shot',
    description: 'Write a storyboard shot from the adopted script. Supply its scene, visual prompt, exact dialogue, frame count and reusable asset UUIDs. Omit shotId for a new shot. Saving records the current script and asset versions for review.',
    parameters: {
      expectedRevision: { type: 'integer', required: true },
      shotId: { type: 'string', description: 'Existing shot UUID. Omit when creating a shot.' },
      scene: { type: 'string', required: true }, title: { type: 'string', required: true },
      prompt: { type: 'string', required: true }, dialogue: { type: 'string', required: true },
      frames: { type: 'integer', required: true, description: 'Shot length in frames at the project frame rate.' },
      assetIds: { type: 'array', items: { type: 'string' }, required: true },
    },
    output: revision,
    async execute(args, exec) {
      const id = project(exec)
      const saved = await production.saveShot(id, args.expectedRevision, {
        id: args.shotId === undefined ? null : productionIds.shot.parse(args.shotId),
        scene: args.scene, title: args.title, prompt: args.prompt, dialogue: args.dialogue, frames: args.frames,
        assetIds: args.assetIds.map(assetId => productionIds.asset.parse(assetId)),
      })
      return { revision: saved.revision }
    },
    presentCall: () => ({ card: 'generic', title: 'Save storyboard shot', kind: 'edit' }),
  }), admission), 'short drama shot draft')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'short_drama_generate_media',
    description: 'Execute the saved creative inputs through the project’s configured image, video or voice API. Use one jobId UUID per attempt and reuse it for retries. A structured video uses its validated director plan and references; legacy video requires an adopted shot image. Human adoption remains separate. Never replace an unresolved attempt with a new request.',
    parameters: {
      expectedRevision: { type: 'integer', required: true },
      jobId: { type: 'string', required: true, description: 'Stable UUID for this attempt, reused if this same operation is repeated.' },
      targetType: { type: 'string', enum: ['asset', 'shot'], required: true },
      targetId: { type: 'string', required: true, description: 'Existing asset or shot UUID from the project catalogue.' },
      kind: { type: 'string', enum: ['image', 'video', 'voice'], required: true },
      referenceMediaIds: { type: 'array', items: { type: 'string' },
        description: 'For an asset image edit, archived image UUIDs in this project, including a rejected candidate whose identity must be retained. Uses the configured reference-image model. Omit for other output paths.' },
    },
    output: generation,
    async execute(args, exec) {
      const id = project(exec)
      const jobId = productionIds.job.parse(args.jobId)
      const target = args.targetType === 'asset' ? productionIds.asset.parse(args.targetId) : productionIds.shot.parse(args.targetId)
      const saved = await production.generate(id, args.expectedRevision, jobId, args.targetType, target, args.kind,
        args.referenceMediaIds?.map(mediaId => productionIds.media.parse(mediaId)))
      const attempt = saved.jobs.find(item => item.id === jobId)
      if (attempt === undefined) throw new Error('The generation attempt is missing after its execution.')
      return { revision: saved.revision, state: attempt.state }
    },
    presentCall: () => ({ card: 'generic', title: 'Generate production media', kind: 'edit' }),
  }), admission), 'short drama media generation')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'short_drama_observe_media',
    description: 'Query an existing generation attempt through its original API and archive completed media. This never submits a replacement generation. Retain an unknown attempt for later reconciliation.',
    parameters: { jobId: { type: 'string', required: true, description: 'UUID of the existing generation attempt.' } },
    output: generation,
    async execute(args, exec) {
      const id = project(exec)
      const jobId = productionIds.job.parse(args.jobId)
      const saved = await production.observe(id, jobId)
      const attempt = saved.jobs.find(item => item.id === jobId)
      if (attempt === undefined) throw new Error('The generation attempt is missing after observation.')
      return { revision: saved.revision, state: attempt.state }
    },
    presentCall: () => ({ card: 'generic', title: 'Check media generation', kind: 'read' }),
  }), admission), 'short drama media observation')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'short_drama_save_timeline',
    description: 'Save frame-accurate clips in array playback order using only adopted project media. startFrame is a source-media trim offset, not a timeline position; use 0 for each untrimmed source. Does not generate or adopt anything. Read production first and retain source media identities.',
    parameters: {
      expectedRevision: { type: 'integer', required: true },
      clips: {
        type: 'array', required: true,
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            shotId: { type: 'string', required: true }, videoId: { type: 'string', required: true },
            voiceId: { type: 'string', description: 'Adopted voice UUID. Omit to retain native video audio.' },
            startFrame: { type: 'integer', required: true, description: 'Zero-based source-media frame offset. Independent for each clip, not cumulative timeline time.' },
            frames: { type: 'integer', required: true, description: 'Number of source frames to include from startFrame.' },
            subtitle: { type: 'string', required: true },
          },
        },
      },
    },
    output: revision,
    async execute(args, exec) {
      const saved = await production.saveTimeline(project(exec), args.expectedRevision, args.clips.map(clip => ({
        shotId: productionIds.shot.parse(clip.shotId), videoId: productionIds.media.parse(clip.videoId),
        voiceId: clip.voiceId === undefined ? null : productionIds.media.parse(clip.voiceId),
        startFrame: clip.startFrame, frames: clip.frames, subtitle: clip.subtitle,
      })))
      return { revision: saved.revision }
    },
    presentCall: () => ({ card: 'generic', title: 'Save timeline', kind: 'edit' }),
  }), admission), 'short drama timeline')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'short_drama_save_edit',
    description: 'Save a multitrack edit using archived project media. Read production first. document is JSON {version:1,tracks:[{id,kind,name,muted,clips}]}. Track kind is video, audio or subtitle; track order is bottom to top. Every clip has id UUID, startFrame (timeline position) and frames. Video/audio clips also have mediaId, sourceStartFrame and volume (0–2). Video clips require opacity (0–1) and transform {x,y,width,height}, where {0,0,1,1} fills the frame. Subtitle clips have text. Clips within a track cannot overlap. Preserve unmodified tracks, original media and existing history. Transcription is a candidate; only add subtitles after the user confirms the edited words and timing.',
    parameters: {
      expectedRevision: { type: 'integer', required: true },
      document: { type: 'string', required: true, description: 'Complete multitrack edit JSON, using immutable media UUIDs and distinct track/clip UUIDs.' },
    },
    output: revision,
    async execute(args, exec) {
      const edit = editTimelineSchema.parse(JSON.parse(args.document))
      const saved = await production.saveEdit(project(exec), args.expectedRevision, edit)
      return { revision: saved.revision }
    },
    presentCall: () => ({ card: 'generic', title: 'Save multitrack edit', kind: 'edit' }),
  }), admission), 'short drama multitrack edit')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'short_drama_export_episode',
    description: 'Render the saved timeline to a real MP4 and optional subtitle sidecar. Reuse exportId for duplicate requests; each export freezes its input clips and preserves older exports. Never claim success before this returns.',
    parameters: {
      expectedRevision: { type: 'integer', required: true },
      exportId: { type: 'string', required: true, description: 'Stable UUID reused for this same export attempt.' },
    },
    output: generation,
    async execute(args, exec) {
      const exportId = productionIds.export.parse(args.exportId)
      const saved = await production.exportEpisode(project(exec), args.expectedRevision, exportId)
      if (!saved.exports.some(item => item.id === exportId)) throw new Error('The rendered export is missing from project history.')
      return { revision: saved.revision, state: 'ready' }
    },
    presentCall: () => ({ card: 'generic', title: 'Export episode', kind: 'edit' }),
  }), admission), 'short drama episode export')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'short_drama_save_creative',
    description: 'Save a structured diagnosis, source-linked asset brief, timed shot plan or evidence-based media review. Load the matching native studio skill for the record fields. Exact script, asset, shot and job identities are validated by the Host. Records append without overwriting history.',
    parameters: {
      expectedRevision: { type: 'integer', required: true },
      kind: { type: 'string', enum: ['diagnosis', 'asset', 'shot', 'review'], required: true },
      document: { type: 'string', required: true, description: 'Complete JSON record using the matching studio skill schema and a new id UUID.' },
    },
    output: revision,
    async execute(args, exec) {
      const saved = await production.saveCreative(project(exec), args.expectedRevision, args.kind, args.document)
      return { revision: saved.revision }
    },
    presentCall: () => ({ card: 'generic', title: 'Save creative decision', kind: 'edit' }),
  }), admission), 'Studio creative decisions')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'short_drama_compile_shot',
    description: 'Validate a saved director plan against the actual shot duration, verbatim screenplay dialogue and adopted asset versions. Return the exact H3 prompt and ordered references; no generation is submitted. Fix all returned errors before execution.',
    parameters: { shotId: { type: 'string', required: true } },
    output: { schema: { type: 'json' }, render },
    execute: (args, exec) => Promise.resolve({ ...production.compileShot(project(exec), productionIds.shot.parse(args.shotId)) }),
    presentCall: () => ({ card: 'generic', title: 'Compile director plan', kind: 'read' }),
  }), admission), 'Studio shot compilation')

}
