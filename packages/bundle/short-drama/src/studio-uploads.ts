/** Studio originals are stored on the shared Host instead of per-browser IndexedDB. */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { DramaProjectId } from './project-types.ts'
import type { studioDomain } from './studio-domain.ts'

/** Register authenticated original-media upload and range-preview endpoints.
 * @param ctx - Authenticated native transport.
 * @param domain - Studio original metadata.
 * @param root - Project directory root.
 * @param maxBytes - Configured original size limit.
 * @param requireProject - Reject missing projects.
 */
export function registerStudioUploads(ctx: Context, domain: Domain<typeof studioDomain>, root: string, maxBytes: number,
  requireProject: (id: DramaProjectId) => void): void {
  const uploads = domain.table('uploads')
  const projectSchema = z.uuid().transform(brandString<DramaProjectId>)
  const frameSchema = z.coerce.number().int()
  const accepted = new Set(['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm', 'audio/mpeg',
    'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4'])
  const fetchOriginal = async (request: Request): Promise<Response> => {
    const params = new URL(request.url).searchParams
    const project = projectSchema.safeParse(params.get('projectId'))
    if (!project.success) return new Response(null, { status: 400 })
    requireProject(project.data)
    const rawFrame = params.get('frame')
    if (request.method === 'GET' && rawFrame === null) {
      const records = [...uploads.entries()].filter(([, item]) => item.projectId === project.data).map(([, item]) => ({ frame: item.frame,
        name: item.name, mimeType: item.mimeType, url: `/api/studio-originals?projectId=${project.data}&frame=${item.frame}` }))
      return Response.json(records)
    }
    const frame = frameSchema.safeParse(rawFrame)
    if (!frame.success || rawFrame === null) return new Response(null, { status: 400 })
    const key = `${project.data}:${frame.data}`
    const directory = join(root, project.data, '.originals')
    if (request.method === 'POST') {
      const mimeType = request.headers.get('content-type')?.split(';')[0] ?? ''
      if (!accepted.has(mimeType) || !request.body) return new Response(null, { status: 415 })
      const reader = request.body.getReader(), chunks: Uint8Array[] = []
      let length = 0
      try {
        for (;;) {
          const next = await reader.read()
          if (next.done) break
          length += next.value.byteLength
          if (length > maxBytes) { await reader.cancel(); return new Response(null, { status: 413 }) }
          chunks.push(next.value)
        }
      } finally { reader.releaseLock() }
      if (!length) return new Response(null, { status: 400 })
      const bytes = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      const file = randomUUID()
      await mkdir(directory, { recursive: true })
      await writeFile(join(directory, file), bytes, { flag: 'wx', mode: 0o600 })
      await uploads.put(key, { projectId: project.data, frame: frame.data, name: params.get('name')?.slice(0, 255) ?? '',
        mimeType, file, bytes: length })
      return Response.json({ stored: true })
    }
    const record = uploads.get(key)
    if (!record) return new Response(null, { status: 404 })
    const bytes = await readFile(join(directory, record.file))
    const headers = { 'content-type': record.mimeType, 'content-length': String(bytes.byteLength),
      'cache-control': 'private, no-cache', 'x-content-type-options': 'nosniff', 'accept-ranges': 'bytes' }
    const range = request.headers.get('range')?.match(/^bytes=(\d+)-(\d*)$/)
    if (range) {
      const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1
      if (start > end || start >= bytes.length) return new Response(null, { status: 416 })
      return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes.subarray(start, end + 1)).buffer,
        { status: 206, headers: { ...headers, 'content-length': String(end - start + 1),
          'content-range': `bytes ${start}-${end}/${bytes.length}` } })
    }
    return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes).buffer, { headers })
  }
  ctx.effect(() => ctx.connection.fetch.register({ path: '/api/studio-originals', methods: ['GET', 'HEAD'],
    requestBody: 'buffered', fetch: fetchOriginal }), 'studio original previews')
  ctx.effect(() => ctx.connection.fetch.register({ path: '/api/studio-originals/upload', methods: ['POST'],
    requestBody: 'streaming', fetch: fetchOriginal }), 'studio original uploads')
}
