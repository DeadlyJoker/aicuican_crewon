/** Creative direction and project progress derived from authoritative production records. */
import { z } from 'zod'
import type { CreationPreferences } from './creation-preferences.ts'
import type { DramaProject, DramaProjectId, DramaScriptRevision, DramaScriptId } from './project-types.ts'
import type { DramaProduction, DramaJobId, DramaMedia, DramaAsset } from './production-types.ts'

const text = z.string().trim().min(1).max(4000)
/** Editable story brief; assumptions remain visible until the user confirms them. */
export const directionSchema = z.object({
  idea: text, audience: text, durationSeconds: z.number().int().min(5).max(3600),
  style: text, background: text, characters: text, conflict: text, outline: text,
  constraints: z.array(text).max(24), assumptions: z.array(text).max(12),
  storyPositioning: text.optional(), logline: text.optional(), synopsis: text.optional(),
  characterBios: z.array(z.object({ name: text, background: text, motivation: text, arc: text, relationships: text })).max(50).optional(),
  episodeOutlines: z.array(z.object({ number: z.number().int().min(1).max(100), title: text, summary: text,
    conflict: text, turningPoint: text, ending: text, durationSeconds: z.number().int().min(5).max(3600) })).max(100).optional(),
})
/** A versioned brief shared by chat and the Studio canvas. */
export type CreativeDirection = z.infer<typeof directionSchema>
/** Production stages are computed, never advanced by a model-supplied status. */
export type DirectorStage = 'idea' | 'direction' | 'script' | 'assets' | 'storyboard' | 'video' | 'edit' | 'complete'
/** The next safe action, with exact candidate identities for review. */
export interface DirectorProgress {
  stage: DirectorStage
  action: 'continue' | 'confirm-direction' | 'adopt-script' | 'adopt-media' | 'observe' | 'repair' | 'configure' | 'view'
  pending: number
}
/**
 * Resolve the earliest unmet dependency while preserving legacy projects without a brief.
 * @param project - Current script candidates and adopted screenplay.
 * @param production - Current definitions, candidates and adopted media.
 * @param hasDirection - Whether a brief candidate exists.
 * @param confirmed - Whether its current revision was confirmed.
 * @param directionScriptId - Latest screenplay when the brief was saved; absent for earlier brief records.
 * @returns Next production stage and its safe action.
 */
export function directorProgress(project: DramaProject, production: DramaProduction,
  hasDirection: boolean, confirmed: boolean, directionScriptId?: DramaScriptId | null): DirectorProgress {
  const result = (stage: DirectorStage, action: DirectorProgress['action'], pending = 0): DirectorProgress => ({ stage, action, pending })
  if (hasDirection && !confirmed) return result('direction', 'confirm-direction', 1)
  const script = project.scripts.at(-1)
  if (hasDirection && confirmed && directionScriptId !== undefined && (script?.id ?? null) === directionScriptId) return result('script', 'continue')
  if (!project.adoptedScriptId) {
    if (project.scripts.length) return result('script', 'adopt-script', 1)
    if (!hasDirection) return result('idea', 'continue')
    return result('script', 'continue')
  }
  if (hasDirection && project.scripts.at(-1)?.id !== project.adoptedScriptId) return result('script', 'adopt-script', 1)
  const diagnosis = production.creative?.diagnoses.filter(item => item.scriptId === project.adoptedScriptId).at(-1)
  if (diagnosis?.issues.some(item => item.severity === 'blocking')) return result('script', 'repair')
  const active = production.jobs.filter(job => ['submitting', 'running', 'unknown'].includes(job.state))
  if (active.length) return result(active.some(job => job.kind === 'video') ? 'video' : 'assets', 'observe', active.length)
  const currentExport = production.timeline.length > 0
    && production.exports.some(item => JSON.stringify(item.clips) === JSON.stringify(production.timeline))
  if (production.shots.length && production.shots.every(shot => shot.adoptedVideoId && !shot.needsReview)) {
    return result(currentExport ? 'complete' : 'edit', currentExport ? 'view' : 'continue')
  }
  const plans = production.creative?.plans ?? []
  const needed = new Set(production.shots.filter(shot => !shot.adoptedVideoId).flatMap((shot) => {
    const plan = plans.filter(item => item.shotId === shot.id && item.shotVersion === shot.version).at(-1)
    return plan ? plan.references.map(reference => reference.assetId) : shot.adoptedImageId ? [] : shot.assetIds
  }))
  const visuals = production.assets.filter(asset => asset.kind !== 'voice' && (!production.shots.length || needed.has(asset.id)))
  if (!visuals.length && !production.shots.length) return result('assets', 'continue')
  const missing = visuals.filter(asset => !asset.adoptedMediaId)
  if (missing.length) {
    if (!production.settings.image) return result('assets', 'configure', missing.length)
    const ready = missing.filter(asset => production.jobs.some(job => job.targetId === asset.id && job.targetVersion === asset.version && job.kind === 'image' && job.state === 'ready'))
    return result('assets', ready.length === missing.length ? 'adopt-media' : 'continue', missing.length)
  }
  if (!production.shots.length) return result('storyboard', 'continue')
  if (production.shots.some(shot => shot.needsReview)) return result('storyboard', 'repair')
  const videos = production.shots.filter(shot => !shot.adoptedVideoId)
  if (videos.length) {
    if (!production.settings.video) return result('video', 'configure', videos.length)
    const ready = videos.filter(shot => production.jobs.some(job => job.targetId === shot.id && job.targetVersion === shot.version && job.kind === 'video' && job.state === 'ready'))
    return result('video', ready.length === videos.length ? 'adopt-media' : 'continue', videos.length)
  }
  return production.timeline.length && currentExport ? result('complete', 'view') : result('edit', 'continue')
}

/** Current creative review and dependency-derived progress, shared by Web and App. */
export interface DirectorView {
  projectId: DramaProjectId
  title: string
  revision: number
  confirmed: boolean
  brief: CreativeDirection | null
  preferences?: CreationPreferences | null
  progress: DirectorProgress
  candidates: { name: string; jobId: DramaJobId | null; media: DramaMedia | null }[]
  script: DramaScriptRevision | null
  assets: Pick<DramaAsset, 'name' | 'kind' | 'prompt'>[]
  issues: { problem: string; suggestion: string }[]
  /** Absent in older Host replies; no failure is inferred for those replies. */
  serviceIssue?: boolean
  token: string
}
