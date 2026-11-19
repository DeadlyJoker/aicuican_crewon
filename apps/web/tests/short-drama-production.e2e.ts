/** Assemble actual API media bytes into an episode through the native Web plugin. */
import { execFile, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { ShortDramaProduction } from '../../../packages/bundle/short-drama/src/production.ts'
import type { MediaAnalysisRecord } from '../../../packages/bundle/short-drama/src/media-analysis-types.ts'
import type { DramaProjectId } from '../../../packages/bundle/short-drama/src/project-types.ts'
import type {
  DramaProduction, DramaRoute, DramaTimelineClip,
} from '../../../packages/bundle/short-drama/src/production-types.ts'
import { expect, it, onTestFinished } from 'vitest'
import { z } from 'zod'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'
import { REPO_ROOT } from './support.ts'

const runFile = promisify(execFile)
const available = ['ffmpeg', 'ffprobe'].every(command => spawnSync(command, ['-version'], { stdio: 'ignore' }).status === 0)
const packageName = '@deepseek-ai/dsh-short-drama-bundle'
const namespace = 'shortDramaProduction'

type RpcResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }

async function rpc<T>(scaffold: WebScaffold, method: string, args: Record<string, unknown> = {}): Promise<T> {
  const response = await scaffold.hostFetch(`/api/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args } }),
  })
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`)
  const reply = await response.json() as { result: RpcResult<T> }
  if (!reply.result.ok) throw new Error(`${method}: ${reply.result.error.code}: ${reply.result.error.message}`)
  return reply.result.value
}

async function executionApi(root: string) {
  const files = { image: join(root, 'reference.png'), video: join(root, 'shot.mp4'), voice: join(root, 'dialogue.wav') }
  await runFile('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x203f63:s=160x120:r=24:d=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', files.video], { timeout: 30_000 })
  await runFile('ffmpeg', ['-nostdin', '-v', 'error', '-i', files.video, '-frames:v', '1', files.image], { timeout: 30_000 })
  await runFile('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', files.voice], { timeout: 30_000 })
  const bytes = { image: await readFile(files.image), video: await readFile(files.video), voice: await readFile(files.voice) }
  const mime = { image: 'image/png', video: 'video/mp4', voice: 'audio/wav' }
  const submissions = new Map<string, { requestId: string; kind: 'image' | 'video' | 'voice' }>()
  let posts = 0
  const referenceCounts: number[] = []
  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    if (request.method === 'POST' && path === '/v1/jobs') {
      let body = ''
      for await (const chunk of request) body += String(chunk)
      const submitted = z.object({ requestId: z.string(), kind: z.enum(['image', 'video', 'voice']),
        input: z.object({ references: z.array(z.object({ mimeType: z.string(), base64: z.string().min(1) })).optional() }),
      }).parse(JSON.parse(body))
      referenceCounts.push(submitted.input.references?.length ?? 0)
      posts++
      submissions.set(submitted.requestId, submitted)
      response.writeHead(202, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ requestId: submitted.requestId, taskId: submitted.requestId, state: 'accepted' }))
      return
    }
    if (request.method === 'GET' && path.startsWith('/v1/jobs/')) {
      const id = decodeURIComponent(path.split('/').at(-1) ?? '')
      const submitted = submissions.get(id)
      if (submitted) {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ requestId: id, taskId: id, state: 'succeeded',
          outputs: [{ artifactId: submitted.kind, mimeType: mime[submitted.kind] }] }))
        return
      }
    }
    if (request.method === 'GET' && path.startsWith('/v1/artifacts/')) {
      const id = path.split('/').at(-1)
      if (id === 'image' || id === 'video' || id === 'voice') {
        response.writeHead(200, { 'content-type': mime[id], 'content-length': bytes[id].length })
        response.end(bytes[id])
        return
      }
    }
    response.writeHead(404)
    response.end()
  }
  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      response.destroy(error instanceof Error ? error : new Error('The execution fixture failed.'))
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('The execution API did not bind a TCP port.')
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    posts: () => posts,
    referenceCounts,
    close: () => new Promise<void>((resolve, reject) => {
      server.closeAllConnections()
      server.close((error) => { if (error) reject(error); else resolve() })
    }),
  }
}

it.skipIf(!available)('archives media, exports adopted cuts and retains editable production after plugin reload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-drama-production-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const api = await executionApi(root)
  onTestFinished(() => api.close())
  const overlay = join(root, 'media-policy.yml')
  await writeFile(overlay, JSON.stringify([{ id: 'short-drama', config: {
    projectDirectory: join(root, 'projects'), mediaDirectory: join(root, 'media'), ffmpeg: process.env.DSH_TEST_FFMPEG ?? 'ffmpeg', ffprobe: 'ffprobe', requestTimeoutMs: 5000,
    ...(process.env.DSH_TEST_MELT ? { melt: process.env.DSH_TEST_MELT } : {}),
    resultMaxBytes: 1024 * 1024, processTimeoutMs: 30000, processGraceMs: 1000,
    outputWidth: 160, outputHeight: 120, fps: 24,
  } }]))
  const scaffold = await launchWebScaffold({
    profile: { packages: [{ dir: join(REPO_ROOT, 'packages/bundle/short-drama'), enabled: true }] },
    extraOverlayPath: overlay,
  })
  onTestFinished(() => scaffold.close())
  await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd)
  const project = await rpc<{ id: DramaProjectId }>(scaffold, 'shortDrama/create', { title: 'The last light' })
  const projectId = project.id
  const script = await rpc<{ scripts: { id: string }[] }>(scaffold, 'shortDrama/saveDraft', {
    projectId, expectedRevision: 0, synopsis: 'A keeper and a traveller share a light.', script: 'PLATFORM — NIGHT\nThe keeper passes the light.\nSTREET — NIGHT\nThe traveller finds the way home.',
  })
  await rpc(scaffold, 'shortDrama/adoptScript', { projectId, expectedRevision: 1, scriptId: script.scripts[0]!.id })
  let production = await rpc<DramaProduction>(scaffold, `${namespace}/read`, { projectId })
  const write = async (method: string, args: Record<string, unknown>) => {
    production = await rpc<DramaProduction>(scaffold, `${namespace}/${method}`, { projectId, expectedRevision: production.revision, ...args })
    return production
  }
  const route: DramaRoute = { adapter: 'jobs-v1', endpoint: api.endpoint, model: 'fixture', credentialRef: '', voice: '' }
  await write('saveSettings', { settings: { image: route, video: route, voice: route } })
  await write('saveAsset', { draft: { id: null, kind: 'character', name: 'Keeper', prompt: 'Blue coat, carrying an old lamp.' } })
  await write('saveAsset', { draft: { id: null, kind: 'scene', name: 'Station', prompt: 'An empty rainy platform at night.' } })
  const assetIds = production.assets.map(asset => asset.id)
  const generate = async (targetType: 'asset' | 'shot', targetId: string, kind: 'image' | 'video' | 'voice') => {
    const jobId = randomUUID()
    await write('generate', { jobId, targetType, targetId, kind })
    const before = api.posts()
    await write('generate', { jobId, targetType, targetId, kind })
    expect(api.posts()).toBe(before)
    for (let attempt = 0; attempt < 4 && production.jobs.find(job => job.id === jobId)?.state !== 'ready'; attempt++) {
      production = await rpc<DramaProduction>(scaffold, `${namespace}/observe`, { projectId, jobId })
    }
    const job = production.jobs.find(item => item.id === jobId)
    expect(job?.state, job?.reason ?? `${kind} generation`).toBe('ready')
    const output = job?.outputs[0]
    if (!output) throw new Error(`Missing archived ${kind} output.`)
    expect(output.url).toMatch(/^\/api\/short-drama-media\?/u)
    const preview = await scaffold.hostFetch(output.url)
    expect(preview.status).toBe(200)
    expect((await preview.arrayBuffer()).byteLength).toBe(output.bytes)
    await write('adoptMedia', { jobId, mediaId: output.id })
  }
  const controller = new AbortController()
  const service: ShortDramaProduction = scaffold.ctx.shortDramaProduction
  const updates = service.watch(projectId, controller.signal)[Symbol.asyncIterator]()
  const initial = await updates.next()
  if (initial.done) throw new Error('Production observation ended before its initial state.')
  expect(initial.value.revision).toBe(production.revision)
  const changed = updates.next()
  await generate('asset', assetIds[0]!, 'image')
  const submitted = await changed
  if (submitted.done) throw new Error('Production observation ended before media submission.')
  expect(submitted.value.jobs.some(job => job.targetId === assetIds[0])).toBe(true)
  controller.abort()
  expect((await updates.next()).done).toBe(true)
  for (const [scene, title] of [['Platform', 'Pass the light'], ['Street', 'Find the way']]) {
    await write('saveShot', { draft: { id: null, scene, title, prompt: title, dialogue: 'The light stays with you.', frames: 24, assetIds } })
  }
  const expectedReferences = production.assets.map(asset => ({ id: asset.id, version: asset.version }))
  expect(production.shots.map(shot => shot.assetVersions)).toEqual([expectedReferences, expectedReferences])
  const shotIds = production.shots.map(shot => shot.id)
  for (const id of shotIds) {
    await generate('shot', id, 'image')
    await generate('shot', id, 'video')
    await generate('shot', id, 'voice')
  }
  const clips: DramaTimelineClip[] = production.shots.map((shot) => {
    if (!shot.adoptedVideoId) throw new Error('A shot has no adopted video.')
    return { shotId: shot.id, videoId: shot.adoptedVideoId, voiceId: shot.adoptedVoiceId, startFrame: 6, frames: 12, subtitle: shot.title }
  })
  await write('saveTimeline', { clips })
  const exportId = randomUUID()
  await write('exportEpisode', { exportId })
  const exported = production.exports[0]
  if (!exported) throw new Error('The episode export was not recorded.')
  expect(exported.frames).toBe(24)
  expect(exported.clips).toEqual(clips)
  const finished = await scaffold.hostFetch(exported.video.url)
  expect(finished.status).toBe(200)
  expect(finished.headers.get('content-type')).toContain('video/mp4')
  const frozenBytes = Buffer.from(await finished.arrayBuffer())
  expect(frozenBytes.length).toBeGreaterThan(1000)
  const renderedPath = join(root, 'episode.mp4')
  await writeFile(renderedPath, frozenBytes)
  const probe = z.object({ streams: z.array(z.object({ codec_type: z.string(), nb_frames: z.string().optional() })) })
    .parse(JSON.parse((await runFile('ffprobe', [
      '-v', 'error', '-show_entries', 'stream=codec_type,nb_frames', '-of', 'json', renderedPath,
    ], { timeout: 30_000 })).stdout))
  expect(probe.streams.map(stream => stream.codec_type)).toEqual(['video', 'audio', 'subtitle'])
  expect(probe.streams.find(stream => stream.codec_type === 'video')?.nb_frames).toBe('24')
  expect((await fetch(new URL(exported.video.url, scaffold.baseUrl))).status).toBe(401)
  const missing = await scaffold.hostFetch(exported.video.url.replace(/mediaId=[^&]+/u, `mediaId=${randomUUID()}`))
  expect(missing.status).toBe(404)
  const invalidRange = await scaffold.hostFetch(exported.video.url, { headers: { range: 'bytes=99999999-' } })
  expect(invalidRange.status).toBe(416)
  const range = await scaffold.hostFetch(exported.video.url, { headers: { range: 'bytes=0-31' } })
  expect(range.status).toBe(206)
  expect(range.headers.get('content-range')).toBe(`bytes 0-31/${frozenBytes.length}`)
  expect(Buffer.from(await range.arrayBuffer())).toEqual(frozenBytes.subarray(0, 32))
  const analysisRequestId = randomUUID()
  const analyzed = await rpc<MediaAnalysisRecord>(scaffold, 'studioMediaAnalysis/analyze', {
    projectId, mediaId: exported.video.id, mode: 'scenes', requestId: analysisRequestId,
  })
  expect(analyzed).toMatchObject({ state: 'ready', mode: 'scenes', result: {
    durationSeconds: 1, videoTracks: [{ width: 160, height: 120 }], audioTracks: [{ channels: 2 }],
    scenes: [{ startSeconds: 0, endSeconds: 1 }],
  } })
  const repeated = await rpc<MediaAnalysisRecord>(scaffold, 'studioMediaAnalysis/analyze', {
    projectId, mediaId: exported.video.id, mode: 'scenes', requestId: analysisRequestId,
  })
  expect(repeated).toEqual(analyzed)
  expect(await rpc(scaffold, 'studioMediaAnalysis/read', { projectId, mediaId: exported.video.id })).toEqual([analyzed])
  const unavailableTranscript = await rpc<MediaAnalysisRecord>(scaffold, 'studioMediaAnalysis/analyze', {
    projectId, mediaId: exported.video.id, mode: 'transcript', requestId: randomUUID(),
  })
  expect(unavailableTranscript).toMatchObject({ state: 'ready', result: { transcript: { state: 'unavailable', reason: 'missing-config' } } })
  expect(await rpc<DramaProduction>(scaffold, `${namespace}/read`, { projectId })).toEqual(production)
  const edit = {
    version: 1 as const, tracks: [
      { id: randomUUID(), kind: 'video' as const, name: 'Picture', muted: false,
        clips: clips.map((clip, index) => ({ id: randomUUID(), mediaId: clip.videoId, sourceStartFrame: 0,
          startFrame: index * 12, frames: 12, volume: 1, opacity: 1, transform: { x: 0, y: 0, width: 1, height: 1 } })) },
      { id: randomUUID(), kind: 'audio' as const, name: 'Voice', muted: false,
        clips: [{ id: randomUUID(), mediaId: clips[0]!.voiceId!, startFrame: 0, sourceStartFrame: 0, frames: 24, volume: 0.3 }] },
      { id: randomUUID(), kind: 'subtitle' as const, name: 'Confirmed subtitles', muted: false,
        clips: [{ id: randomUUID(), startFrame: 6, frames: 12, text: 'Come home.' }] },
    ],
  }
  await write('saveEdit', { edit })
  expect(production.edit).toEqual(edit)
  expect(production.timeline).toEqual(clips)
  if (process.env.DSH_TEST_MELT) {
    const multiExportId = randomUUID()
    await write('exportEpisode', { exportId: multiExportId })
    const multi = production.exports.find(item => item.id === multiExportId)!
    expect(multi.edit).toEqual(edit)
    expect(multi.frames).toBe(24)
    expect((await (await scaffold.hostFetch(multi.video.url)).arrayBuffer()).byteLength).toBeGreaterThan(1000)
    await write('exportEpisode', { exportId: multiExportId })
    expect(production.exports.filter(item => item.id === multiExportId)).toHaveLength(1)
  }
  const oldVideo = production.jobs.find(job => job.targetId === shotIds[0] && job.kind === 'video')
  const oldVideoId = oldVideo?.outputs[0]?.id
  if (!oldVideo || !oldVideoId) throw new Error('The first shot video has no saved candidate.')
  await generate('shot', shotIds[0]!, 'image')
  expect(production.shots[0]?.adoptedVideoId).toBeNull()
  await expect(write('adoptMedia', { jobId: oldVideo.id, mediaId: oldVideoId })).rejects.toThrow('short-drama/source-changed')
  expect(production.exports[0]).toEqual(exported)
  const first = production.assets[0]!
  await write('saveAsset', { draft: { id: first.id, kind: first.kind, name: first.name, prompt: 'Keeper wearing a red coat.' } })
  expect(production.shots.every(shot => shot.needsReview)).toBe(true)
  expect(production.exports[0]).toEqual(exported)
  const beforeReload = structuredClone(production)
  expect(await rpc(scaffold, 'pluginManager/setBundleEnabled', { name: packageName, enabled: false }))
    .toMatchObject({ application: 'applied' })
  expect(await rpc(scaffold, 'pluginManager/setBundleEnabled', { name: packageName, enabled: true }))
    .toMatchObject({ application: 'applied' })
  production = await rpc<DramaProduction>(scaffold, `${namespace}/read`, { projectId })
  expect(production).toEqual(beforeReload)
  expect(await rpc(scaffold, 'studioMediaAnalysis/read', { projectId, mediaId: exported.video.id }))
    .toEqual([analyzed, unavailableTranscript])
  expect(await rpc(scaffold, 'studioMediaAnalysis/analyze', {
    projectId, mediaId: exported.video.id, mode: 'scenes', requestId: analysisRequestId,
  })).toEqual(analyzed)
  expect(Buffer.from(await (await scaffold.hostFetch(exported.video.url)).arrayBuffer())).toEqual(frozenBytes)
  await write('saveShot', { draft: { ...production.shots[0]!, title: 'Updated shot after reload', assetIds } })
  expect(production.shots[0]?.title).toBe('Updated shot after reload')
  expect(production.exports[0]).toEqual(exported)
  const second = await rpc<{ id: string }>(scaffold, 'shortDrama/create', { title: 'Another production' })
  await expect(rpc(scaffold, 'studioMediaAnalysis/analyze', {
    projectId: second.id, mediaId: exported.video.id, mode: 'inspect', requestId: randomUUID(),
  })).rejects.toThrow('short-drama/')
  let other = await rpc<DramaProduction>(scaffold, `${namespace}/read`, { projectId: second.id })
  other = await rpc<DramaProduction>(scaffold, `${namespace}/saveSettings`, {
    projectId: second.id, expectedRevision: other.revision, settings: { image: route, video: route, voice: route },
  })
  other = await rpc<DramaProduction>(scaffold, `${namespace}/saveAsset`, {
    projectId: second.id, expectedRevision: other.revision,
    draft: { id: null, kind: 'character', name: 'Another keeper', prompt: 'Another independent reference.' },
  })
  const sharedKey = randomUUID()
  const [left, right] = await Promise.all([
    rpc<DramaProduction>(scaffold, `${namespace}/generate`, {
      projectId, expectedRevision: production.revision, jobId: sharedKey,
      targetType: 'asset', targetId: production.assets[0]!.id, kind: 'image',
    }),
    rpc<DramaProduction>(scaffold, `${namespace}/generate`, {
      projectId: second.id, expectedRevision: other.revision, jobId: sharedKey,
      targetType: 'asset', targetId: other.assets[0]!.id, kind: 'image',
    }),
  ])
  expect(left.jobs.find(job => job.id === sharedKey)?.targetId).toBe(production.assets[0]!.id)
  expect(right.jobs.find(job => job.id === sharedKey)?.targetId).toBe(other.assets[0]!.id)
  expect(api.posts()).toBe(10)
  const reference = production.jobs.find(job => job.targetType === 'asset' && job.kind === 'image')?.outputs[0]?.id
  if (!reference) throw new Error('The original asset candidate is missing.')
  await expect(rpc(scaffold, `${namespace}/generate`, {
    projectId: second.id, expectedRevision: right.revision, jobId: randomUUID(),
    targetType: 'asset', targetId: other.assets[0]!.id, kind: 'image', referenceMediaIds: [reference],
  })).rejects.toThrow('short-drama/')
  expect(api.posts()).toBe(10)
  const edited = await rpc<DramaProduction>(scaffold, `${namespace}/generate`, {
    projectId, expectedRevision: left.revision, jobId: randomUUID(),
    targetType: 'asset', targetId: production.assets[0]!.id, kind: 'image', referenceMediaIds: [reference],
  })
  expect(edited.jobs).toHaveLength(left.jobs.length + 1)
  expect(api.referenceCounts.at(-1)).toBe(1)
  expect(api.posts()).toBe(11)
  expect(await rpc(scaffold, 'pluginManager/setBundleEnabled', { name: packageName, enabled: false }))
    .toMatchObject({ application: 'applied' })
  expect((await scaffold.hostFetch(exported.video.url)).status).toBe(404)
})
