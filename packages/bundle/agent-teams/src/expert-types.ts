/** Saved expert identities and immutable execution revisions. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Actual expert composition recorded by one direct child Session. */
export interface ExpertExecution {
  sessionId: SessionId
  memberName: string
  preset: string
  expertName: string
}

/**
 * Editable expert instructions and base preset used to create an immutable execution revision.
 */
export interface ExpertDraft {
  name: string
  description: string
  prompt: string
  basePreset: string
  provider?: string
  model?: string
  category?: string
  tags?: string[]
  examples?: string[]
  sourceSlug?: string
  sourceRevision?: string
}
/** One reusable expert. Its preset points to an immutable saved revision. */
export interface ExpertDefinition extends ExpertDraft {
  id: string
  revision: number
  preset: string
}

/** Localized category names shared by the bundled catalogue and saved experts. */
export interface ExpertCategory {
  id: string
  name: string
  nameEn: string
}

/** Searchable expert metadata. Bundled instructions are loaded only when selected. */
export interface ExpertCatalogEntry {
  key: string
  name: string
  description: string
  category: string
  tags: string[]
  examples: string[]
  builtinSlug?: string
  expert?: ExpertDefinition
}

/** Host-configured limits and native capabilities for bundled expert activation. */
export interface ExpertConfiguration {
  maxPromptLength: number
  builtinBasePreset: string
}
