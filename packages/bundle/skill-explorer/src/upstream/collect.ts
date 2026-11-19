/**
 * Skill collection adapted from dsh-skill-explorer 0.4.15 (BSD-3-Clause).
 * Modified for CrewON with bounded reads, linked-file detection and read-only bundled roots.
 *
 * The list combines a preset-scoped native snapshot with fresh scans of
 * configured editable roots. Files contributed by other providers remain
 * read-only until their directory is explicitly configured for management.
 */

import { existsSync } from 'node:fs'
import { lstat, readdir, realpath, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { parseFrontmatter } from './frontmatter.ts'
import { readSkillFile } from './files.ts'

/** Display order and copy for each source level. */
export interface SourceGroup {
  key: string
  title: string
  hint: string
}

/** Source levels produced by filesystem scanning (registry sources map to the same set). */
export const SOURCE_GROUPS: SourceGroup[] = [
  { key: 'bundled', title: 'System bundled', hint: 'Global skills shipped with CrewON and its plugins' },
  { key: 'project-dsh', title: 'Project skills (.dsh/skills)', hint: 'Located in the project directory, scoped to its workspace' },
  { key: 'project-agents', title: 'Project skills (.agents/skills)', hint: 'Located in the project directory, scoped to its workspace' },
  { key: 'custom', title: 'Custom directories', hint: 'customSkillDirs config' },
  { key: 'user-dsh', title: 'User skills (~/.dsh/skills)', hint: 'Global skills shared by all projects on this machine' },
  { key: 'user-agents', title: 'User skills (~/.agents/skills)', hint: 'Global skills shared by all projects on this machine' },
  { key: 'runtime', title: 'Runtime registered', hint: 'Skills registered at runtime by plugins' },
]

/** Registry source -> display level mapping (unlisted sources fall into "other"). */
export const REGISTRY_SOURCE_LEVEL: ReadonlyMap<string, string> = new Map(SOURCE_GROUPS.map(group => [group.key, group.key]))

/**
 * The official skill-name grammar.
 *
 * One definition serves both this scan and the write routes, so a name the
 * panel accepts is one the official registry loads: lowercase alphanumeric
 * segments joined by single hyphens, never a leading, trailing or doubled
 * hyphen. Mirrors isSkillName in @deepseek-ai/dsh-skill.
 */
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Whether a string is a skill name the official registry accepts.
 * @param name - candidate skill name.
 * @returns whether it matches the official skill-name grammar.
 */
export function isSkillName(name: string): boolean {
  return SKILL_NAME_PATTERN.test(name)
}

/**
 * Official precedence rank per source (lower wins): the values
 * @deepseek-ai/dsh-skill-filesystem assigns its roots plus the registry's
 * runtime rank. A duplicate name resolves by this rank across every source the
 * panel shows, so the entry it displays is the one the model receives. Note
 * runtime (250) sits between the project roots and the custom root, not last.
 */
export const SKILL_SOURCE_RANK: ReadonlyMap<string, number> = new Map([
  ['project-dsh', 100],
  ['project-agents', 200],
  ['runtime', 250],
  ['custom', 300],
  ['user-dsh', 400],
  ['user-agents', 500],
  ['bundled', 600],
])

/** Unknown or foreign sources rank below every known source. */
const UNKNOWN_SOURCE_RANK = 999

/**
 * Precedence rank of a display level (see SKILL_SOURCE_RANK).
 * @param level - a source level key or an other:<source> bucket.
 * @returns the rank; unknown levels rank last.
 */
export function rankOf(level: string): number {
  return SKILL_SOURCE_RANK.get(level) ?? UNKNOWN_SOURCE_RANK
}

/**
 * How the panel classifies what backs a skill locally.
 *
 * - `editable`: a filesystem scan resolved the SKILL.md, so the entry carries
 *   the `path` the write routes accept.
 * - `provider-file`: the official registry reports a real instruction file
 *   (`SkillSummary.path`) that this panel's scan did not resolve. The file
 *   exists — saying otherwise is issue #1842 — but it is not a path the write
 *   routes trust, so no row control may be offered for it.
 * - `virtual`: the registry reports no instruction file at all; "no local
 *   file" is the accurate statement.
 */
export type SkillFileState = 'editable' | 'provider-file' | 'virtual'

/** One skill entry as served to the panel. */
export interface SkillEntry {
  name: string
  description: string
  whenToUse?: string
  provider?: string
  level: string
  path?: string
  /** What backs this skill locally (see SkillFileState). */
  fileState: SkillFileState
  /** True when the skill was discovered through a symlink entry (deletion is not allowed). */
  linked?: boolean
  modelInvocable: boolean
  userInvocable: boolean
  /** Project workspace root path this skill belongs to. */
  workspaceRoot?: string
  /** Display name of the workspace directory. */
  workspaceName?: string
  /** True when the skill belongs to the primary active session workspace. */
  isActiveWorkspace?: boolean
}

/** Registry snapshot entry shape (subset of ctx.skills entries). */
export interface RegistrySkill {
  name: string
  description: string
  whenToUse?: string
  provider?: string
  source: string
  /**
   * Absolute instruction file path the provider reports
   * (`SkillSummary.path` in @deepseek-ai/dsh-skill: "Absolute instruction file
   * path when supplied by the provider; absent for virtual skills"). This is
   * the field that distinguishes a provider-backed skill with a real SKILL.md
   * from a virtual one — NOT `resourceBase`, which names a directory of
   * relative resources rather than an instruction file.
   */
  path?: string
  resourceBase?: { kind: string; path?: string }
  invocation?: { modelInvocable?: boolean; userInvocable?: boolean }
}

/** Options for collectSkills. */
export interface CollectOptions {
  /** Registry snapshot workspace base. */
  cwd: string
  /** Project roots to scan (each scans .dsh/skills and .agents/skills). */
  projectRoots?: string[]
  /** Extra custom skill roots (the plugin's own config plus every live provider row). */
  customSkillDirs?: string[]
  /** Trusted packaged skill roots, displayed as read-only. */
  bundledSkillDirs?: string[]
  /** Maximum bytes read from one local instruction file. */
  maximumBytes: number
  /** User dsh config root (~/.dsh). */
  dshHome: string
  /** User agents config root (~/.agents). */
  agentsHome: string
  /** ctx.skills registry (snapshot). */
  registry: { snapshot(options: { cwd: string }): Promise<{ skills: RegistrySkill[]; complete: boolean }> }

}

/** Result of a collection pass. */
export interface CollectResult {
  skills: SkillEntry[]
  complete: boolean
}

/** Group payload served by the list route. */
export interface GroupPayload {
  key: string
  title: string
  hint: string
  skills: SkillEntry[]
}

/** Workspace descriptor for multi-workspace isolation. */
export interface WorkspaceItem {
  root: string
  name: string
  active: boolean
}

/** List payload served by the list route. */
export interface ListPayload {
  cwd: string
  projectRoots: string[]
  complete: boolean
  groups: GroupPayload[]
  workspaces?: WorkspaceItem[]
}

/** Find the nearest ancestor directory containing .git (cwd itself when none).
 * @param cwd - Selected workspace directory.
 * @returns Repository root or the original workspace directory.
 */
export function findProjectRoot(cwd: string): string {
  let current = cwd
  for (;;) {
    if (existsSync(join(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) return cwd
    current = parent
  }
}

/**
 * Normalize a custom-root list: drop blanks, resolve each entry to an absolute
 * path, and de-duplicate.
 *
 * Two sources can name the same root — the plugin's own `customSkillDirs` and
 * the live `skill-filesystem` row config — and the official provider resolves
 * every configured root with `resolve()` before scanning it. Matching that
 * here keeps the scanned identity equal to the path the write routes later
 * re-resolve, so a toggle or delete addresses the file the panel displayed.
 * @param dirs - configured custom skill roots (possibly empty or duplicated).
 * @returns absolute, de-duplicated, non-empty roots in first-seen order.
 */
export function normalizeSkillRoots(dirs: readonly string[]): string[] {
  const seen = new Set<string>()
  const roots: string[] = []
  for (const dir of dirs) {
    if (typeof dir !== 'string' || dir.trim() === '') continue
    const root = resolve(dir)
    if (seen.has(root)) continue
    seen.add(root)
    roots.push(root)
  }
  return roots
}

/**
 * Scan one skill root (one level: <name>/SKILL.md or <name>.md).
 * Async IO via fs/promises so multiple roots can be scanned in parallel.
 */
async function scanSkillRoot(
  root: string,
  level: string,
  into: Map<string, SkillEntry>,
  workspaceInfo?: { root: string; name: string; active: boolean },
  skipSystem = false,
  maximumBytes = 64 * 1024,
): Promise<void> {
  if (!existsSync(root)) return
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const name = entry.name
    // The official filesystem provider reserves the .system entry under the
    // user .dsh root for harness-internal bookkeeping and never lists it.
    if (skipSystem && name === '.system') continue
    let file: string
    let linked = await realpath(root) !== resolve(root)
    if (entry.isDirectory()) {
      file = join(root, name, 'SKILL.md')
    } else if (entry.isFile() && name.endsWith('.md')) {
      file = join(root, name)
    } else if (entry.isSymbolicLink()) {
      // A symlink's dirent is neither a directory nor a file, so a plain
      // readdir() skips it and linked-out skills never show up. Follow the
      // target with stat() (cross-platform: Windows symlink/junction, Linux and
      // macOS symlink all resolve the same way) to classify it, then resolve
      // the file path like a real entry — the scan path stays on the link, so
      // the write route (set-enabled) reaches the linked target via the normal
      // fs follow semantics. Dangling or unreadable links are skipped.
      // A linked skill is mount-of-intent content, not created under this root:
      // it stays listable and toggleable, but deletion is refused (see routes).
      linked = true
      let linkedFile: string
      try {
        const target = await stat(join(root, name))
        if (target.isDirectory()) linkedFile = join(root, name, 'SKILL.md')
        else if (target.isFile() && name.endsWith('.md')) linkedFile = join(root, name)
        else continue
      } catch {
        continue
      }
      file = linkedFile
    } else {
      continue
    }
    if (!existsSync(file)) continue
    let content: string
    try {
      linked ||= (await lstat(file)).isSymbolicLink()
      content = (await readSkillFile(linked ? await realpath(file) : file, maximumBytes)).content
    } catch {
      continue
    }
    const parsed = parseFrontmatter(content)
    // Official acceptance: a skill file must declare a non-empty name and
    // description in frontmatter, and that name must satisfy the skill-name
    // grammar (the official provider's stringField requires length > 0 and
    // parseSkillFile discards the rest). A file the official provider drops —
    // missing frontmatter, missing or empty either field, invalid name — is
    // not a loaded skill, so the panel must not show it; otherwise the panel
    // lists a skill the model never receives.
    if (parsed.name === undefined || parsed.name === '') continue
    if (parsed.description === undefined || parsed.description === '') continue
    if (!isSkillName(parsed.name)) continue
    const priority = rankOf(level)
    const existing = into.get(parsed.name)
    if (existing !== undefined) {
      const existingPriority = rankOf(existing.level)
      if (existingPriority < priority) continue
      if (existingPriority === priority && existing.isActiveWorkspace && !workspaceInfo?.active) {
        continue
      }
    }
    into.set(parsed.name, {
      name: parsed.name,
      description: parsed.description,
      ...(parsed.whenToUse === undefined ? {} : { whenToUse: parsed.whenToUse }),
      provider: 'filesystem',
      level,
      path: file,
      fileState: 'editable',
      linked,
      // Official frontmatter invocation policy.
      modelInvocable: parsed.disableModelInvocation !== true,
      userInvocable: parsed.userInvocable !== false,
      ...(workspaceInfo === undefined ? {} : {
        workspaceRoot: workspaceInfo.root, workspaceName: workspaceInfo.name, isActiveWorkspace: workspaceInfo.active,
      }),
    })
  }
}

/** Serialize one registry entry into the panel payload (keeps the source for grouping). */
function serializeRegistry(skill: RegistrySkill): SkillEntry {
  // Provider paths permit preview; only a fresh configured-root scan permits editing.
  const providerPath = typeof skill.path === 'string' && skill.path.trim() !== '' ? skill.path : undefined
  return {
    name: skill.name,
    description: skill.description,
    ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
    ...(skill.provider === undefined ? {} : { provider: skill.provider }),
    ...(providerPath === undefined ? {} : { path: providerPath }),
    level: REGISTRY_SOURCE_LEVEL.get(skill.source) ?? `other:${skill.source}`,
    fileState: providerPath === undefined ? 'virtual' : 'provider-file',
    // Official invocation semantics: an omitted policy permits both surfaces.
    // dsh-skill register() defaults to { modelInvocable: true,
    // userInvocable: true }, and the filesystem provider resolves omitted
    // frontmatter the same way, so a registry candidate that carries no
    // invocation (validateInvocation() accepts undefined) means allowed,
    // never denied.
    modelInvocable: skill.invocation?.modelInvocable ?? true,
    userInvocable: skill.invocation?.userInvocable ?? true,
  }
}

/** Group by level, ordered by SOURCE_GROUPS then leftovers, sorted by name inside each group.
 * @param skills - Resolved skills.
 * @param complete - Whether all providers completed discovery.
 * @param cwd - Selected workspace or personal skill directory.
 * @param projectRoots - Project directories included in discovery.
 * @returns Grouped discovery metadata for the client.
 */
export function buildPayload(skills: SkillEntry[], complete: boolean, cwd: string, projectRoots: string[]): ListPayload {
  const byLevel = new Map<string, SkillEntry[]>()
  for (const skill of skills) {
    const list = byLevel.get(skill.level) ?? []
    list.push(skill)
    byLevel.set(skill.level, list)
  }
  const known = new Set(SOURCE_GROUPS.map(group => group.key))
  const groups: GroupPayload[] = SOURCE_GROUPS.map(group => ({
    key: group.key,
    title: group.title,
    hint: group.hint,
    skills: (byLevel.get(group.key) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter(group => group.skills.length > 0)
  const leftovers: GroupPayload[] = [...byLevel.entries()]
    .filter(([key]) => !known.has(key))
    .map(([key, list]) => ({
      key,
      title: key.startsWith('other:') ? `Other (${key.slice(6)})` : `Other (${key})`,
      hint: '',
      skills: list.sort((a, b) => a.name.localeCompare(b.name)),
    }))
  const activeRoot = findProjectRoot(cwd)
  const allRoots = new Set<string>(projectRoots.length > 0 ? [activeRoot, ...projectRoots] : [activeRoot])
  const workspaces: WorkspaceItem[] = [...allRoots].map(root => ({
    root,
    name: basename(root) || root,
    active: root === activeRoot || root === cwd,
  }))

  return { cwd, projectRoots, complete, groups: [...groups, ...leftovers], workspaces }
}

/**
 * Collect grouped skills: filesystem scanning plus registry supplement.
 *
 * Both halves apply the official acceptance rules: a scanned file must declare
 * name and description and the name must be a valid skill name (see
 * scanSkillRoot), and a duplicate name resolves by the official source rank
 * across the scan and the registry, so the entry shown is the one the model
 * receives. The registry additionally contributes bundled and runtime entries
 * of its own, and fills whenToUse / invocation flags on a same-rank peer.
 * @param options - collection options.
 * @returns skills and whether the registry snapshot was complete.
 */
export async function collectSkills(options: CollectOptions): Promise<CollectResult> {
  const { cwd, customSkillDirs, dshHome, agentsHome, registry } = options
  const byName = new Map<string, SkillEntry>()
  const activeProjectRoot = findProjectRoot(cwd)
  const roots = new Set<string>(options.projectRoots === undefined ? [activeProjectRoot] : options.projectRoots)
  // Each root scans independently, in parallel (Map writes are atomic under the single thread).
  const scanTasks: Array<Promise<void>> = []
  for (const root of roots) {
    const isActive = root === activeProjectRoot || root === cwd
    const wsInfo = {
      root,
      name: basename(root) || root,
      active: isActive,
    }
    scanTasks.push(scanSkillRoot(join(root, '.dsh', 'skills'), 'project-dsh', byName, wsInfo, false, options.maximumBytes))
    scanTasks.push(scanSkillRoot(join(root, '.agents', 'skills'), 'project-agents', byName, wsInfo, false, options.maximumBytes))
  }
  for (const dir of normalizeSkillRoots(customSkillDirs ?? [])) scanTasks.push(scanSkillRoot(dir, 'custom', byName, undefined, false, options.maximumBytes))
  for (const dir of normalizeSkillRoots(options.bundledSkillDirs ?? [])) scanTasks.push(scanSkillRoot(dir, 'bundled', byName, undefined, false, options.maximumBytes))
  scanTasks.push(scanSkillRoot(join(dshHome, 'skills'), 'user-dsh', byName, undefined, true, options.maximumBytes))
  scanTasks.push(scanSkillRoot(join(agentsHome, 'skills'), 'user-agents', byName, undefined, false, options.maximumBytes))
  await Promise.all(scanTasks)

  // Registry supplement: same-name skills get whenToUse / invocation flags
  // filled in; registry-only skills (bundled / runtime) join as-is.
  // Query the registry for primary cwd and any other active project roots so
  // project-level providers are captured.
  const snapshotCwds = new Set<string>([cwd, ...roots])
  let complete = true
  for (const snapshotCwd of snapshotCwds) {
    try {
      const snapshot = await registry.snapshot({ cwd: snapshotCwd })
      if (!snapshot.complete) complete = false
      for (const skill of snapshot.skills) {
        if (skill.path) {
          try {
            if (!(await stat(skill.path)).isFile()) continue
          } catch (error) {
            if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) continue
            throw error
          }
        }
        const existing = byName.get(skill.name)
        const serialized = serializeRegistry(skill)
        if (existing === undefined) {
          byName.set(skill.name, serialized)
          continue
        }
        // The registry outranks a scanned entry of a weaker source, the way
        // the official registry resolves a duplicate by rank. Without this an
        // unquestioned filesystem entry would win even when the official
        // winner is a runtime registration, so the panel would name a different
        // skill than the model receives.
        if (rankOf(serialized.level) < rankOf(existing.level)) {
          byName.set(skill.name, serialized)
          continue
        }
        if (rankOf(serialized.level) > rankOf(existing.level)) continue
        if (serialized.provider !== undefined) existing.provider = serialized.provider
        // A provider's cached file metadata can lag a completed local edit.
        if (skill.path === existing.path && existing.fileState === 'editable') continue
        if (serialized.whenToUse !== undefined) existing.whenToUse = serialized.whenToUse
        // Only let the registry refine invocation when it actually states a
        // policy. scanSkillRoot() already resolved the file frontmatter with
        // the official rule (omitted => allowed), so overwriting it with the
        // serialized default would re-introduce the false-negative that made
        // every skill render as not invocable.
        if (skill.invocation?.modelInvocable !== undefined) existing.modelInvocable = skill.invocation.modelInvocable
        if (skill.invocation?.userInvocable !== undefined) existing.userInvocable = skill.invocation.userInvocable
      }
    } catch {
      // Registry unavailable: the filesystem result still stands.
      complete = false
    }
  }
  return { skills: [...byName.values()], complete }
}

/** Single-quote a YAML scalar (doubling embedded quotes); keeps the frontmatter parseable for values containing colons. */
function yamlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** Build complete text for a new instruction file.
 * @param name - Validated skill identifier.
 * @param description - Routing summary.
 * @param whenToUse - Optional additional routing guidance.
 * @param content - Markdown instruction body.
 * @param disabled - Whether model invocation starts disabled.
 * @returns YAML frontmatter followed by the instruction body.
 */
export function buildSkillContent(
  name: string, description: string, whenToUse: string | undefined, content: string, disabled: boolean,
): string {
  const lines = ['---', `name: ${name}`, `description: ${yamlQuote(description.replace(/[\r\n]/gu, ' '))}`]
  if (typeof whenToUse === 'string' && whenToUse.trim() !== '') lines.push(`whenToUse: ${yamlQuote(whenToUse.replace(/[\r\n]/gu, ' '))}`)
  if (disabled) lines.push('disable-model-invocation: true')
  lines.push('---', '', content.trim(), '')
  return lines.join('\n')
}
