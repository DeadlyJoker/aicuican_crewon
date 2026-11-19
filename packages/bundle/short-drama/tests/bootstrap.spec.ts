/** Studio downloads overlap Host initialization while classic scripts retain their order. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

it('downloads before initialization and executes in dependency order', async () => {
  const source = readFileSync(new URL('../studio/bootstrap.js', import.meta.url), 'utf8')
  const requested: string[] = [], executed: string[] = [], revoked: string[] = []
  let ready: (() => void) | undefined
  const boot = new Promise<void>((resolve) => { ready = resolve })
  const root = { dataset: {} as Record<string, string> }
  const document = {
    documentElement: root,
    querySelectorAll: () => ['a.js', 'b.js'].map(src => ({ dataset: { studioSrc: src } })),
    getElementById: () => ({ remove() {} }),
    createElement: () => ({ src: '', async: true, onload: () => {} }),
    body: { append(script: { src: string; onload(): void }) { executed.push(script.src); queueMicrotask(() => script.onload()) } },
  }
  runInNewContext(source, { document, window: { addEventListener() {} }, location: { href: 'https://test/' }, studioNativeBoot: boot,
    Blob, URL: class extends URL { static override createObjectURL(blob: Blob) { return `blob:${blob.size}` }
      static override revokeObjectURL(url: string) { revoked.push(url) } },
    fetch: async (src: string) => { requested.push(src); return { ok: true, text: async () => src } },
  })
  expect(requested).toEqual(['a.js', 'b.js'])
  expect(executed).toEqual([])
  ready?.()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(executed).toEqual(['blob:4', 'blob:4'])
  expect(revoked).toHaveLength(2)
  expect(root.dataset.studioReady).toBe('true')
})

it('reports a failed download even while Host initialization is pending', async () => {
  const source = readFileSync(new URL('../studio/bootstrap.js', import.meta.url), 'utf8')
  const root = { dataset: {} as Record<string, string> }, added: { dataset: Record<string, string> }[] = []
  const element = () => ({ dataset: {}, style: {}, append() {}, setAttribute() {}, focus() {}, remove() {} })
  runInNewContext(source, {
    document: { documentElement: root, querySelectorAll: () => [{ dataset: { studioSrc: 'missing.js' } }],
      querySelector: () => null, getElementById: () => element(), createElement: element,
      body: { append(value: { dataset: Record<string, string> }) { added.push(value) } } },
    window: { addEventListener() {} }, location: { href: 'https://test/' }, studioNativeBoot: new Promise(() => {}),
    fetch: async () => ({ ok: false }), Blob, URL,
  })
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(root.dataset.studioReady).toBeUndefined()
  expect(added.map(value => value.dataset.studioStartup)).toEqual(['failed'])
})
