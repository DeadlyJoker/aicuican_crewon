/** Progress follows actual adopted work and unresolved attempts rather than a separate phase counter. */
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { directorStageSkills } from '../src/creative-skills.ts'
import { directorProgress } from '../src/director-model.ts'
import type { DramaProject, DramaProjectId, DramaScriptId } from '../src/project-types.ts'
import type { DramaProduction } from '../src/production-types.ts'
import { productionIds } from '../src/production-schema.ts'
function fixture() {
  const project: DramaProject = { id: brandString<DramaProjectId>(randomUUID()), title: 'Light', synopsis: '', revision: 0, scripts: [], adoptedScriptId: null }
  const production: DramaProduction = { revision: 0, fps: 24, settings: { image: null, video: null, voice: null },
    assets: [], shots: [], jobs: [], timeline: [], exports: [] }
  return { project, production }
}
it('guides an idea through brief confirmation and script adoption', () => {
  const { project, production } = fixture()
  expect(directorProgress(project, production, false, false)).toMatchObject({ stage: 'idea', action: 'continue' })
  expect(directorProgress(project, production, true, false)).toMatchObject({ stage: 'direction', action: 'confirm-direction' })
  expect(directorProgress(project, production, true, true)).toMatchObject({ stage: 'script', action: 'continue' })
  project.scripts.push({ id: brandString<DramaScriptId>(randomUUID()), body: 'A light goes out.', createdAt: 0 })
  expect(directorProgress(project, production, true, true)).toMatchObject({ stage: 'script', action: 'adopt-script' })
})
it('lets legacy adopted scripts skip a missing brief without losing work', () => {
  const { project, production } = fixture()
  project.adoptedScriptId = brandString<DramaScriptId>(randomUUID())
  expect(directorProgress(project, production, false, false)).toMatchObject({ stage: 'assets' })
  production.assets.push({ id: productionIds.asset.parse(randomUUID()), kind: 'scene', name: 'Room', prompt: 'Night', version: 1, adoptedMediaId: null })
  expect(directorProgress(project, production, false, false)).toMatchObject({ stage: 'assets', action: 'configure' })
  production.assets[0]!.adoptedMediaId = productionIds.media.parse(randomUUID())
  expect(directorProgress(project, production, false, false)).toMatchObject({ stage: 'storyboard', action: 'continue' })
})
it('observes unknown attempts instead of asking for a replacement generation', () => {
  const { project, production } = fixture()
  project.adoptedScriptId = brandString<DramaScriptId>(randomUUID())
  production.jobs.push({ id: productionIds.job.parse(randomUUID()), targetType: 'shot', targetId: randomUUID(), targetVersion: 1,
    kind: 'video', state: 'unknown', reason: 'response-lost', outputs: [], createdAt: 0 })
  expect(directorProgress(project, production, false, false)).toEqual({ stage: 'video', action: 'observe', pending: 1 })
})
it('requires review after upstream edits and only marks a current exported edit complete', () => {
  const { project, production } = fixture()
  project.adoptedScriptId = brandString<DramaScriptId>(randomUUID())
  const videoId = productionIds.media.parse(randomUUID()), shotId = productionIds.shot.parse(randomUUID())
  production.assets.push({ id: productionIds.asset.parse(randomUUID()), kind: 'scene', name: 'Room', prompt: 'Night', version: 1, adoptedMediaId: productionIds.media.parse(randomUUID()) })
  production.shots.push({ id: shotId, scene: 'Room', title: 'Light', prompt: 'Night', dialogue: '', frames: 144, assetIds: [], version: 1,
    scriptId: project.adoptedScriptId, assetVersions: [], adoptedImageId: null, adoptedVideoId: videoId,
    adoptedVoiceId: null, needsReview: true })
  expect(directorProgress(project, production, false, false)).toMatchObject({ stage: 'storyboard', action: 'repair' })
  production.shots[0]!.needsReview = false
  production.timeline.push({ shotId, videoId, voiceId: null, startFrame: 0, frames: 144, subtitle: '' })
  production.exports.push({ id: productionIds.export.parse(randomUUID()), createdAt: 0, clips: [...production.timeline],
    video: { id: videoId, kind: 'video', url: '/media', mimeType: 'video/mp4', bytes: 100 }, subtitle: null, frames: 144 })
  expect(directorProgress(project, production, false, false)).toMatchObject({ stage: 'complete' })
  production.timeline[0] = { ...production.timeline[0]!, startFrame: 24, frames: 120 }
  expect(directorProgress(project, production, false, false)).toMatchObject({ stage: 'edit' })
})

it('does not block a text-only shot on unused asset pictures', () => {
  const { project, production } = fixture()
  project.adoptedScriptId = brandString<DramaScriptId>(randomUUID())
  const shotId = productionIds.shot.parse(randomUUID())
  production.assets.push({ id: productionIds.asset.parse(randomUUID()), kind: 'prop', name: 'Lamp', prompt: 'Warm lamp', version: 1, adoptedMediaId: null })
  production.shots.push({ id: shotId, scene: 'Room', title: 'Light', prompt: 'Night', dialogue: '', frames: 144, assetIds: [], version: 1,
    scriptId: project.adoptedScriptId, assetVersions: [], adoptedImageId: null, adoptedVideoId: null,
    adoptedVoiceId: null, needsReview: false })
  expect(directorProgress(project, production, false, false)).toMatchObject({ stage: 'video', action: 'configure' })
})

it('repairs blocking script findings before generation and reviews the replacement without losing the adopted script', () => {
  const { project, production } = fixture()
  const first = brandString<DramaScriptId>(randomUUID()), second = brandString<DramaScriptId>(randomUUID())
  project.scripts.push({ id: first, body: 'He turns off the lamp.', createdAt: 1 })
  project.adoptedScriptId = first
  production.creative = { diagnoses: [{ id: brandString<import('../src/creative.ts').CreativeDecisionId>(randomUUID()),
    scriptId: first, summary: 'Lamp continuity', issues: [{ scene: 'Room', quote: 'turns off', severity: 'blocking',
      problem: 'The lamp must stay on.', suggestion: 'He tests the shade instead.' }] }], assets: [], plans: [], reviews: [] }
  expect(directorProgress(project, production, true, true)).toMatchObject({ stage: 'script', action: 'repair' })
  project.scripts.push({ id: second, body: 'He tests the shade.', createdAt: 2 })
  expect(directorProgress(project, production, true, true)).toMatchObject({ stage: 'script', action: 'adopt-script' })
  expect(project.adoptedScriptId).toBe(first)
  project.adoptedScriptId = second
  expect(directorProgress(project, production, true, true)).toMatchObject({ stage: 'assets' })
})

it('reconfirms a changed story direction and writes a new screenplay before reusing older adopted work', () => {
  const { project, production } = fixture()
  const first = brandString<DramaScriptId>(randomUUID())
  project.scripts.push({ id: first, body: 'A warm story.', createdAt: 1 })
  project.adoptedScriptId = first
  expect(directorProgress(project, production, true, false, first)).toMatchObject({ stage: 'direction', action: 'confirm-direction' })
  expect(directorProgress(project, production, true, true, first)).toMatchObject({ stage: 'script', action: 'continue' })
  expect(project.adoptedScriptId).toBe(first)
  project.scripts.push({ id: brandString<DramaScriptId>(randomUUID()), body: 'Revised story.', createdAt: 0 })
  expect(directorProgress(project, production, true, true, first)).toMatchObject({ action: 'adopt-script' })
})

it('loads image guidance for assets and H3 compilation for video without requiring skill discovery', () => {
  expect(directorStageSkills('assets')).toContain('Skill: studio-image-prompts')
  expect(directorStageSkills('assets')).toContain('accepted geometry unchanged')
  expect(directorStageSkills('video')).toContain('Skill: studio-u22-compiler')
  expect(directorStageSkills('video')).toContain('Skill: studio-media-review')
  expect(directorStageSkills('idea')).not.toContain('Skill: studio-u22-compiler')
})
