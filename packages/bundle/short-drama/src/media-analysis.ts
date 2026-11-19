/** Read archived media through bounded native tools without modifying its source. */
import { mkdtemp, open, rm } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { z } from 'zod'

/** Explicit Host policy for local media inspection and optional transcription. */
export interface MediaAnalysisConfig {
  ffmpeg: string
  ffprobe: string
  whisper?: { executable: string; model: string; language: string } | undefined
  sceneThreshold: number
  maxScenes: number
  maxTranscriptSegments: number
  maxResultBytes: number
  maxDurationSeconds: number
}

/** The Host owns subprocess timeouts, output limits, cancellation and teardown. */
export interface MediaAnalysisRunner {
  /**
   * Execute a native tool without a shell and reject unsuccessful exits.
   * @param argv - Executable followed by its individual arguments.
   * @param cwd - Private operation directory.
   * @param signal - Operation cancellation.
   * @returns Bounded standard output.
   */
  run(argv: readonly string[], cwd: string, signal: AbortSignal): Promise<string>
}

/** One contiguous candidate scene, in source seconds. */
export interface MediaScene {
  startSeconds: number
  endSeconds: number
}

/** Recognized speech remains a candidate; it never replaces approved dialogue. */
export interface TranscriptSegment extends MediaScene {
  text: string
}

/** Distinguish absent configuration and missing audio from a completed empty transcript. */
export type MediaTranscript =
  | { state: 'not-requested' }
  | { state: 'unavailable'; reason: 'missing-config' | 'no-audio' }
  | { state: 'complete'; language: string; segments: TranscriptSegment[] }

const sceneSchema = z.object({ startSeconds: z.number().nonnegative(), endSeconds: z.number().nonnegative() })
/** Validate external and persisted inspection results before exposing them to consumers. */
export const mediaAnalysisResultSchema = z.object({
  durationSeconds: z.number().positive(),
  videoTracks: z.array(z.object({ index: z.number().int().nonnegative(), codec: z.string().min(1),
    width: z.number().int().positive(), height: z.number().int().positive(), fps: z.number().positive().nullable() })),
  audioTracks: z.array(z.object({ index: z.number().int().nonnegative(), codec: z.string().min(1),
    sampleRate: z.number().int().positive(), channels: z.number().int().positive() })),
  scenes: z.array(sceneSchema),
  transcript: z.discriminatedUnion('state', [
    z.object({ state: z.literal('not-requested') }),
    z.object({ state: z.literal('unavailable'), reason: z.enum(['missing-config', 'no-audio']) }),
    z.object({ state: z.literal('complete'), language: z.string().min(1),
      segments: z.array(sceneSchema.extend({ text: z.string().min(1) })) }),
  ]),
}).superRefine((value, ctx) => {
  const indexes = [...value.videoTracks, ...value.audioTracks].map(track => track.index)
  if (new Set(indexes).size !== indexes.length) ctx.addIssue({ code: 'custom', message: 'Media stream indexes must be unique.' })
  const checkRanges = (ranges: readonly MediaScene[], path: string) => {
    let end = 0
    for (const [index, range] of ranges.entries()) {
      if (range.startSeconds < end || range.endSeconds <= range.startSeconds || range.endSeconds > value.durationSeconds) {
        ctx.addIssue({ code: 'custom', message: 'Media time ranges must be ordered and inside the source.', path: [path, index] })
      }
      end = range.endSeconds
    }
  }
  checkRanges(value.scenes, 'scenes')
  if (value.transcript.state === 'complete') checkRanges(value.transcript.segments, 'transcript')
})

/** Verified streams and optional analysis derived from one immutable media source. */
export type MediaAnalysisResult = z.infer<typeof mediaAnalysisResultSchema>

/** Source paths are resolved by the project archive, never supplied by a Client. */
export interface MediaAnalysisInput {
  source: string
  workRoot: string
  /** Detect cuts in the first video stream when true; otherwise retain an empty scene list. */
  analyzeScenes: boolean
  /** Transcribe the first audio stream when true; otherwise retain a not-requested result. */
  transcribe: boolean
}

const finitePositive = z.number().positive()
// Direct containers only: playlist and concat demuxers could open unrelated local files.
const MEDIA_CONTAINER_FORMATS = 'mov,matroska,webm,avi,mp3,wav,ogg,flac,aiff,aac,mpeg,mpegts,flv,ac3,eac3'
const numericString = z.string().refine(value => value.trim().length > 0 && Number.isFinite(Number(value)))
const probeSchema = z.object({
  format: z.object({ duration: numericString }),
  streams: z.array(z.discriminatedUnion('codec_type', [
    z.object({ codec_type: z.literal('video'), index: z.number().int().nonnegative(), codec_name: z.string().min(1),
      width: z.number().int().positive(), height: z.number().int().positive(), avg_frame_rate: z.string() }),
    z.object({ codec_type: z.literal('audio'), index: z.number().int().nonnegative(), codec_name: z.string().min(1),
      sample_rate: numericString, channels: z.number().int().positive() }),
  ])),
})

function boundedText(text: string, limit: number): string {
  if (Buffer.byteLength(text, 'utf8') > limit) throw new Error('Media analysis exceeds its result size limit.')
  return text
}

async function readBounded(path: string, limit: number): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const facts = await handle.stat()
    if (!facts.isFile() || facts.size > limit) throw new Error('Media analysis exceeds its result size limit.')
    const buffer = Buffer.alloc(facts.size)
    let offset = 0
    while (offset < buffer.length) {
      const read = await handle.read(buffer, offset, buffer.length - offset, offset)
      if (!read.bytesRead) throw new Error('Media analysis output changed while reading.')
      offset += read.bytesRead
    }
    if ((await handle.read(Buffer.alloc(1), 0, 1, offset)).bytesRead) throw new Error('Media analysis output changed while reading.')
    return buffer.toString('utf8')
  } finally { await handle.close() }
}

function frameRate(value: string): number | null {
  const match = /^(\d+)\/(\d+)$/u.exec(value)
  if (!match) throw new Error('The media frame rate is invalid.')
  const numerator = Number(match[1]), denominator = Number(match[2])
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) throw new Error('The media frame rate is invalid.')
  return denominator === 0 ? null : finitePositive.parse(numerator / denominator)
}

function sceneRanges(text: string, duration: number, maxScenes: number): MediaScene[] {
  const cuts = [0]
  let previousCut = 0
  for (const line of text.split(/\r?\n/u).filter(Boolean)) {
    if (/^lavfi\.scene_score=/u.test(line)) continue
    const match = /^frame:\s*\d+\s+pts:\s*-?\d+\s+pts_time:(\S+)\s*$/u.exec(line)
    if (!match) throw new Error('The scene detector returned invalid metadata.')
    const time = Number(match[1])
    if (!Number.isFinite(time) || time < 0 || time > duration) throw new Error('The scene detector returned an invalid cut time.')
    if (time === 0 || time === duration) continue
    if (time <= previousCut) throw new Error('The scene detector returned unordered cut times.')
    if (cuts.length >= maxScenes) throw new Error('The scene detector exceeds the configured scene limit.')
    cuts.push(time)
    previousCut = time
  }
  return cuts.map((startSeconds, index) => ({ startSeconds, endSeconds: cuts[index + 1] ?? duration }))
}

async function transcript(
  runner: MediaAnalysisRunner, config: MediaAnalysisConfig, source: string, work: string,
  duration: number, signal: AbortSignal,
): Promise<MediaTranscript> {
  const whisper = config.whisper
  if (!whisper) return { state: 'unavailable', reason: 'missing-config' }
  if (!whisper.executable.trim() || !isAbsolute(whisper.model) || !/^(?:auto|[a-z]{2,3})$/u.test(whisper.language)) {
    throw new Error('Configure a Whisper executable, absolute model path and language before transcription.')
  }
  await runner.run([config.ffmpeg, '-nostdin', '-v', 'error', '-protocol_whitelist', 'file',
    '-format_whitelist', MEDIA_CONTAINER_FORMATS, '-i', source,
    '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', 'speech.wav'], work, signal)
  await runner.run([whisper.executable, '-m', whisper.model, '-f', 'speech.wav', '-l', whisper.language,
    '-oj', '-of', 'transcript', '-np'], work, signal)
  const decoded = z.object({ result: z.object({ language: z.string().min(1) }), transcription: z.array(z.object({
    offsets: z.object({ from: z.number().int().nonnegative(), to: z.number().int().nonnegative() }),
    text: z.string(),
  })).max(config.maxTranscriptSegments) }).parse(JSON.parse(await readBounded(join(work, 'transcript.json'), config.maxResultBytes)))
  let previousEnd = 0
  const segments = decoded.transcription.map((segment) => {
    const startSeconds = segment.offsets.from / 1000, endSeconds = segment.offsets.to / 1000
    if (startSeconds < previousEnd || endSeconds < startSeconds || endSeconds > duration + 0.02) {
      throw new Error('The transcript timestamps do not match the media duration.')
    }
    previousEnd = endSeconds
    return { startSeconds, endSeconds: Math.min(duration, endSeconds), text: segment.text.trim() }
  }).filter(segment => segment.text.length > 0)
  return { state: 'complete', language: decoded.result.language, segments }
}

/**
 * Inspect media and optionally detect cuts or recognize speech using local tools.
 * @param runner - Bounded Host subprocess owner.
 * @param config - Explicit deployment limits and installed tool paths; no downloads occur.
 * @param input - Archive-resolved source and requested analyses; false leaves that analysis unrequested.
 * @param signal - Cancels each native operation and prevents publication of partial output.
 * @returns Complete candidate metadata, never modified project content or a quality score.
 */
export async function analyzeMedia(
  runner: MediaAnalysisRunner, config: MediaAnalysisConfig, input: MediaAnalysisInput, signal: AbortSignal,
): Promise<MediaAnalysisResult> {
  if (!isAbsolute(input.source) || !isAbsolute(input.workRoot)) throw new Error('Media inspection needs archive-resolved absolute paths.')
  finitePositive.parse(config.maxDurationSeconds)
  z.number().int().positive().parse(config.maxScenes)
  z.number().int().positive().parse(config.maxTranscriptSegments)
  z.number().int().positive().parse(config.maxResultBytes)
  z.number().min(0).max(1).parse(config.sceneThreshold)
  if (!config.ffmpeg.trim() || !config.ffprobe.trim()) throw new Error('Configure native media tools before inspection.')
  signal.throwIfAborted()
  const work = await mkdtemp(join(input.workRoot, 'analysis-'))
  try {
    const output = boundedText(await runner.run([config.ffprobe, '-v', 'error', '-protocol_whitelist', 'file',
      '-format_whitelist', MEDIA_CONTAINER_FORMATS,
      '-show_entries', 'format=duration:stream=index,codec_type,codec_name,width,height,avg_frame_rate,sample_rate,channels',
      '-of', 'json', input.source], work, signal), config.maxResultBytes)
    // Subtitle/data streams are outside this analysis but remain in the archived source.
    const raw = z.object({
      streams: z.array(z.looseObject({ codec_type: z.string() })), format: z.unknown(),
    }).parse(JSON.parse(output))
    const probe = probeSchema.parse({ ...raw, streams: raw.streams.filter(stream => stream.codec_type === 'video' || stream.codec_type === 'audio') })
    const durationSeconds = finitePositive.max(config.maxDurationSeconds).parse(Number(probe.format.duration))
    signal.throwIfAborted()
    const videoTracks: MediaAnalysisResult['videoTracks'] = []
    const audioTracks: MediaAnalysisResult['audioTracks'] = []
    for (const stream of probe.streams) {
      if (stream.codec_type === 'video') {
        videoTracks.push({
          index: stream.index, codec: stream.codec_name, width: stream.width,
          height: stream.height, fps: frameRate(stream.avg_frame_rate),
        })
      } else {
        audioTracks.push({
          index: stream.index, codec: stream.codec_name,
          sampleRate: finitePositive.parse(Number(stream.sample_rate)), channels: stream.channels,
        })
      }
    }
    if (!videoTracks.length && !audioTracks.length) throw new Error('The source has no audio or video streams.')
    let scenes: MediaScene[] = []
    if (input.analyzeScenes && videoTracks.length) {
      await runner.run([config.ffmpeg, '-nostdin', '-v', 'error', '-protocol_whitelist', 'file',
        '-format_whitelist', MEDIA_CONTAINER_FORMATS, '-i', input.source,
        '-map', '0:v:0', '-an', '-vf', `select=gt(scene\\,${config.sceneThreshold}),metadata=print:file=scene-cuts.txt`,
        '-f', 'null', '-'], work, signal)
      scenes = sceneRanges(await readBounded(join(work, 'scene-cuts.txt'), config.maxResultBytes), durationSeconds, config.maxScenes)
    }
    const recognized: MediaTranscript = !input.transcribe ? { state: 'not-requested' }
      : !audioTracks.length ? { state: 'unavailable', reason: 'no-audio' }
        : await transcript(runner, config, input.source, work, durationSeconds, signal)
    signal.throwIfAborted()
    const result = { durationSeconds, videoTracks, audioTracks, scenes, transcript: recognized }
    boundedText(JSON.stringify(result), config.maxResultBytes)
    return mediaAnalysisResultSchema.parse(result)
  } finally { await rm(work, { recursive: true, force: true }) }
}
