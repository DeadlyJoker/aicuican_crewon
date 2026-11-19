/** Compact Studio input summaries leave complete generation settings in the original Session text and trace. */
import { z } from 'zod'
import type { UserTextRule } from '@deepseek-ai/dsh-client-ui-conversation/client'

const input = z.object({ category: z.enum(['drama', 'create', 'interactive']),
  mode: z.enum(['write', 'adapt', 'produce', 'redraw', 'agent', 'image', 'video', 'audio', 'interactive']),
  options: z.object({ ratio: z.string().optional(), style: z.string().optional(), episodes: z.string().optional() }),
  productionEpisodes: z.string().nullable().optional(),
})
/** Creation fields used only by the localized display summary. */
export type StudioEntrySummary = z.infer<typeof input>

/**
 * @param summary - Locale-owned summary of the submitted mode and visible settings.
 * @returns Display-only transformation; unrelated or malformed text remains visible without modification.
 */
export function studioEntryTextRule(summary: (value: StudioEntrySummary) => string): UserTextRule {
  return { id: 'studio.entry-input', order: 5, match(text, from) {
    const marked = text.indexOf('\n\n[crewon-studio-input:v1]\n')
    const start = marked >= 0 ? marked : text.indexOf('\n\n执行目标：')
    if (start < from || start < 0) return undefined
    const marker = '\n用户确认的完整创作输入：\n', offset = text.indexOf(marker, start)
    if (offset < 0) return undefined
    let data: StudioEntrySummary
    try {
      const raw = text.slice(offset + marker.length), end = raw.indexOf('\n\n')
      data = input.parse(JSON.parse(end >= 0 ? raw.slice(0, end) : raw))
    }
    catch (_error) { return undefined } // Only complete Studio submissions receive a display summary.
    return { id: 'text', start, end: text.length, data: { text: text.slice(start), display: '\n\n' + summary(data) } }
  } }
}

/** @returns Display-only canvas action summary; complete instructions remain in the Session and trace. */
export function studioActionTextRule(): UserTextRule {
  const payload = z.object({ instruction: z.string().min(1).max(32000) })
  const marker = '\n\n[crewon-studio-action:v1]\n'
  return { id: 'studio.canvas-action', order: 6, match(text, from) {
    const start = text.indexOf(marker)
    if (start < from || start <= 0 || start > 240) return undefined
    try { payload.parse(JSON.parse(text.slice(start + marker.length))) }
    catch (_error) { return undefined } // Malformed submissions retain their complete visible input.
    return { id: 'text', start, end: text.length, data: { text: text.slice(start), display: '' } }
  } }
}
