import { expect, it, vi } from 'vitest'
import { createDramaWorkbench, type DramaActions } from '../src/client/workbench.ts'
import type { DramaProject, DramaProjectId } from '../src/project-types.ts'
import type { DramaProduction } from '../src/production-types.ts'

function setup() {
  const created: DramaProject = {
    id: 'new-project' as DramaProjectId, title: 'New story', revision: 0, synopsis: '', scripts: [], adoptedScriptId: null,
  }
  const previous: DramaProject = { ...created, id: 'previous-project' as DramaProjectId, title: 'Previous story' }
  const production: DramaProduction = {
    revision: 0, settings: { image: null, video: null, voice: null },
    assets: [], shots: [], jobs: [], timeline: [], exports: [], fps: 24,
  }
  const layout = { revision: 0, positions: {}, viewport: { x: 0, y: 0, zoom: 1 } }
  const unavailable = (): Promise<never> => Promise.reject(new Error('Unexpected operation'))
  const api: DramaActions = {
    create: vi.fn(async () => created), list: vi.fn(async () => []),
    read: vi.fn(async id => id === created.id ? created : previous),
    readCanvas: vi.fn(async () => layout), saveCanvas: unavailable,
    saveDraft: unavailable, adoptScript: unavailable, openConversation: unavailable,
    requestAgent: vi.fn(async () => {}),
    production: {
      read: vi.fn(async () => production), saveSettings: unavailable,
      saveAsset: unavailable, removeAsset: unavailable, saveShot: unavailable, removeShot: unavailable,
      generate: unavailable, observe: unavailable, adoptMedia: unavailable, saveTimeline: unavailable, exportEpisode: unavailable,
    },
  }
  return { ...createDramaWorkbench(api), api, created, previous }
}

it('keeps new-project creation attached to its project when the previous conversation refreshes', async () => {
  const { actions, store, api, created, previous } = setup()
  const projectId = await actions.create(created.title)
  await actions.open(previous.id)
  await actions.requestScript(projectId)
  expect(api.requestAgent).toHaveBeenCalledExactlyOnceWith(created.id, { kind: 'script', name: '' })
  expect(store.getSnapshot().project?.id).toBe(created.id)
})

it('admits one pending Agent request and preserves an unsaved script when submission fails', async () => {
  const { actions, store, api, created } = setup()
  await actions.open(created.id)
  actions.edit(created, { script: 'Unsaved human draft' })
  const pending = Promise.withResolvers<undefined>()
  vi.mocked(api.requestAgent).mockReturnValueOnce(pending.promise)
  const first = actions.requestScript(created.id)
  expect(await actions.requestScript(created.id)).toBe(false)
  pending.reject(new Error('Connection lost'))
  expect(await first).toBe(false)
  expect(api.requestAgent).toHaveBeenCalledTimes(1)
  expect(store.getSnapshot().drafts[created.id]?.script).toBe('Unsaved human draft')
  expect(store.getSnapshot().feedback).toEqual({ kind: 'error', key: 'conversationError' })
})
