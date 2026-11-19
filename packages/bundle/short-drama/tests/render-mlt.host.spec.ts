/** Real MLT composition checks cover pixels, original sound, subtitles and failed publication. */
import { execFile, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { brandString } from '@deepseek-ai/dsh-brand'
import { expect, it, onTestFinished } from 'vitest'
import { z } from 'zod'
import type { DramaEditClipId, DramaTrackId } from '../src/edit-types.ts'
import { renderMltEpisode, type MltTimeline } from '../src/render-mlt.ts'

const runFile = promisify(execFile)
const melt = process.env.DSH_MLT_TEST_EXECUTABLE ?? 'melt'
const ffmpeg = process.env.DSH_MLT_TEST_FFMPEG ?? 'ffmpeg'
const available = [melt, ffmpeg, 'ffprobe'].every(command => spawnSync(command, ['-version'], { stdio: 'ignore' }).status === 0)
const trackId = () => brandString<DramaTrackId>(randomUUID())
const clipId = () => brandString<DramaEditClipId>(randomUUID())

async function run(argv: readonly string[], cwd: string, signal: AbortSignal): Promise<string> {
  const command = argv[0]
  if (!command) throw new Error('Missing test executable.')
  return (await runFile(command, argv.slice(1), { cwd, signal, maxBuffer: 4 * 1024 * 1024, timeout: 40_000 })).stdout
}

it.skipIf(!available)('composes two picture tracks with original audio, an independent sound and confirmed subtitles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-mlt-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const signal = new AbortController().signal
  const red = join(root, 'red & source.mp4')
  const blue = join(root, 'blue.mp4')
  const audio = join(root, 'tone.wav')
  await run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=320x240:r=24:d=2',
    '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=2', '-c:v', 'libx264', '-c:a', 'aac', red], root, signal)
  await run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=24:d=2', '-c:v', 'libx264', blue], root, signal)
  await run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000:duration=2', audio], root, signal)
  const edit: MltTimeline = { tracks: [
    { id: trackId(), name: 'Picture', kind: 'video', muted: false, clips: [{ id: clipId(), path: red, hasAudio: true,
      startFrame: 0, sourceStartFrame: 0, frames: 48, volume: 1, opacity: 1, transform: { x: 0, y: 0, width: 1, height: 1 } }] },
    { id: trackId(), name: 'Overlay', kind: 'video', muted: false, clips: [{ id: clipId(), path: blue, hasAudio: false,
      startFrame: 12, sourceStartFrame: 0, frames: 24, volume: 0, opacity: 1, transform: { x: 0.5, y: 0, width: 0.5, height: 0.5 } }] },
    { id: trackId(), name: 'Music', kind: 'audio', muted: false, clips: [{ id: clipId(), path: audio,
      startFrame: 12, sourceStartFrame: 0, frames: 24, volume: 0.5 }] },
    { id: trackId(), name: 'Captions', kind: 'subtitle', muted: false, clips: [{ id: clipId(), startFrame: 12, frames: 24, text: 'Confirmed caption' }] },
  ] }
  const output = await renderMltEpisode({ melt, ffmpeg, ffprobe: 'ffprobe', run }, root, edit,
    { width: 320, height: 240, fps: 24 }, signal)
  expect(output.frames).toBe(48)
  expect(await readFile(output.subtitle!, 'utf8')).toBe('1\n00:00:00,500 --> 00:00:01,500\nConfirmed caption\n')
  const streams = z.object({ streams: z.array(z.object({ codec_type: z.string() })) }).parse(
    JSON.parse(await run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type',
      '-of', 'json', output.video], root, signal)),
  )
  expect(streams.streams).toEqual([{ codec_type: 'video' }, { codec_type: 'audio' }])
  const pixel = async (at: string, x: number, y: number) => (await runFile('ffmpeg', ['-v', 'error', '-ss', at, '-i', output.video,
    '-frames:v', '1', '-vf', `crop=2:2:${x}:${y},scale=1:1`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { encoding: 'buffer', maxBuffer: 1024 })).stdout
  const before = await pixel('0.2', 240, 60)
  const overlay = await pixel('0.8', 240, 60)
  const underneath = await pixel('0.8', 40, 60)
  expect(before[0]).toBeGreaterThan(200)
  expect(overlay[2]).toBeGreaterThan(200)
  expect(underneath[0]).toBeGreaterThan(200)
  const samples = (await runFile('ffmpeg', ['-v', 'error', '-i', output.video, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'],
    { encoding: 'buffer', maxBuffer: 1024 * 1024 })).stdout
  const magnitude = (seconds: number, hz: number) => {
    let real = 0; let imaginary = 0
    const length = 4800
    for (let i = 0; i < length; i++) {
      const sample = samples.readFloatLE((Math.round(seconds * 48000) + i) * 4)
      const angle = 2 * Math.PI * hz * i / 48000
      real += sample * Math.cos(angle); imaginary += sample * Math.sin(angle)
    }
    return Math.hypot(real, imaginary) / length
  }
  const original = magnitude(0.2, 220)
  expect(original).toBeGreaterThan(0.04)
  expect(magnitude(0.8, 220) / original).toBeGreaterThan(0.85)
  expect(magnitude(0.8, 220) / original).toBeLessThan(1.15)
  expect(magnitude(0.8, 880)).toBeGreaterThan(0.02)
  expect(magnitude(0.2, 880)).toBeLessThan(0.003)
  const withCaption = (await runFile('ffmpeg', ['-v', 'error', '-ss', '0.8', '-i', output.video, '-frames:v', '1',
    '-vf', 'crop=320:70:0:170', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { encoding: 'buffer', maxBuffer: 200000 })).stdout
  let white = 0
  for (let i = 0; i < withCaption.length; i += 3) {
    if (withCaption[i]! > 200 && withCaption[i + 1]! > 200 && withCaption[i + 2]! > 200) white++
  }
  expect(white).toBeGreaterThan(20)
}, 60_000)

it('cleans all temporary outputs when the composition engine fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-mlt-failed-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  await expect(renderMltEpisode({ melt, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', run: async () => { throw new Error('engine unavailable') } }, root,
    { tracks: [{ id: trackId(), name: 'Caption', kind: 'subtitle', muted: false, clips: [{ id: clipId(), startFrame: 0, frames: 24, text: 'Keep old edit' }] }] },
    { width: 320, height: 240, fps: 24 }, new AbortController().signal)).rejects.toThrow('engine unavailable')
  expect(await readdir(root)).toEqual([])
})

it.skipIf(!available)('muting a video track preserves its picture while removing its original sound', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-mlt-muted-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const signal = new AbortController().signal
  const source = join(root, 'red.mp4')
  await run([ffmpeg, '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=160x120:r=24:d=1',
    '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=1', '-c:v', 'libx264', '-c:a', 'aac', source], root, signal)
  const output = await renderMltEpisode({ melt, ffmpeg, ffprobe: 'ffprobe', run }, root, { tracks: [{
    id: trackId(), name: 'Muted source', kind: 'video', muted: true, clips: [{ id: clipId(), path: source, hasAudio: true,
      startFrame: 0, sourceStartFrame: 0, frames: 24, volume: 1, opacity: 1, transform: { x: 0, y: 0, width: 1, height: 1 } }],
  }] }, { width: 160, height: 120, fps: 24 }, signal)
  const pixel = (await runFile(ffmpeg, ['-v', 'error', '-ss', '0.5', '-i', output.video, '-frames:v', '1', '-vf', 'scale=1:1',
    '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { encoding: 'buffer', maxBuffer: 1024 })).stdout
  expect(pixel[0]).toBeGreaterThan(200)
  const audio = (await runFile(ffmpeg, ['-v', 'error', '-i', output.video, '-vn', '-ac', '1', '-f', 'f32le', 'pipe:1'],
    { encoding: 'buffer', maxBuffer: 1000000 })).stdout
  let peak = 0
  for (let i = 0; i < audio.length; i += 4) peak = Math.max(peak, Math.abs(audio.readFloatLE(i)))
  expect(peak).toBeLessThan(0.0001)
}, 40_000)
