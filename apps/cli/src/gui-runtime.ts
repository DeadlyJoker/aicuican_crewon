/** One local GUI Host per Harness home, shared by browser and desktop clients. */
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

const ownerSchema = z.object({
  id: z.uuid(), pid: z.number().int().positive(), version: z.string().min(1),
  url: z.url().optional(), token: z.string().regex(/^[a-f0-9]{64}$/),
})
const STARTUP_WAIT_MS = 60_000

/** Private, owner-readable discovery record for the active local GUI Host. */
export type GuiRuntimeRecord = z.infer<typeof ownerSchema> & { url: string }

/** Ownership of a GUI Host startup and its discovery record. */
export interface GuiRuntimeOwner {
  readonly kind: 'owner'
  readonly token: string
  /** Publish only after the control endpoint is ready. */
  publish(url: string): Promise<void>
  /** Release this exact owner without removing a successor's record. */
  release(): Promise<void>
}

/** An existing Host which a caller must attach to instead of booting another. */
export interface GuiRuntimeFollower {
  readonly kind: 'follower'
  readonly record: GuiRuntimeRecord
}

function validateUrl(value: string): void {
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
    || url.username || url.password) throw new Error('GUI Host discovery must use a local HTTP address.')
}

async function readOwner(path: string): Promise<z.infer<typeof ownerSchema> | undefined> {
  let raw: string
  try { raw = await readFile(path, 'utf8') }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }
  const record = ownerSchema.parse(JSON.parse(raw))
  if (record.url !== undefined) validateUrl(record.url)
  return record
}

function running(pid: number): boolean {
  try { process.kill(pid, 0); return true }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false
    throw error
  }
}

/**
 * Claim the single GUI Host or wait for the current owner's ready record.
 * @param home - Shared Harness home.
 * @param version - Exact runtime version which this client can use.
 * @param signal - Startup cancellation.
 * @returns Exclusive ownership or the existing compatible local Host.
 */
export async function acquireGuiRuntime(
  home: string, version: string, signal?: AbortSignal,
): Promise<GuiRuntimeOwner | GuiRuntimeFollower> {
  const directory = join(home, 'gui-runtime')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const path = join(directory, 'owner.json')
  const deadline = Date.now() + STARTUP_WAIT_MS
  while (true) {
    signal?.throwIfAborted()
    const selected = await withFileLock(path, async () => {
      const current = await readOwner(path)
      if (current !== undefined && running(current.pid)) return { owned: false as const, current }
      const currentOwner = {
        id: randomUUID(), pid: process.pid, version, token: randomBytes(32).toString('hex'),
      }
      await writeFileAtomic(path, JSON.stringify(currentOwner), { mode: 0o600 })
      return { owned: true as const, current: currentOwner }
    }, { waitMs: STARTUP_WAIT_MS, ...(signal === undefined ? {} : { signal }) })
    if (selected.owned) {
      const owner = selected.current
      return {
        kind: 'owner', token: owner.token,
        async publish(url) {
          validateUrl(url)
          await withFileLock(path, async () => {
            if ((await readOwner(path))?.id !== owner.id) throw new Error('GUI Host ownership changed during startup.')
            await writeFileAtomic(path, JSON.stringify({ ...owner, url }), { mode: 0o600 })
          })
        },
        async release() {
          await withFileLock(path, async () => {
            if ((await readOwner(path))?.id === owner.id) await unlink(path)
          })
        },
      }
    }
    if (selected.current.url !== undefined) {
      const record = { ...selected.current, url: selected.current.url }
      if (record.version !== version) throw new Error(`The active GUI Host uses ${record.version}; this client requires ${version}.`)
      return { kind: 'follower', record }
    }
    if (Date.now() >= deadline) throw new Error('The existing GUI Host did not finish starting within 60 seconds.')
    await delay(50, undefined, { signal })
  }
}

/**
 * Serialize offline profile preparation with GUI ownership acquisition.
 * @param home - Shared Harness home containing the GUI discovery record.
 * @param prepare - Offline migration and profile writes; omitted while a live Host owns this home.
 * @returns Whether this call prepared the profile; false leaves the live Host's files untouched.
 */
export async function withGuiProfilePreparation(home: string, prepare: () => Promise<void>): Promise<boolean> {
  const directory = join(home, 'gui-runtime')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const path = join(directory, 'owner.json')
  return withFileLock(path, async () => {
    const owner = await readOwner(path)
    if (owner !== undefined && running(owner.pid)) return false
    await prepare()
    return true
  }, { waitMs: STARTUP_WAIT_MS })
}
