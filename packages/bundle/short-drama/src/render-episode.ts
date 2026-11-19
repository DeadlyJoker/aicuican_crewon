/** Assemble adopted clips into a verified MP4 and subtitle sidecar. */
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { z } from 'zod'

/** An adopted clip resolved to Host-owned local files. Times are relative to the source. */
export interface TimelineClip {
  video: string
  hasAudio: boolean
  voice?: string | undefined
  startFrame: number
  frames: number
  subtitle?: string | undefined
}

/** Local encoder and probe operations with a bounded Host command runner. */
export interface EpisodeEncoder {
  ffmpeg: string
  ffprobe: string
  run(argv: readonly string[], cwd: string, signal: AbortSignal): Promise<string>
}

/** Target resolution and frame rate captured by the export request. */
export interface EpisodeFormat {
  width: number
  height: number
  fps: number
}

/** Files published after verifying the completed timeline. */
export interface EpisodeExport {
  video: string
  subtitle?: string
  frames: number
}

const positiveInteger = z.number().int().positive()
const formatSchema = z.object({
  width: positiveInteger.refine(value => value % 2 === 0),
  height: positiveInteger.refine(value => value % 2 === 0),
  fps: positiveInteger,
})
const clipSchema = z.object({
  video: z.string().refine(isAbsolute),
  voice: z.string().refine(isAbsolute).optional(),
  hasAudio: z.boolean(),
  startFrame: z.number().int().nonnegative(),
  frames: positiveInteger,
  subtitle: z.string().optional(),
})
const probeSchema = z.object({
  streams: z.array(z.object({ codec_type: z.string(), nb_frames: z.string().optional() })),
})

function timestamp(frames: number, fps: number): string {
  const ms = Math.round(frames * 1000 / fps)
  const hms = [Math.floor(ms / 3_600_000), Math.floor(ms / 60_000) % 60, Math.floor(ms / 1_000) % 60]
  return hms.map(value => String(value).padStart(2, '0')).join(':') + ',' + String(ms % 1000).padStart(3, '0')
}

function renderArguments(clips: readonly TimelineClip[], format: EpisodeFormat) {
  const { width, height, fps } = format
  const inputs: string[] = []
  const filters: string[] = []
  const segments: string[] = []
  const subtitles: string[] = []
  let input = 0
  let total = 0
  for (const [index, clip] of clips.entries()) {
    const video = input++
    inputs.push('-protocol_whitelist', 'file', '-i', clip.video)
    const endFrame = clip.startFrame + clip.frames
    const start = clip.startFrame / fps
    const seconds = clip.frames / fps
    filters.push(`[${video}:v:0]fps=${fps},trim=start_frame=${clip.startFrame}:end_frame=${endFrame},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${index}]`)
    if (clip.voice || clip.hasAudio) {
      const audio = clip.voice ? input++ : video
      if (clip.voice) inputs.push('-protocol_whitelist', 'file', '-i', clip.voice)
      filters.push(`[${audio}:a:0]atrim=start=${clip.voice ? 0 : start},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${seconds}[a${index}]`)
    } else {
      filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${seconds}[a${index}]`)
    }
    segments.push(`[v${index}][a${index}]`)
    const subtitle = clip.subtitle?.replace(/\r\n?/gu, '\n').split('\n').map(line => line.trim()).filter(Boolean).join('\n')
    if (subtitle) {
      subtitles.push(`${subtitles.length + 1}\n${timestamp(total, fps)} --> ${timestamp(total + clip.frames, fps)}\n${subtitle}\n`)
    }
    total += clip.frames
  }
  filters.push(`${segments.join('')}concat=n=${clips.length}:v=1:a=1[v][a]`)
  return { inputs, filters, subtitles, total, input }
}

/**
 * Render in a fresh private directory and return files after probing their streams.
 * @param encoder - Host-configured executable names and runner.
 * @param root - Existing private output directory.
 * @param clips - Ordered adopted assets with trim intervals at the target frame rate.
 * @param format - Target canvas and frame rate.
 * @param signal - Export cancellation.
 * @returns Paths to the verified MP4 and optional SRT.
 */
export async function renderEpisode(
  encoder: EpisodeEncoder, root: string, clips: readonly TimelineClip[], format: EpisodeFormat, signal: AbortSignal,
): Promise<EpisodeExport> {
  const validated = z.array(clipSchema).min(1).parse(clips)
  const target = formatSchema.parse(format)
  const { inputs, filters, subtitles, total, input } = renderArguments(validated, target)
  signal.throwIfAborted()
  const work = await mkdtemp(join(root, 'episode-'))
  const draft = join(work, 'rendering.mp4')
  const video = join(work, 'episode.mp4')
  const subtitle = subtitles.length ? join(work, 'episode.srt') : undefined
  try {
    if (subtitle) await writeFile(subtitle, subtitles.join('\n'), { mode: 0o600 })
    await encoder.run([
      encoder.ffmpeg, '-nostdin', '-hide_banner', '-loglevel', 'error', ...inputs,
      ...subtitle ? ['-protocol_whitelist', 'file', '-i', subtitle] : [],
      '-filter_complex', filters.join(';'), '-map', '[v]', '-map', '[a]',
      ...subtitle ? ['-map', `${input}:s:0`, '-c:s', 'mov_text'] : [],
      '-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart', draft,
    ], work, signal)
    const facts = probeSchema.parse(JSON.parse(await encoder.run([
      encoder.ffprobe, '-v', 'error', '-show_entries', 'stream=codec_type,nb_frames', '-of', 'json', draft,
    ], work, signal)))
    if (Number(facts.streams.find(stream => stream.codec_type === 'video')?.nb_frames) !== total
      || !facts.streams.some(stream => stream.codec_type === 'audio')
      || (subtitle !== undefined && !facts.streams.some(stream => stream.codec_type === 'subtitle'))) {
      throw new Error('The exported streams do not match the timeline.')
    }
    signal.throwIfAborted()
    await rename(draft, video)
    return subtitle ? { video, subtitle, frames: total } : { video, frames: total }
  } catch (error) {
    await rm(work, { recursive: true, force: true })
    throw error
  }
}
