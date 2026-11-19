/** H3 compilation must reject mismatched creative inputs before API execution. */
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { compileShot, shotPlanSchema } from '../src/creative.ts'
import { productionIds } from '../src/production-schema.ts'

function fixture() {
  const assetId = productionIds.asset.parse(randomUUID())
  const image = productionIds.media.parse(randomUUID())
  const plan = shotPlanSchema.parse({ id: randomUUID(), shotId: randomUUID(), shotVersion: 1, mode: 'ref2va',
    purpose: 'A child waits for wind.', geography: 'Grandmother left, child right.', camera: 'Static medium shot.',
    lighting: 'Soft window light.', entryState: 'The crane rests on the sill.', exitState: 'The crane stays on the sill.',
    beats: [{ start: 0, end: 3, action: 'The child looks at the crane.', speaker: '阿禾', dialogue: '它会飞吗？' },
      { start: 3, end: 6, action: 'Grandmother answers.', speaker: '奶奶', dialogue: '等风来。' }],
    references: [{ assetId, assetVersion: 1, usage: 'identity' }], soundscape: 'Chinese dialogue and quiet wind.', music: 'None.',
  })
  const shot = { version: 1, dialogue: '阿禾：它会飞吗？\n奶奶：等风来。', adoptedImageId: null }
  const assets = [{ id: assetId, kind: 'character' as const, version: 1, name: '阿禾', prompt: 'A young girl.', adoptedMediaId: image }]
  const script = '阿禾：它会飞吗？\n奶奶：等风来。'
  return { plan, shot, assets, script, image }
}

it('compiles reference mode without requiring a first-frame image', () => {
  const f = fixture(), value = compileShot(f.plan, f.shot, f.assets, f.script, 6)
  expect(value.valid).toBe(true)
  expect(value.references).toEqual([f.image])
  expect(value.prompt).toContain('<Picture 1>: 阿禾. Purpose: identity.')
  expect(value.prompt).toContain('阿禾: “它会飞吗？”')
  expect(value.prompt.match(/^[a-z_]+:/gmu)).toEqual([
    'subject_definitions:', 'summary:', 'retention_analysis:', 'detailed_description:', 'overall_soundscape:', 'non_diegetic_music:',
  ])
})
it('rejects overlapping, missing and overlong timeline beats', () => {
  const f = fixture()
  f.plan.beats[1]!.start = 2
  expect(compileShot(f.plan, f.shot, f.assets, f.script, 6).errors).toContain('timeline-invalid')
  f.plan.beats[1]!.start = 3
  expect(compileShot(f.plan, f.shot, f.assets, f.script, 5).errors).toContain('timeline-duration-mismatch')
})
it('retains reference purpose without carrying image-generation instructions into the scene', () => {
  const f = fixture()
  f.assets[0]!.prompt = 'An empty reference image. No people. Edit only the hair.'
  const value = compileShot(f.plan, f.shot, f.assets, f.script, 6)
  expect(value.valid).toBe(true)
  expect(value.prompt).toContain('Retain the visible facial identity and wardrobe')
  expect(value.prompt).not.toContain('No people')
  expect(value.prompt).not.toContain('Edit only the hair')
})
it('rejects invented dialogue and saved lines omitted by the plan', () => {
  const f = fixture()
  f.plan.beats[0]!.dialogue = '它一定会飞。'
  const value = compileShot(f.plan, f.shot, f.assets, f.script, 6)
  expect(value.errors).toContain('dialogue-not-in-script')
  expect(value.errors).toContain('dialogue-omitted')
})
it('rejects stale, duplicated and unadopted references', () => {
  const f = fixture()
  f.assets[0]!.version = 2
  expect(compileShot(f.plan, f.shot, f.assets, f.script, 6).errors).toContain('asset-version-changed')
  f.assets[0]!.version = 1
  f.plan.references.push(f.plan.references[0]!)
  expect(compileShot(f.plan, f.shot, f.assets, f.script, 6).errors).toContain('duplicate-reference')
  expect(compileShot(f.plan, f.shot, [], f.script, 6).valid).toBe(false)
})
it('keeps keyframe mode separate from full-reference mode', () => {
  const f = fixture(); f.plan.mode = 'i2va'
  expect(compileShot(f.plan, f.shot, f.assets, f.script, 6).errors).toContain('first-frame-required')
  expect(compileShot(f.plan, f.shot, f.assets, f.script, 6).errors).toContain('first-frame-extra-references')
  f.plan.references = []
  const result = compileShot(f.plan, { ...f.shot, adoptedImageId: f.image }, f.assets, f.script, 6)
  expect(result.valid).toBe(true)
  expect(result.prompt).toMatch(/^integrated_multimodal_description:/u)
  expect(result.prompt).not.toContain('subject_definitions:')
})
