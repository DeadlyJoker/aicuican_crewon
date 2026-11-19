/** Media analysis refreshes only its own panel and never edits the timeline. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

const source = readFileSync(new URL('../studio/native-analysis.js', import.meta.url), 'utf8')

function fixture() {
  const messages: object[] = []
  const listeners = new Map<string, ((event: object) => void)[]>()
  const listen = (type: string, callback: (event: object) => void) => listeners.set(type, [...(listeners.get(type) || []), callback])
  const parent = {}
  const owner = { editor: { selected: 'clip1', clips: [{ id: 'clip1', media: { id: 'media1', kind: 'video' } }],
    draft: 'uncommitted trim' } }
  const ui = { paints: 0, html: '', sectionMedia: 'media1', result: '', scrollTop: 32, disabled: false }
  const segment = { get scrollTop() { return ui.scrollTop }, set scrollTop(value: number) { ui.scrollTop = value } }
  const result = { get innerHTML() { return ui.result }, set innerHTML(value: string) { ui.result = value },
    querySelector: () => segment }
  const button = { get disabled() { return ui.disabled }, set disabled(value: boolean) { ui.disabled = value } }
  const section = { dataset: { get analysisMedia() { return ui.sectionMedia } },
    querySelector: () => result, querySelectorAll: () => [button] }
  const context = {
    parent, studioRandomUUID: () => 'new-request',
    esc: (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
    studioNativeConfig: { analysisCopy: { title: 'Analysis', inspect: 'Inspect', scenes: 'Scenes', transcript: 'Transcript',
      failed: 'Failed', interrupted: 'Interrupted', duration: 'Duration', video: 'Video', audio: 'Audio', empty: 'Empty',
      noAudio: 'No audio', missing: 'No model' } },
    studioNativePost: (type: string, payload: object) => messages.push({ type, ...payload }),
    referenceCutOwner: () => owner,
    referenceCutSelection: () => owner.editor.clips[0],
    studioCutClipMedia: (clip: { media: object } | undefined) => clip?.media,
    referenceCutPropertyHtml: () => '<input value="uncommitted trim">',
    referenceCutPaint: () => { ui.paints++ },
    document: { addEventListener: (type: string, callback: (event: object) => void) => listen(type, callback),
      querySelector: () => section },
    window: { addEventListener: (type: string, callback: (event: object) => void) => listen(type, callback) },
  }
  const evaluate = (code: string): unknown => runInNewContext(code, context)
  evaluate(source)
  const emit = (value: object, source = parent) =>{  listeners.get('message')!.forEach((callback) =>{  callback({ source,
    data: { channel: 'crewon-studio-v1', ...value } }) }) }
  const click = (mode: string) =>{  listeners.get('click')!.forEach((callback) =>{  callback({ preventDefault() {},
    target: { closest: (selector: string) => selector === '[data-media-analysis]' ? ({ dataset: { mediaId: 'media1',
      mediaAnalysis: mode } }) : null } }) }) }
  return { ui, owner, messages, context, evaluate, emit, click }
}

function record(id: string, state = 'ready', createdAt = 1) {
  return { id, state, createdAt, mode: 'transcript', result: { durationSeconds: 2, videoTracks: [{}], audioTracks: [{}], scenes: [],
    transcript: { state: 'complete', segments: [{ startSeconds: 0, endSeconds: 1, text: '<script>alert("x")</script>' }] } } }
}

it('loads history once after painting, without request side effects during property rendering', () => {
  const h = fixture()
  h.evaluate('referenceCutPropertyHtml(referenceCutOwner())')
  expect(h.messages).toEqual([])
  h.evaluate('referenceCutPaint();referenceCutPaint()')
  expect(h.messages).toEqual([{ type: 'read-media-analysis', mediaId: 'media1' }])
})

it('updates only the analysis region while preserving selection, drafts and editor playback nodes', () => {
  const h = fixture(), before = JSON.stringify(h.owner)
  h.click('transcript')
  expect(h.ui.disabled).toBe(true)
  expect(h.ui.paints).toBe(0)
  h.emit({ type: 'media-analysis-result', mediaId: 'media1', record: record('new-request') })
  expect(h.ui.result).toContain('&lt;script&gt;')
  expect(h.ui.result).not.toContain('<script>')
  expect(h.ui.disabled).toBe(false)
  expect(h.ui.scrollTop).toBe(32)
  expect(h.ui.paints).toBe(0)
  expect(JSON.stringify(h.owner)).toBe(before)
})

it('ignores stale history errors and stale operation failures while a newer request is pending', () => {
  const h = fixture()
  h.click('scenes')
  h.emit({ type: 'media-analysis-history-failed', mediaId: 'media1', message: 'old history failure' })
  h.emit({ type: 'media-analysis-failed', mediaId: 'media1', requestId: 'old-request', message: 'old request failure' })
  expect(h.ui.result).toContain('native-analysis-wait')
  expect(h.ui.disabled).toBe(true)
  h.emit({ type: 'media-analysis-failed', mediaId: 'media1', requestId: 'new-request', message: '<failure>' })
  expect(h.ui.result).toContain('&lt;failure&gt;')
  expect(h.ui.disabled).toBe(false)
})

it('keeps completed local records when older running history arrives and joins an existing job only once', () => {
  const h = fixture()
  h.emit({ type: 'media-analysis-history', mediaId: 'media1', records: [record('running', 'running')] })
  h.emit({ type: 'media-analysis-history', mediaId: 'media1', records: [record('running', 'running')] })
  expect(h.messages).toEqual([{ type: 'analyze-media', mediaId: 'media1', mode: 'transcript', requestId: 'running' }])
  h.emit({ type: 'media-analysis-result', mediaId: 'media1', record: record('running') })
  h.emit({ type: 'media-analysis-history', mediaId: 'media1', records: [record('running', 'running')] })
  expect(h.ui.result).toContain('&lt;script&gt;')
  expect(h.ui.disabled).toBe(false)
  expect(h.messages).toHaveLength(1)
})

it('refreshes running history with a terminal Host result and keeps other selected media untouched', () => {
  const h = fixture()
  h.emit({ type: 'media-analysis-history', mediaId: 'media1', records: [record('r', 'running')] })
  h.emit({ type: 'media-analysis-history', mediaId: 'media1', records: [record('r')] })
  h.emit({ type: 'media-analysis-result', mediaId: 'media1', record: record('r') })
  expect(h.ui.result).toContain('&lt;script&gt;')
  h.ui.sectionMedia = 'media2'
  const previous = h.ui.result
  h.emit({ type: 'media-analysis-result', mediaId: 'media1', record: record('another', 'failed', 3) })
  expect(h.ui.result).toBe(previous)
  h.emit({ type: 'media-analysis-result', mediaId: 'media2', record: record('ignored') }, {})
  expect(h.ui.result).toBe(previous)
})
