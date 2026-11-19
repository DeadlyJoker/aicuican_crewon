/** Validate editing decisions at client, tool and durable-data boundaries. */
import { brandString } from '@deepseek-ai/dsh-brand'
import { z } from 'zod'
import type { DramaEditClipId, DramaTrackId } from './edit-types.ts'
import type { DramaMediaId } from './production-types.ts'
import type { MediaAnalysisId } from './media-analysis-types.ts'

const placement = {
  id: z.uuid().transform(brandString<DramaEditClipId>),
  startFrame: z.number().int().min(0).max(864000),
  frames: z.number().int().min(1).max(864000),
}
const source = {
  mediaId: z.uuid().transform(brandString<DramaMediaId>),
  sourceStartFrame: z.number().int().min(0).max(864000),
  volume: z.number().min(0).max(2),
}
const track = {
  id: z.uuid().transform(brandString<DramaTrackId>), name: z.string().trim().min(1).max(80), muted: z.boolean(),
}
const video = z.object({ ...placement, ...source, opacity: z.number().min(0).max(1),
  transform: z.object({ x: z.number().min(-2).max(2), y: z.number().min(-2).max(2),
    width: z.number().min(0.01).max(4), height: z.number().min(0.01).max(4) }).strict(),
}).strict()
const audio = z.object({ ...placement, ...source }).strict()
const subtitle = z.object({ ...placement, text: z.string().trim().min(1).max(4000)
  .refine(value => !/<\/?[a-z][^>]*>|\{\s*\\|\{[cfopsy]:/iu.test(value), 'Use plain subtitle text without style tags') }).strict()

/** Bounded, path-free and effect-free timeline accepted by the renderer. */
export const editTimelineSchema = z.object({
  version: z.literal(1), tracks: z.array(z.discriminatedUnion('kind', [
    z.object({ ...track, kind: z.literal('video'), clips: z.array(video).max(500) }).strict(),
    z.object({ ...track, kind: z.literal('audio'), clips: z.array(audio).max(500) }).strict(),
    z.object({ ...track, kind: z.literal('subtitle'), clips: z.array(subtitle).max(500), transcript: z.object({
      analysisId: z.uuid().transform(brandString<MediaAnalysisId>), clipId: z.uuid().transform(brandString<DramaEditClipId>),
    }).strict().optional() }).strict(),
  ])).min(1).max(32),
}).strict().superRefine((edit, ctx) => {
  const identities = new Set<string>()
  let count = 0
  for (const item of edit.tracks) {
    if (identities.has(item.id)) ctx.addIssue({ code: 'custom', message: 'Duplicate edit identity' })
    identities.add(item.id)
    let end = 0
    for (const clip of [...item.clips].sort((a, b) => a.startFrame - b.startFrame)) {
      if (identities.has(clip.id)) ctx.addIssue({ code: 'custom', message: 'Duplicate edit identity' })
      identities.add(clip.id)
      if (clip.startFrame < end || clip.startFrame + clip.frames > 864000) {
        ctx.addIssue({ code: 'custom', message: 'Overlapping or out-of-range track clips' })
      }
      end = clip.startFrame + clip.frames
      count++
    }
  }
  if (count > 500) ctx.addIssue({ code: 'custom', message: 'Too many edit clips' })
})
