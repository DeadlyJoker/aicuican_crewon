/** HTTP previews retain cryptographic identifiers without the secure-context UUID API. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { webcrypto } from 'node:crypto'
import { expect, it } from 'vitest'
it('creates unique version 4 identifiers with getRandomValues alone', () => {
  const source = readFileSync(new URL('../studio/random-id.js', import.meta.url), 'utf8')
  const ids = runInNewContext(source + '; Array.from({length:100}, studioRandomUUID)', {
    crypto: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) },
  }) as string[]
  expect(new Set(ids).size).toBe(100)
  for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

it('creates pointer-added subtitle clips with wire-valid identifiers', () => {
  const random = readFileSync(new URL('../studio/random-id.js', import.meta.url), 'utf8')
  const gestures = readFileSync(new URL('../studio/reference-cut-gestures.js', import.meta.url), 'utf8')
  const start = gestures.slice(gestures.indexOf('function referenceCutStartGesture('), gestures.indexOf("window.addEventListener('pointerdown'"))
  const clip = runInNewContext(random + `
    var referenceCutDrag=null,referenceCutView={},owner={editor:{clips:[]}};
    var tracks={offsetWidth:300,querySelector(){return {dataset:{cutPx:'100'}}}};
    var scroll={scrollLeft:0,querySelector(){return tracks}};
    var root={querySelector(){return {querySelector(){return scroll}}}};
    var document={querySelector(){return root}};
    function referenceCutOwner(){return owner}
    function referenceCutRead(){return owner.editor}
    function referenceCutContent(editor){return editor}
    function referenceCutStop(){}
  ` + start + `
    referenceCutStartGesture({button:0,target:{closest(selector){return selector.includes('add-text')?{setPointerCapture(){}}:selector==='button'?{setPointerCapture(){}}:null}},
      preventDefault(){},stopImmediatePropagation(){},pointerId:1,clientX:1,clientY:1});
    referenceCutDrag.clip;
  `, { crypto: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) }, structuredClone }) as { id: string; kind: string }
  expect(clip.kind).toBe('text')
  expect(clip.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})
