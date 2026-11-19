/** Structured creative decisions and deterministic H3 input compilation. */
import { z } from 'zod'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import type { DramaAssetId, DramaShotId, DramaJobId, DramaMediaId } from './production-types.ts'
import type { DramaScriptId } from './project-types.ts'

/** Identity of a retained creative decision. */
export type CreativeDecisionId = Branded<'CreativeDecisionId'>
const identity = z.uuid().transform(brandString<CreativeDecisionId>)
const assetId = z.uuid().transform(brandString<DramaAssetId>)
const shotId = z.uuid().transform(brandString<DramaShotId>)
const jobId = z.uuid().transform(brandString<DramaJobId>)
const scriptId = z.uuid().transform(brandString<DramaScriptId>)
const text = z.string().trim().min(1).max(4000)
const version = z.number().int().nonnegative()
/** Source-linked screenplay findings; a diagnosis never rewrites the adopted script. */
export const diagnosisSchema = z.object({
  id: identity, scriptId, summary: text,
  issues: z.array(z.object({ scene: text, quote: text, severity: z.enum(['note', 'warning', 'blocking']),
    problem: text, suggestion: text })).max(40),
})
/** Asset facts remain distinct from inferred and newly designed details. */
export const assetBriefSchema = z.object({
  id: identity, inheritedFrom: identity.optional(), assetId, assetVersion: version, scriptId, evidence: text,
  origin: z.enum(['explicit', 'inferred', 'designed']), locked: z.array(text).min(1).max(24),
  variants: z.array(z.object({ name: text, description: text, appliesTo: text })).max(24),
})
/** Frame-aligned director decisions compiled without appending competing prompt templates. */
export const shotPlanSchema = z.object({
  id: identity, shotId, shotVersion: version, mode: z.enum(['i2va', 'ref2va', 't2va']),
  purpose: text, geography: text, camera: text, lighting: text, entryState: text, exitState: text,
  beats: z.array(z.object({ start: z.number().nonnegative(), end: z.number().positive(), action: text,
    speaker: z.string().trim().max(120), dialogue: z.string().trim().max(1000) })).min(1).max(24),
  references: z.array(z.object({ assetId, assetVersion: version, usage: z.enum(['identity', 'scene', 'prop', 'voice']) })).max(12),
  soundscape: text, music: text,
})
/** Observations belong to one exact generation attempt, not all future versions. */
export const mediaReviewSchema = z.object({
  id: identity, jobId, reviewer: text,
  dimensions: z.array(z.object({ dimension: z.enum(['identity', 'space', 'appearance', 'performance', 'sound', 'cut']),
    verdict: z.enum(['passed', 'failed', 'unknown', 'not-applicable']), observation: text })).min(1).max(6),
  repair: z.string().trim().max(4000), replacesJobId: jobId.nullable(),
})
/** Additive decisions preserve original asset, shot and media histories. */
export const creativeStateSchema = z.object({
  diagnoses: z.array(diagnosisSchema), assets: z.array(assetBriefSchema),
  plans: z.array(shotPlanSchema), reviews: z.array(mediaReviewSchema),
})
/** Persisted creative decisions returned to both clients. */
export type DramaCreativeState = z.infer<typeof creativeStateSchema>
/** One source-linked diagnosis. */
export type ScriptDiagnosis = z.infer<typeof diagnosisSchema>
/** One version-specific asset brief. */
export type AssetBrief = z.infer<typeof assetBriefSchema>
/** One version-specific director plan. */
export type ShotPlan = z.infer<typeof shotPlanSchema>
/** One immutable media review. */
export type MediaReview = z.infer<typeof mediaReviewSchema>
/** Editable creative record category. */
export type CreativeKind = 'diagnosis' | 'asset' | 'shot' | 'review'
/**
 * Explicit resolution for projects saved before structured creative decisions existed.
 * @returns Empty decision lists.
 */
export function emptyCreativeState(): DramaCreativeState {
  return { diagnoses: [], assets: [], plans: [], reviews: [] }
}
/** Frozen asset input available to the compiler. */
export interface CompilerAsset {
  id: DramaAssetId
  kind: 'character' | 'scene' | 'prop' | 'voice'
  version: number
  name: string
  adoptedMediaId: DramaMediaId | null
}
/** Structured input compilation result; errors prevent execution. */
export interface ShotCompilation {
  valid: boolean
  errors: string[]
  prompt: string
  references: DramaMediaId[]
  mode: ShotPlan['mode']
  planId: CreativeDecisionId
  seconds: number
}
/**
 * Compile one reviewed plan against the current script, duration and adopted references.
 * @param plan - Validated director decisions, retained at their shot revision.
 * @param shot - Saved shot including its adopted image and exact duration.
 * @param assets - Current asset definitions and adopted media.
 * @param script - Adopted screenplay used to validate spoken words.
 * @param seconds - Actual execution duration derived from saved frames.
 * @returns H3 input and all blocking findings; no network or project mutation occurs.
 */
export function compileShot(plan: ShotPlan, shot: { version: number; dialogue: string; adoptedImageId: DramaMediaId | null },
  assets: readonly CompilerAsset[], script: string, seconds: number): ShotCompilation {
  const errors: string[] = []
  if (plan.shotVersion !== shot.version) errors.push('shot-version-changed')
  let end = 0
  for (const beat of plan.beats) {
    if (Math.abs(beat.start - end) > 0.001 || beat.end <= beat.start || beat.end > seconds + 0.001) errors.push('timeline-invalid')
    if (beat.dialogue && (!script.includes(beat.dialogue) || !shot.dialogue.includes(beat.dialogue) || !beat.speaker)) {
      errors.push('dialogue-not-in-script')
    }
    end = beat.end
  }
  if (Math.abs(end - seconds) > 0.001) errors.push('timeline-duration-mismatch')
  const spoken = plan.beats.filter(beat => beat.dialogue).map(beat => beat.dialogue)
  for (const line of shot.dialogue.split(/\r?\n/u).map(value => value.trim()).filter(Boolean)) {
    const words = line.replace(/^[^：:]{1,120}[：:]\s*/u, '')
    if (words && !spoken.some(value => value.includes(words))) errors.push('dialogue-omitted')
  }
  const references: DramaMediaId[] = []
  const subjects: string[] = []
  let pictures = 0
  let audios = 0
  if (plan.mode === 'i2va') {
    if (!shot.adoptedImageId) errors.push('first-frame-required')
    else references.push(shot.adoptedImageId)
    if (plan.references.length) errors.push('first-frame-extra-references')
    subjects.push('Use the adopted first frame. Preserve its visible identities, composition and appearance.')
  } else if (plan.mode === 'ref2va') {
    if (!plan.references.length) errors.push('references-required')
    const selected = new Set<string>()
    for (const reference of plan.references) {
      if (selected.has(reference.assetId)) errors.push('duplicate-reference')
      selected.add(reference.assetId)
      const asset = assets.find(item => item.id === reference.assetId)
      if (!asset || asset.version !== reference.assetVersion) { errors.push('asset-version-changed'); continue }
      if (asset.kind !== ({ identity: 'character', scene: 'scene', prop: 'prop', voice: 'voice' } as const)[reference.usage]) errors.push('reference-purpose-mismatch')
      if (!asset.adoptedMediaId) { errors.push('reference-not-adopted'); continue }
      references.push(asset.adoptedMediaId)
      const label = reference.usage === 'voice' ? `<Audio ${++audios}>` : `<Picture ${++pictures}>`
      const retention = {
        identity: 'Retain the visible facial identity and wardrobe; use the current plan for pose, expression and framing.',
        scene: 'Retain environment geometry and materials; populate actors and props according to the current plan.',
        prop: 'Retain object appearance; use the current plan for position and state.',
        voice: 'Retain vocal timbre; speak only the exact dialogue in the current plan.',
      } as const
      subjects.push(`${label}: ${asset.name}. Purpose: ${reference.usage}. ${retention[reference.usage]}`)
    }
  } else if (plan.references.length) errors.push('text-mode-references')
  const timeline = plan.beats.map(beat => `[${beat.start.toFixed(3)}-${beat.end.toFixed(3)}s] ${beat.action}`
    + (beat.dialogue ? ` ${beat.speaker}: “${beat.dialogue}” (spoken audio, no subtitles).` : '')).join('\n')
  const details = [`Duration: ${seconds} seconds.`, `Scene purpose: ${plan.purpose}`, `Space: ${plan.geography}`,
    `Camera: ${plan.camera}`, `Lighting: ${plan.lighting}`, `Opening state: ${plan.entryState}`, timeline,
    `Ending state: ${plan.exitState}`, 'No subtitles, captions, logos or watermarks.'].join('\n')
  const prompt = plan.mode === 'ref2va'
    ? `subject_definitions:\n${subjects.join('\n')}\n\nsummary:\n${plan.purpose}\n\nretention_analysis:\nPreserve each reference only for its stated purpose; implement the current scene and actions below.\n\ndetailed_description:\n${details}\n\noverall_soundscape:\n${plan.soundscape}\n\nnon_diegetic_music:\n${plan.music}`
    : `integrated_multimodal_description:\n${subjects.join('\n')}\n${details}\n\noverall_soundscape:\n${plan.soundscape}\n\nnon_diegetic_music:\n${plan.music}`
  if (prompt.length > 14000) errors.push('compiled-input-too-long')
  return { valid: errors.length === 0, errors: [...new Set(errors)], prompt, references, mode: plan.mode, planId: plan.id, seconds }
}
