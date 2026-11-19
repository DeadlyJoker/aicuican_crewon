/** Real HTTP/SSE coverage of the shared GUI Host's private native control transport. */
import { createHash } from 'node:crypto'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import SessionStore from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import type { PluginOperation } from '@deepseek-ai/dsh-plugin-manager/types'
import { expect, it, onTestFinished, vi } from 'vitest'
import {
  GUI_CONTROL_HEADER, GUI_CONTROL_PATH, GUI_EVENTS_PATH, installGuiHostControl,
  parseGuiControlResponse, parseGuiHostEvent, parseGuiHostReady, type GuiHostControl,
} from '../src/gui-host-control.ts'

const token = '6cfb247d0d3950f12f642c7d6c489902a52dddbb3a68d386b2b26b24d84b66df'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-gui-control-'))
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  await ctx.plugin(LocalFileSystem, { cwd: root })
  await ctx.plugin(SessionStore)
  ctx.provide('connection', {
    authenticatedUrl: (url: string) => `${url}/?token=browser-fixture`,
    browserPeer: {},
  } as never)
  ctx.provide('agents', { list: () => [] } as never)
  ctx.provide('jobs', { list: () => [] } as never)
  ctx.provide('sandboxPolicy', { workspaceRoot: root } as never)
  ctx.on('webserver/index-inject', (rows) => { rows.push({ kind: 'global', name: 'fixture', value: true }) })
  let control: GuiHostControl | undefined
  const fiber = await ctx.plugin((scope) => { control = installGuiHostControl(scope, token) })
  if (control === undefined) throw new Error('Control fixture did not start')
  const origin = ctx.webServer.getOrigin()
  const headers = { [GUI_CONTROL_HEADER]: token }
  const post = async (body: string) => fetch(origin + GUI_CONTROL_PATH, { method: 'POST', headers, body })
  return { ctx, root, fiber, control, origin, headers, post }
}

it('serves authenticated native boot metadata and the same local controller', async () => {
  const f = await fixture()
  const response = await fetch(f.origin + GUI_CONTROL_PATH, { headers: f.headers })
  expect(response.status).toBe(200)
  const ready = parseGuiHostReady(await response.json())
  expect(ready).toEqual(f.control.ready())
  expect(ready.url).toBe(`${f.origin}/?token=browser-fixture`)
  expect(ready.injections).toEqual([{ kind: 'global', name: 'fixture', value: true }])
  expect(ready.platformSession).toBeNull()
  expect(response.headers.get('cache-control')).toBe('no-store')
  const inspect = parseGuiControlResponse(await (await f.post('{"type":"quit-inspection"}')).json())
  expect(inspect).toEqual({ type: 'quit-inspection', activeTasks: false, scheduledTasks: false })
  expect(inspect).toEqual(await f.control.request({ type: 'quit-inspection' }))
})

it.each([undefined, 'wrong-token'])('rejects missing or incorrect control credentials', async (provided) => {
  const f = await fixture()
  const response = await fetch(f.origin + GUI_CONTROL_PATH, {
    headers: provided === undefined ? {} : { [GUI_CONTROL_HEADER]: provided },
  })
  expect(response.status).toBe(401)
  const body = await response.text()
  expect(body).toContain('unauthorized')
  expect(body).not.toContain(token)
  expect(body).not.toContain('browser-fixture')
})

it('refuses browser-origin requests even with the native control token', async () => {
  const f = await fixture()
  const response = await fetch(f.origin + GUI_CONTROL_PATH, { headers: { ...f.headers, origin: f.origin } })
  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ error: { code: 'forbidden' } })
})

it.each(['not json', '{}', '{"type":"update-tasks","action":"destroy"}', '{"type":"file-drag-resource","address":4}'])(
  'rejects malformed control operations (%s)', async (body) => {
    const f = await fixture()
    const response = await f.post(body)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: 'invalid-request' } })
  },
)

it('bounds the complete request body', async () => {
  const f = await fixture()
  const response = await f.post(JSON.stringify({ type: 'file-drag-resource', address: 'a'.repeat(70 * 1024) }))
  expect(response.status).toBe(413)
  expect(await response.json()).toMatchObject({ error: { code: 'request-too-large' } })
})

it('shares native admission lock and unlock with the HTTP caller', async () => {
  const f = await fixture()
  for (const action of ['inspect', 'lock', 'unlock'] as const) {
    const response = await f.post(JSON.stringify({ type: 'update-tasks', action }))
    expect(response.status).toBe(200)
    expect(parseGuiControlResponse(await response.json())).toEqual({ type: 'update-tasks', active: false })
  }
})

it('authorizes drag resources through the current Session filesystem', async () => {
  const f = await fixture()
  const id = SessionId('gui-drag')
  f.ctx.sessions.create(id, { meta: { cwd: f.root, origin: 'subagent' } })
  const bytes = Buffer.from('verified file')
  const path = join(f.root, 'report.txt')
  await writeFile(path, bytes)
  const response = await f.post(JSON.stringify({ type: 'file-drag-resource', address: sessionFileAddress(id, 'report.txt') }))
  expect(parseGuiControlResponse(await response.json())).toEqual({ type: 'file-drag-resource', resource: {
    path: await realpath(path), size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
  } })
})

it('streams the initial platform session and subsequent plugin operations', async () => {
  const f = await fixture()
  const abort = new AbortController()
  onTestFinished(() => { abort.abort() })
  const response = await fetch(f.origin + GUI_EVENTS_PATH, { headers: f.headers, signal: abort.signal })
  expect(response.headers.get('content-type')).toBe('text/event-stream')
  const reader = response.body?.getReader()
  if (reader === undefined) throw new Error('Missing event stream')
  const first = await reader.read()
  expect(new TextDecoder().decode(first.value)).toBe('data: {"type":"platform-session","session":null}\n\n')
  const operation: PluginOperation = {
    id: 'cd44aba5-dc88-47c4-8da5-6f396f9b9198' as PluginOperation['id'],
    time: '2026-11-06T01:00:00.000Z', reason: 'plugin', phase: 'started', target: 'fixture', stage: 'enable',
  }
  f.ctx.emit('plugin-manager/operation', operation)
  const next = await reader.read()
  const text = new TextDecoder().decode(next.value)
  const event = parseGuiHostEvent(JSON.parse(text.slice('data: '.length).trim()))
  expect(event).toMatchObject({ type: 'plugin-operation', record: { runId: f.control.ready().runId, operation } })
  await reader.cancel()
})

it('removes both routes and rejects retained local handles after disposal', async () => {
  const f = await fixture()
  await f.fiber.dispose()
  expect((await fetch(f.origin + GUI_CONTROL_PATH, { headers: f.headers })).status).toBe(404)
  expect((await fetch(f.origin + GUI_EVENTS_PATH, { headers: f.headers })).status).toBe(404)
  expect(() => f.control.ready()).toThrow()
  await expect(f.control.request({ type: 'quit-inspection' })).rejects.toThrow()
  expect(() => f.control.subscribe(() => {})).toThrow()
})

it('rejects unsafe boot URLs and malformed stream or operation responses', () => {
  expect(() => parseGuiHostReady({ url: 'https://example.com', injections: [], platformSession: null,
    runId: 'cd44aba5-dc88-47c4-8da5-6f396f9b9198' })).toThrow('Invalid GUI Host')
  expect(() => parseGuiHostEvent({ type: 'platform-session', session: { origin: 'https://platform.example', token: 't' } })).toThrow()
  expect(() => parseGuiControlResponse({ type: 'file-drag-resource', resource: { path: 'a', size: -1, sha256: 'a' } })).toThrow()
})

it('validates all boot injection kinds and private platform headers', () => {
  const value = {
    url: 'http://127.0.0.1:3000/?token=browser-fixture',
    injections: [
      { kind: 'global', name: 'setting', value: { enabled: true } },
      { kind: 'script', placement: 'head', text: 'fixture()' },
      { kind: 'script-src', placement: 'body', src: '/fixture.js' },
      { kind: 'script-preload', src: '/later.js' },
      { kind: 'style', text: 'body {}' },
      { kind: 'html', placement: 'body', html: '<div></div>' },
    ],
    platformSession: { origin: 'https://platform.example', token: 'private', userId: 'user',
      embeddedPageDist: 'test', requestHeaders: { 'x-fixture': 'test' } },
    runId: 'cd44aba5-dc88-47c4-8da5-6f396f9b9198',
  }
  expect(parseGuiHostReady(value)).toEqual(value)
  expect(parseGuiHostEvent({ type: 'platform-session', session: value.platformSession }))
    .toEqual({ type: 'platform-session', session: value.platformSession })
  for (const malformed of [null, {}, { kind: 'script', placement: 'elsewhere', text: '' }, { kind: 'global', name: 1 }]) {
    expect(() => parseGuiHostReady({ ...value, injections: [malformed] })).toThrow()
  }
  for (const platform of [
    { ...value.platformSession, origin: 'https://user:password@platform.example' },
    { ...value.platformSession, origin: 'http://platform.example' },
    { ...value.platformSession, origin: 'https://platform.example/path' },
    { ...value.platformSession, embeddedPageDist: 1 },
    { ...value.platformSession, requestHeaders: { authorization: 'private' } },
    { ...value.platformSession, requestHeaders: { 'x-fixture': 'a\nb' } },
  ]) {
    expect(() => parseGuiHostReady({ ...value, platformSession: platform })).toThrow()
  }
})

it('contains operation failures and rejects unsupported HTTP methods', async () => {
  const f = await fixture()
  const failure = await f.post('{"type":"file-drag-resource","address":"unscoped"}')
  expect(failure.status).toBe(500)
  expect(await failure.json()).toEqual({ error: { code: 'operation-failed', message: 'The GUI Host operation failed' } })
  for (const path of [GUI_CONTROL_PATH, GUI_EVENTS_PATH]) {
    const unsupported = await fetch(f.origin + path, { method: 'PUT', headers: f.headers })
    expect(unsupported.status).toBe(405)
  }
  expect((await fetch(f.origin + GUI_EVENTS_PATH)).status).toBe(401)
})

it('rejects weak control credentials before installing transport effects', async () => {
  const f = await fixture()
  expect(() => installGuiHostControl(f.ctx, 'short')).toThrow('at least 32 bytes')
})

it('keeps idle native event streams active and releases their heartbeat on disconnect', async () => {
  const f = await fixture()
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  const abort = new AbortController()
  try {
    const response = await fetch(f.origin + GUI_EVENTS_PATH, { headers: f.headers, signal: abort.signal })
    if (!response.body) throw new Error('Missing event stream')
    const reader = response.body.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('data:')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(': keepalive')
    await reader.cancel()
    await vi.waitFor(() => { expect(vi.getTimerCount()).toBe(0) })
  } finally {
    abort.abort()
    vi.useRealTimers()
  }
})
