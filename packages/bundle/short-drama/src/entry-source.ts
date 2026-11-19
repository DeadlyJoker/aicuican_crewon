/** Preserve and inspect imported entry sources before a project exists. */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import mammoth from 'mammoth'
import WordExtractor from 'word-extractor'
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Context } from '@deepseek-ai/cordis'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type { EntrySourceId } from './project-types.ts'
import type { ProductionConfig } from './production.ts'
import type { studioDomain } from './studio-domain.ts'

/** Immutable entry-file metadata; originals survive project creation and removal from the entry. */
export const entrySourceSchema = z.object({
  id: z.uuid().transform(brandString<EntrySourceId>), name: z.string().max(255), kind: z.enum(['script', 'video', 'style']), file: z.string(),
  mimeType: z.string(), bytes: z.number().int().positive(), text: z.string().max(150000), seconds: z.number().nonnegative(),
})
/** Persisted imported source metadata. */
export type EntrySource = z.infer<typeof entrySourceSchema>

/** @param buffer - Word or plain text bytes. @param name - Selected file name. @returns Extracted, bounded script text. */
export async function extractEntryScript(buffer: Buffer, name: string): Promise<string> {
  const extension = extname(name).toLowerCase()
  const text = extension === '.docx' ? (await mammoth.extractRawText({ buffer })).value
    : extension === '.doc' ? (await new WordExtractor().extract(buffer)).getBody()
      : new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  const normalized = text.replace(/^\uFEFF/u, '').trim()
  if (!normalized || normalized.length > 150000) throw new Error('剧本需要包含正文，最多支持 150,000 字')
  return normalized
}

/**
 * @param ctx - Authenticated Host transport.
 * @param domain - Shared source registry.
 * @param root - Project root.
 * @param config - Existing media limits and inspection commands.
 */
export function registerEntrySources(ctx: Context, domain: Domain<typeof studioDomain>, root: string, config: ProductionConfig): void {
  const records = domain.table('entry_sources'), directory = join(root, '.entry', 'originals')
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/studio-entry-source', methods: ['GET', 'POST'], requestBody: 'buffered',
    async fetch(request) {
      const query = new URL(request.url).searchParams
      if (request.method === 'GET') {
        const id = entrySourceSchema.shape.id.safeParse(query.get('id'))
        const record = id.success ? records.get(id.data) : undefined
        if (!record) return new Response(null, { status: 404 })
        return new Response(new Uint8Array(await readFile(join(directory, record.file))).buffer,
          { headers: { 'content-type': record.mimeType, 'cache-control': 'private, no-cache', 'x-content-type-options': 'nosniff' } })
      }
      const name = query.get('name')?.slice(0, 255) ?? '', extension = extname(name).toLowerCase()
      const kind = ['.mp4', '.mov'].includes(extension) ? 'video' : ['.txt', '.md', '.doc', '.docx'].includes(extension) ? 'script'
        : ['.png', '.jpg', '.jpeg', '.webp'].includes(extension) ? 'style' : null
      if (!kind || !request.body) return Response.json({ error: '请选择 TXT、MD、DOC、DOCX 剧本或 MP4、MOV 视频' }, { status: 415 })
      const reader = request.body.getReader(), chunks: Uint8Array[] = []
      let size = 0
      try {
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) break
          size += chunk.value.byteLength
          if (size > config.resultMaxBytes) { await reader.cancel(); return Response.json({ error: '文件超过当前服务的导入大小限制' }, { status: 413 }) }
          chunks.push(chunk.value)
        }
      } finally { reader.releaseLock() }
      if (!size) return Response.json({ error: '文件为空' }, { status: 400 })
      const bytes = Buffer.concat(chunks), id = brandString<EntrySourceId>(randomUUID()), file = id + extension
      await mkdir(directory, { recursive: true, mode: 0o700 })
      await writeFile(join(directory, file), bytes, { flag: 'wx', mode: 0o600 })
      try {
        let text = '', seconds = 0
        if (kind === 'script') text = await extractEntryScript(bytes, name)
        else if (kind === 'video') {
          const child = ctx.subprocess.spawn({ argv: [config.ffprobe, '-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', join(directory, file)],
            cwd: directory, signal: AbortSignal.timeout(config.processTimeoutMs), graceMs: config.processGraceMs,
            stdio: { stdin: 'ignore', stdout: { maxBytes: 65536 }, stderr: { maxBytes: 65536 } } })
          const result = await child.done
          if (result.exitCode !== 0) throw new Error('无法读取视频，请检查文件编码')
          const info = z.object({ format: z.object({ duration: z.coerce.number().positive().max(300) }),
            streams: z.array(z.object({ codec_type: z.string() })).refine(streams => streams.some(stream => stream.codec_type === 'video')) })
            .parse(JSON.parse(child.collected.stdout?.readFrom(0).text ?? '{}'))
          seconds = info.format.duration
        }
        const record: EntrySource = { id, name, kind, file, mimeType: kind === 'video' ? extension === '.mov' ? 'video/quicktime' : 'video/mp4' : kind === 'style'
          ? extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg' : 'text/plain', bytes: size, text, seconds }
        await records.put(id, record)
        return Response.json(record)
      } catch (error) {
        ctx.logger.warn('Studio source inspection failed', error)
        return Response.json({ error: kind === 'video' ? '视频无法解析或超过 5 分钟，请检查后重试' : '无法读取剧本，请检查格式及 150,000 字限制' }, { status: 422 })
      }
    },
  }), 'Studio entry sources')
}
