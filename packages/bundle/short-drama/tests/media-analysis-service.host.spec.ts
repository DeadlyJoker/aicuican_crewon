/** Inspect immutable source media through the real durable domain and service lifecycle. */
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { SubprocessRuntime, type SubprocessHandle, type SubprocessOutcome, type SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { expect, it, onTestFinished, vi } from 'vitest'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import { analysisPolicy, mediaAnalysisDomain, StudioMediaAnalysis, type AnalysisPolicy,
  type MediaAnalysisId } from '../src/media-analysis-service.ts'
import type { ProductionConfig, ShortDramaProduction } from '../src/production.ts'
import type { DramaProjectId } from '../src/project-types.ts'
import type { DramaMediaId } from '../src/production-types.ts'

const projectId = brandString<DramaProjectId>('11111111-1111-4111-8111-111111111111')
const otherProjectId = brandString<DramaProjectId>('22222222-2222-4222-8222-222222222222')
const mediaId = brandString<DramaMediaId>('33333333-3333-4333-8333-333333333333')
const otherMediaId = brandString<DramaMediaId>('44444444-4444-4444-8444-444444444444')
const requestId = brandString<MediaAnalysisId>('55555555-5555-4555-8555-555555555555')

const probe = JSON.stringify({ format: { duration: '2' }, streams: [
  { index: 0, codec_type: 'video', codec_name: 'h264', width: 160, height: 120, avg_frame_rate: '24/1' },
  { index: 1, codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2 },
] })

class InspectionProcesses extends SubprocessRuntime {
  readonly calls: SubprocessSpawnSpec[] = []
  handler: (spec: SubprocessSpawnSpec) => Promise<SubprocessOutcome> = () => Promise.resolve({ exitCode: 0, signal: null })
  lossy = false
  text = probe
  override async resolveExecutable(command: string) { return command }
  override async terminalEnvironment() { return { platform: 'posix' as const } }
  override async spawnTerminal(): Promise<never> { throw new Error('Inspection cannot allocate a terminal.') }
  override spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
    this.calls.push(spec)
    return {
      control: undefined, stdin: undefined, stdout: undefined, stderr: undefined,
      collected: { stdout: { readFrom: () => ({ text: this.text, lossy: this.lossy, nextOffset: Buffer.byteLength(this.text) }) } },
      done: this.handler(spec), terminate: () => {}, waitForExit: async () => true,
    }
  }
}

async function harness(pool = new MemoryMediaPool(), policy: Partial<AnalysisPolicy> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-analysis-service-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  const domain = await facility.open(mediaAnalysisDomain)
  const subprocess = new InspectionProcesses(ctx)
  const source = vi.fn<Pick<ShortDramaProduction, 'analysisSource'>['analysisSource']>((project, media) => {
    if (project !== projectId || ![mediaId, otherMediaId]
      .includes(media)) throw new Error('The archived media is not owned by this project.')
    return { path: join(root, media), directory: root }
  })
  const config: ProductionConfig & AnalysisPolicy = {
    mediaDirectory: root, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', requestTimeoutMs: 1000,
    resultMaxBytes: 1024 * 1024, processTimeoutMs: 5000, processGraceMs: 100,
    outputWidth: 160, outputHeight: 120, fps: 24,
    ...analysisPolicy({ whisperExecutable: '', whisperModel: '', analysisSceneThreshold: 0.35, analysisMaxScenes: 500,
      analysisMaxSegments: 2000, analysisMaxDurationSeconds: 1800, analysisMaxResultBytes: 1048576, analysisHistoryLimit: 20 }), ...policy,
  }
  const service = new StudioMediaAnalysis(ctx, domain, config, { analysisSource: source })
  let closed = false
  const close = async () => { if (!closed) { closed = true; await ctx.fiber.dispose() } }
  onTestFinished(close)
  return { root, pool, ctx, domain, subprocess, source, config, service, close }
}

it('deduplicates concurrent requests and retains the exact result after reopening the domain', async () => {
  const first = await harness()
  const completed = await Promise.all([
    first.service.analyze(projectId, mediaId, 'inspect', requestId),
    first.service.analyze(projectId, mediaId, 'inspect', requestId),
  ])
  expect(first.subprocess.calls).toHaveLength(1)
  expect(completed[0]).toEqual(completed[1])
  expect(completed[0]?.engine).toEqual({ probe: 'ffprobe', scenes: 'ffmpeg-scene', sceneThreshold: 0.35, transcription: null, model: null })
  expect(completed[0]).toMatchObject({ state: 'ready', result: { durationSeconds: 2, audioTracks: [{ channels: 2 }] } })
  expect(await readdir(first.root)).toEqual([])
  await first.close()

  const reopened = await harness(first.pool)
  expect(reopened.service.read(projectId, mediaId)).toEqual([completed[0]])
  await expect(reopened.service.analyze(projectId, mediaId, 'inspect', requestId)).resolves.toEqual(completed[0])
  expect(reopened.subprocess.calls).toEqual([])
})

it('binds a request identity to its original media and operation', async () => {
  const h = await harness()
  await h.service.analyze(projectId, mediaId, 'inspect', requestId)
  await expect(h.service.analyze(projectId, otherMediaId, 'inspect', requestId)).rejects.toThrow('another media analysis')
  await expect(h.service.analyze(projectId, mediaId, 'transcript', requestId)).rejects.toThrow('another media analysis')
  expect(h.subprocess.calls).toHaveLength(1)
  expect(h.service.read(projectId, otherMediaId)).toEqual([])
})

it('rejects different inputs sharing an identity before the first durable reservation settles', async () => {
  const h = await harness()
  const first = h.service.analyze(projectId, mediaId, 'inspect', requestId)
  await expect(h.service.analyze(projectId, mediaId, 'transcript', requestId)).rejects.toThrow('another media analysis')
  await expect(h.service.analyze(projectId, otherMediaId, 'inspect', requestId)).rejects.toThrow('another media analysis')
  await expect(first).resolves.toMatchObject({ state: 'ready', mode: 'inspect', mediaId })
  expect(h.subprocess.calls).toHaveLength(1)
})

it('rejects unknown and cross-project media before creating a record or a process', async () => {
  const h = await harness()
  await expect(h.service.analyze(otherProjectId, mediaId, 'inspect', requestId)).rejects.toThrow('not owned')
  await expect(h.service.analyze(projectId, brandString<DramaMediaId>('66666666-6666-4666-8666-666666666666'),
    'inspect', requestId)).rejects.toThrow('not owned')
  expect(h.subprocess.calls).toEqual([])
  expect([...h.domain.table('records').entries()]).toEqual([])
})

it('exposes an interrupted durable request without automatically restarting it', async () => {
  const h = await harness()
  await h.domain.table('records').put(requestId, { id: requestId, projectId, mediaId, mode: 'inspect',
    createdAt: 1, state: 'running', reason: null, result: null,
    engine: { probe: 'ffprobe', scenes: 'ffmpeg-scene', sceneThreshold: 0.35, transcription: null, model: null } })
  expect(h.service.read(projectId, mediaId)).toMatchObject([{ state: 'interrupted', reason: 'interrupted' }])
  await expect(h.service.analyze(projectId, mediaId, 'inspect', requestId)).resolves.toMatchObject({ state: 'interrupted' })
  expect(h.subprocess.calls).toEqual([])
})

it.each(['exit', 'signal', 'truncated',
  'invalid-json'] as const)('retains a failed %s analysis without modifying source production', async (failure) => {
  const h = await harness()
  if (failure === 'exit') h.subprocess.handler = async () => ({ exitCode: 1, signal: null })
  if (failure === 'signal') h.subprocess.handler = async () => ({ exitCode: 0, signal: 'SIGTERM' })
  if (failure === 'truncated') h.subprocess.lossy = true
  if (failure === 'invalid-json') h.subprocess.text = '{'
  const result = await h.service.analyze(projectId, mediaId, 'inspect', requestId)
  expect(result).toMatchObject({ state: 'failed', reason: 'execution-failed', result: null })
  expect(h.service.read(projectId, mediaId)).toEqual([result])
  await expect(h.service.analyze(projectId, mediaId, 'inspect', requestId)).resolves.toEqual(result)
  expect(h.subprocess.calls).toHaveLength(1)
  expect(await readdir(h.root)).toEqual([])
})

it('waits for active child settlement and preserves interrupted history before disposal closes storage', async () => {
  const h = await harness()
  const started = Promise.withResolvers<undefined>()
  const stopped = Promise.withResolvers<undefined>()
  h.subprocess.handler = (spec) => {
    started.resolve(undefined)
    return new Promise((resolve) => {
      spec.signal?.addEventListener('abort', () => {
        stopped.resolve(undefined)
        resolve({ exitCode: 0, signal: null })
      }, { once: true })
    })
  }
  const work = h.service.analyze(projectId, mediaId, 'inspect', requestId)
  await started.promise
  const closing = h.close()
  await stopped.promise
  await expect(work).resolves.toMatchObject({ state: 'interrupted', reason: 'interrupted' })
  await closing
  const reopened = await harness(h.pool)
  expect(reopened.service.read(projectId, mediaId)).toMatchObject([{ state: 'interrupted', result: null }])
  expect(reopened.subprocess.calls).toEqual([])
})

it('returns missing transcription configuration explicitly while preserving real stream metadata', async () => {
  const h = await harness()
  const result = await h.service.analyze(projectId, mediaId, 'transcript', requestId)
  expect(result).toMatchObject({ state: 'ready', result: { transcript: { state: 'unavailable', reason: 'missing-config' },
    videoTracks: [{ width: 160, height: 120 }] } })
  expect(h.subprocess.calls).toHaveLength(1)
})

it('cancels the initiating Agent operation and waits for its child to settle', async () => {
  const h = await harness()
  const started = Promise.withResolvers<undefined>()
  const owner = new AbortController()
  h.subprocess.handler = (spec) => {
    started.resolve(undefined)
    return new Promise((resolve) => {
      spec.signal?.addEventListener('abort', () =>{  resolve({ exitCode: 0, signal: null }) }, { once: true })
    })
  }
  const work = h.service.analyzeForAgent(projectId, mediaId, 'inspect', requestId, owner.signal)
  await started.promise
  owner.abort()
  await expect(work).resolves.toMatchObject({ state: 'interrupted', reason: 'interrupted' })
  expect(h.service.read(projectId, mediaId)).toMatchObject([{ state: 'interrupted' }])
  expect(await readdir(h.root)).toEqual([])
})

it('does not let a joining Agent cancel another operation with the same request identity', async () => {
  const h = await harness()
  const started = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<SubprocessOutcome>()
  h.subprocess.handler = async () => { started.resolve(undefined); return release.promise }
  const first = h.service.analyze(projectId, mediaId, 'inspect', requestId)
  await started.promise
  const secondOwner = new AbortController()
  const second = h.service.analyzeForAgent(projectId, mediaId, 'inspect', requestId, secondOwner.signal)
  secondOwner.abort()
  release.resolve({ exitCode: 0, signal: null })
  const results = await Promise.all([first, second])
  expect(results[0]).toEqual(results[1])
  expect(results[0]).toMatchObject({ state: 'ready' })
  expect(h.subprocess.calls).toHaveLength(1)
})
