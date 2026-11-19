/** Two clients retain independent edits without overwriting another client's content. */
import { expect, it, vi } from 'vitest'
import { createStudioDocumentWriter } from '../src/client/studio-document.ts'
import type { StudioDocument } from '../src/project-types.ts'

const storage = (prompt: string, other = 'Scene', x = 0) => ({
  'crewon-studio-demo-v1': JSON.stringify({ nodes: [{ id: 'a', prompt }, { id: 'b', prompt: other }], pan: { x, y: 0 } }),
})
function host() {
  let document: StudioDocument = { revision: 1, storage: storage('Original') }
  const read = vi.fn(async () => document)
  const write = vi.fn(async (next: StudioDocument) => {
    if (next.revision !== document.revision) throw new Error('Revision conflict')
    document = { ...next, revision: next.revision + 1 }
    return document
  })
  return { read, write, current: () => document }
}

it('preserves edits to different nodes across repeated saves from stale clients', async () => {
  const server = host(), initial = server.current()
  const web = createStudioDocumentWriter(initial, server.write, server.read)
  const app = createStudioDocumentWriter(initial, server.write, server.read)
  await web.save(storage('Web prompt'))
  await app.save(storage('Original', 'App scene', 200))
  await app.save(storage('Original', 'App scene continued', 240))
  expect(server.current().storage).toEqual(storage('Web prompt', 'App scene continued', 240))
})

it('keeps a conflicting local draft out of the Host document', async () => {
  const server = host(), initial = server.current()
  const web = createStudioDocumentWriter(initial, server.write, server.read)
  const app = createStudioDocumentWriter(initial, server.write, server.read)
  await web.save(storage('Web prompt'))
  await expect(app.save(storage('Different App prompt'))).rejects.toThrow('another client')
  expect(server.current().storage).toEqual(storage('Web prompt'))
})

it('merges native candidate projections while retaining independent prompt drafts', async () => {
  const server = host()
  const state = (candidate: string, draft: string) => ({ 'crewon-studio-demo-v1': JSON.stringify({
    nodes: [{ id: 'asset:girl', nativeRevision: 2, candidates: [{ id: 'image', prompt: candidate }], frame: candidate }],
    nodeDrafts: { 'asset:girl': { prompt: draft } },
  }) })
  const initial = await server.write({ revision: 1, storage: state('Original', 'Saved') })
  const web = createStudioDocumentWriter(initial, server.write, server.read)
  const app = createStudioDocumentWriter(initial, server.write, server.read)
  await web.save(state('Web projection', 'Saved'))
  await app.save(state('App projection', 'Local draft'))
  expect(JSON.parse(server.current().storage['crewon-studio-demo-v1']!)).toMatchObject({
    nodeDrafts: { 'asset:girl': { prompt: 'Local draft' } },
  })
})

it('keeps the newer native definition when clients refresh at different production revisions', async () => {
  const server = host()
  const state = (nativeRevision: number, prompt: string) => ({ 'crewon-studio-demo-v1': JSON.stringify({
    nodes: [{ id: 'asset:girl', nativeRevision, prompt }],
  }) })
  const initial = await server.write({ revision: 1, storage: state(1, 'Initial') })
  const web = createStudioDocumentWriter(initial, server.write, server.read)
  const app = createStudioDocumentWriter(initial, server.write, server.read)
  await web.save(state(2, 'Intermediate definition'))
  await app.save(state(3, 'Current definition'))
  expect(JSON.parse(server.current().storage['crewon-studio-demo-v1']!)).toEqual({
    nodes: [{ id: 'asset:girl', nativeRevision: 3, prompt: 'Current definition' }],
  })
})

it('does not retry an unchanged revision after a transport failure', async () => {
  const server = host()
  const write = vi.fn().mockRejectedValue(new Error('Disconnected'))
  const writer = createStudioDocumentWriter(server.current(), write, server.read)
  await expect(writer.save(storage('Draft'))).rejects.toThrow('Disconnected')
  expect(write).toHaveBeenCalledOnce()
})

it('allows each client to switch entry tabs while retaining the other client input edits', async () => {
  const server = host()
  const initial = await server.write({ revision: 1, storage: { 'crewon-studio-demo-v1': JSON.stringify({
    referenceDrama: 'write', referenceOptions: { ratio: '16:9' },
  }) } })
  const web = createStudioDocumentWriter(initial, server.write, server.read)
  const app = createStudioDocumentWriter(initial, server.write, server.read)
  await web.save({ 'crewon-studio-demo-v1': JSON.stringify({ referenceDrama: 'redraw', referenceOptions: { ratio: '9:16' } }) })
  await app.save({ 'crewon-studio-demo-v1': JSON.stringify({ referenceDrama: 'produce', referenceOptions: { ratio: '16:9' } }) })
  expect(JSON.parse(server.current().storage['crewon-studio-demo-v1']!)).toEqual({
    referenceDrama: 'produce', referenceOptions: { ratio: '9:16' },
  })
})


it('keeps playback and selection local while retaining another client source trims', async () => {
  const server = host()
  const state = (playhead: number, sourceIn: number) => ({ 'crewon-studio-demo-v1': JSON.stringify({
    referenceProjectEdit: { editor: { version: 1, clips: [{ id: 'clip', sourceIn }], playhead, selected: 'clip', zoom: .5 } },
  }) })
  const initial = await server.write({ revision: 1, storage: state(0, 0) })
  const web = createStudioDocumentWriter(initial, server.write, server.read)
  const app = createStudioDocumentWriter(initial, server.write, server.read)
  await web.save(state(.04, 1))
  await app.save(state(12, 0))
  expect(JSON.parse(server.current().storage['crewon-studio-demo-v1']!)).toMatchObject({
    referenceProjectEdit: { editor: { playhead: 12, clips: [{ id: 'clip', sourceIn: 1 }] } },
  })
})

it('retains conflicting source trims in their original client instead of overwriting them', async () => {
  const server = host()
  const state = (sourceIn: number) => ({ 'crewon-studio-demo-v1': JSON.stringify({
    referenceProjectEdit: { editor: { version: 1, clips: [{ id: 'clip', sourceIn }], playhead: 0 } },
  }) })
  const initial = await server.write({ revision: 1, storage: state(0) })
  const web = createStudioDocumentWriter(initial, server.write, server.read)
  const app = createStudioDocumentWriter(initial, server.write, server.read)
  await web.save(state(1))
  await expect(app.save(state(2))).rejects.toThrow('another client')
  expect(server.current().storage).toEqual(state(1))
})
