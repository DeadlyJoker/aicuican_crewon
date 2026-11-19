/** Validated durable production records; the existing script domain is unchanged. */
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { creativeStateSchema } from './creative.ts'
import { editTimelineSchema } from './edit-schema.ts'
import type { DramaProjectId } from './project-types.ts'
import type { DramaAssetId, DramaShotId, DramaJobId, DramaMediaId, DramaExportId } from './production-types.ts'

/** UUIDs admitted by the production API and its storage reader. */
export const productionIds = {
  project: z.uuid().transform(brandString<DramaProjectId>),
  asset: z.uuid().transform(brandString<DramaAssetId>),
  shot: z.uuid().transform(brandString<DramaShotId>),
  job: z.uuid().transform(brandString<DramaJobId>),
  media: z.uuid().transform(brandString<DramaMediaId>),
  export: z.uuid().transform(brandString<DramaExportId>),
}
const text = z.string().trim().min(1).max(120)
const prompt = z.string().trim().min(1).max(8000)
const version = z.number().int().nonnegative()
/** Validated project-level API route settings. */
export const productionSettingsSchema = z.object({
  image: route().nullable(), video: route().nullable(), voice: route().nullable(),
})
function route() {
  return z.object({
    adapter: z.enum(['openai', 'dashscope', 'jobs-v1', 'zealman']),
    endpoint: z.url().refine((value) => {
      const url = new URL(value)
      return !url.username && !url.password && !url.search && !url.hash
        && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    }),
    model: text, referenceModel: text.optional(),
    credentialRef: z.string().regex(/^$|^[A-Za-z_][A-Za-z0-9_]*$/u), voice: z.string().max(120),
  })
}
/** Wire validation for an editable asset. */
export const assetDraftSchema = z.object({
  id: productionIds.asset.nullable(), kind: z.enum(['character', 'scene', 'prop', 'voice']), name: text, prompt,
})
const asset = assetDraftSchema.extend({ id: productionIds.asset, version, adoptedMediaId: productionIds.media.nullable() })
/** Wire validation for an editable shot. */
export const shotDraftSchema = z.object({
  id: productionIds.shot.nullable(), scene: text, title: text, prompt, dialogue: z.string().max(4000),
  frames: z.number().int().min(1).max(1440), assetIds: z.array(productionIds.asset).max(24),
})
const shot = shotDraftSchema.extend({
  id: productionIds.shot, version, scriptId: z.uuid(),
  assetVersions: z.array(z.object({ id: productionIds.asset, version })),
  adoptedImageId: productionIds.media.nullable(), adoptedVideoId: productionIds.media.nullable(),
  adoptedVoiceId: productionIds.media.nullable(),
})
/** Exact frozen edit used for rendering and retained in each export. */
export const timelineSchema = z.array(z.object({
  shotId: productionIds.shot, videoId: productionIds.media, voiceId: productionIds.media.nullable(),
  startFrame: z.number().int().nonnegative(), frames: z.number().int().min(1).max(1440), subtitle: z.string().max(4000),
})).max(120)
const media = z.object({
  id: productionIds.media, kind: z.enum(['image', 'video', 'voice', 'subtitle']),
  mimeType: z.string().min(1), bytes: z.number().int().positive(), file: z.uuid(),
})
const generation = z.object({
  id: productionIds.job, targetType: z.enum(['asset', 'shot']), targetId: z.uuid(), targetVersion: version,
  kind: z.enum(['image', 'video', 'voice']), state: z.enum(['submitting', 'running', 'unknown', 'failed', 'ready']),
  reason: z.string().nullable(), outputs: z.array(media), createdAt: z.number(),
  route: route(), prompt: z.string().trim().min(1).max(14000), taskId: z.string().nullable(),
  references: z.array(productionIds.media), duration: z.number().positive(),
  planId: z.uuid().optional(),
})
const episode = z.object({
  id: productionIds.export, createdAt: z.number(), clips: timelineSchema, video: media, subtitle: media.nullable(), frames: version,
  edit: editTimelineSchema.optional(),
})
const intent = z.object({ id: productionIds.export, clips: timelineSchema, edit: editTimelineSchema.optional(), state: z
  .enum(['rendering', 'failed', 'complete']) })
const record = z.object({
  revision: version, settings: productionSettingsSchema, creative: creativeStateSchema.optional(),
  assets: z.array(asset).max(240), assetHistory: z.array(asset),
  shots: z.array(shot).max(120), shotHistory: z.array(shot),
  jobs: z.array(generation), timeline: timelineSchema, edit: editTimelineSchema.optional(), exports: z.array(episode),
  renders: z.array(intent),
  fps: z.number().int().positive(),
})
/** Current production data with separately retained past asset and shot revisions. */
export type ProductionRecord = z.infer<typeof record>
/** Private archived file identity; no path is accepted from clients. */
export type ArchivedMedia = z.infer<typeof media>
/** Persisted attempt including the exact execution route and references. */
export type GenerationRecord = z.infer<typeof generation>
/** Independent storage ensures existing project/script records remain readable. */
export const productionDomain = defineDomain({
  name: 'short_drama_production', version: 1, layout: 'per-record',
  tables: { projects: domainTable<DramaProjectId, ProductionRecord>(record),
    services: domainTable<'shared', import('./production-types.ts').SharedGenerationSettings>(z.object({
      revision: version, settings: productionSettingsSchema,
    })),
  },
})
