/** Project asset lists and canvas categories share live membership across saved generations. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

const series = readFileSync(new URL('../studio/script-series.js', import.meta.url), 'utf8')
const groups = readFileSync(new URL('../studio/reference-group-model.js', import.meta.url), 'utf8')
const adapter = readFileSync(new URL('../studio/native-adapter.js', import.meta.url), 'utf8')
const projection = adapter.slice(adapter.indexOf('function studioNativeNode('), adapter.indexOf('function studioNativeRun('))
const workbench = readFileSync(new URL('../studio/reference-workbench.js', import.meta.url), 'utf8')
const openWorkbench = workbench.slice(workbench.indexOf('openScriptWorkbench=function'), workbench.indexOf('function referenceWorkbenchScriptLocked'))
const creative = readFileSync(new URL('../studio/native-creative.js', import.meta.url), 'utf8')
const creativeActions = creative.slice(creative.indexOf('const studioCreativeAction=handleAction'), creative.indexOf("window.addEventListener('message'"))

function runtime() {
  const story = { id: 'story', kind: 'story', nativeRevision: 1, x: 10, y: 20, w: 280, h: 320,
    scriptDocument: { title: 'Paper boat', logline: 'Bring the boat home', scenes: [] },
    scriptSeries: { sharedAssetIds: [], episodes: [{ id: 'ep1', primary: true, number: 1, assetIds: [] }] } }
  const state = { project: 'Paper boat', projectKind: 'drama', nodes: [story,
    { id: 'asset:girl', kind: 'character', title: 'Girl', x: 710, y: 85, w: 380, h: 436, nativeRevision: 1 },
    { id: 'asset:boat', kind: 'character', title: 'Boat', x: 1220, y: 240, w: 380, h: 436, nativeRevision: 1 },
    { id: 'asset:removed', kind: 'scene', title: 'Removed location', x: 0, y: 0, w: 380, h: 436 },
    { id: 'manual', kind: 'scene', title: 'Manual reference', x: 0, y: 800, w: 380, h: 436 },
  ], edges: [], clips: [], history: [], versions: {}, projectDrafts: {}, pan: {}, zoom: 1 }
  const production = { assets: [
    { id: 'girl', name: 'Girl', kind: 'character', version: 1, prompt: 'A girl' },
    { id: 'water', name: 'Waterway', kind: 'scene', version: 1, prompt: 'A narrow waterway' },
    { id: 'boat', name: 'Boat', kind: 'prop', version: 2, prompt: 'A paper boat' },
    { id: 'voice', name: 'Voice', kind: 'voice', version: 1, prompt: 'Soft voice' },
  ], shots: [], timeline: [], jobs: [], fps: 24 }
  const element = { textContent: '', clientWidth: 500, clientHeight: 700 }
  const context = { S: state, stored: { nodes: state.nodes }, studioNativePersistKey: 'crewon-studio-demo-v1',
    studioNativeConfig: { project: { id: 'project', title: 'Paper boat', revision: 1, scripts: [], synopsis: 'A girl and boat' },
      production, direction: null },
    studioNativePrepareLayout: () => false, studioNativeFitViewport: vi.fn(), location: { hash: '' },
    document: { getElementById: () => element, createElement: () => element, head: { append: vi.fn() } },
    render: vi.fn(), ensureStudioScript: (node: typeof story) => node.scriptDocument }
  runInNewContext(series + '\n' + groups + '\n' + projection, context)
  return { context, state, production }
}

it('shows live project assets when the saved series membership predates their creation', () => {
  const { context, state } = runtime()
  runInNewContext('studioNativeApplyProject(false)', context)
  const ids: unknown = runInNewContext("studioSeriesAssetsFor(S.nodes[0], 'all').map(n => n.id)", context)
  expect(ids).toEqual(['asset:girl', 'asset:water', 'asset:boat', 'manual'])
  expect(runInNewContext("studioSeriesAssetsFor(S.nodes[0], 'ep1').map(n => n.id)", context)).toEqual(ids)
  const boat = state.nodes.find(node => node.id === 'asset:boat')!
  expect(boat).toMatchObject({ kind: 'image', assetCategory: 'prop', label: '道具', description: 'A paper boat' })
  expect(state.nodes.find(node => node.id === 'asset:girl')).toMatchObject({ x: 710, y: 85 })
  expect(state.nodes.some(node => node.id === 'asset:removed')).toBe(false)
})

it('maps each asset category to the same canvas group while retaining unrelated custom members', () => {
  const { context, state } = runtime()
  Object.assign(state, { referenceGroups: { version: 1, groups: [
    { id: 'character', name: '角色组', nodeIds: ['asset:girl'], color: 'blue' },
    { id: 'custom', name: 'Reference notes', nodeIds: ['asset:boat', 'manual', 'story'] },
  ] } })
  runInNewContext('studioNativeApplyProject(false)', context)
  const result: unknown = runInNewContext('referenceReadGroups(S)', context)
  expect(result).toEqual([
    { id: 'character', name: '角色组', nodeIds: ['asset:girl'], color: 'blue' },
    { id: 'scene', name: '场景组', nodeIds: ['asset:water', 'manual'] },
    { id: 'prop', name: '道具组', nodeIds: ['asset:boat'] },
    { id: 'custom', name: 'Reference notes', nodeIds: ['story'] },
  ])
  for (const category of ['character', 'scene', 'prop']) {
    const fromList: unknown = runInNewContext(`studioSeriesAssetsFor(S.nodes[0], 'all', '${category}').map(n => n.id)`, context)
    const fromCanvas: unknown = runInNewContext(`referenceReadGroups(S).find(g => g.id === '${category}').nodeIds`, context)
    expect(fromList).toEqual(fromCanvas)
  }
  expect(runInNewContext('referenceReadGroups(S)', context)).toEqual(result)
})

it('updates category membership without losing the asset position or creating duplicates', () => {
  const { context, state, production } = runtime()
  runInNewContext('studioNativeApplyProject(false)', context)
  production.assets[0] = { ...production.assets[0]!, kind: 'prop', version: 2 }
  runInNewContext('studioNativeApplyProject(false)', context)
  expect(state.nodes.filter(node => node.id === 'asset:girl')).toHaveLength(1)
  expect(state.nodes.find(node => node.id === 'asset:girl')).toMatchObject({ kind: 'image', assetCategory: 'prop', x: 710, y: 85 })
  expect(runInNewContext("studioSeriesAssetsFor(S.nodes[0], 'all', 'character')", context)).toHaveLength(0)
  expect(runInNewContext("studioSeriesAssetsFor(S.nodes[0], 'all', 'prop').map(n => n.id)", context)).toEqual(['asset:girl', 'asset:boat'])
  production.assets = production.assets.filter(asset => asset.id !== 'boat')
  runInNewContext('S=JSON.parse(JSON.stringify(S));studioNativeApplyProject(true)', context)
  expect(runInNewContext("studioSeriesAssetsFor(S.nodes[0], 'all', 'prop').map(n => n.id)", context)).toEqual(['asset:girl'])
  expect(runInNewContext("referenceReadGroups(S).find(group => group.id === 'prop').nodeIds", context)).toEqual(['asset:girl'])
  expect(runInNewContext("S.nodes.some(node => node.id === 'asset:boat')", context)).toBe(false)
})

it('refits a category frame when new assets would fall outside its saved bounds', () => {
  const { context, state } = runtime()
  Object.assign(state, { referenceGroups: { version: 1, groups: [
    { id: 'character', name: '角色组', nodeIds: ['asset:girl'], frame: { dx: 0, dy: 0, width: 420, height: 500 } },
    { id: 'scene', name: '场景组', nodeIds: ['manual'], frame: { dx: 0, dy: 0, width: 420, height: 500 } },
  ] } })
  runInNewContext('studioNativeApplyProject(false)', context)
  expect(runInNewContext("referenceReadGroups(S).find(group => group.id === 'character').frame", context)).toEqual({ dx: 0, dy: 0, width: 420, height: 500 })
  expect(runInNewContext("referenceReadGroups(S).find(group => group.id === 'scene').frame", context)).toBeUndefined()
  expect(state.nodes.find(node => node.id === 'manual')).toMatchObject({ x: 0, y: 800 })
})

it('leaves standalone custom grouping intact without native project asset identities', () => {
  const { context, state } = runtime()
  state.nodes = [{ id: 'manual', kind: 'scene', title: 'Manual reference', x: 0, y: 0, w: 380, h: 436 }]
  Object.assign(state, { referenceGroups: { version: 1, groups: [{ id: 'custom', name: 'Custom', nodeIds: ['manual'] }] } })
  expect(runInNewContext('referenceReadGroups(S)', context)).toEqual([{ id: 'custom', name: 'Custom', nodeIds: ['manual'] }])
})

it('opens the project asset cards from the canvas asset entry and retains category navigation', () => {
  const { context, state } = runtime()
  const showWorkbench = vi.fn(), showCreative = vi.fn(), originalAction = vi.fn()
  Object.assign(context, { referenceDrawWorkbench: showWorkbench, studioCreativeDialog: showCreative,
    save: vi.fn(), handleAction: originalAction, studioScriptNode: () => state.nodes[0],
    nodeById: (id: string) => state.nodes.find(node => node.id === id),
    referenceWorkbench: { nodeId: 'story', project: 'Paper boat', tab: 'script', assetCategory: 'prop', assetScope: 'all', scrolls: { 'assets/prop': 80 } } })
  runInNewContext(openWorkbench + '\n' + creativeActions + "\nhandleAction('asset-vault')", context)
  expect(showWorkbench).toHaveBeenCalledOnce()
  expect(showCreative).not.toHaveBeenCalled()
  expect(originalAction).not.toHaveBeenCalled()
  expect(runInNewContext('referenceWorkbench', context)).toMatchObject({ tab: 'assets', assetCategory: 'prop', scrolls: { 'assets/prop': 80 } })
})
