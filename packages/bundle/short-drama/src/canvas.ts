/** Canvas layout storage is additive to the unchanged project and production records. */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type { DramaProjectId, DramaCanvasLayout } from './project-types.ts'

/** Positions use semantic keys (script, asset:<id>, shot:<id>) rather than a second content identity. */
export const canvasLayoutSchema = z.object({
  revision: z.number().int().nonnegative(),
  positions: z
    .record(z.string().max(160), z.object({ x: z.number(), y: z.number() }))
    .refine(value => Object.keys(value).length <= 2000),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number().min(0.1).max(4) }),
})

export type { DramaCanvasLayout } from './project-types.ts'

/** Separate layout domain leaves all existing script and media generations readable. */
export const canvasDomain = defineDomain({
  name: 'short_drama_canvas',
  version: 1,
  layout: 'per-record',
  tables: { layouts: domainTable<DramaProjectId, DramaCanvasLayout>(canvasLayoutSchema) },
})
