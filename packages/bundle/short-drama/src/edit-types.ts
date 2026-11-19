/** Versioned editing decisions, independent of the legacy sequential timeline. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { DramaMediaId } from './production-types.ts'
import type { MediaAnalysisId } from './media-analysis-types.ts'

/** Stable identity of an editable track. */
export type DramaTrackId = Branded<'DramaTrackId'>
/** Stable identity of a clip within one edit. */
export type DramaEditClipId = Branded<'DramaEditClipId'>

/** Placement uses project frames; source offsets are stored separately. */
interface EditPlacement {
  id: DramaEditClipId
  startFrame: number
  frames: number
}

/** Video placement and its original audio gain; zero gain mutes only its audio. */
export interface DramaVideoClip extends EditPlacement {
  mediaId: DramaMediaId
  sourceStartFrame: number
  volume: number
  opacity: number
  /** Output-relative rectangle, where the full frame is 0, 0, 1, 1. */
  transform: { x: number; y: number; width: number; height: number }
}

/** Independent audio placement, referencing archived video audio or a voice file. */
export interface DramaAudioClip extends EditPlacement {
  mediaId: DramaMediaId
  sourceStartFrame: number
  volume: number
}

/** Confirmed editable subtitle, never applied merely by running transcription. */
export interface DramaSubtitleClip extends EditPlacement {
  text: string
}

/** Track order is bottom to top; clips in each track must not overlap. */
export type DramaEditTrack = { id: DramaTrackId; name: string; muted: boolean } & (
  | { kind: 'video'; clips: DramaVideoClip[] }
  | { kind: 'audio'; clips: DramaAudioClip[] }
  | {
    kind: 'subtitle'
    clips: DramaSubtitleClip[]
    /** Identifies a confirmed transcript application across clients and restarts. */
    transcript?: { analysisId: MediaAnalysisId; clipId: DramaEditClipId } | undefined }
)

/** Frame rate remains owned by the project; legacy timeline semantics are unchanged. */
export interface DramaEditTimeline {
  version: 1
  tracks: DramaEditTrack[]
}
