/** Project-owned production records shared by the workbench and Agent tools. */
import type { DramaCreativeState } from './creative.ts'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { DramaEditTimeline } from './edit-types.ts'

/** Identity of a reusable character, scene, prop or voice. */
export type DramaAssetId = Branded<'DramaAssetId'>
/** Identity of one storyboard shot. */
export type DramaShotId = Branded<'DramaShotId'>
/** Identity of one media generation attempt. */
export type DramaJobId = Branded<'DramaJobId'>
/** Identity of a locally archived media file. */
export type DramaMediaId = Branded<'DramaMediaId'>
/** Identity of an immutable episode export. */
export type DramaExportId = Branded<'DramaExportId'>
/** Execution capability selected per output type. */
export type DramaMediaKind = 'image' | 'video' | 'voice'
/** Reusable production asset category. */
export type DramaAssetKind = 'character' | 'scene' | 'prop' | 'voice'

/** API execution settings; credentialRef names a DSH-managed secret. */
export interface DramaRoute {
  adapter: 'openai' | 'dashscope' | 'jobs-v1' | 'zealman'
  endpoint: string
  model: string
  /** Optional workflow selected when an image operation includes references. */
  referenceModel?: string | undefined
  credentialRef: string
  voice: string
}

/** Shared defaults are copied explicitly; historical project routes remain unchanged. */
export interface SharedGenerationSettings {
  revision: number
  settings: DramaProductionSettings
}

/** Per-project execution configuration, never containing secret values. */
export interface DramaProductionSettings {
  image: DramaRoute | null
  video: DramaRoute | null
  voice: DramaRoute | null
}

/** Authenticated local preview or download for an archived file. */
export interface DramaMedia {
  id: DramaMediaId
  kind: DramaMediaKind | 'subtitle'
  url: string
  mimeType: string
  bytes: number
}

/** Editable definition used to create a new asset revision. */
export interface DramaAssetDraft {
  id: DramaAssetId | null
  kind: DramaAssetKind
  name: string
  prompt: string
}

/** Current asset definition; revisions are retained for historical media. */
export interface DramaAsset extends DramaAssetDraft {
  id: DramaAssetId
  version: number
  adoptedMediaId: DramaMediaId | null
}

/** Editable storyboard content and reusable asset references. */
export interface DramaShotDraft {
  id: DramaShotId | null
  scene: string
  title: string
  prompt: string
  dialogue: string
  frames: number
  assetIds: DramaAssetId[]
}

/** A shot freezes the script and asset versions reviewed with its definition. */
export interface DramaShot extends DramaShotDraft {
  id: DramaShotId
  version: number
  scriptId: string
  assetVersions: { id: DramaAssetId; version: number }[]
  adoptedImageId: DramaMediaId | null
  adoptedVideoId: DramaMediaId | null
  adoptedVoiceId: DramaMediaId | null
  needsReview: boolean
}

/** One durable attempt; an unknown result is reconciled instead of resubmitted. */
export interface DramaGeneration {
  id: DramaJobId
  targetType: 'asset' | 'shot'
  targetId: string
  targetVersion: number
  kind: DramaMediaKind
  state: 'submitting' | 'running' | 'unknown' | 'failed' | 'ready'
  reason: string | null
  outputs: DramaMedia[]
  createdAt: number
}

/** Exact adopted files and trim interval used by one timeline row. */
export interface DramaTimelineClip {
  shotId: DramaShotId
  videoId: DramaMediaId
  voiceId: DramaMediaId | null
  /** Zero-based trim offset into this source video; clip order is the array order. */
  startFrame: number
  /** Source frames retained from the trim offset. */
  frames: number
  subtitle: string
}

/** A verified immutable export with frozen input clips. */
export interface DramaEpisodeExport {
  id: DramaExportId
  createdAt: number
  clips: DramaTimelineClip[]
  /** Frozen multitrack decisions, absent for sequential legacy exports. */
  edit?: DramaEditTimeline | undefined
  video: DramaMedia
  subtitle: DramaMedia | null
  frames: number
}

/** Production state independent of the backwards-compatible script record. */
export interface DramaProduction {
  /** Absent in clients holding a project response from before creative decision support. */
  creative?: DramaCreativeState
  revision: number
  settings: DramaProductionSettings
  assets: DramaAsset[]
  shots: DramaShot[]
  jobs: DramaGeneration[]
  timeline: DramaTimelineClip[]
  /** Present only after an explicit multitrack save. */
  edit?: DramaEditTimeline | undefined
  exports: DramaEpisodeExport[]
  fps: number
}
