/** Client-visible analysis records contain no local media or model paths. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { DramaProjectId } from './project-types.ts'
import type { DramaMediaId } from './production-types.ts'

/** Stable identity of an immutable inspection request. */
export type MediaAnalysisId = Branded<'MediaAnalysisId'>
/** Available non-destructive media operations. */
export type MediaAnalysisMode = 'inspect' | 'scenes' | 'transcript'
/** Non-secret engine configuration captured when an inspection starts. */
export interface MediaAnalysisEngine {
  probe: string
  scenes: string
  sceneThreshold: number
  transcription: string | null
  model: string | null
}
/** Structured observations from the actual archived media. */
export interface MediaAnalysisResult {
  durationSeconds: number
  videoTracks: { index: number; codec: string; width: number; height: number; fps: number | null }[]
  audioTracks: { index: number; codec: string; sampleRate: number; channels: number }[]
  scenes: { startSeconds: number; endSeconds: number }[]
  transcript: { state: 'not-requested' } | { state: 'unavailable'; reason: 'missing-config' | 'no-audio' }
    | { state: 'complete'; language: string; segments: { startSeconds: number; endSeconds: number; text: string }[] }
}
/** Persisted result or explicit unfinished outcome for one exact source file. */
export interface MediaAnalysisRecord {
  id: MediaAnalysisId
  projectId: DramaProjectId
  mediaId: DramaMediaId
  mode: MediaAnalysisMode
  createdAt: number
  engine: MediaAnalysisEngine
  state: 'running' | 'ready' | 'failed' | 'interrupted'
  reason: 'execution-failed' | 'interrupted' | null
  result: MediaAnalysisResult | null
}
