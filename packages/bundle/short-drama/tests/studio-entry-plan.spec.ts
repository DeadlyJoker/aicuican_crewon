/** Native creation submits selected mode inputs without reusing hidden settings or unrelated originals. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

const source = readFileSync(new URL('../studio/native-entry.js', import.meta.url), 'utf8')
const action = source.slice(source.indexOf(' handleAction=function(action)'), source.indexOf(" document.addEventListener('dragover'"))

function setup(mode: string) {
  const S = { referenceCreationSpec: null as object | null, referenceMode: 'drama', referenceDrama: mode, referenceOptions: {
    genre: '悬疑', style: '雨夜', ratio: '9:16', episodes: '1 集',
  }, referenceAdaptation: { mode: 'overseas', episodes: 24 }, referenceProductionEpisodes: '1 集', referenceLanguage: 'en',
  referenceScriptInput: { id: 'script', name: '原稿.docx', text: '《原稿》\n中文对白' }, referenceEntrySources: [
    { id: 'script', name: '原稿.docx', kind: 'script' }, { id: 'video', name: '原片.mp4', kind: 'video' },
  ] }
  const post = vi.fn()
  const context = { S, handleAction: vi.fn(), beforeEntryAction: vi.fn(), studioEntryBusy: false, studioEntryReading: false,
    referenceEntryInput: () => S.referenceScriptInput.text, referenceEntryCanStart: () => true, referenceEntryMediaItems: () => [],
    referenceEntryKind: () => ({ id: 'agent' }), referenceSettingCatalog: { style: [{ name: '雨夜', prompt: '冷暖光对比' }] },
    render: vi.fn(), studioNativePost: post, entryStorage: () => ({}), toast: vi.fn() }
  runInNewContext(action + "\nhandleAction('ref-start')", context)
  const call = post.mock.calls[0] as [string, { text: string; sourceIds: string[] }]
  const marker = '用户确认的完整创作输入：\n'
  return { S, post, call, spec: JSON.parse(call[1].text.split(marker)[1]!) as {
    mode: string
    adaptation: object | null
    language: string | null
    original: string
    options: object
  } }
}

it('submits production settings without hidden overseas or genre choices', () => {
  const { call, spec } = setup('produce')
  expect(call[0]).toBe('entry-submit')
  expect(call[1].sourceIds).toEqual(['script'])
  expect({ mode: spec.mode, adaptation: spec.adaptation, language: spec.language, options: spec.options, original: spec.original })
    .toMatchInlineSnapshot(`
      {
        "adaptation": null,
        "language": null,
        "mode": "produce",
        "options": {
          "ratio": "9:16",
          "style": "雨夜",
        },
        "original": "《原稿》
      中文对白",
      }
    `)
})

it('submits a redraw video without the screenplay file or overseas adaptation mode', () => {
  const { call, spec } = setup('redraw')
  expect(call[1].sourceIds).toEqual(['video'])
  expect(spec.adaptation).toBeNull()
  expect(spec.language).toBe('en')
  expect(spec.original).toBe('')
})

it('persists selected genre, full style prompt, ratio and episode count with the project', () => {
  const { S } = setup('write')
  expect(S.referenceCreationSpec).toEqual({ genre: '悬疑', style: '雨夜', stylePrompt: '冷暖光对比', ratio: '9:16', episodes: '1 集' })
})
