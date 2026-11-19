/** Skill-centre requests shared by the authenticated Host API and native Client. */
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

/** User-facing purposes shared by skills, connections and local tools. */
export type ToolPurpose = 'writing' | 'research' | 'data' | 'development' | 'media' | 'general'

/** Editable presentation kept separately from native resource configuration. */
export interface ToolPresentation {
  /** User-visible resource name. */
  title: string
  /** Short explanation of the resource capability. */
  description: string
  /** Business purpose used by the toolbox filters. */
  purpose: ToolPurpose
}

/** Revision-fenced presentation metadata for the current toolbox. */
export interface ToolboxCatalogSnapshot {
  revision: number
  writable: boolean
  items: Record<string, ToolPresentation>
}

/** Filesystem and provider classification retained from the upstream skill explorer. */
export interface SkillEntry {
  name: string
  description: string
  whenToUse?: string
  provider?: string
  level: string
  path?: string
  fileState: 'editable' | 'provider-file' | 'virtual'
  linked?: boolean
  modelInvocable: boolean
  userInvocable: boolean
  workspaceRoot?: string
  workspaceName?: string
  isActiveWorkspace?: boolean
}

/** One source group in the skill catalogue. */
export interface GroupPayload {
  key: string
  title: string
  hint: string
  skills: SkillEntry[]
}

/** A catalogue snapshot for the selected workspace. */
export interface ListPayload {
  /** Maximum compressed archive size accepted by the configured importer, in bytes. */
  importLimitBytes: number
  cwd: string
  projectRoots: string[]
  complete: boolean
  groups: GroupPayload[]
  workspaces?: { root: string; name: string; active: boolean }[]
}

/** Import summary, including files skipped after an individual write failure. */
export interface ImportReport {
  level: string
  outcomes: {
    name: string
    origin: string
    status: 'imported' | 'skipped'
    reason?: 'invalid-frontmatter' | 'invalid-name' | 'too-large' | 'duplicate' | 'exists' | 'shadowed' | 'write-failed'
    path?: string
  }[]
  imported: number
  skipped: number
}

/** The workspace determines which project-local skill roots are visible. */
export interface SkillScope {
  workspaceId?: WorkspaceId
}

/** A file identity plus its last-read content revision. */
export interface SkillTarget extends SkillScope {
  name: string
  path: string
  revision?: string
}

/** Editable fields retain all other existing frontmatter fields on update. */
export interface SkillDraft {
  name: string
  description: string
  whenToUse?: string
  content: string
}

/** A selected file and the revision used for conflict detection. */
export interface SkillDocument extends SkillDraft {
  path: string
  revision: string
}

/** Destination of a newly authored or imported skill. */
export interface SkillDestination extends SkillScope {
  scope: 'user' | 'project'
}

/** A new skill definition and its storage destination. */
export interface SkillCreateRequest extends SkillDestination {
  draft: SkillDraft
}

/** A revision-fenced edit of one existing skill. */
export interface SkillUpdateRequest extends SkillTarget {
  revision: string
  draft: SkillDraft
}

/** Invocation permission change for a filesystem-backed skill. */
export interface SkillToggleRequest extends SkillTarget {
  enabled: boolean
}

/** Directory or archive import into one selected root. */
export interface SkillImportRequest extends SkillDestination {
  source: { kind: 'directory'; path: string } | { kind: 'archive'; data: string }
}

/** Recoverable trash identity returned after removing an instruction file. */
export interface SkillTrashEntry extends SkillScope {
  name: string
  path: string
  trashedPath: string
}
