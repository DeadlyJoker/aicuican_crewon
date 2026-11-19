/** The short-drama bundle shares durable project revisions between Web RPCs and scoped Agent tools. */
import { randomUUID } from 'node:crypto'
import { zipSync, strToU8 } from 'fflate'
import { join } from 'node:path'
import { assembleContextFor, type Agent } from '@deepseek-ai/dsh-agent'
import { renderPrompt, renderContextSnapshot } from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { expect, it, onTestFinished, vi } from 'vitest'
import { launchWebScaffold, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { REPO_ROOT } from './support.ts'

const readScript = 'short_drama_read_script'
const saveScript = 'short_drama_save_script'

type RpcResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }

interface Project {
  id: string
  title: string
  synopsis: string
  revision: number
  scripts: { id: string; body: string }[]
  adoptedScriptId: string | null
}

async function request<T>(scaffold: WebScaffold, method: string, args: Record<string, unknown> = {}): Promise<RpcResult<T>> {
  const response = await scaffold.hostFetch(`/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args } }),
  })
  if (!response.ok) throw new Error(`${method} returned HTTP ${response.status}: ${await response.text()}`)
  return (await response.json() as { result: RpcResult<T> }).result
}

async function result<T>(scaffold: WebScaffold, method: string, args?: Record<string, unknown>): Promise<T> {
  const reply = await request<T>(scaffold, method, args)
  if (!reply.ok) throw new Error(`${method} failed: ${reply.error.code}: ${reply.error.message}`)
  return reply.value
}

async function invoke(scaffold: WebScaffold, agent: Agent, name: string, args: Record<string, unknown> = {}) {
  const modelSelection = agent.model.current()
  if (!modelSelection) throw new Error('The native conversation has no model selection.')
  const signal = new AbortController().signal
  const tools = scaffold.ctx.tools
  const toolSet = await tools.resolve({ agent, modelSelection, signal })
  try {
    const visible = tools.schemas(agent, toolSet).map(schema => schema.name)
    const batch = await tools.execute({
      agent, signal, toolSet,
      calls: [{ type: 'tool-call', id: ToolCallId(randomUUID()), name, arguments: JSON.stringify(args) }],
    })
    const call = batch.results[0]
    if (!call) throw new Error(`No tool result for ${name}.`)
    return { visible, result: call.result }
  } finally {
    toolSet.dispose()
  }
}

it.skipIf(webSnapshotMode() === 'record')('opens a reserved project conversation and shares script versions with its Agent', async () => {
  const scaffold = await launchWebScaffold({
    profile: { packages: [{ dir: join(REPO_ROOT, 'packages/bundle/short-drama'), enabled: true }] },
  })
  onTestFinished(() => scaffold.close())
  const workspace = await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd)
  const title = 'The last recording'
  const synopsis = 'A technician hears tomorrow’s announcement on a damaged tape.'
  const humanScript = 'INT. STATION — NIGHT\nMara plays the tape.'
  const agentScript = 'INT. STATION — NIGHT\nMara rewinds the tape. The announcement starts before she presses Play.'

  expect(await result(scaffold, 'shortDrama/list')).toEqual([])
  const created = await result<Project>(scaffold, 'shortDrama/create', { title })
  const projectId = created.id
  expect(created).toMatchObject({ title, revision: 0, synopsis: '', scripts: [], adoptedScriptId: null })
  const saved = await result<Project>(scaffold, 'shortDrama/saveDraft', { projectId, expectedRevision: 0, synopsis, script: humanScript })
  const first = saved.scripts[0]
  if (!first) throw new Error('The Web editor did not save a candidate.')
  const adopted = await result<Project>(scaffold, 'shortDrama/adoptScript', { projectId, expectedRevision: 1, scriptId: first.id })
  expect(adopted).toMatchObject({ revision: 2, adoptedScriptId: first.id })

  const open = () => result<string>(scaffold, 'shortDrama/openConversation', { projectId })
  const [opened, duplicate] = await Promise.all([open(), open()])
  const sessionId = SessionId(opened)
  expect(scaffold.ctx.agentPresets.presetForSession(scaffold.ctx.agents.get(sessionId)!.session)).toBe('studio-director')
  expect(duplicate).toBe(sessionId)
  expect(await open()).toBe(sessionId)
  expect(workspace.sessionIds).toEqual([])
  const catalogue = await result<{ id: string; workspaceId: string; sessionIds: string[] }[]>(scaffold, 'shortDrama/studioCatalogue')
  const projectScope = catalogue.find(item => item.id === projectId)
  expect(projectScope?.sessionIds).toEqual([sessionId])
  const isolated = scaffold.ctx.workspaceRegistry.list().find(item => item.id === projectScope?.workspaceId)
  expect(isolated?.namespace).toBe('crewon-studio')
  expect(isolated?.path).not.toBe(workspace.path)
  expect(scaffold.ctx.sessions.get(sessionId)?.header.cwd).toBe(isolated?.path)
  expect(await result(scaffold, 'shortDrama/readStudio', { projectId })).toEqual({ revision: 0, storage: {} })
  const document = { revision: 0, storage: { 'crewon-studio-demo-v1': JSON.stringify({ nodes: [{ id: 'draft', x: 25, y: 80 }] }) } }
  const documents = await Promise.all([
    request(scaffold, 'shortDrama/saveStudio', { projectId, document }),
    request(scaffold, 'shortDrama/saveStudio', { projectId, document }),
  ])
  expect(documents.filter(item => item.ok)).toHaveLength(1)
  expect(documents.find(item => !item.ok)).toMatchObject({ ok: false, error: { code: 'short-drama/revision-conflict' } })
  expect(await result(scaffold, 'shortDrama/readStudio', { projectId })).toEqual({ ...document, revision: 1 })

  const initialLayout = await result(scaffold, 'shortDrama/readCanvas', { projectId })
  expect(initialLayout).toEqual({ revision: 0, positions: {}, viewport: { x: 0, y: 0, zoom: 1 } })
  const layout = { revision: 0, positions: { script: { x: 120, y: 80 } }, viewport: { x: -30, y: 12, zoom: 0.8 } }
  const writes = await Promise.all([
    request(scaffold, 'shortDrama/saveCanvas', { projectId, layout }),
    request(scaffold, 'shortDrama/saveCanvas', { projectId, layout }),
  ])
  expect(writes.filter(write => write.ok)).toHaveLength(1)
  expect(writes.find(write => !write.ok)).toMatchObject({ ok: false, error: { code: 'short-drama/revision-conflict' } })
  expect(await result(scaffold, 'shortDrama/readCanvas', { projectId })).toEqual({ ...layout, revision: 1 })
  expect(await result(scaffold, 'shortDrama/conversationProject', { sessionId })).toMatchObject({ id: projectId, revision: 2 })
  expect(await request(scaffold, 'shortDrama/saveCanvas', { projectId, layout: { ...layout, revision: 1, viewport: { x: 0, y: 0, zoom: 0 } } }))
    .toMatchObject({ ok: false, error: { code: 'short-drama/invalid-input' } })

  await expect(scaffold.ctx.sessionController.create({ workspaceId: workspace.id, sessionId }))
    .rejects.toThrow('belongs to')
  const other = await scaffold.ctx.sessionController.create({ workspaceId: workspace.id })
  expect(other.sessionId).not.toBe(sessionId)
  const agent = scaffold.ctx.agents.get(sessionId)
  const otherAgent = scaffold.ctx.agents.get(other.sessionId)
  if (!agent || !otherAgent) throw new Error('The Web Host did not create both native Agents.')
  const assembly = await scaffold.ctx.systemPrompt.assemble(assembleContextFor(agent, new AbortController().signal))
  expect(renderPrompt(assembly)).toContain('CrewON Studio director')
  expect(renderPrompt(assembly)).not.toContain('You are a coding agent')
  expect(renderContextSnapshot(assembly)).toContain('Skill: studio-image-prompts')
  expect(scaffold.ctx.agentPresets.presetForSession(otherAgent.session)).toBe('standard')

  const blocked = await invoke(scaffold, otherAgent, saveScript, { expectedRevision: 2, script: 'Wrong conversation' })
  expect(blocked.visible).not.toContain(readScript)
  expect(blocked.visible).not.toContain(saveScript)
  expect(blocked.result.isError).toBe(true)

  const read = await invoke(scaffold, agent, readScript)
  expect(read.visible).toEqual(expect.arrayContaining([readScript, saveScript]))
  expect(read.result).toMatchObject({ isError: false, value: { title, synopsis, revision: 2, script: humanScript } })
  const candidate = await invoke(scaffold, agent, saveScript, { expectedRevision: 2, script: agentScript })
  expect(candidate.result).toMatchObject({ isError: false, value: { revision: 3 } })

  expect(await request(scaffold, 'shortDrama/saveDraft', { projectId, expectedRevision: 2, synopsis, script: 'Stale editor' }))
    .toMatchObject({ ok: false, error: { code: 'short-drama/revision-conflict' } })
  const current = await result<Project>(scaffold, 'shortDrama/read', { projectId })
  expect(current).toMatchObject({ title, synopsis, revision: 3, adoptedScriptId: first.id })
  expect(current.scripts.map(script => script.body)).toEqual([humanScript, agentScript])
  expect(await result(scaffold, 'shortDrama/list')).toEqual([{ id: projectId, title, revision: 3 }])
  expect((await invoke(scaffold, agent, readScript)).result).toMatchObject({ value: { script: humanScript } })
  expect((await invoke(scaffold, agent, readScript, { latestDraft: true })).result).toMatchObject({ value: { script: agentScript } })

  const productionRead = await invoke(scaffold, agent, 'short_drama_read_production')
  expect(productionRead.result).toMatchObject({
    isError: false, value: { revision: 0, assets: [], shots: [], configured: { image: false, video: false, voice: false } },
  })
  const assetArguments = { expectedRevision: 0, kind: 'character', name: 'Mara', prompt: 'A station technician in a raincoat.' }
  const deniedAsset = await invoke(scaffold, otherAgent, 'short_drama_save_asset', assetArguments)
  expect(deniedAsset.visible).not.toContain('short_drama_read_production')
  expect(deniedAsset.visible).not.toContain('short_drama_save_asset')
  expect(deniedAsset.result.isError).toBe(true)
  const allowedAsset = await invoke(scaffold, agent, 'short_drama_save_asset', assetArguments)
  expect(allowedAsset.result).toMatchObject({ isError: false, value: { revision: 1 } })
  const production = await result<{ revision: number; assets: { id: string; name: string }[] }>(
    scaffold, 'shortDramaProduction/read', { projectId },
  )
  expect(production).toMatchObject({ revision: 1, assets: [{ name: 'Mara' }] })
  const allowedShot = await invoke(scaffold, agent, 'short_drama_save_shot', {
    expectedRevision: 1, scene: 'Station', title: 'The announcement', prompt: 'Mara listens beside the old recorder.',
    dialogue: 'The voice is mine.', frames: 48, assetIds: [production.assets[0]!.id],
  })
  expect(allowedShot.result).toMatchObject({ isError: false, value: { revision: 2 } })
  expect(await result(scaffold, 'shortDramaProduction/read', { projectId }))
    .toMatchObject({ revision: 2, shots: [{ title: 'The announcement', needsReview: false }] })
  expect((await invoke(scaffold, otherAgent, 'short_drama_save_timeline', { expectedRevision: 2, clips: [] })).result.isError).toBe(true)
  const edit = await invoke(scaffold, agent, 'short_drama_save_timeline', { expectedRevision: 2, clips: [] })
  expect(edit.result).toMatchObject({ isError: false, value: { revision: 3 } })
  const emptyExport = await invoke(scaffold, agent, 'short_drama_export_episode', { expectedRevision: 3, exportId: randomUUID() })
  expect(emptyExport.result.isError).toBe(true)
  expect(await result(scaffold, 'shortDramaProduction/read', { projectId })).toMatchObject({ exports: [] })
})

it.skipIf(webSnapshotMode() === 'record')('shares creation settings and imported sources while rejecting stale saves', async () => {
  const scaffold = await launchWebScaffold({
    profile: { packages: [{ dir: join(REPO_ROOT, 'packages/bundle/short-drama'), enabled: true }] },
  })
  onTestFinished(() => scaffold.close())
  const draft = { 'crewon-studio-demo-v1': JSON.stringify({ referenceDrama: 'adapt',
    referenceOptions: { genreMain: '悬疑', genreBlend: '都市情感', style: '电影感' },
    referenceAdaptation: { mode: 'continue', episodes: 5 }, referenceScriptInput: { text: '原稿', source: 'paste' } }) }
  const saved = await result<{ revision: number; storage: Record<string, string> }>(scaffold, 'shortDrama/saveEntryDocument',
    { document: { revision: 0, storage: draft } })
  expect(saved).toEqual({ revision: 1, storage: draft })
  expect(await result(scaffold, 'shortDrama/readEntryDocument')).toEqual(saved)
  const stale = await request(scaffold, 'shortDrama/saveEntryDocument', { document: { revision: 0, storage: {} } })
  expect(stale.ok).toBe(false)
  if (stale.ok) throw new Error('The stale creation draft was accepted')
  expect(stale.error.code).toBe('short-drama/revision-conflict')
  const uploaded = await scaffold.hostFetch('/api/studio-entry-source?name=original.md', { method: 'POST', body: '《原稿》\n雨停了。' })
  expect(uploaded.status).toBe(200)
  const source = await uploaded.json() as { id: string; name: string; text: string }
  expect(source.text).toBe('《原稿》\n雨停了。')
  const project = await result<Project>(scaffold, 'shortDrama/create', { title: '完整输入' })
  const copied = await result<{ name: string; path: string }[]>(scaffold, 'shortDrama/copyEntrySources',
    { projectId: project.id, ids: [source.id] })
  expect(copied[0]?.name).toBe('original.md')
  expect(copied[0]?.path).toMatch(/^source\//u)
  const docx = zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="xml" ContentType="application/xml"/></Types>'),
    '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"'
      + ' Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + '<w:body><w:p><w:r><w:t>Word 原稿正文</w:t></w:r></w:p></w:body></w:document>'),
  })
  const word = await scaffold.hostFetch('/api/studio-entry-source?name=original.docx', { method: 'POST', body: Buffer.from(docx) })
  expect(word.status).toBe(200)
  expect(await word.json()).toMatchObject({ kind: 'script', text: 'Word 原稿正文' })
  const invalid = await scaffold.hostFetch('/api/studio-entry-source?name=broken.docx', { method: 'POST', body: 'not a Word document' })
  expect(invalid.status).toBe(422)
  expect(await result(scaffold, 'shortDrama/readEntryDocument')).toEqual(saved)
})

it.skipIf(webSnapshotMode() === 'record')('shares generation defaults while retaining existing project routes', async () => {
  const scaffold = await launchWebScaffold({
    profile: { packages: [{ dir: join(REPO_ROOT, 'packages/bundle/short-drama'), enabled: true }] },
  })
  onTestFinished(() => scaffold.close())
  const old = await result<Project>(scaffold, 'shortDrama/create', { title: 'Existing project' })
  await result(scaffold, 'shortDramaProduction/read', { projectId: old.id })
  const settings = { image: { adapter: 'zealman', endpoint: 'https://media.example/', model: 'image-workflow',
    referenceModel: 'edit-workflow', credentialRef: '', voice: '' }, video: null, voice: null }
  expect(await result(scaffold, 'shortDramaProduction/saveSharedSettings', { expectedRevision: 0, settings }))
    .toEqual({ revision: 1, settings })
  expect(await request(scaffold, 'shortDramaProduction/saveSharedSettings', { expectedRevision: 0, settings }))
    .toMatchObject({ ok: false, error: { code: 'short-drama/revision-conflict' } })
  const next = await result<Project>(scaffold, 'shortDrama/create', { title: 'New project' })
  await result(scaffold, 'shortDramaProduction/saveSettings', { projectId: next.id, expectedRevision: 0, settings })
  expect(await result(scaffold, 'shortDramaProduction/read', { projectId: next.id })).toMatchObject({ settings })
  expect(await result(scaffold, 'shortDramaProduction/read', { projectId: old.id }))
    .toMatchObject({ settings: { image: null, video: null, voice: null } })
  expect(await result(scaffold, 'shortDramaProduction/readSharedSettings')).toEqual({ revision: 1, settings })
})

it.skipIf(webSnapshotMode() === 'record')('includes saved dialogue in video input and submits a repeated attempt only once', async () => {
  const scaffold = await launchWebScaffold({
    profile: { packages: [{ dir: join(REPO_ROOT, 'packages/bundle/short-drama'), enabled: true }] },
  })
  onTestFinished(() => scaffold.close())
  const realFetch = globalThis.fetch
  const prompts: string[] = []
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.startsWith('https://media.example/')) return realFetch(input, init)
    if (url.endsWith('/v1/jobs')) {
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { requestId: string; kind: string; input: { prompt: string } }
      if (body.kind === 'video') {
        prompts.push(body.input.prompt)
        return Response.json({ requestId: body.requestId, taskId: 'video-task', state: 'accepted' })
      }
      return Response.json({ requestId: body.requestId, taskId: 'image-task', state: 'succeeded',
        outputs: [{ artifactId: 'image', mimeType: 'image/png' }] })
    }
    return new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cRZkAAAAASUVORK5CYII=', 'base64'))
  })
  onTestFinished(() => { spy.mockRestore() })
  const project = await result<Project>(scaffold, 'shortDrama/create', { title: 'Dialogue test' })
  const draft = await result<Project>(scaffold, 'shortDrama/saveDraft', {
    projectId: project.id, expectedRevision: 0, synopsis: 'A paper crane by the window.', script: '阿禾：它会飞吗？奶奶：等风来。',
  })
  await result(scaffold, 'shortDrama/adoptScript', { projectId: project.id, expectedRevision: 1, scriptId: draft.scripts[0]!.id })
  const route = { adapter: 'jobs-v1', endpoint: 'https://media.example/', model: 'test', credentialRef: '', voice: '' }
  await result(scaffold, 'shortDramaProduction/saveSettings', {
    projectId: project.id, expectedRevision: 0, settings: { image: route, video: route, voice: null },
  })
  type State = { revision: number; shots: { id: string }[]; jobs: { id: string; outputs: { id: string }[] }[] }
  const shots = await result<State>(scaffold, 'shortDramaProduction/saveShot', {
    projectId: project.id, expectedRevision: 1, draft: { id: null, scene: 'Room', title: 'Crane', prompt: 'A girl beside a paper crane.',
      dialogue: '阿禾：它会飞吗？\n奶奶：等风来。', frames: 192, assetIds: [] },
  })
  const targetId = shots.shots[0]!.id
  const imageJob = randomUUID()
  const image = await result<State>(scaffold, 'shortDramaProduction/generate', {
    projectId: project.id, expectedRevision: 2, jobId: imageJob, targetType: 'shot', targetId, kind: 'image',
  })
  await result(scaffold, 'shortDramaProduction/adoptMedia', {
    projectId: project.id, expectedRevision: image.revision, jobId: imageJob, mediaId: image.jobs[0]!.outputs[0]!.id,
  })
  const jobId = randomUUID()
  const args = { projectId: project.id, expectedRevision: image.revision + 1, jobId, targetType: 'shot', targetId, kind: 'video' }
  await result(scaffold, 'shortDramaProduction/generate', args)
  await result(scaffold, 'shortDramaProduction/generate', args)
  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toContain('视频时长：8 秒')
  expect(prompts[0]).toContain('阿禾：它会飞吗？\n奶奶：等风来。')
})

it.skipIf(webSnapshotMode() === 'record')('persists creative decisions, scopes native skills and blocks invalid plans before submission', async () => {
  const scaffold = await launchWebScaffold({
    profile: { packages: [{ dir: join(REPO_ROOT, 'packages/bundle/short-drama'), enabled: true }] },
  })
  onTestFinished(() => scaffold.close())
  const project = await result<Project>(scaffold, 'shortDrama/create', { title: 'Creative decisions' })
  const draft = await result<Project>(scaffold, 'shortDrama/saveDraft', {
    projectId: project.id, expectedRevision: 0, synopsis: 'A paper crane.', script: '阿禾把纸鹤放在窗台。阿禾：等风来。',
  })
  await result(scaffold, 'shortDrama/adoptScript', { projectId: project.id, expectedRevision: 1, scriptId: draft.scripts[0]!.id })
  const session = SessionId(await result<string>(scaffold, 'shortDrama/openConversation', { projectId: project.id }))
  const agent = scaffold.ctx.agents.get(session)
  if (!agent) throw new Error('The project Agent did not open.')
  const names = (await scaffold.ctx.skills.list({ cwd: agent.session.header.cwd })).map(item => item.name)
  expect(names).toContain('studio-director')
  expect(names).toContain('studio-image-prompts')
  expect((await scaffold.ctx.skills.list({ cwd: scaffold.workspaceCwd })).map(item => item.name)).not.toContain('studio-director')
  const diagnosis = { id: randomUUID(), scriptId: draft.scripts[0]!.id, summary: 'Check the crane handoff.',
    issues: [{ scene: 'Window', quote: 'Invented quote', severity: 'warning', problem: 'Missing trigger.', suggestion: 'Keep the wind causal.' }] }
  expect((await invoke(scaffold, agent, 'short_drama_save_creative', {
    expectedRevision: 0, kind: 'diagnosis', document: JSON.stringify(diagnosis),
  })).result.isError).toBe(true)
  diagnosis.issues[0]!.quote = '阿禾把纸鹤放在窗台。'
  expect((await invoke(scaffold, agent, 'short_drama_save_creative', {
    expectedRevision: 0, kind: 'diagnosis', document: JSON.stringify(diagnosis),
  })).result).toMatchObject({ isError: false, value: { revision: 1 } })
  type State = { revision: number; shots: { id: string }[]; creative: { diagnoses: { id: string }[]; plans: { id: string }[] } }
  const shot = await result<State>(scaffold, 'shortDramaProduction/saveShot', { projectId: project.id, expectedRevision: 1, draft: {
    id: null, scene: 'Window', title: 'Paper crane', prompt: 'A child by a window.', dialogue: '阿禾：等风来。', frames: 144, assetIds: [],
  } })
  const shotId = shot.shots[0]!.id
  const plan = { id: randomUUID(), shotId, shotVersion: 1, mode: 't2va', purpose: 'Wait for wind.', geography: 'Child by window.',
    camera: 'Static.', lighting: 'Soft daylight.', entryState: 'Crane rests.', exitState: 'Crane stays.',
    beats: [{ start: 0, end: 7, action: 'Child speaks softly.', speaker: '阿禾', dialogue: '等风来。' }],
    references: [], soundscape: 'Chinese dialogue and wind.', music: 'None.' }
  await result(scaffold, 'shortDramaProduction/saveCreative', { projectId: project.id, expectedRevision: 2,
    kind: 'shot', document: JSON.stringify(plan) })
  expect(await result(scaffold, 'shortDramaProduction/compileShot', { projectId: project.id, shotId })).toMatchObject({ valid: false })
  const route = { adapter: 'jobs-v1', endpoint: 'https://creative.example/', model: 'video', credentialRef: '', voice: '' }
  await result(scaffold, 'shortDramaProduction/saveSettings', { projectId: project.id, expectedRevision: 3,
    settings: { image: null, video: route, voice: null } })
  const realFetch = globalThis.fetch
  const submits: string[] = []
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.startsWith('https://creative.example/')) return realFetch(input, init)
    submits.push(typeof init?.body === 'string' ? init.body : '')
    const body = JSON.parse(submits.at(-1) ?? '{}') as { requestId: string }
    return Promise.resolve(Response.json({ requestId: body.requestId, taskId: 'creative-task', state: 'accepted' }))
  })
  onTestFinished(() => { spy.mockRestore() })
  const rejected = await request(scaffold, 'shortDramaProduction/generate', { projectId: project.id, expectedRevision: 4,
    jobId: randomUUID(), targetType: 'shot', targetId: shotId, kind: 'video' })
  expect(rejected.ok).toBe(false)
  expect(submits).toEqual([])
  plan.id = randomUUID(); plan.beats[0]!.end = 6
  await result(scaffold, 'shortDramaProduction/saveCreative', { projectId: project.id, expectedRevision: 4,
    kind: 'shot', document: JSON.stringify(plan) })
  expect(await result(scaffold, 'shortDramaProduction/compileShot', { projectId: project.id, shotId })).toMatchObject({ valid: true })
  await result(scaffold, 'shortDramaProduction/generate', { projectId: project.id, expectedRevision: 5,
    jobId: randomUUID(), targetType: 'shot', targetId: shotId, kind: 'video' })
  expect(submits).toHaveLength(1)
  expect(submits[0]).toContain('integrated_multimodal_description')
  const restored = await result<State>(scaffold, 'shortDramaProduction/read', { projectId: project.id })
  expect(restored.creative.diagnoses).toHaveLength(1)
  expect(restored.creative.plans).toHaveLength(2)
})

it.skipIf(webSnapshotMode() === 'record')('guides creative direction with versioned human confirmation and rejects a repeated confirmation', async () => {
  const scaffold = await launchWebScaffold({ profile: { packages: [{ dir: join(REPO_ROOT, 'packages/bundle/short-drama'), enabled: true }] } })
  onTestFinished(() => scaffold.close())
  const project = await result<Project>(scaffold, 'shortDrama/create', { title: 'A light left on' })
  const sessionId = SessionId(await result<string>(scaffold, 'shortDrama/openConversation', { projectId: project.id }))
  const agent = scaffold.ctx.agents.get(sessionId)
  if (!agent) throw new Error('The project Agent was not created')
  const read = () => result<{ token: string; progress: { stage: string; action: string }; revision: number; brief: { background: string } }>(scaffold, 'studioDirector/read', { sessionId })
  expect((await read()).progress.stage).toBe('idea')
  await result(scaffold, 'shortDrama/saveStudio', { projectId: project.id, document: { revision: 0, storage: {
    'crewon-studio-demo-v1': JSON.stringify({ referenceOptions: { genre: '家庭亲情', style: '写实电影', ratio: '16:9', episodes: '1 集' } }),
  } } })
  const preferences = await result<{ preferences: { genre: string; style: string; episodes: number } }>(scaffold, 'studioDirector/read', { sessionId })
  expect(preferences.preferences).toMatchObject({ genre: '家庭亲情', style: '写实电影', episodes: 1 })
  const brief = { storyPositioning: 'A family story about care across distance.', logline: 'A daughter leaves a light for her father.',
    synopsis: 'At night the father discovers the lamp. A call reveals his daughter switched it on. He leaves it beside her photo.',
    characterBios: [{ name: 'Father', background: 'Lives alone.', motivation: 'Wants connection.', arc: 'Finds comfort.', relationships: 'His daughter lives away.' }],
    episodeOutlines: [{ number: 1, title: 'The lamp', summary: 'A father discovers a lit lamp and a message.', conflict: 'He feels alone.',
      turningPoint: 'His daughter has lit it remotely.', ending: 'He sits in its warmth.', durationSeconds: 12 }],
    idea: 'A daughter leaves a light on remotely.', audience: 'Families', durationSeconds: 12, style: 'Natural cinema',
    background: 'A quiet home at night.', characters: 'Father and daughter.', conflict: 'Distance and companionship.',
    outline: 'The father notices the light and receives a message.', constraints: ['One location'], assumptions: ['The lamp is connected.'] }
  const mismatched = { ...brief, episodeOutlines: [...brief.episodeOutlines, { ...brief.episodeOutlines[0], number: 2 }] }
  expect((await invoke(scaffold, agent, 'short_drama_save_direction', { expectedRevision: 0, brief: mismatched })).result.isError).toBe(true)
  await invoke(scaffold, agent, 'short_drama_save_direction', { expectedRevision: 0, brief })
  const rejected = await invoke(scaffold, agent, saveScript, { expectedRevision: 0, script: 'Premature screenplay' })
  expect(JSON.stringify(rejected.result)).toContain('Confirm the creative direction')
  expect((await result<Project>(scaffold, 'shortDrama/read', { projectId: project.id })).scripts).toEqual([])
  const pending = await read()
  expect(pending.progress).toMatchObject({ stage: 'direction', action: 'confirm-direction' })
  expect(pending.brief.background).toBe(brief.background)
  const confirmations = await Promise.all([
    request(scaffold, 'studioDirector/confirm', { sessionId, token: pending.token }),
    request(scaffold, 'studioDirector/confirm', { sessionId, token: pending.token }),
  ])
  expect(confirmations.filter(item => item.ok)).toHaveLength(1)
  expect(confirmations.filter(item => !item.ok)).toHaveLength(1)
  expect((await read()).progress).toMatchObject({ stage: 'script', action: 'continue' })
  const saved = await result<Project>(scaffold, 'shortDrama/saveDraft', { projectId: project.id, expectedRevision: 0, synopsis: brief.idea, script: 'INT. HOME — NIGHT\nThe lamp turns on.' })
  const script = await read()
  expect(script.progress.action).toBe('adopt-script')
  await result(scaffold, 'studioDirector/confirm', { sessionId, token: script.token })
  const adopted = await result<Project>(scaffold, 'shortDrama/read', { projectId: project.id })
  expect(adopted.adoptedScriptId).toBe(saved.scripts[0]?.id)
  expect((await read()).progress.stage).toBe('assets')
})

it.skipIf(webSnapshotMode() === 'record')('retains an existing project preset when opening it again', async () => {
  const scaffold = await launchWebScaffold({ profile: { packages: [{ dir: join(REPO_ROOT, 'packages/bundle/short-drama'), enabled: true }] } })
  onTestFinished(() => scaffold.close())
  const project = await result<Project>(scaffold, 'shortDrama/create', { title: 'Existing project' })
  const sessionId = SessionId(await result<string>(scaffold, 'shortDrama/openConversation', { projectId: project.id }))
  const agent = scaffold.ctx.agents.get(sessionId)
  if (!agent) throw new Error('The project Agent was not created')
  await scaffold.ctx.agentPresets.select(agent, 'standard')
  const count = agent.session.seq
  expect(await result(scaffold, 'shortDrama/openConversation', { projectId: project.id })).toBe(sessionId)
  expect(scaffold.ctx.agentPresets.presetForSession(agent.session)).toBe('standard')
  expect(agent.session.seq).toBe(count)
  const assembly = await scaffold.ctx.systemPrompt.assemble(assembleContextFor(agent, new AbortController().signal))
  expect(renderContextSnapshot(assembly)).toContain('You are the Studio project director')
})
