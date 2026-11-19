/** Verify native media inspection, external output validation and source preservation. */
import { execFile, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it, onTestFinished } from 'vitest'
import { analyzeMedia, mediaAnalysisResultSchema, type MediaAnalysisConfig, type MediaAnalysisRunner } from '../src/media-analysis.ts'

const policy: MediaAnalysisConfig = {
  ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', sceneThreshold: 0.3, maxScenes: 20,
  maxTranscriptSegments: 20, maxResultBytes: 32_768, maxDurationSeconds: 300,
}
const probe = JSON.stringify({ format: { duration: '2' }, streams: [
  { index: 0, codec_type: 'video', codec_name: 'h264', width: 64, height: 64, avg_frame_rate: '10/1' },
  { index: 1, codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 1 },
  { index: 2, codec_type: 'subtitle' },
] })
const signal = () => new AbortController().signal

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-media-analysis-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'source.mp4')
  await writeFile(source, 'immutable input')
  return { root, source, input: { source, workRoot: root, analyzeScenes: false, transcribe: false } }
}

it('reads typed streams without invoking decoders or changing source data', async () => {
  const { root, source, input } = await fixture()
  const commands: string[][] = []
  const result = await analyzeMedia({ run: async (argv) => { commands.push([...argv]); return probe } }, policy, input, signal())
  expect(commands).toHaveLength(1)
  expect(commands[0]![0]).toBe('ffprobe')
  expect(commands[0]).toContain('-format_whitelist')
  expect(result.videoTracks).toEqual([{ index: 0, codec: 'h264', width: 64, height: 64, fps: 10 }])
  expect(result.audioTracks).toEqual([{ index: 1, codec: 'aac', sampleRate: 48000, channels: 1 }])
  expect(result.transcript).toEqual({ state: 'not-requested' })
  expect(await readFile(source, 'utf8')).toBe('immutable input')
  expect(await readdir(root)).toEqual(['source.mp4'])
})

it('distinguishes missing speech configuration and absent audio', async () => {
  const { input } = await fixture()
  const configured = { ...policy, whisper: { executable: 'whisper-cli', model: '/model.bin', language: 'auto' } }
  expect((await analyzeMedia({ run: async () => probe }, policy, { ...input, transcribe: true }, signal())).transcript)
    .toEqual({ state: 'unavailable', reason: 'missing-config' })
  const silentProbe = JSON.stringify({ format: { duration: '2' }, streams: [
    { index: 0, codec_type: 'video', codec_name: 'h264', width: 64, height: 64, avg_frame_rate: '0/0' },
  ] })
  expect((await analyzeMedia({ run: async () => silentProbe }, configured, { ...input, transcribe: true }, signal())).transcript)
    .toEqual({ state: 'unavailable', reason: 'no-audio' })
})

it('parses Whisper millisecond offsets and retains recognized text as candidates', async () => {
  const { input } = await fixture()
  const commands: string[][] = []
  const runner: MediaAnalysisRunner = { run: async (argv, cwd) => {
    commands.push([...argv])
    if (argv[0] === 'ffprobe') return probe
    if (argv[0] === 'whisper-cli') await writeFile(join(cwd, 'transcript.json'), JSON.stringify({
      result: { language: 'zh' }, transcription: [
        { offsets: { from: 0, to: 900 }, text: ' 你好 ' },
        { offsets: { from: 1000, to: 1800 }, text: '世界' },
      ],
    }))
    return ''
  } }
  const result = await analyzeMedia(runner, { ...policy,
    whisper: { executable: 'whisper-cli', model: '/models/ggml-base.bin', language: 'auto' },
  }, { ...input, transcribe: true }, signal())
  expect(result.transcript).toEqual({ state: 'complete', language: 'zh', segments: [
    { startSeconds: 0, endSeconds: 0.9, text: '你好' }, { startSeconds: 1, endSeconds: 1.8, text: '世界' },
  ] })
  expect(commands[1]).toContain('16000')
  expect(commands[1]).toContain('-format_whitelist')
  expect(commands[2]).toEqual(['whisper-cli', '-m', '/models/ggml-base.bin', '-f', 'speech.wav', '-l', 'auto', '-oj',
    '-of', 'transcript', '-np'])
})

it.each(['garbage', 'frame:0 pts:1 pts_time:3\nlavfi.scene_score=1\n',
  'frame:0 pts:1 pts_time:1.2\nframe:1 pts:2 pts_time:1\n'])('rejects invalid detector output and removes partial files: %s',
  async (metadata) => {
    const { input, root } = await fixture()
    const runner: MediaAnalysisRunner = { run: async (argv, cwd) => {
      if (argv[0] === 'ffprobe') return probe
      await writeFile(join(cwd, 'scene-cuts.txt'), metadata)
      return ''
    } }
    await expect(analyzeMedia(runner, policy, { ...input, analyzeScenes: true }, signal())).rejects.toThrow()
    expect(await readdir(root)).toEqual(['source.mp4'])
  })

it('rejects oversized, too-long and invalid media before decoding', async () => {
  const { input, root } = await fixture()
  const calls: string[] = []
  const runner: MediaAnalysisRunner = { run: async (argv) => { calls.push(argv[0]!); return probe } }
  await expect(analyzeMedia(runner, { ...policy, maxDurationSeconds: 1 }, { ...input, analyzeScenes: true }, signal())).rejects.toThrow()
  expect(calls).toEqual(['ffprobe'])
  await expect(analyzeMedia(runner, { ...policy, maxResultBytes: 2 }, input, signal())).rejects.toThrow('size limit')
  await expect(analyzeMedia({ run: async () => '{}' }, policy, input, signal())).rejects.toThrow()
  expect(await readdir(root)).toEqual(['source.mp4'])
})

it('does not publish transcripts with overlapping or out-of-source timestamps', async () => {
  const { input, root } = await fixture()
  const runner: MediaAnalysisRunner = { run: async (argv, cwd) => {
    if (argv[0] === 'ffprobe') return probe
    if (argv[0] === 'whisper-cli') await writeFile(join(cwd, 'transcript.json'), JSON.stringify({
      result: { language: 'en' }, transcription: [{ offsets: { from: 1000, to: 5000 }, text: 'too long' }],
    }))
    return ''
  } }
  await expect(analyzeMedia(runner, { ...policy, whisper: { executable: 'whisper-cli', model: '/model.bin', language: 'auto' } },
    { ...input, transcribe: true }, signal())).rejects.toThrow('timestamps')
  expect(await readdir(root)).toEqual(['source.mp4'])
})

it('cleans up after cancellation between subprocesses', async () => {
  const { input, root } = await fixture()
  const abort = new AbortController()
  const runner: MediaAnalysisRunner = { run: async () => { abort.abort(); return probe } }
  await expect(analyzeMedia(runner, policy, input, abort.signal)).rejects.toThrow()
  expect(await readdir(root)).toEqual(['source.mp4'])
})

it('rejects invalid persisted time ranges and duplicate stream identities', () => {
  const result = { durationSeconds: 2, videoTracks: [], audioTracks: [],
    scenes: [{ startSeconds: 1, endSeconds: 0.5 }], transcript: { state: 'not-requested' } }
  expect(mediaAnalysisResultSchema.safeParse(result).success).toBe(false)
  expect(mediaAnalysisResultSchema.safeParse({ ...result, scenes: [], audioTracks: [
    { index: 0, codec: 'aac', sampleRate: 48000, channels: 1 },
    { index: 0, codec: 'aac', sampleRate: 48000, channels: 1 },
  ] }).success).toBe(false)
})

const runFile = promisify(execFile)
const nativeAvailable = ['ffmpeg', 'ffprobe'].every(command => spawnSync(command, ['-version'], { stdio: 'ignore' }).status === 0)
it.skipIf(!nativeAvailable)('detects a real cut and audio stream with native FFmpeg while preserving source bytes', async () => {
  const { input, source, root } = await fixture()
  const runner: MediaAnalysisRunner = { run: async (argv, cwd, abort) => {
    const result = await runFile(argv[0]!, argv.slice(1), { cwd, signal: abort, maxBuffer: policy.maxResultBytes, timeout: 30_000 })
    return result.stdout
  } }
  await runner.run(['ffmpeg', '-y', '-nostdin', '-v', 'error',
    '-f', 'lavfi', '-i', 'color=black:s=64x64:r=10:d=1', '-f', 'lavfi', '-i', 'color=white:s=64x64:r=10:d=1',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]',
    '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-c:a', 'aac', source], root, signal())
  const bytes = await readFile(source)
  const result = await analyzeMedia(runner, policy, { ...input, analyzeScenes: true }, signal())
  expect(result.videoTracks[0]).toMatchObject({ codec: 'h264', width: 64, height: 64, fps: 10 })
  expect(result.audioTracks[0]).toMatchObject({ codec: 'aac', channels: 1 })
  expect(result.scenes).toEqual([{ startSeconds: 0, endSeconds: 1 }, { startSeconds: 1, endSeconds: 2 }])
  expect(await readFile(source)).toEqual(bytes)
  expect(await readdir(root)).toEqual(['source.mp4'])
})

it.skipIf(!nativeAvailable)('rejects a playlist disguised as media instead of reading its local file references', async () => {
  const { input, source, root } = await fixture()
  const other = join(root, 'outside.wav')
  await runFile('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', other],
    { cwd: root, timeout: 30_000 })
  await writeFile(source, "ffconcat version 1.0\nfile 'outside.wav'\n")
  const unsafe = await runFile('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', source],
    { cwd: root, timeout: 30_000 })
  expect(JSON.parse(unsafe.stdout)).toMatchObject({ streams: [{ codec_type: 'audio' }] })
  const runner: MediaAnalysisRunner = { run: async (argv, cwd, abort) => (await runFile(argv[0]!, argv.slice(1),
    { cwd, signal: abort, timeout: 30_000 })).stdout }
  await expect(analyzeMedia(runner, policy, input, signal())).rejects.toThrow('not on whitelist')
  expect(await readdir(root)).toEqual(['outside.wav', 'source.mp4'])
})
