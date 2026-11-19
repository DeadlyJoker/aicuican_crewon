/**
 * Adapted from dsh-skill-explorer 0.4.15 (BSD-3-Clause).
 * Modified for CrewON with bounded decompression, link-safe exclusive writes and partial reports.
 * Directory imports scan one level; ZIP imports retain SKILL.md text. Source ranks
 * decide collisions before each complete file is published without replacement.
 */

import { lstat, opendir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { isSkillName, rankOf, type SkillEntry } from './collect.ts'
import { parseFrontmatter } from './frontmatter.ts'
import { createSkillFile, directoryBelow, readSkillFile } from './files.ts'

/** Deployment-resolved bounds applied before reading or inflating skill content. */
export interface ImportLimits {
  archiveBytes: number
  entries: number
  skillBytes: number
  totalBytes: number
}

/**
 * A failure caused by what the request supplied (a malformed archive, an
 * unreadable source directory), never by the host. The route maps it to 400 so
 * the user reads an actionable message instead of a generic server error.
 */
export class ImportRequestError extends Error {}

/** One source file found at an import source, before validation. */
export interface RawCandidate {
  /** Archive entry path or absolute file path, reported back to the user. */
  origin: string
  /** The SKILL.md text, verbatim. */
  content: string
  tooLarge?: boolean
}

/** Why a candidate was not imported. */
export type ImportSkipReason =
  | 'invalid-frontmatter'
  | 'invalid-name'
  | 'too-large'
  | 'duplicate'
  | 'exists'
  | 'shadowed'
  | 'write-failed'

/** The result for one candidate. */
export interface ImportOutcome {
  /** The skill name, or the origin when no valid name was found. */
  name: string
  /** Where the candidate was read from. */
  origin: string
  status: 'imported' | 'skipped'
  /** Why it was skipped (absent when imported). */
  reason?: ImportSkipReason
  /** The written SKILL.md path (imported only). */
  path?: string
  /** Per-file failure after earlier candidates may have succeeded. */
  error?: string
}

/** A validated candidate ready to be written. */
export interface ImportCandidate {
  name: string
  content: string
  origin: string
}

/** One candidate's fate before any file is written. */
export type ImportPlanItem =
  | { candidate: ImportCandidate; decision: 'import' }
  | { candidate: ImportCandidate; decision: 'skip'; reason: ImportSkipReason }

/** The import result the route returns. */
export interface ImportReport {
  /** The source level the files were written into. */
  level: string
  /** Per-candidate outcomes, in source order. */
  outcomes: ImportOutcome[]
  /** How many files were created. */
  imported: number
  /** How many candidates were skipped. */
  skipped: number
}

/** The source of an import: a host directory, or an archive the browser sent. */
export type ImportSource =
  | { kind: 'directory'; path: string }
  | { kind: 'archive'; data: Buffer }

/** One decoded archive entry. */
export interface ArchiveEntry {
  path: string
  data: Buffer
}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
/** The zip64 escape value in a 32-bit size/offset field. */
const ZIP64_MARKER = 0xffffffff
const EOCD_SIZE = 22
const MAX_COMMENT = 0xffff

/** The central-directory file name of a skill instruction file. */
const SKILL_FILE = 'skill.md'

/** Find the end-of-central-directory record, scanning back over the comment. */
function findEndOfCentralDirectory(archive: Buffer): number {
  const last = archive.length - EOCD_SIZE
  if (last < 0) return -1
  const first = Math.max(0, last - MAX_COMMENT)
  for (let offset = last; offset >= first; offset -= 1) {
    if (archive.readUInt32LE(offset) === EOCD_SIGNATURE) return offset
  }
  return -1
}

/**
 * Normalize one archive entry path and reject anything that could escape a
 * directory: absolute paths, drive letters and `..` segments. The import never
 * joins an entry path onto a filesystem path, but a reported origin must not
 * read like a path outside the archive either.
 */
function safeEntryPath(name: string): string | undefined {
  const normalized = name.replace(/\\/gu, '/')
  if (normalized === '' || normalized.startsWith('/')) return undefined
  if (/^[A-Za-z]:/u.test(normalized)) return undefined
  const segments = normalized.split('/')
  if (segments.some(segment => segment === '..')) return undefined
  return normalized
}

/**
 * Decode a zip archive into its file entries (stored and deflate methods).
 *
 * Only what a skills archive uses is supported; zip64, encrypted entries and
 * unknown compression methods are rejected with a message naming the problem,
 * so an unsupported archive fails loudly instead of importing half of itself.
 * @param archive - the raw archive bytes.
 * @param limits - Input, entry and expanded-byte limits.
 * @returns every file entry, directories excluded.
 * @throws when the archive is malformed or uses an unsupported feature.
 */
export function readZipEntries(archive: Buffer, limits: ImportLimits): ArchiveEntry[] {
  if (archive.length > limits.archiveBytes) throw new ImportRequestError('The archive exceeds the configured size limit.')
  if (archive.length < EOCD_SIZE) throw new ImportRequestError('not a zip archive: too short')
  const eocd = findEndOfCentralDirectory(archive)
  if (eocd < 0) throw new ImportRequestError('not a zip archive: no end-of-central-directory record')
  const total = archive.readUInt16LE(eocd + 10)
  const directorySize = archive.readUInt32LE(eocd + 12)
  const directoryOffset = archive.readUInt32LE(eocd + 16)
  if (total === 0xffff || directoryOffset === ZIP64_MARKER || directorySize === ZIP64_MARKER) {
    throw new ImportRequestError('unsupported zip archive: zip64 is not supported')
  }
  if (total > limits.entries) {
    throw new ImportRequestError(`archive has more than ${limits.entries} entries`)
  }
  const directoryEnd = directoryOffset + directorySize
  if (directoryOffset > archive.length || directoryEnd > archive.length) {
    throw new ImportRequestError('corrupt zip archive: central directory is out of range')
  }
  const entries: ArchiveEntry[] = []
  let totalBytes = 0
  let cursor = directoryOffset
  for (let index = 0; index < total; index += 1) {
    if (cursor + 46 > directoryEnd || archive.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw new ImportRequestError('corrupt zip archive: bad central directory entry')
    }
    const flags = archive.readUInt16LE(cursor + 8)
    const method = archive.readUInt16LE(cursor + 10)
    const compressedSize = archive.readUInt32LE(cursor + 20)
    const uncompressedSize = archive.readUInt32LE(cursor + 24)
    const nameLength = archive.readUInt16LE(cursor + 28)
    const extraLength = archive.readUInt16LE(cursor + 30)
    const commentLength = archive.readUInt16LE(cursor + 32)
    const localOffset = archive.readUInt32LE(cursor + 42)
    const nameStart = cursor + 46
    const nameEnd = nameStart + nameLength
    if (nameEnd > directoryEnd) throw new ImportRequestError('corrupt zip archive: truncated entry name')
    const rawName = archive.toString('utf8', nameStart, nameEnd)
    cursor = nameEnd + extraLength + commentLength
    if (compressedSize === ZIP64_MARKER || uncompressedSize === ZIP64_MARKER || localOffset === ZIP64_MARKER) {
      throw new ImportRequestError('unsupported zip archive: zip64 is not supported')
    }
    if (rawName.endsWith('/')) continue
    if ((flags & 0x1) !== 0) throw new ImportRequestError(`unsupported zip entry (encrypted): ${rawName}`)
    if (method !== 0 && method !== 8) {
      throw new ImportRequestError(`unsupported zip entry (compression method ${method}): ${rawName}`)
    }
    if (localOffset + 30 > archive.length || archive.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
      throw new ImportRequestError(`corrupt zip archive: bad local header for ${rawName}`)
    }
    const localNameLength = archive.readUInt16LE(localOffset + 26)
    const localExtraLength = archive.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const dataEnd = dataStart + compressedSize
    if (dataEnd > archive.length) {
      throw new ImportRequestError(`corrupt zip archive: truncated data for ${rawName}`)
    }
    if (uncompressedSize > limits.totalBytes - totalBytes) throw new ImportRequestError('The archive exceeds the configured expanded size limit.')
    const compressed = archive.subarray(dataStart, dataEnd)
    let data: Buffer
    if (method === 0) {
      data = Buffer.from(compressed)
    } else {
      try {
        data = inflateRawSync(compressed, { maxOutputLength: Math.max(1, Math.min(uncompressedSize, limits.totalBytes - totalBytes)) })
      } catch {
        throw new ImportRequestError(`corrupt zip archive: cannot inflate ${rawName}`)
      }
    }
    if (data.length !== uncompressedSize) {
      throw new ImportRequestError(`corrupt zip archive: ${rawName} inflates past its declared size`)
    }
    totalBytes += data.length
    if (totalBytes > limits.totalBytes) {
      throw new ImportRequestError(`archive expands past the ${limits.totalBytes} byte import limit`)
    }
    const safe = safeEntryPath(rawName)
    if (safe === undefined) continue
    entries.push({ path: safe, data })
  }
  return entries
}

/**
 * Pull the SKILL.md candidates out of decoded archive entries. Nested layouts
 * (`<skill>/SKILL.md` at any depth, so a zipped folder of skills works) are
 * accepted; every other file in the archive is ignored rather than reported,
 * because an archive routinely carries READMEs and assets beside the skills.
 * @param entries - decoded archive entries.
 * @returns one candidate per SKILL.md, in archive order.
 */
export function candidatesFromArchive(entries: readonly ArchiveEntry[]): RawCandidate[] {
  const candidates: RawCandidate[] = []
  for (const entry of entries) {
    if (basename(entry.path).toLowerCase() !== SKILL_FILE) continue
    candidates.push({ origin: entry.path, content: entry.data.toString('utf8') })
  }
  return candidates
}

/**
 * Read the candidates of one host directory, one level deep: a skill
 * directory (`<name>/SKILL.md`) or a flattened `<name>.md`, the same two
 * shapes the panel's own scan accepts. Dot entries and symbolic links are
 * skipped — a link would let an import copy content the user did not point at,
 * and the panel's linked-skill rules have no meaning for a copy.
 * @param dir - absolute source directory.
 * @param limits - Candidate count and instruction-byte limits.
 * @returns the candidates found, in directory order.
 * @throws when the path is not a readable directory.
 */
export async function candidatesFromDirectory(dir: string, limits: ImportLimits): Promise<RawCandidate[]> {
  const info = await lstat(dir)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new ImportRequestError('The import source must be a regular directory.')
  const entries = await opendir(dir)
  const candidates: RawCandidate[] = []
  let count = 0
  let totalBytes = 0
  for await (const entry of entries) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
    count += 1
    if (count > limits.entries) throw new ImportRequestError('The directory exceeds the configured entry limit.')
    const file = entry.isDirectory() ? join(dir, entry.name, 'SKILL.md') : join(dir, entry.name)
    if (!entry.isDirectory() && (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md'))) continue
    let fileInfo
    try {
      fileInfo = await lstat(file)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue
      throw error
    }
    if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) continue
    if (fileInfo.size > limits.skillBytes) {
      candidates.push({ origin: file, content: '', tooLarge: true })
      continue
    }
    const content = (await readSkillFile(file, limits.skillBytes)).content
    totalBytes += Buffer.byteLength(content)
    if (totalBytes > limits.totalBytes) throw new ImportRequestError('The directory exceeds the configured expanded size limit.')
    candidates.push({ origin: file, content })
  }
  return candidates
}

/**
 * Validate one raw candidate the way the official provider accepts a skill:
 * the frontmatter must declare a non-empty description and a name inside the
 * official grammar. The skill's identity is the *frontmatter* name — that is
 * the name the registry loads and the model receives, so the imported
 * directory is named after it rather than after the source folder.
 * @param raw - the candidate text and where it came from.
 * @param limits - Maximum accepted instruction size.
 * @returns the validated candidate, or the reason it cannot be imported.
 */
export function parseCandidate(raw: RawCandidate, limits: ImportLimits):
  { candidate: ImportCandidate; name: string } | { candidate?: never; name: string; reason: ImportSkipReason } {
  if (raw.tooLarge || Buffer.byteLength(raw.content, 'utf8') > limits.skillBytes) {
    return { name: basename(dirname(raw.origin)), reason: 'too-large' }
  }
  const frontmatter = parseFrontmatter(raw.content)
  const declared = frontmatter.name ?? ''
  const name = declared === '' ? basename(dirname(raw.origin)) : declared
  if (declared === '' || frontmatter.description === undefined || frontmatter.description === '') {
    return { name, reason: 'invalid-frontmatter' }
  }
  if (!isSkillName(declared)) return { name, reason: 'invalid-name' }
  return { name: declared, candidate: { name: declared, content: raw.content, origin: raw.origin } }
}

/**
 * Decide every candidate's fate before writing anything, so a conflict or a
 * duplicate cannot leave a half-applied import behind.
 *
 * Conflicts use the official source rank: a same-name skill at a *stronger*
 * source outranks the target root and the imported file would never be the
 * one the model receives (skipped as shadowed); a same-name skill at the
 * *same* source means the name is already taken in that root (skipped as
 * existing); a weaker source is shadowed by the import, so it is written.
 * @param candidates - validated candidates in source order.
 * @param existing - the skills a fresh collection just found.
 * @param targetLevel - the source level the import writes into.
 * @returns one plan item per candidate, in source order.
 */
export function planImport(
  candidates: readonly ImportCandidate[],
  existing: readonly SkillEntry[],
  targetLevel: string,
): ImportPlanItem[] {
  const targetRank = rankOf(targetLevel)
  const byName = new Map(existing.map(skill => [skill.name, skill]))
  const seen = new Set<string>()
  const plan: ImportPlanItem[] = []
  for (const candidate of candidates) {
    if (seen.has(candidate.name)) {
      plan.push({ candidate, decision: 'skip', reason: 'duplicate' })
      continue
    }
    seen.add(candidate.name)
    const current = byName.get(candidate.name)
    if (current !== undefined) {
      const currentRank = rankOf(current.level)
      if (currentRank < targetRank) {
        plan.push({ candidate, decision: 'skip', reason: 'shadowed' })
        continue
      }
      if (currentRank === targetRank) {
        plan.push({ candidate, decision: 'skip', reason: 'exists' })
        continue
      }
    }
    plan.push({ candidate, decision: 'import' })
  }
  return plan
}

/**
 * Write the planned candidates into one skill root. Every write is a new file:
 * an existing SKILL.md is never overwritten, and a failure after the first
 * file leaves the earlier imports in place (each one is individually valid and
 * the panel simply lists them — the report says which succeeded).
 * @param plan - the plan from planImport.
 * @param baseDir - the target skill root.
 * @returns one outcome per plan item, in plan order.
 */
export async function executeImport(plan: readonly ImportPlanItem[], baseDir: string): Promise<ImportOutcome[]> {
  const outcomes: ImportOutcome[] = []
  for (const item of plan) {
    const { candidate } = item
    if (item.decision === 'skip') {
      outcomes.push({ name: candidate.name, origin: candidate.origin, status: 'skipped', reason: item.reason })
      continue
    }
    try {
      const directory = await directoryBelow(baseDir, [candidate.name], true)
      const target = await createSkillFile(directory, 'SKILL.md', candidate.content)
      outcomes.push({ name: candidate.name, origin: candidate.origin, status: 'imported', path: target })
    } catch (error) {
      const exists = error instanceof Error && 'code' in error && error.code === 'EEXIST'
      outcomes.push({ name: candidate.name, origin: candidate.origin, status: 'skipped',
        reason: exists ? 'exists' : 'write-failed',
        ...(exists ? {} : { error: error instanceof Error ? error.message : 'The file could not be written.' }),
      })
    }
  }
  return outcomes
}

/** Arguments for one import run. */
export interface ImportRequest {
  /** Target skill root (already resolved from the root choice by the route). */
  baseDir: string
  /** Source level the root writes into ('user-dsh' or 'project-dsh'). */
  targetLevel: string
  /** Where the candidates come from. */
  source: ImportSource
  /** The skills a fresh collection found, for the conflict rule. */
  existing: readonly SkillEntry[]
  limits: ImportLimits
}

/**
 * Run one import: extract, validate, plan, then write.
 * @param request - the resolved target root, source and current catalog.
 * @returns per-candidate outcomes plus the counts.
 */
export async function importSkills(request: ImportRequest): Promise<ImportReport> {
  const raw = request.source.kind === 'archive'
    ? candidatesFromArchive(readZipEntries(request.source.data, request.limits))
    : await candidatesFromDirectory(request.source.path, request.limits)
  // Validate in source order first; the report then walks the same order, and
  // planImport preserves the relative order of the survivors, so outcome N
  // always describes candidate N as the user listed them.
  const parsed = raw.map(item => ({ item, result: parseCandidate(item, request.limits) }))
  const valid = parsed.flatMap(entry => entry.result.candidate === undefined ? [] : [entry.result.candidate])
  const plan = planImport(valid, request.existing, request.targetLevel)
  const executed = await executeImport(plan, request.baseDir)
  const outcomes: ImportOutcome[] = []
  let cursor = 0
  for (const entry of parsed) {
    if (entry.result.candidate === undefined) {
      outcomes.push({ name: entry.result.name, origin: entry.item.origin, status: 'skipped', reason: entry.result.reason })
      continue
    }
    const outcome = executed[cursor]
    cursor += 1
    if (outcome !== undefined) outcomes.push(outcome)
  }
  return {
    level: request.targetLevel,
    outcomes,
    imported: outcomes.filter(outcome => outcome.status === 'imported').length,
    skipped: outcomes.filter(outcome => outcome.status === 'skipped').length,
  }
}
