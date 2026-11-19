/** Replay scoped Agent calls against the short-drama project store. */
import crypto, { randomUUID } from 'node:crypto'
import { syncBuiltinESMExports } from 'node:module'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import type {} from '@deepseek-ai/dsh-short-drama-bundle'
import { expect, it, onTestFinished, vi } from 'vitest'
import {
  assertFinalWorkspaceSnapshot, assertFixtureInventory, fixtureUserPrompts, launchWebScaffold,
  readPersistedEvents, selectedSessionFixture, webSnapshotMode,
} from './scaffold.ts'

const DIR = fileURLToPath(new URL('../../../snapshots/web/short-drama-project', import.meta.url))
const BUNDLE = fileURLToPath(new URL('../../../packages/bundle/short-drama', import.meta.url))
const MODE = webSnapshotMode()

it.skipIf(MODE === 'record')('saves script and asset candidates only in its bound project', async () => {
  const fixture = await selectedSessionFixture(join(DIR, 'session.v4.jsonl'))
  const prompts = fixtureUserPrompts(await readFile(fixture, 'utf8'))
  expect(prompts).toHaveLength(1)
  const scaffold = await launchWebScaffold({
    replayFixture: fixture, compareReplaySession: true, profile: { packages: [{ dir: BUNDLE, enabled: true }] },
  })
  onTestFinished(() => scaffold.close())
  const cwd = join(scaffold.workspaceCwd, 'project')
  await mkdir(cwd)
  const workspace = await scaffold.ctx.workspaceRegistry.create(cwd, 'Production')
  const projects = scaffold.ctx.shortDrama
  const entry = await projects.saveEntryDocument({ revision: 0, storage: {
    'crewon-studio-demo-v1': JSON.stringify({ referenceDrama: 'produce', referenceOptions: { style: '电影感', ratio: '9:16' } }),
  } })
  const projectUuid = vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('759ab17b-3456-4567-89ab-123456789abc')
  syncBuiltinESMExports()
  const project = await projects.create('The last ferry').finally(() => {
    projectUuid.mockRestore()
    syncBuiltinESMExports()
  })
  const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('639feb03-229b-4dcc-a52d-cf2395008f04')
  syncBuiltinESMExports()
  const draft = await projects.saveDraft(project.id, 0, 'Two siblings meet at a ferry terminal.', 'The terminal clock stops.')
    .finally(() => {
      uuid.mockRestore()
      syncBuiltinESMExports()
    })
  const original = draft.scripts[0]!
  await projects.adoptScript(project.id, draft.revision, original.id)
  const sessionId = await projects.openConversation(project.id)
  expect(await projects.openConversation(project.id)).toBe(sessionId)

  const { sessionId: otherId } = await scaffold.ctx.sessionController.create({ workspaceId: workspace.id })
  const other = scaffold.ctx.agents.get(otherId)
  const modelSelection = other?.model.current()
  if (other === undefined || modelSelection === undefined) throw new Error('The ordinary Session has no ready Agent.')
  const signal = new AbortController().signal
  const toolSet = await scaffold.ctx.tools.resolve({ agent: other, modelSelection, signal })
  try {
    expect(scaffold.ctx.tools.schemas(other, toolSet).filter(tool => tool.name.startsWith('short_drama_'))).toEqual([])
  } finally {
    toolSet.dispose()
  }

  const settled = scaffold.whenTurnSettled()
  await scaffold.ctx.sessionController.prompt({
    sessionId, mode: 'queue', content: [{ type: 'text', text: prompts[0]! }],
    requestId: brandString<SessionRequestId>(randomUUID()), clientTimeZone: 'UTC',
  }, signal)
  expect(await settled).toBe(sessionId)
  const events = await readPersistedEvents(scaffold, sessionId)
  expect(events.flatMap(event => event.type === 'tool/call' ? [event.data.name] : [])).toEqual([
    'short_drama_read_script', 'short_drama_save_script', 'short_drama_read_production', 'short_drama_save_asset',
  ])
  expect(events.flatMap(event => event.type === 'tool/result' ? [event.data.message.isError] : []))
    .toEqual([false, false, false, false])
  expect(projects.read(project.id)).toMatchObject({
    revision: 3, adoptedScriptId: original.id,
    scripts: [original, { body: 'The terminal clock stops. The last ferry sounds its horn.' }],
  })
  expect(scaffold.ctx.shortDramaProduction.read(project.id)).toMatchObject({
    revision: 1, assets: [{ kind: 'scene', name: 'Ferry terminal', prompt: 'An empty ferry terminal at night.', version: 1 }],
    shots: [], jobs: [], exports: [],
  })
  expect(projects.readEntryDocument()).toEqual(entry)
  await assertFinalWorkspaceSnapshot(DIR, cwd)
})

it.skipIf(MODE !== 'replay')('keeps the project tool fixture canonical', async () => {
  await assertFixtureInventory(DIR, ['session.v4.jsonl', 'system-prompt.expected.md', 'tool-schemas.expected.json', 'workspace.expected'])
})
