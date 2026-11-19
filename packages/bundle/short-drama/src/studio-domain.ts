/** Additive project workspaces and complete Studio view documents preserve legacy project records. */
import { entrySourceSchema } from './entry-source.ts'
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { brandString } from '@deepseek-ai/dsh-brand'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { StudioDocument, DramaProjectId } from './project-types.ts'

/** Host-owned UI document; values retain the prototype's complete serializable state. */
export const studioDocumentSchema = z.object({ revision: z.number().int().nonnegative(), storage: z.record(z.string(), z.string()) })
/** Shared Web/Desktop Studio document. */
export type { StudioDocument } from './project-types.ts'
/** Native workspace association and reserved initial conversation. */
export const studioWorkspaceSchema = z.object({
  workspaceId: z.string().transform(brandString<WorkspaceId>),
  sessionId: z.string().transform(SessionId),
})
/** Separate domains leave all released project and production generations intact. */
export const studioDomain = defineDomain({ name: 'short_drama_studio', version: 1, layout: 'per-record', tables: {
  uploads: domainTable<string, {
    projectId: DramaProjectId
    frame: number
    name: string
    mimeType: string
    file: string
    bytes: number }>(z.object({
    projectId: z.string().transform(brandString<DramaProjectId>), frame: z.number().int(), name: z.string(),
    mimeType: z.string(), file: z.string(), bytes: z.number().int().nonnegative(),
  })),
  entry_documents: domainTable<'landing', StudioDocument>(studioDocumentSchema),
  entry_sources: domainTable<import('./project-types.ts').EntrySourceId, import('./entry-source.ts').EntrySource>(entrySourceSchema),
  entries: domainTable<'landing', z.infer<typeof studioWorkspaceSchema>>(studioWorkspaceSchema),
  documents: domainTable<DramaProjectId, StudioDocument>(studioDocumentSchema),
  workspaces: domainTable<DramaProjectId, z.infer<typeof studioWorkspaceSchema>>(studioWorkspaceSchema),
} })
