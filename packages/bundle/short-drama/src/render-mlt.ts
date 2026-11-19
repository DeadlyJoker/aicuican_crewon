/** Compile project editing decisions into an MLT composition and verified delivery files. */
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { DramaEditTimeline } from './edit-types.ts'
import type { EpisodeEncoder, EpisodeExport, EpisodeFormat } from './render-episode.ts'

type EditTrack = DramaEditTimeline['tracks'][number]
type ResolvedVideo = Omit<Extract<EditTrack, { kind: 'video' }>['clips'][number], 'mediaId'> & { path: string; hasAudio: boolean }
type ResolvedAudio = Omit<Extract<EditTrack, { kind: 'audio' }>['clips'][number], 'mediaId'> & { path: string }

/** Host-resolved edit: paths are admitted by the owning project's media archive. */
export interface MltTimeline {
  tracks: (Omit<Extract<EditTrack, { kind: 'video' }>, 'clips'> & { clips: ResolvedVideo[] }
    | Omit<Extract<EditTrack, { kind: 'audio' }>, 'clips'> & { clips: ResolvedAudio[] }
    | Extract<EditTrack, { kind: 'subtitle' }>)[]
}

function xml(value: string | number): string {
  return String(value).replace(/[&<>"']/gu, (char) => {
    switch (char) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      default: return '&apos;'
    }
  })
}

function property(name: string, value: string | number): string {
  return `<property name="${xml(name)}">${xml(value)}</property>`
}

function stamp(frames: number, fps: number): string {
  const ms = Math.round(frames * 1000 / fps)
  return [Math.floor(ms / 3_600_000), Math.floor(ms / 60_000) % 60, Math.floor(ms / 1000) % 60]
    .map(value => String(value).padStart(2, '0')).join(':') + ',' + String(ms % 1000).padStart(3, '0')
}

function composition(timeline: MltTimeline, format: EpisodeFormat): { source: string; subtitles: string; total: number } {
  const total = Math.max(0, ...timeline.tracks.flatMap(track => track.clips.map(clip => clip.startFrame + clip.frames)))
  if (total === 0) throw new Error('An edit must contain at least one clip.')
  const end = total - 1
  const producers: string[] = []
  const playlists: string[] = []
  const tracks = ['<track producer="background-track"/>']
  const transitions: string[] = []
  const cues: { startFrame: number; frames: number; text: string }[] = []
  let sourceId = 0
  for (const track of timeline.tracks) {
    if (track.kind === 'subtitle') {
      if (!track.muted) cues.push(...track.clips)
      continue
    }
    const trackIndex = tracks.length
    const entries: string[] = []
    let cursor = 0
    for (const clip of [...track.clips].sort((a, b) => a.startFrame - b.startFrame)) {
      if (clip.startFrame < cursor) throw new Error('Clips on one track must not overlap.')
      if (clip.startFrame > cursor) entries.push(`<blank length="${clip.startFrame - cursor}"/>`)
      const id = `media-${sourceId++}`
      const volume = track.muted ? 0 : clip.volume
      const audioIndex = track.kind === 'video' && !('hasAudio' in clip && clip.hasAudio) ? -1 : 0
      producers.push(`<chain id="${id}">${property('resource', clip.path)}${property('mlt_service', 'avformat')}`
        + `${property('eof', 'pause')}${property('audio_index', audioIndex)}${track.kind === 'audio' ? property('video_index', -1) : ''}`
        + `<filter>${property('mlt_service', 'avfilter.volume')}${property('av.volume', volume)}</filter></chain>`)
      entries.push(`<entry producer="${id}" in="${clip.sourceStartFrame}" out="${clip.sourceStartFrame + clip.frames - 1}"/>`)
      if (track.kind === 'video' && 'transform' in clip) {
        const rect = clip.transform
        const geometry = `${rect.x * format.width} ${rect.y * format.height} ${rect.width * format.width} ${rect.height * format.height} ${clip.opacity}`
        transitions.push(`<transition in="${clip.startFrame}" out="${clip.startFrame + clip.frames - 1}">`
          + `${property('mlt_service', 'affine')}${property('a_track', 0)}${property('b_track', trackIndex)}`
          + `${property('rect', geometry)}${property('distort', 0)}${property('halign', 'center')}${property('valign', 'middle')}</transition>`)
      }
      cursor = clip.startFrame + clip.frames
    }
    if (cursor < total) entries.push(`<blank length="${total - cursor}"/>`)
    playlists.push(`<playlist id="track-${trackIndex}">${entries.join('')}</playlist>`)
    tracks.push(`<track producer="track-${trackIndex}" hide="${track.kind === 'audio' ? 'video' : 'none'}"/>`)
    transitions.push(`<transition in="0" out="${end}">${property('mlt_service', 'mix')}${property('a_track', 0)}`
      + `${property('b_track', trackIndex)}${property('sum', 1)}${property('always_active', 1)}</transition>`)
  }
  const subtitles = cues.sort((a, b) => a.startFrame - b.startFrame).map((cue, index) =>
    `${index + 1}\n${stamp(cue.startFrame, format.fps)} --> ${stamp(cue.startFrame + cue.frames, format.fps)}\n${cue.text.replace(/\r\n?/gu, '\n').replace(/\n\s*\n/gu, '\n').trim()}\n`).join('\n')
  const profile = `<profile description="CrewON edit" width="${format.width}" height="${format.height}" frame_rate_num="${format.fps}" frame_rate_den="1" progressive="1" sample_aspect_num="1" sample_aspect_den="1" display_aspect_num="${format.width}" display_aspect_den="${format.height}" colorspace="709"/>`
  const source = `<?xml version="1.0" encoding="utf-8"?><mlt producer="composition">${profile}`
    + `<producer id="background" in="0" out="${end}">${property('mlt_service', 'color')}${property('resource', 'black')}${property('length', total)}</producer>`
    + `<playlist id="background-track"><entry producer="background" in="0" out="${end}"/></playlist>`
    + producers.join('') + playlists.join('') + `<tractor id="composition" in="0" out="${end}"><multitrack>${tracks.join('')}</multitrack>`
    + transitions.join('') + `<filter>${property('mlt_service', 'avfilter.alimiter')}${property('av.level', 0)}${property('av.latency', 1)}${property('av.limit', 0.95)}</filter></tractor></mlt>`
  return { source, subtitles, total }
}

const probeSchema = z.object({
  streams: z.array(z.object({ codec_type: z.string(), nb_frames: z.string().optional() })),
})

/**
 * Render a frame-addressed MLT composition; failure removes all partial outputs.
 * @param encoder - Configured MLT and FFmpeg executables with the managed Host runner.
 * @param root - Existing private project output directory.
 * @param timeline - Project-admitted local media, track order bottom to top.
 * @param format - Output dimensions and frame rate.
 * @param signal - Cancellation observed by every subprocess and before publication.
 * @returns Verified MP4 and the confirmed subtitle sidecar, when present.
 */
export async function renderMltEpisode(
  encoder: EpisodeEncoder & { melt: string }, root: string, timeline: MltTimeline, format: EpisodeFormat, signal: AbortSignal,
): Promise<EpisodeExport> {
  const { source, subtitles, total } = composition(timeline, format)
  signal.throwIfAborted()
  const work = await mkdtemp(join(root, 'edit-'))
  const draft = join(work, 'rendering.mp4')
  const video = join(work, 'episode.mp4')
  const subtitle = subtitles ? join(work, 'episode.srt') : undefined
  try {
    await writeFile(join(work, 'composition.mlt'), source, { mode: 0o600 })
    if (subtitle) await writeFile(subtitle, subtitles, { mode: 0o600 })
    await encoder.run([encoder.melt, join(work, 'composition.mlt'), '-silent', '-consumer', `avformat:${join(work, 'composition.mkv')}`,
      'f=matroska', 'vcodec=ffv1', 'acodec=pcm_f32le', 'ar=48000', 'channels=2', 'real_time=-1', 'in=0', `out=${total - 1}`], work, signal)
    await encoder.run([encoder.ffmpeg, '-nostdin', '-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file',
      '-i', join(work, 'composition.mkv'), '-map', '0:v:0', '-map', '0:a:0',
      ...subtitle ? ['-vf', 'subtitles=episode.srt'] : [],
      '-frames:v', String(total), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', draft], work, signal)
    const facts = probeSchema.parse(JSON.parse(await encoder.run([encoder.ffprobe, '-v', 'error', '-show_entries',
      'stream=codec_type,nb_frames', '-of', 'json', draft], work, signal)))
    if (Number(facts.streams.find(stream => stream.codec_type === 'video')?.nb_frames) !== total
      || !facts.streams.some(stream => stream.codec_type === 'audio')
      || facts.streams.some(stream => stream.codec_type === 'subtitle')) {
      throw new Error('The exported streams do not match the multitrack edit.')
    }
    signal.throwIfAborted()
    await rename(draft, video)
    await rm(join(work, 'composition.mkv'))
    await rm(join(work, 'composition.mlt'))
    return subtitle ? { video, subtitle, frames: total } : { video, frames: total }
  } catch (error) {
    await rm(work, { recursive: true, force: true })
    throw error
  }
}
