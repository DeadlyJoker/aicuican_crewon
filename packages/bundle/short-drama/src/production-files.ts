/** Host-owned media archival and authenticated, range-aware file delivery. */
import { randomUUID } from 'node:crypto'
import { mkdir, open, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { DramaProjectId } from './project-types.ts'
import type { DramaMedia, DramaMediaId } from './production-types.ts'
import type { ArchivedMedia } from './production-schema.ts'

/** Connection's registered routes use the same authenticated transport in Web and Desktop. */
interface MediaConnection {
  fetch: {
    register(route: {
      path: string
      methods: readonly ('GET' | 'HEAD')[]
      requestBody: 'buffered'
      fetch(request: Request): Promise<Response>
    }): () => Promise<void>
  }
}

/**
 * Publish a locally archived file without exposing its filesystem path.
 * @param projectId - Owning project.
 * @param media - Archived media metadata.
 * @returns Authenticated preview metadata.
 */
export function mediaView(projectId: DramaProjectId, media: ArchivedMedia): DramaMedia {
  const { id, kind, mimeType, bytes } = media
  return { id, kind, mimeType, bytes, url: `/api/short-drama-media?projectId=${projectId}&mediaId=${id}` }
}

/** Private file store for validated project/media identities. */
export class ProductionFiles {
  /**
   * @param root - Configured private directory.
   * @param maxBytes - Largest archived output.
   */
  constructor(private readonly root: string, private readonly maxBytes: number) {}

  /**
   * Locate a file recorded in the owning project.
   * @param projectId - Owning project.
   * @param media - Archived file.
   * @returns Private file path.
   */
  path(projectId: DramaProjectId, media: ArchivedMedia): string {
    return join(this.root, projectId, media.file)
  }

  /**
   * Prepare the project directory for archival and encoding.
   * @param projectId - Owning project.
   * @returns Prepared private export directory.
   */
  async directory(projectId: DramaProjectId): Promise<string> {
    const directory = join(this.root, projectId)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    return directory
  }

  /**
   * Archive a complete bounded output under an immutable file identity.
   * @param projectId - Owner.
   * @param kind - Output kind.
   * @param mimeType - Verified media type.
   * @param bytes - Complete bounded output.
   * @returns Archived file metadata.
   */
  async archive(projectId: DramaProjectId, kind: ArchivedMedia['kind'], mimeType: string, bytes: Uint8Array): Promise<ArchivedMedia> {
    if (!bytes.byteLength || bytes.byteLength > this.maxBytes) throw new Error('The output exceeds the configured media size limit.')
    const id = brandString<DramaMediaId>(randomUUID())
    const media = { id, kind, mimeType, bytes: bytes.byteLength, file: randomUUID() }
    await this.directory(projectId)
    await writeFile(this.path(projectId, media), bytes, { mode: 0o600, flag: 'wx' })
    return media
  }

  /**
   * Read the exact bytes of an archived file.
   * @param projectId - Owner.
   * @param media - Recorded file.
   * @returns Its bounded bytes.
   */
  async bytes(projectId: DramaProjectId, media: ArchivedMedia): Promise<Uint8Array> {
    const bytes = await this.readBounded(this.path(projectId, media))
    if (bytes.byteLength !== media.bytes || bytes.byteLength > this.maxBytes) throw new Error('The archived media file changed.')
    return bytes
  }

  /**
   * Read a Host-produced export without allocating beyond the configured budget.
   * @param path - Private encoder output, never a client-supplied path.
   * @returns Complete bounded bytes.
   */
  async readBounded(path: string): Promise<Uint8Array> {
    const file = await open(path, 'r')
    try {
      const facts = await file.stat()
      if (!facts.isFile() || !facts.size || facts.size > this.maxBytes) throw new Error('The output exceeds the media size limit.')
      const bytes = Buffer.alloc(facts.size)
      let offset = 0
      while (offset < bytes.byteLength) {
        const read = await file.read(bytes, offset, bytes.byteLength - offset, offset)
        if (!read.bytesRead) throw new Error('The media file changed while reading.')
        offset += read.bytesRead
      }
      if ((await file.read(Buffer.alloc(1), 0, 1, offset)).bytesRead) throw new Error('The media file grew while reading.')
      return bytes
    } finally { await file.close() }
  }

  /**
   * Register authenticated media previews and byte-range downloads.
   * @param ctx - Native connection owner.
   * @param lookup - Validated metadata lookup.
   */
  register(ctx: Context, lookup: (projectId: string, mediaId: string) => ArchivedMedia | undefined): void {
    const connection = Reflect.get(ctx, 'connection') as MediaConnection
    ctx.effect(() => connection.fetch.register({
      path: '/api/short-drama-media', methods: ['GET', 'HEAD'], requestBody: 'buffered',
      fetch: async (request) => {
        const params = new URL(request.url).searchParams
        const projectId = params.get('projectId') ?? ''
        const media = lookup(projectId, params.get('mediaId') ?? '')
        if (!media) return new Response(null, { status: 404 })
        const headers = new Headers({
          'content-type': media.mimeType, 'content-length': String(media.bytes), 'accept-ranges': 'bytes',
          'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
        })
        let start = 0
        let end = media.bytes - 1
        const range = request.headers.get('range')
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/u.exec(range)
          if (!match || (!match[1] && !match[2])) {
            return new Response(null, { status: 416, headers: { 'content-range': `bytes */${media.bytes}` } })
          }
          start = match[1] ? Number(match[1]) : Math.max(0, media.bytes - Number(match[2]))
          end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= media.bytes) {
            return new Response(null, { status: 416, headers: { 'content-range': `bytes */${media.bytes}` } })
          }
          headers.set('content-range', `bytes ${start}-${end}/${media.bytes}`)
          headers.set('content-length', String(end - start + 1))
        }
        if (request.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers })
        let handle
        try { handle = await open(join(this.root, projectId, media.file), 'r') }
        catch (_error) { return new Response(null, { status: 404 }) }
        try {
          const body = Buffer.alloc(end - start + 1)
          let offset = 0
          while (offset < body.byteLength) {
            const result = await handle.read(body, offset, body.byteLength - offset, start + offset)
            if (!result.bytesRead) return new Response(null, { status: 410 })
            offset += result.bytesRead
          }
          return new Response(body, { status: range ? 206 : 200, headers })
        } finally { await handle.close() }
      },
    }), 'short drama authenticated media')
  }
}
