/** Multitrack persistence preserves legacy edits and freezes each export independently. */
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { SubprocessRuntime, type SubprocessHandle, type SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { expect, it, onTestFinished, vi } from 'vitest'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import { canvasDomain } from '../src/canvas.ts'
import { editTimelineSchema } from '../src/edit-schema.ts'
import type { DramaEditTimeline } from '../src/edit-types.ts'
import { projectDomain, ShortDramaProjects } from '../src/projects.ts'
import { ShortDramaProduction } from '../src/production.ts'
import { productionDomain, productionIds, type ProductionRecord } from '../src/production-schema.ts'
import { renderMltEpisode } from '../src/render-mlt.ts'
import { studioDomain } from '../src/studio-domain.ts'

vi.mock('../src/render-mlt.ts', () => ({ renderMltEpisode: vi.fn() }))

const projectId = productionIds.project.parse('11111111-1111-4111-8111-111111111111')
const shotId = productionIds.shot.parse('22222222-2222-4222-8222-222222222222')
const videoId = productionIds.media.parse('33333333-3333-4333-8333-333333333333')
const voiceId = productionIds.media.parse('44444444-4444-4444-8444-444444444444')
const imageId = productionIds.media.parse('55555555-5555-4555-8555-555555555555')
const source = Buffer.from('immutable archived media')

class ProbeProcesses extends SubprocessRuntime {
  readonly calls: SubprocessSpawnSpec[] = []
  formatName = 'mov,mp4,m4a,3gp,3g2,mj2'
  audio = true
  override async resolveExecutable(command: string) { return command }
  override async terminalEnvironment() { return { platform: 'posix' as const } }
  override async spawnTerminal(): Promise<never> { throw new Error('No terminal is needed for export.') }
  override spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
    this.calls.push(spec)
    const text = JSON.stringify({ streams: [{ codec_type: 'video', duration: '2' },
      ...this.audio ? [{ codec_type: 'audio', duration: '2' }] : []], format: { duration: '2', format_name: this.formatName } })
    return { control: undefined, stdin: undefined, stdout: undefined, stderr: undefined,
      collected: { stdout: { readFrom: () => ({ text, lossy: false, nextOffset: text.length }) } },
      done: Promise.resolve({ exitCode: 0, signal: null }), terminate: () => {}, waitForExit: async () => true }
  }
}

function edit(): DramaEditTimeline {
  return editTimelineSchema.parse({ version: 1, tracks: [
    { id: randomUUID(), kind: 'video', name: 'Picture', muted: false, clips: [
      { id: randomUUID(), mediaId: videoId, startFrame: 0, sourceStartFrame: 12, frames: 24, volume: 1, opacity: 1,
        transform: { x: 0, y: 0, width: 1, height: 1 } },
    ] },
    { id: randomUUID(), kind: 'audio', name: 'Dialogue', muted: false, clips: [
      { id: randomUUID(), mediaId: voiceId, startFrame: 6, sourceStartFrame: 0, frames: 18, volume: 0.5 },
    ] },
    { id: randomUUID(), kind: 'subtitle', name: 'Subtitles', muted: false, clips: [
      { id: randomUUID(), startFrame: 6, frames: 12, text: '回家吧！' },
    ] },
  ] })
}

async function harness(pool = new MemoryMediaPool(), root?: string) {
  const directory = root ?? await mkdtemp(join(tmpdir(), 'dsh-multitrack-records-'))
  if (!root) onTestFinished(() => rm(directory, { recursive: true, force: true }))
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  // File delivery is outside these storage tests; the production service still owns its reversible registration.
  ctx.provide('connection', { fetch: { register: () => async () => {} } } as never)
  const project = await facility.open(projectDomain)
  if (!project.table('projects').get(projectId)) await project.table('projects').put(projectId, {
    id: projectId, title: 'Paper boat', revision: 0, synopsis: '', scripts: [], adoptedScriptId: null, conversation: null,
  })
  new ShortDramaProjects(ctx, project, await facility.open(canvasDomain), await facility.open(studioDomain), directory, 1048576, 'standard')
  const domain = await facility.open(productionDomain)
  const table = domain.table('projects')
  if (!table.get(projectId)) {
    const route = { adapter: 'jobs-v1' as const, endpoint: 'http://127.0.0.1:9999/', model: 'fixture', credentialRef: '', voice: '' }
    const record: ProductionRecord = { revision: 0, settings: { image: null, video: null, voice: null },
      assets: [], assetHistory: [], shots: [], shotHistory: [], exports: [], renders: [], fps: 24,
      timeline: [{ shotId, videoId, voiceId: null, startFrame: 12, frames: 24, subtitle: 'Legacy caption' }],
      jobs: ([['video', videoId], ['voice', voiceId], ['image', imageId]] as const).map(([kind, id]) => ({
        id: productionIds.job.parse(randomUUID()), targetType: 'shot', targetId: shotId, targetVersion: 1,
        kind, state: 'ready', reason: null, outputs: [{ id, kind, mimeType: kind === 'video' ? 'video/mp4' : kind === 'voice' ? 'audio/wav' : 'image/png', bytes: source.length, file: randomUUID() }],
        createdAt: 1, route, prompt: 'Archived source', taskId: null, references: [], duration: 2,
      })),
    }
    await table.put(projectId, record)
  }
  const processes = new ProbeProcesses(ctx)
  const service = new ShortDramaProduction(ctx, domain, { mediaDirectory: directory, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', melt: 'melt',
    requestTimeoutMs: 1000, resultMaxBytes: 1048576, processTimeoutMs: 5000, processGraceMs: 100,
    outputWidth: 160, outputHeight: 120, fps: 24 })
  let closed = false
  const close = async () => { if (!closed) { closed = true; await ctx.fiber.dispose() } }
  onTestFinished(close)
  return { directory, pool, ctx, domain, table, service, processes, close }
}

it('reads legacy records and preserves their timeline when adding and reopening multitrack decisions', async () => {
  const h = await harness()
  const legacy = h.service.read(projectId)
  expect(legacy.edit).toBeUndefined()
  const tracks = edit()
  const saved = await h.service.saveEdit(projectId, legacy.revision, tracks)
  expect(saved.timeline).toEqual(legacy.timeline)
  expect(saved.edit).toEqual(tracks)
  expect(saved.revision).toBe(1)
  await h.close()
  const reopened = await harness(h.pool, h.directory)
  expect(reopened.service.read(projectId)).toEqual(saved)
  await expect(reopened.service.saveEdit(projectId, 0, tracks)).rejects.toThrow('Reload')
  expect(reopened.service.read(projectId)).toEqual(saved)
})

it.each(['wrong-kind', 'unknown-media', 'same-track-overlap', 'duplicate-id', 'path-field'] as const)(
  'rejects %s without changing the saved project', async (invalid) => {
    const h = await harness()
    const before = h.service.read(projectId)
    const value = edit()
    const picture = value.tracks[0]
    if (picture?.kind !== 'video' || !picture.clips[0]) throw new Error('Video fixture missing.')
    if (invalid === 'wrong-kind') picture.clips[0].mediaId = imageId
    if (invalid === 'unknown-media') picture.clips[0].mediaId = productionIds.media.parse(randomUUID())
    if (invalid === 'same-track-overlap') picture.clips.push({ ...picture.clips[0], id: editTimelineSchema.parse(edit()).tracks[0]!.clips[0]!.id, startFrame: 12 })
    if (invalid === 'duplicate-id') value.tracks[1]!.id = picture.id
    if (invalid === 'path-field') Object.assign(picture.clips[0], { path: '/private/outside.mp4' })
    await expect(h.service.saveEdit(projectId, before.revision, value)).rejects.toThrow()
    expect(h.service.read(projectId)).toEqual(before)
    expect(h.processes.calls).toEqual([])
  },
)

it('rejects an archived media identity owned by a different project', async () => {
  const h = await harness()
  const record = h.table.get(projectId)
  if (!record?.jobs[0]?.outputs[0]) throw new Error('Archive fixture missing.')
  const foreignId = productionIds.media.parse(randomUUID())
  const foreignProject = productionIds.project.parse(randomUUID())
  await h.table.put(foreignProject, { ...structuredClone(record), jobs: [{ ...record.jobs[0],
    outputs: [{ ...record.jobs[0].outputs[0], id: foreignId }],
  }] })
  const value = edit()
  const track = value.tracks[0]
  if (track?.kind !== 'video' || !track.clips[0]) throw new Error('Video fixture missing.')
  track.clips[0].mediaId = foreignId
  const before = h.service.read(projectId)
  await expect(h.service.saveEdit(projectId, before.revision, value)).rejects.toThrow()
  expect(h.service.read(projectId)).toEqual(before)
  expect(h.processes.calls).toEqual([])
})

it.each(['<b>styled</b>', '<font color="red">styled</font>', '{\\an8}styled', '{c:$FF0000}styled'])(
  'rejects subtitle formatting that would differ between preview and export: %s', async (text) => {
    const h = await harness()
    const value = edit()
    const subtitle = value.tracks.find(track => track.kind === 'subtitle')
    if (subtitle?.kind !== 'subtitle' || !subtitle.clips[0]) throw new Error('Subtitle fixture missing.')
    subtitle.clips[0].text = text
    const before = h.service.read(projectId)
    await expect(h.service.saveEdit(projectId, before.revision, value)).rejects.toThrow()
    expect(h.service.read(projectId)).toEqual(before)
  },
)

it.each(['playlist', 'no-audio', 'source-range'] as const)('rejects %s before invoking the multitrack renderer', async (invalid) => {
  const h = await harness()
  const value = edit()
  if (invalid === 'playlist') h.processes.formatName = 'concat'
  if (invalid === 'no-audio') h.processes.audio = false
  if (invalid === 'source-range') value.tracks[0]!.clips[0]!.frames = 60
  const saved = await h.service.saveEdit(projectId, 0, value)
  const before = vi.mocked(renderMltEpisode).mock.calls.length
  await expect(h.service.exportEpisode(projectId, saved.revision, productionIds.export.parse(randomUUID()))).rejects.toThrow()
  expect(vi.mocked(renderMltEpisode).mock.calls).toHaveLength(before)
  expect(h.service.read(projectId).edit).toEqual(value)
  expect(h.service.read(projectId).timeline).toEqual(saved.timeline)
  expect(h.service.read(projectId).exports).toEqual([])
})

it('keeps a submitted export frozen while a new edit is saved and duplicate confirms join it', async () => {
  const h = await harness()
  const original = edit()
  const saved = await h.service.saveEdit(projectId, 0, original)
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  onTestFinished(() => { release.resolve(undefined) })
  const renderCount = vi.mocked(renderMltEpisode).mock.calls.length
  vi.mocked(renderMltEpisode).mockImplementationOnce(async (_encoder, root, _timeline, _format, signal) => {
    entered.resolve(undefined)
    await release.promise
    signal.throwIfAborted()
    const video = join(root, 'rendered-test.mp4')
    await writeFile(video, 'verified render fixture')
    return { video, frames: 24 }
  })
  const id = productionIds.export.parse(randomUUID())
  const first = h.service.exportEpisode(projectId, saved.revision, id)
  void first.catch(entered.reject)
  await entered.promise
  const duplicate = h.service.exportEpisode(projectId, saved.revision, id)
  const changed = structuredClone(original)
  const subtitle = changed.tracks.find(track => track.kind === 'subtitle')
  if (subtitle?.kind !== 'subtitle' || !subtitle.clips[0]) throw new Error('Subtitle fixture missing.')
  subtitle.clips[0].text = '已编辑的新字幕'
  await h.service.saveEdit(projectId, saved.revision, changed)
  release.resolve(undefined)
  const [left, right] = await Promise.all([first, duplicate])
  expect(left).toEqual(right)
  expect(left.edit).toEqual(changed)
  expect(left.exports).toHaveLength(1)
  expect(vi.mocked(renderMltEpisode).mock.calls).toHaveLength(renderCount + 1)
  expect(left.exports[0]?.edit).toEqual(original)
  expect(left.timeline).toEqual(saved.timeline)
  expect(vi.mocked(renderMltEpisode).mock.calls.at(-1)?.[2].tracks[0]?.clips[0]).toMatchObject({
    sourceStartFrame: 12, startFrame: 0, frames: 24,
  })
  await expect(h.service.exportEpisode(projectId, left.revision, id)).resolves.toEqual(left)
  const stored = h.table.get(projectId)?.exports[0]?.video
  if (!stored) throw new Error('Export fixture missing.')
  expect(await readFile(join(h.directory, projectId, stored.file), 'utf8')).toBe('verified render fixture')
  await h.close()
  const reopened = await harness(h.pool, h.directory)
  expect(reopened.service.read(projectId)).toEqual(left)
  await expect(reopened.service.exportEpisode(projectId, left.revision, id)).resolves.toEqual(left)
})
