/** The workbench reads saved choices and narrative fields instead of reusing screenplay titles. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { readCreationPreferences } from '../src/creation-preferences.ts'

it('restores original genre, style and episode choices from earlier project documents', () => {
  expect(readCreationPreferences({ revision: 1, storage: { 'crewon-studio-demo-v1': JSON.stringify({
    referenceCreationSpec: null, referenceOptions: { genre: '悬疑推理', style: '水墨国风', ratio: '9:16', episodes: '3 集' },
  }) } })).toEqual({ genre: '悬疑推理', style: '水墨国风', ratio: '9:16', episodes: 3 })
  expect(readCreationPreferences({ revision: 0, storage: {} })).toBeNull()
})

it('renders story and episode fields separately from the screenplay title', () => {
  const context = { studioNativeConfig: { preferences: { genre: '悬疑推理', style: '水墨国风', episodes: 3 }, direction: {
    storyPositioning: '寻找亲人的都市谜案', logline: '女孩为寻找母亲追查一封来历不明的信', synopsis: '追查线索后发现信由自己寄出',
    background: '雨夜老城', conflict: '寻找真相会失去信任', characterBios: [{ name: '小满', background: '独自生活',
      motivation: '寻找母亲', arc: '从逃避到面对', relationships: '与父亲疏远' }],
    episodeOutlines: [{ number: 1, title: '来信', summary: '信封中出现失踪母亲的地址', conflict: '父亲阻止调查',
      turningPoint: '地址就在旧居', ending: '门内传来声音', durationSeconds: 60 }],
  } }, S: {}, ensureStudioSeries: () => ({ title: '剧本标题' }), esc: (text: string) => text }
  const source = readFileSync(new URL('../studio/reference-workbench.js', import.meta.url), 'utf8')
  const functions = source.slice(source.indexOf('function referenceSeriesOutline(n)'), source.indexOf('function referenceWorkbenchAssetCard'))
  const result = runInNewContext(functions + '\n({setting:referenceSeriesSetting({}),outline:referenceSeriesOutline({})})', context) as { setting: string; outline: string }
  for (const value of ['悬疑推理', '水墨国风', '寻找亲人的都市谜案', '独自生活', '从逃避到面对']) expect(result.setting).toContain(value)
  for (const value of ['来信', '父亲阻止调查', '地址就在旧居', '门内传来声音']) expect(result.outline).toContain(value)
  expect(result.setting).not.toContain('<p>剧本标题</p>')
})

it('uses the saved twelve-second target instead of a demo duration floor', () => {
  const source = readFileSync(new URL('../studio/script-series.js', import.meta.url), 'utf8')
  const series = runInNewContext(source + '\nensureStudioSeries({})', {
    S: { nodes: [] }, studioNativeConfig: { direction: { durationSeconds: 12 } },
    ensureStudioScript: () => ({ title: 'Short film', logline: 'A letter arrives.', scenes: [] }),
  }) as { targetSeconds: { min: number; max: number } }
  expect(series.targetSeconds).toEqual({ min: 12, max: 12 })
})
