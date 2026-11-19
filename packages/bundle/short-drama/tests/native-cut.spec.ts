/** Native editor projects the durable edit and rejects decisions the encoder cannot preserve. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

const source = readFileSync(new URL('../studio/native-cut.js', import.meta.url), 'utf8')
const pure = source.slice(0, source.indexOf('const studioCutApplyOriginal='))
function runtime() {
  const node = { id: 'shot:s1', title: 'Shot', seconds: 6, candidates: [{ id: 'm1', number: 1, nativeMedia: { kind: 'video', url: '/real.mp4', id: 'm1' } }] }
  const production = { fps: 24, shots: [{ id: 's1', adoptedVideoId: 'm1' }], timeline: [
    { shotId: 's1', videoId: 'm1', voiceId: null, startFrame: 24, frames: 48, subtitle: '' },
    { shotId: 's1', videoId: 'm1', voiceId: null, startFrame: 0, frames: 72, subtitle: '' },
  ] }
  const context = { production, structuredClone, nodeById: () => node,
    referenceCutSourceClip: (_node: object, output: object, id: string) => ({ id, kind: 'video', pending: false,
      scale: 100, opacity: 100, x: 0, y: 0, rotation: 0, volume: 100, sourceDuration: 6,
      source: { id: node.id, snapshot: output } }),
  }
  runInNewContext(pure + '\nvar editor={clips:studioCutTimeline(production)};', context)
  return context
}
it('restores playback positions separately from source trim offsets and round-trips the native edit', () => {
  const context = runtime()
  expect(runInNewContext('editor.clips.map(c=>[c.start,c.sourceIn,c.duration])', context)).toEqual([[0, 1, 2], [2, 0, 3]])
  expect(runInNewContext('studioCutSerialize(editor,production)', context)).toEqual(context.production.timeline)
})
it.each([
  ['editor.clips[1].start=1', '空隙或重叠'],
  ['editor.clips[0].scale=120', '变换或混音'],
  ['editor.clips[0].sourceIn=5', '超出源视频'],
  ['production.shots[0].adoptedVideoId="new-version"', '当前已采用'],
  ['editor.clips[0].kind="text"', '当前已采用'],
])('retains unsupported drafts instead of silently exporting different content: %s', (mutation, message) => {
  const context = runtime()
  runInNewContext(mutation, context)
  const before: unknown = runInNewContext('JSON.stringify(editor)', context)
  expect(() => { runInNewContext('studioCutSerialize(editor,production)', context) }).toThrow(message)
  expect(runInNewContext('JSON.stringify(editor)', context)).toBe(before)
})

it('ripples source trims on the native project frame grid', () => {
  const context = runtime()
  const gestures = readFileSync(new URL('../studio/reference-cut-gesture-model.js', import.meta.url), 'utf8')
  const model = readFileSync(new URL('../studio/reference-cut-model.js', import.meta.url), 'utf8')
  const wrapper = source.slice(source.indexOf('const studioCutApplyOriginal='), source.indexOf('const studioCutStopOriginal='))
  runInNewContext(gestures + '\n' + model + '\n' + wrapper + '\neditor.version=1;editor.fps=24;editor.playhead=0;editor.undo=[];editor.redo=[];editor.clips.forEach(c=>c.track="media");var owner={editor};', context)
  runInNewContext('referenceCutApply(owner,{type:"trim",id:editor.clips[0].id,start:1.5,end:3})', context)
  expect(runInNewContext('owner.editor.clips.map(c=>[c.start,c.sourceIn,c.duration])', context)).toEqual([[0, 1.5, 1.5], [1.5, 0, 3]])
  runInNewContext('referenceCutApply(owner,{type:"gesture",id:owner.editor.clips[0].id,spec:{mode:"start",delta:1/24,snap:false}})', context)
  expect(runInNewContext('Math.round(owner.editor.clips[0].duration*24)', context)).toBe(35)
  expect(runInNewContext('owner.editor.nativeDirty', context)).toBe(true)
})


it('preserves a legacy edit and keeps dirty edits when reopening after an unrelated production change', () => {
  const base = runtime()
  const legacy = { title: 'Legacy', editor: { version: 1, clips: [{ id: 'legacy' }] } }
  const context = { ...base, S: { referenceProjectEdit: legacy, referenceLegacyProjectEdit: null },
    studioNativeConfig: { project: { id: 'project' }, production: { ...base.production, revision: 4 } },
    referenceOpenCut: vi.fn(), referenceCutEmpty: () => ({ version: 1, clips: [], playhead: 0 }),
    referenceCutDuration: (editor: { clips: { start: number; duration: number }[] }) =>
      Math.max(0, ...editor.clips.map(c => c.start + c.duration)),
  }
  const opening = source.slice(source.indexOf('const studioCutOpenOriginal='), source.indexOf('const studioCutSourceOriginal='))
  runInNewContext(opening + '\nreferenceOpenCut()', context)
  expect(runInNewContext('S.referenceLegacyProjectEdit.editor.clips[0].id', context)).toBe('legacy')
  runInNewContext('S.referenceProjectEdit.editor.nativeDirty=true;S.referenceProjectEdit.editor.clips[0].duration=1;studioNativeConfig.production.revision=5;referenceOpenCut()', context)
  expect(runInNewContext('S.referenceProjectEdit.editor.clips[0].duration', context)).toBe(1)
  expect(runInNewContext('S.referenceProjectEdit.editor.nativeRevision', context)).toBe(5)
  runInNewContext('studioNativeConfig.production.timeline=[];studioNativeConfig.production.revision=6;referenceOpenCut()', context)
  expect(runInNewContext('S.referenceProjectEdit.editor.clips[0].duration', context)).toBe(1)
  expect(runInNewContext('S.referenceProjectEdit.editor.nativeRevision', context)).toBe(5)
})
