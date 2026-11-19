/** Shared project records for the workbench and project-scoped Agent tools. */
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Identity of a project owned by the current Host profile. */
export type DramaProjectId = Branded<'DramaProjectId'>

/** Identity of one immutable imported creation source. */
export type EntrySourceId = Branded<'EntrySourceId'>

/** Identity of an immutable script revision. */
export type DramaScriptId = Branded<'DramaScriptId'>

/** Project catalogue entry and revision for optimistic edits. */
export interface DramaProjectSummary {
  id: DramaProjectId
  title: string
  revision: number
}

/** Script candidate retained after replacement or adoption. */
export interface DramaScriptRevision {
  id: DramaScriptId
  body: string
  createdAt: number
}

/** Editable synopsis and script history for the selected project. */
export interface DramaProject extends DramaProjectSummary {
  synopsis: string
  scripts: DramaScriptRevision[]
  adoptedScriptId: DramaScriptId | null
}

/** Saved semantic content positions and viewport; layout revisions do not change content versions. */
export interface DramaCanvasLayout {
  revision: number
  positions: Record<string, { x: number; y: number }>
  viewport: { x: number; y: number; zoom: number }
}

/** Host-owned complete Studio view document, shared by Web and Desktop. */
export interface StudioDocument {
  revision: number
  storage: Record<string, string>
}
