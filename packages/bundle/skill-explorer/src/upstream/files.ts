/** Filesystem safeguards for the adapted BSD-3-Clause skill explorer. */
import { constants } from 'node:fs'
import { link, lstat, mkdir, open, realpath, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Resolve a trusted anchor and reject symbolic links in its descendant directories.
 * @param anchor - Existing trusted directory.
 * @param segments - Child directory names resolved below the anchor.
 * @param create - Whether missing descendants may be created.
 * @returns Canonical validated directory path.
 */
export async function directoryBelow(anchor: string, segments: readonly string[], create = false): Promise<string> {
  let path = await realpath(anchor)
  for (const segment of segments) {
    path = join(path, segment)
    if (create) {
      try {
        await mkdir(path, { mode: 0o700 })
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
      }
    }
    const info = await lstat(path)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('A skill directory is not a regular directory.')
  }
  return path
}

/** Read a regular file without following a final symbolic link or allocating past the configured limit.
 * @param path - Validated file path.
 * @param maximumBytes - Allocation and accepted file-size limit.
 * @returns The complete text and original permission bits.
 */
export async function readSkillFile(path: string, maximumBytes: number): Promise<{ content: string; mode: number }> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = await handle.stat()
    if (!info.isFile()) throw new Error('A skill must be a regular file.')
    if (info.size > maximumBytes) throw new Error('The skill exceeds the configured size limit.')
    const bytes = Buffer.alloc(maximumBytes + 1)
    let length = 0
    while (length < bytes.length) {
      const chunk = await handle.read(bytes, length, bytes.length - length, length)
      if (chunk.bytesRead === 0) break
      length += chunk.bytesRead
    }
    if (length > maximumBytes) throw new Error('The skill exceeds the configured size limit.')
    return { content: bytes.subarray(0, length).toString('utf8'), mode: info.mode & 0o777 }
  } finally {
    await handle.close()
  }
}

/** Publish complete content only if the final file is absent.
 * @param directory - Validated destination directory.
 * @param filename - Final instruction-file basename.
 * @param content - Complete file contents.
 * @returns The committed path; an existing destination raises EEXIST.
 */
export async function createSkillFile(directory: string, filename: string, content: string): Promise<string> {
  const target = join(directory, filename)
  const temp = join(directory, `.skill-${randomUUID()}.tmp`)
  await writeFile(temp, content, { flag: 'wx', mode: 0o600 })
  try {
    await link(temp, target)
  } finally {
    await unlink(temp)
  }
  return target
}
