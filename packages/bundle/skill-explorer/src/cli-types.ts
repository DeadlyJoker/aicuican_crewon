/** Named command recipes and their execution-device observations. */
import z from '@deepseek-ai/schemastery'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

/** Stable recipe identity used by settings and model tool registration. */
export type CliToolId = Branded<'CliToolId'>

/** A user-configured executable with fixed arguments and an optional input placeholder. */
export interface CliRecipe {
  /** User-visible action name. */
  name: string
  /** Outcome this action provides. */
  description: string
  /** Product use-case group used by the toolbox. */
  category: string
  /** Executable name or absolute path in the execution environment. */
  command: string
  /** Fixed arguments; `{input}` placeholders receive the single supplied input. */
  args: string[]
  /** Fixed arguments for the explicit version probe. */
  versionArgs: string[]
  /** Whether the recipe is published as a model tool and accepts manual runs. */
  enabled: boolean
}

/** Recipe fields remain editable through the owning plugin's native Settings form. */
export const CliRecipeSchema: z<CliRecipe> = z.object({
  name: z.string().min(1).pattern(/^[^\0]+$/).required(),
  description: z.string().min(1).pattern(/^[^\0]+$/).required(),
  category: z.string().min(1).default('general'),
  command: z.string().min(1).pattern(/^[^\0]+$/).required(),
  args: z.array(z.string().pattern(/^[^\0]*$/)).default([]),
  versionArgs: z.array(z.string().pattern(/^[^\0]*$/)).default(['--version']),
  enabled: z.boolean().default(true),
})

/** Native Settings dictionary containing all configured recipes. */
export const CliToolsSchema: z<Record<string, CliRecipe>, Record<string, CliRecipe>, 'defined'> =
  z.dict(CliRecipeSchema, z.string().pattern(/^[a-z][a-z0-9-]{0,39}$/)).default({})

/** Executable lookup reflects the actual subprocess provider's execution environment. */
export type CliAvailability =
  | { state: 'ready'; executable: string }
  | { state: 'missing'; message: string }
  | { state: 'failed'; message: string }

/** One configured recipe shown in the toolbox. */
export interface CliToolView extends CliRecipe {
  id: CliToolId
  toolName: string
  inherited: boolean
  availability: CliAvailability
}

/** Current native Settings revision and actual Host identification. */
export interface CliCatalogue {
  revision: number
  host: string
  tools: CliToolView[]
}

/** A revision-fenced recipe write. */
export interface CliSaveRequest {
  id: CliToolId
  recipe: CliRecipe
  expectedRevision: number
}

/** A revision-fenced removal of a user-owned recipe. */
export interface CliRemoveRequest {
  id: CliToolId
  expectedRevision: number
}

/** Exact recipe selected for a version check. */
export interface CliTarget {
  id: CliToolId
}

/** User input is substituted inside individual argv items, never interpreted as a shell command. */
export interface CliRunRequest extends CliTarget {
  input: string
  workspaceId?: WorkspaceId
}

/** Orthogonal execution outcome flags and bounded command output. */
export interface CliRunResult {
  id: CliToolId
  name: string
  cwd: string
  executable: string
  stdout: string
  stderr: string
  exitCode: number | null
  signal: string | null
  timedOut: boolean
  aborted: boolean
  truncated: boolean
}

/** Version-check result, including lookup failures without spawning a process. */
export type CliProbeResult =
  | { state: 'ready'; executable: string; version: string; result: CliRunResult }
  | { state: 'missing' | 'failed'; message: string }
