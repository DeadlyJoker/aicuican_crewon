/** Immutable media storage for the shared wallpaper catalog. */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { IncomingMessage } from 'node:http'
import { WALLPAPER_FILE_PATTERN } from './appearance-settings.ts'

const formats = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm' } as const
interface WallpaperConnection {
  requestRejection(request: { readonly headers: IncomingMessage['headers'] }): 401 | 403 | undefined
}

/** Check the signature independently of the browser-provided MIME label.
 * @param bytes Uploaded bytes.
 * @param extension Accepted file extension.
 * @returns Whether the container header matches the advertised format.
 */
export function wallpaperSignature(bytes: Buffer, extension: string): boolean {
  if (extension === 'png') return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  if (extension === 'jpg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (extension === 'gif') return /^GIF8[79]a$/u.test(bytes.toString('ascii', 0, 6))
  if (extension === 'webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  if (extension === 'mp4') return bytes.toString('ascii', 4, 8) === 'ftyp'
  return extension === 'webm' && bytes.subarray(0, 4).equals(Buffer.from([26,69,223,163]))
}

/** Register authenticated uploads and bounded media reads; media is never executed.
 * @param ctx Owning Host scope with webServer and connection available.
 * @param directory Shared durable media directory.
 * @param maxBytes Per-file byte limit from deployment config.
 */
export function registerWallpaperMedia(ctx: Context, directory: string, maxBytes: number): void {
  const connection = Reflect.get(ctx, 'connection') as WallpaperConnection
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/appearance-media', handler: async (req, res) => {
    const rejection = connection.requestRejection(req)
    if (rejection) { res.writeHead(rejection); res.end(); return }
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    try {
      if (req.method === 'POST' && pathname === '/appearance-media') {
        const mime = req.headers['content-type'] ?? ''
        const extension = Object.entries(formats).find(([type]) => type === mime)?.[1]
        if (!extension) { res.writeHead(415); res.end(); return }
        const chunks: Buffer[] = []; let size = 0
        for await (const chunk of req) {
          if (!Buffer.isBuffer(chunk)) throw new Error('unexpected upload chunk')
          const bytes = Buffer.from(chunk)
          size += bytes.length
          if (size > maxBytes) { res.writeHead(413); res.end(); return }
          chunks.push(bytes)
        }
        const bytes = Buffer.concat(chunks)
        if (!wallpaperSignature(bytes, extension)) { res.writeHead(415); res.end(); return }
        const file = `${createHash('sha256').update(bytes).digest('hex')}.${extension}`
        await mkdir(directory, { recursive: true })
        const temporary = join(directory, `.upload-${randomUUID()}`)
        try { await writeFile(temporary, bytes, { flag: 'wx' }); await rename(temporary, join(directory, file)) }
        finally { await rm(temporary, { force: true }) }
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ file, kind: mime.startsWith('video/') ? 'video' : 'image' })); return
      }
      const file = pathname.slice('/appearance-media/'.length)
      if (!['GET', 'HEAD'].includes(req.method ?? '') || !WALLPAPER_FILE_PATTERN.test(file)) { res.writeHead(404); res.end(); return }
      const bytes = await readFile(join(directory, file))
      const mime = Object.entries(formats).find(([, extension]) => file.endsWith(`.${extension}`))?.[0]
      const headers = { 'content-type': mime ?? 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=31536000, immutable', 'accept-ranges': 'bytes' }
      const range = req.headers.range
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/u.exec(range)
        const start = Number(match?.[1]), end = match?.[2] ? Number(match[2]) : bytes.length - 1
        if (!match || start > end || end >= bytes.length) { res.writeHead(416, { 'content-range': `bytes */${bytes.length}` }); res.end(); return }
        res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${bytes.length}`, 'content-length': end-start+1 }); res.end(req.method === 'HEAD' ? undefined : bytes.subarray(start, end+1)); return
      }
      res.writeHead(200, { ...headers, 'content-length': bytes.length }); res.end(req.method === 'HEAD' ? undefined : bytes)
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (res.headersSent) { res.destroy(); return }
      res.writeHead(missing ? 404 : 500); res.end()
    }
  } }), 'appearance: authenticated media storage')
}
