/** Preview retains decoded frames across cuts and independent subtitle changes. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

class Media {
  style: Record<string, string> = {}
  className = ''
  src = ''
  preload = ''
  playsInline = false
  muted = true
  paused = true
  readyState = 0
  seeking = false
  videoWidth = 160
  videoHeight = 90
  loads = 0
  plays = 0
  seeks = 0
  removed = false
  private time = 0
  private nextPlay: Promise<void> | undefined
  listeners = new Map<string, (() => void)[]>()
  get currentTime() { return this.time }
  set currentTime(value: number) { this.time = value; this.seeking = true; this.seeks++ }
  addEventListener(name: string, callback: () => void) { this.listeners.set(name, [...this.listeners.get(name) ?? [], callback]) }
  removeEventListener(name: string, callback: () => void) {
    this.listeners.set(name, this.listeners.get(name)?.filter(item => item !== callback) ?? [])
  }
  load() { this.loads++ }
  advance(value: number) { this.time = value }
  pause() { this.paused = true }
  play() { this.paused = false; this.plays++; const result = this.nextPlay ?? Promise.resolve(); this.nextPlay = undefined; return result }
  deferNextPlay() {
    let rejectPlay: (error: Error) => void = () => { throw new Error('Play was not deferred') }
    this.nextPlay = new Promise<void>((_resolve, reject) => { rejectPlay = reject })
    return rejectPlay
  }
  remove() { this.removed = true }
  removeAttribute() { this.src = '' }
  ready() { this.readyState = 2; this.seeking = false; for (const callback of this.listeners.get('loadeddata') ?? []) callback() }
  seeked() { this.readyState = 2; this.seeking = false; for (const callback of this.listeners.get('seeked') ?? []) callback() }
  fail() { this.readyState = 0; for (const callback of this.listeners.get('error') ?? []) callback() }
}

function harness() {
  const videos: Media[] = []
  const tasks: (() => void)[] = []
  const transport = { stops: 0, failures: [] as string[] }
  const picture = { draws: 0, clears: 0, globalAlpha: 1, fillStyle: '', fillRect() {},
    clearRect() { this.clears++ }, drawImage() { this.draws++ } }
  const canvas = { width: 160, height: 90, hidden: false, getContext: () => picture }
  const captions = { values: [] as { textContent: string }[],
    replaceChildren(...values: { textContent: string }[]) { this.values = values } }
  const surface = { isConnected: true, clientWidth: 160, clientHeight: 90,
    querySelector: (selector: string) => selector === 'canvas' ? canvas : selector === '.native-edit-captions' ? captions : { append() {} } }
  const context = { surface, console, requestAnimationFrame: (task: () => void) => tasks.push(task),
    document: { createElement: (tag: string) => { if (tag === 'div') return { className: '', textContent: '' }; const media = new Media(); videos.push(media); return media } },
    studioCutClipMedia: (clip: { id: string }) => ({ url: '/' + clip.id + '.mp4' }),
    studioEditVisible: (editor: {
      clips: { start: number; duration: number; track: string }[]
      nativeTracks: { id: string; kind: string; muted: boolean }[]
    }, time: number) =>
      editor.clips.filter(clip => time >= clip.start && time < clip.start + clip.duration
        && !editor.nativeTracks.some(track => track.id === clip.track && track.kind === 'subtitle' && track.muted)),
    studioEditSetGain() {}, studioEditReleaseGain() {}, referenceCutStop() { transport.stops++ },
    toast(message: string) { transport.failures.push(message) }, studioEditCopy: () => ({ playbackFailed: 'Failed' }),
  }
  runInNewContext(readFileSync(new URL('../studio/native-playback.js', import.meta.url), 'utf8') + '\nvar pool=new StudioEditPlayback(surface);', context)
  const evaluate = (code: string): unknown => runInNewContext(code, context)
  evaluate(`var editor={fps:24,nativeTracks:[{id:'v',kind:'video',muted:false},{id:'s',kind:'subtitle',muted:false}],clips:[
    {id:'one',kind:'video',track:'v',start:0,duration:1,sourceIn:0,opacity:100,volume:100},
    {id:'two',kind:'video',track:'v',start:1,duration:1,sourceIn:0,opacity:100,volume:100},
    {id:'caption',kind:'text',track:'s',start:0,duration:0.5,text:'Hello'}]};`)
  const flush = () => { while (tasks.length) tasks.shift()?.() }
  const media = (id: string) => {
    const result = videos.findLast(video => video.src === '/' + id + '.mp4')
    if (!result) throw new Error('Missing media ' + id)
    return result
  }
  return { videos, picture, canvas, captions, transport, evaluate, flush, media }
}

describe('decoded preview transitions', () => {
  it('does not recreate or pause the video when a subtitle ends', () => {
    const h = harness()
    h.evaluate('pool.sync(editor,0,true)')
    const one = h.videos.find(media => media.src === '/one.mp4')
    if (!one) throw new Error('Missing first media')
    one.ready(); h.flush()
    expect(h.captions.values[0]?.textContent).toBe('Hello')
    one.advance(0.5)
    h.evaluate('pool.sync(editor,0.5,true)')
    expect(h.videos.filter(media => media.src === '/one.mp4')).toEqual([one])
    expect(one.loads).toBe(1)
    expect(one.paused).toBe(false)
    expect(h.captions.values).toEqual([])
  })

  it('preloads the next clip and switches only after its frame is decoded', () => {
    const h = harness()
    h.evaluate('pool.sync(editor,0,true)')
    const one = h.videos.find(media => media.src === '/one.mp4')
    if (!one) throw new Error('Missing first media')
    const two = h.videos.find(media => media.src === '/two.mp4')
    if (!two) throw new Error('Missing second media')
    one.ready(); h.flush()
    expect(h.canvas.hidden).toBe(true)
    expect(h.evaluate('pool.sync(editor,1,true)')).toBe(false)
    expect(h.picture.draws).toBeGreaterThan(0)
    expect(h.canvas.hidden).toBe(false)
    const captured = h.picture.draws
    h.evaluate('pool.sync(editor,1,true)')
    expect(h.picture.draws).toBe(captured)
    expect(h.canvas.hidden).toBe(false)
    expect(two.style.visibility).toBe('hidden')
    two.ready(); h.flush()
    expect(two.style.visibility).toBe('visible')
    expect(h.canvas.hidden).toBe(true)
    expect(two.paused).toBe(false)
    expect(h.evaluate('pool.sync(editor,1,true)')).toBe(true)
    expect(one.removed).toBe(true)
  })

  it('seeks on each paused frame step and honors a one-frame source in point', () => {
    const h = harness()
    h.evaluate('editor.clips[0].sourceIn=1/24;pool.sync(editor,0,false)')
    const one = h.media('one')
    one.ready()
    expect(one.currentTime).toBe(1 / 24)
    expect(one.seeks).toBe(1)
    one.seeked(); h.flush()
    expect(h.evaluate('pool.sync(editor,1/24,false)')).toBe(false)
    expect(one.currentTime).toBe(2 / 24)
    expect(one.seeks).toBe(2)
    one.seeked(); h.flush()
    expect(h.evaluate('pool.sync(editor,1/24,false)')).toBe(true)
    expect(one.paused).toBe(true)
  })

  it('clears the retained frame when a smaller translucent next shot is ready', () => {
    const h = harness()
    h.evaluate('editor.clips[1].opacity=50;editor.clips[1].nativeTransform={x:.25,y:0,width:.5,height:1};pool.sync(editor,0,false)')
    h.media('one').ready(); h.flush()
    const cleared = h.picture.clears
    h.evaluate('pool.sync(editor,1,false)')
    expect(h.picture.draws).toBeGreaterThan(0)
    expect(h.picture.clears).toBe(cleared)
    h.media('two').ready(); h.flush()
    expect(h.media('two').style.visibility).toBe('visible')
    expect(Number(h.media('two').style.opacity)).toBe(0.5)
    expect(h.picture.clears).toBeGreaterThan(cleared)
  })

  it('retains overlapping pictures when an independent audio track needs to seek', () => {
    const h = harness()
    h.evaluate(`editor.nativeTracks=[{id:'v',kind:'video',muted:false},{id:'overlay',kind:'video',muted:false},
      {id:'voice',kind:'audio',muted:false}];editor.clips=editor.clips.filter(clip=>clip.kind==='video');
      editor.clips[0].duration=6;Object.assign(editor.clips[1],{track:'overlay',start:5,duration:6});
      editor.clips.push({id:'sound',kind:'audio',track:'voice',start:0,duration:6,sourceIn:0,volume:100});
      pool.sync(editor,119/24,true)`)
    const one = h.media('one'), two = h.media('two'), sound = h.media('sound')
    one.ready(); one.seeked(); sound.ready(); sound.seeked(); two.ready(); h.flush()
    expect(h.evaluate('pool.sync(editor,5,true)')).toBe(true)
    expect(one.style.visibility).toBe('visible')
    expect(two.style.visibility).toBe('visible')
    expect(h.canvas.hidden).toBe(true)
    one.advance(5.1); two.advance(0.1)
    expect(h.evaluate('pool.sync(editor,5.25,true)')).toBe(false)
    expect(sound.seeking).toBe(true)
    expect(one.style.visibility).toBe('hidden')
    expect(two.style.visibility).toBe('hidden')
    expect(h.canvas.hidden).toBe(false)
    const captured = h.picture.draws
    expect(captured).toBeGreaterThanOrEqual(2)
    h.evaluate('pool.sync(editor,5.25,true)')
    expect(h.picture.draws).toBe(captured)
    expect(h.canvas.hidden).toBe(false)
    sound.seeked(); h.flush()
    expect(one.style.visibility).toBe('visible')
    expect(two.style.visibility).toBe('visible')
    expect(h.canvas.hidden).toBe(true)
    expect(h.transport.stops).toBe(0)
  })

  it('does not resume after a pause while a decoded frame callback is queued', () => {
    const h = harness()
    h.evaluate('pool.sync(editor,0,true)')
    const one = h.media('one')
    one.ready()
    h.evaluate('pool.pause()')
    h.flush()
    expect(one.plays).toBe(0)
    expect(one.paused).toBe(true)
    expect(h.media('two').paused).toBe(true)
  })

  it('stops all media on failure and can reload the failed source on retry', () => {
    const h = harness()
    h.evaluate('pool.sync(editor,0,true)')
    const one = h.media('one')
    one.ready(); h.flush()
    const plays = one.plays
    h.media('two').ready()
    one.fail(); h.flush()
    expect(h.transport).toEqual({ stops: 1, failures: ['Failed'] })
    expect(one.paused).toBe(true)
    expect(one.plays).toBe(plays)
    expect(h.media('two').paused).toBe(true)
    expect(h.evaluate('pool.sync(editor,0,true)')).toBe(false)
    const retry = h.media('one')
    expect(retry).not.toBe(one)
    expect(one.removed).toBe(true)
    retry.ready(); h.flush()
    expect(retry.paused).toBe(false)
    expect(h.evaluate('pool.sync(editor,0,true)')).toBe(true)
    expect(h.transport.stops).toBe(1)
  })

  it('ignores the old play rejection after seeking to a new frame', async () => {
    const h = harness()
    h.evaluate('pool.sync(editor,0,true)')
    const one = h.media('one')
    const rejectOldPlay = one.deferNextPlay()
    one.ready(); h.flush()
    expect(one.plays).toBe(1)
    expect(h.evaluate('pool.sync(editor,.5,true)')).toBe(false)
    expect(one.paused).toBe(true)
    one.seeked(); h.flush()
    expect(one.plays).toBe(2)
    rejectOldPlay(new Error('The play request was interrupted by a call to pause'))
    await Promise.resolve()
    expect(h.transport).toEqual({ stops: 0, failures: [] })
    expect(one.paused).toBe(false)
  })

  it('keeps an intentional gap black and releases media on close', () => {
    const h = harness()
    h.evaluate('pool.sync(editor,0,false)')
    h.videos.forEach((media) => { media.ready() }); h.flush()
    h.evaluate('pool.sync(editor,3,false)')
    expect(h.picture.clears).toBeGreaterThan(0)
    h.evaluate('pool.dispose()')
    expect(h.videos.every(media => media.removed)).toBe(true)
  })
})
