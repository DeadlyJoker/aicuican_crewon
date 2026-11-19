/** Read creation choices from the shared Studio document without inferring them from generated prose. */
import { z } from 'zod'
import type { StudioDocument } from './project-types.ts'

/** Original project choices, kept separately from the director's creative elaboration. */
export interface CreationPreferences {
  genre: string
  style: string
  stylePrompt?: string
  ratio: string
  episodes: number | null
}
const options = z.object({ genre: z.string().optional(), style: z.string().optional(), ratio: z.string().optional(),
  stylePrompt: z.string().optional(),
  episodes: z.union([z.string(), z.number()]).optional() })
const documentSchema = z.object({ referenceOptions: options.nullish(), referenceCreationSpec: options.nullish() })
/**
 * @param document - Native project UI document, including older entry records.
 * @returns Original choices when saved; null for projects without a creation record.
 */
export function readCreationPreferences(document: StudioDocument): CreationPreferences | null {
  const raw = document.storage['crewon-studio-demo-v1']
  if (!raw) return null
  const state = documentSchema.parse(JSON.parse(raw))
  if (!state.referenceCreationSpec && !state.referenceOptions) return null
  const value = { ...state.referenceOptions, ...state.referenceCreationSpec }
  const count = Number.parseInt(String(value.episodes ?? ''), 10)
  return { genre: value.genre || '默认题材', style: !value.style || value.style === '风格' ? '自动匹配' : value.style,
    ...(value.stylePrompt ? { stylePrompt: value.stylePrompt } : {}), ratio: value.ratio || '16:9', episodes: Number.isInteger(count) && count >= 1 && count <= 100 ? count : null }
}
