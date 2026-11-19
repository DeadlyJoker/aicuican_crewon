/** Workbench reads existing native shots without requiring a legacy demo confirmation. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
const workbench = readFileSync(new URL('../studio/reference-workbench.js', import.meta.url), 'utf8')
const creative = readFileSync(new URL('../studio/native-creative.js', import.meta.url), 'utf8')
it('opens native storyboard records while keeping an empty unconfirmed project gated', () => {
  const context = { studioNativeConfig: { production: { shots: [] as object[] } }, referenceSeriesAssetsLocked: () => false }
  runInNewContext(workbench.slice(workbench.indexOf('function referenceWorkbenchHasStoryboard'), workbench.indexOf('function referenceDrawWorkbench')), context)
  expect(runInNewContext('referenceWorkbenchHasStoryboard({})', context)).toBe(false)
  context.studioNativeConfig.production.shots.push({})
  expect(runInNewContext('referenceWorkbenchHasStoryboard({})', context)).toBe(true)
})
it('renders native shots using the storyboard layout without changing saved records', () => {
  const shot = { id: 'one', title: '雨夜信箱', prompt: '雨水落在信箱上', dialogue: '', frames: 120, assetIds: [] }
  const context = { studioNativeConfig: { production: { shots: [shot], fps: 24 } },
    studioCreativeState: () => ({ plans: [] }), esc: (value: string) => value,
    referenceStoryboardPending: () => 'pending', referenceStoryboardAssetsExpanded: false,
    nodeById: () => null, referenceStoryboardAssetMarkup: () => '', handleAction: () => {}, referenceDrawWorkbench: () => {} }
  runInNewContext(creative.slice(creative.indexOf('let studioNativeSelectedShot')), context)
  const html = runInNewContext('referenceStoryboardPending({})', context)
  expect(html).toContain('ref-sb-result')
  expect(html).toContain('ref-sb-strip')
  expect(html).toContain('雨水落在信箱上')
  expect(html).not.toContain('native-creative-record')
  expect(context.studioNativeConfig.production.shots).toEqual([shot])
})
