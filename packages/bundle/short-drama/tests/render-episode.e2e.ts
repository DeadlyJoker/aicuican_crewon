/** Verify the real local encoder against trimmed adopted clips and subtitles. */
import { execFile, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it, onTestFinished } from 'vitest'
import { z } from 'zod'
import { renderEpisode, type EpisodeEncoder } from '../src/render-episode.ts'

const runFile = promisify(execFile)
const available = ['ffmpeg', 'ffprobe'].every(command => spawnSync(command, ['-version'], { stdio: 'ignore' }).status === 0)

async function run(argv: readonly string[], cwd: string, signal: AbortSignal): Promise<string> {
  const command = argv[0]
  if (command === undefined) throw new Error('The encoder command is empty.')
  const result = await runFile(command, argv.slice(1), { cwd, signal, maxBuffer: 1024 * 1024, timeout: 30_000 })
  return result.stdout
}

it.skipIf(!available)('exports exact frame cuts with replacement voice and subtitle streams using ffmpeg', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-drama-render-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const signal = new AbortController().signal
  const red = join(root, 'red.mp4')
  const blue = join(root, 'blue.mp4')
  const voice = join(root, 'voice.wav')
  await run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=160x120:r=24:d=1',
    '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=1', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', red], root, signal)
  await run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x120:r=24:d=1',
    '-c:v', 'libx264', blue], root, signal)
  await run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=0.5', voice], root, signal)

  const encoder: EpisodeEncoder = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', run }
  const exported = await renderEpisode(encoder, root, [
    { video: blue, hasAudio: false, voice, startFrame: 6, frames: 12, subtitle: '蓝色镜头' },
    { video: red, hasAudio: true, startFrame: 12, frames: 12, subtitle: '红色镜头' },
  ], { width: 160, height: 120, fps: 24 }, signal)

  expect(exported.frames).toBe(24)
  expect(exported.subtitle).toBeDefined()
  if (!exported.subtitle) throw new Error('The render omitted its subtitle file.')
  expect(await readFile(exported.subtitle, 'utf8')).toBe(
    '1\n00:00:00,000 --> 00:00:00,500\n蓝色镜头\n\n2\n00:00:00,500 --> 00:00:01,000\n红色镜头\n',
  )
  const probe = z.object({
    streams: z.array(z.object({ codec_type: z.string(), nb_frames: z.string().optional() })),
    format: z.object({ duration: z.string() }),
  }).parse(JSON.parse(await run([
    'ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,nb_frames:format=duration', '-of', 'json', exported.video,
  ], root, signal)))
  expect(probe.streams.map(stream => stream.codec_type)).toEqual(['video', 'audio', 'subtitle'])
  expect(probe.streams.find(stream => stream.codec_type === 'video')?.nb_frames).toBe('24')
  expect(Number(probe.format.duration)).toBeGreaterThanOrEqual(1)

  const frameColor = async (at: string): Promise<Buffer> => (await runFile('ffmpeg', [
    '-nostdin', '-v', 'error', '-ss', at, '-i', exported.video, '-frames:v', '1', '-vf', 'scale=1:1',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
  ], { cwd: root, encoding: 'buffer', maxBuffer: 1024, timeout: 30_000 })).stdout
  const first = await frameColor('0.1')
  const second = await frameColor('0.7')
  expect(first[2]).toBeGreaterThan(first[0]! + 100)
  expect(second[0]).toBeGreaterThan(second[2]! + 100)
})

it.skipIf(!available)('removes incomplete output after a real encoder rejects the media', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-drama-render-failure-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  await expect(renderEpisode({ ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', run }, root, [
    { video: join(root, 'missing.mp4'), hasAudio: false, startFrame: 0, frames: 24 },
  ], { width: 160, height: 120, fps: 24 }, new AbortController().signal)).rejects.toThrow()
  expect(await readdir(root)).toEqual([])
})
