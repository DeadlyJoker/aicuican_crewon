/** Expert discovery opens a native-preset conversation without submitting a message. */
import { IconUserOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClientSessionContext, InputTriggerSource, TokenSpan } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { ExpertCatalogEntry } from '../expert-types.ts'

/**
 * Match names, specialties and use cases with complete-word matching for short ASCII terms.
 * @param entries - Current catalogue rows.
 * @param query - User search text, matched case-insensitively by word.
 * @param category - An exact category id, or an empty string for all categories.
 * @returns Catalogue rows matching every term and the chosen category.
 */
export function filterExpertEntries(entries: readonly ExpertCatalogEntry[], query: string, category: string): ExpertCatalogEntry[] {
  const terms = query.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean)
    .map(term => /^[a-z0-9]{1,3}$/u.test(term) ? new RegExp(`(^|[^a-z0-9])${term}($|[^a-z0-9])`, 'u') : term)
  return entries.filter((entry) => {
    if (category !== '' && entry.category !== category) return false
    const fields = [entry.name, entry.description, ...entry.tags, ...entry.examples]
      .map(value => value.normalize('NFKC').toLocaleLowerCase())
    return terms.every(term => fields.some(value => typeof term === 'string' ? value.includes(term) : term.test(value)))
  })
}

/** The source draft and guarded trigger span retained when an expert is selected. */
export interface ExpertPickOrigin extends ClientSessionContext {
  readonly span: TokenSpan
}

/**
 * Offer catalogue experts from the native @ menu and hand selection to the navigation owner.
 * @param catalogue - Current built-in and saved experts, merged by identity.
 * @param label - Localized section title.
 * @param hint - Explains that selection opens a new conversation.
 * @param open - Captures the draft and opens a native expert conversation, reporting its own asynchronous failures.
 * @returns A discovery source that never submits or rewrites the active conversation.
 */
export function createExpertReferenceSource(
  catalogue: () => Promise<{ entries: ExpertCatalogEntry[] }>,
  label: () => string,
  hint: () => string,
  open: (entry: ExpertCatalogEntry, origin: ExpertPickOrigin) => void,
): InputTriggerSource {
  const choices = new Map<string, ExpertCatalogEntry>()
  return {
    trigger: '@', name: 'experts', order: -5,
    candidates: async (_session, request) => {
      const { entries } = await catalogue()
      request.signal.throwIfAborted()
      const matching = filterExpertEntries(entries, request.query, '')
        .sort((left, right) => Number(right.expert !== undefined) - Number(left.expert !== undefined))
        .slice(0, request.query.trim() ? 40 : 20)
      return matching.map((entry) => {
        const value = entry.expert ? `${entry.key}:${entry.expert.revision}` : entry.key
        choices.set(value, entry)
        return { name: entry.name, label: entry.name, description: entry.description, section: label(), hint: hint(),
          icon: IconUserOutlineRegular, value }
      })
    },
    onPick: ({ candidate, session, span }) => {
      const entry = candidate.value === undefined ? undefined : choices.get(candidate.value)
      if (entry === undefined) return undefined
      open(entry, { sessionId: session.sessionId, span })
      return 'handled'
    },
  }
}
