/** Native skill-centre operations supplied by the authenticated Host adapter. */
import type {
  ImportReport, ListPayload, SkillCreateRequest, SkillDocument, SkillImportRequest,
  SkillScope, SkillTarget, SkillToggleRequest, SkillTrashEntry, SkillUpdateRequest,
} from '../types.ts'

/** The page sends file identities and revisions back to the Host for every write. */
export interface SkillExplorerActions {
  /** Read the skill catalogue in the selected workspace. */
  list(this: void, scope: SkillScope): Promise<ListPayload>
  /** Read a file after the Host resolves its current skill identity. */
  read(this: void, target: SkillTarget): Promise<SkillDocument>
  /** Create a new instruction file without replacing an existing skill. */
  create(this: void, request: SkillCreateRequest): Promise<void>
  /** Save a definition only while its read revision remains current. */
  update(this: void, request: SkillUpdateRequest): Promise<void>
  /** Update the filesystem skill's model-invocation policy. */
  setEnabled(this: void, request: SkillToggleRequest): Promise<void>
  /** Move a file to recoverable storage and return its restore identity. */
  trash(this: void, target: SkillTarget): Promise<SkillTrashEntry>
  /** Restore one recoverable file without replacing a new file. */
  restore(this: void, entry: SkillTrashEntry): Promise<void>
  /** Import definitions and retain a per-file outcome. */
  importSkills(this: void, request: SkillImportRequest): Promise<ImportReport>
}
