/** Serve the built-in Studio interface through the authenticated native Web/Desktop transport. */
import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { Context } from '@deepseek-ai/cordis'

/** @param ctx - Host with the native authenticated Fetch registry. @returns Completion after every packaged UI resource is registered. */
export async function registerStudioAssets(ctx: Context): Promise<void> {
  const root = fileURLToPath(new URL('./studio/', import.meta.resolve('@deepseek-ai/dsh-short-drama-bundle/package.json')))
  const files: string[] = []
  async function collect(path: string): Promise<void> {
    for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
      const relative = path ? `${path}/${entry.name}` : entry.name
      if (entry.isDirectory()) await collect(relative)
      else if (entry.isFile()) files.push(relative)
    }
  }
  await collect('')
  const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' }
  for (const file of files) ctx.effect(() => ctx.connection.fetch.register({
    path: `/api/studio-ui/${file}`, methods: ['GET', 'HEAD'], requestBody: 'buffered',
    async fetch(request) {
      const bytes = await readFile(join(root, file))
      return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes).buffer, {
        headers: { 'content-type': mime[extname(file)] ?? 'application/octet-stream',
          'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' },
      })
    },
  }), `studio interface ${file}`)
}
