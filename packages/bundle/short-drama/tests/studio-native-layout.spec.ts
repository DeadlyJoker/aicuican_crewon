/** Native embedding retains Demo group layout and keeps its complete rendered bounds visible. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const layout = readFileSync(new URL('../studio/native-layout.js', import.meta.url), 'utf8')
const reference = readFileSync(new URL('../studio/reference-canvas.js', import.meta.url), 'utf8')
const arrange = reference.slice(reference.indexOf('function referenceArrangeNewDrama()'))

function runtime() {
  const nodes = [
    { id: 'story', kind: 'story', x: 40, y: 90, w: 280, h: 320 },
    { id: 'actor', kind: 'character', x: 400, y: 80, w: 280, h: 320 },
    { id: 'scene', kind: 'scene', x: 400, y: 420, w: 280, h: 320 },
    { id: 'shot', kind: 'shot', x: 800, y: 80, w: 280, h: 320 },
  ]
  const S = { projectKind: 'drama', nodes, zoom: .65, pan: { x: -100, y: 40 }, studioNativeLayoutVersion: undefined }
  const applyCamera = vi.fn()
  const viewport = { clientWidth: 540, clientHeight: 760, getBoundingClientRect: () => ({ left: 0, top: 0 }),
    querySelectorAll: () => [{ getBoundingClientRect: () => ({
      left: -200, top: -100, right: 1400, bottom: 700, width: 1600, height: 800,
    }) }] }
  const context = { S, applyCamera, handleAction: vi.fn(), studioRecordCanvasHistory: vi.fn(), render: vi.fn(), save: vi
    .fn(), fitCanvas: vi.fn(), zoomBy: vi.fn(), focusNode: vi.fn(),
  selectNode: vi.fn(), canvasCreationNode: () => nodes[1], canvasActiveTool: null, frameCanvasNodeControls: vi.fn(),
  studioScriptNode: () => nodes[0], referenceRefreshGroups: vi.fn(), window: { addEventListener: vi.fn() },
  document: { addEventListener: vi.fn(), getElementById: () => viewport,
    querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 48 }) }) } }
  runInNewContext(arrange + '\n' + layout, context)
  return { context, S, viewport, applyCamera }
}

describe('native Studio canvas', () => {
  it('frames the selected node with its attached editor', () => {
    const { context } = runtime()
    runInNewContext("selectNode('actor')", context)
    expect(context.frameCanvasNodeControls).toHaveBeenCalledOnce()
  })

  it('keeps the selected editor framed after resetting the viewport', () => {
    const { context, S } = runtime()
    Object.assign(S, { selected: 'actor' })
    runInNewContext('studioNativeFitViewport()', context)
    expect(context.frameCanvasNodeControls).toHaveBeenCalledOnce()
  })

  it('arranges the initial project by screenplay, assets and shots only once', () => {
    const { context, S } = runtime()
    expect(runInNewContext('studioNativePrepareLayout(S)', context)).toBe(true)
    const [story, actor, scene, shot] = S.nodes
    expect(story!.w).toBe(420)
    expect(actor!.w).toBe(380)
    expect(actor!.x).toBe(scene!.x)
    expect(actor!.y + actor!.h + 48).toBeLessThan(scene!.y)
    expect(scene!.x + scene!.w + 48).toBeLessThan(shot!.x)
    actor!.x += 150
    expect(runInNewContext('studioNativePrepareLayout(S)', context)).toBe(false)
    expect(actor!.x).toBe(750)
  })

  it('fits rendered content including group labels within the sidebar clearances', () => {
    const { context, S, viewport, applyCamera } = runtime()
    const old = { zoom: S.zoom, pan: { ...S.pan } }
    runInNewContext('studioNativeFitViewport()', context)
    const project = (value: number, axis: 'x' | 'y') => (value - old.pan[axis]) / old.zoom * S.zoom + S.pan[axis]
    expect(project(-200, 'x')).toBeGreaterThanOrEqual(79.99)
    expect(project(1400, 'x')).toBeLessThanOrEqual(viewport.clientWidth - 28 + .01)
    expect(project(-100, 'y')).toBeGreaterThanOrEqual(68 - .01)
    expect(project(700, 'y')).toBeLessThanOrEqual(viewport.clientHeight - 72 + .01)
    expect(applyCamera).toHaveBeenCalledOnce()
  })
})

it('opens an entry-settings document without seeded Demo characters or shots', () => {
  const source = readFileSync(new URL('../studio/native-adapter.js', import.meta.url), 'utf8')
  const functions = source.slice(source.indexOf('function studioNativeNode('), source.indexOf('function studioNativeRun('))
  const S = { nodes: [{ id: 'actor', kind: 'character', title: 'Demo actor' }], edges: [], clips: [],
    history: [], versions: {}, projectDrafts: {}, pan: {}, zoom: 1 }
  const document = { getElementById: () => ({ textContent: '', clientWidth: 500, clientHeight: 700 }),
    createElement: () => ({}), head: { append: vi.fn() } }
  const context = { S, stored: { referenceDrama: 'produce' }, studioNativePersistKey: 'crewon-studio-demo-v1',
    studioNativeConfig: { project: { id: 'project', title: 'Original', revision: 1, scripts: [], synopsis: 'Original synopsis' },
      document: { storage: { 'crewon-studio-demo-v1': '{"referenceDrama":"produce"}' } },
      production: { assets: [], shots: [], timeline: [], jobs: [], fps: 24 } },
    studioNativePrepareLayout: () => false, studioNativeFitViewport: vi.fn(), location: { hash: '' }, document, render: vi.fn() }
  runInNewContext(functions + '\nstudioNativeApplyProject(true)', context)
  expect(S.nodes.map(node => node.id)).toEqual(['story'])
  expect(S.edges).toEqual([])
  expect(S.clips).toEqual([])
})

it('organizes an existing canvas only on request and records positions for undo', () => {
  const { context, S } = runtime()
  const before = S.nodes.map(node => ({ id: node.id, x: node.x, y: node.y }))
  runInNewContext("handleAction('layout')", context)
  const after = S.nodes.map(node => ({ id: node.id, x: node.x, y: node.y }))
  expect(after).not.toEqual(before)
  expect(context.studioRecordCanvasHistory).toHaveBeenCalledWith({ type: 'positions', before, after })
  for (const first of S.nodes) for (const second of S.nodes) {
    if (first === second) continue
    expect(first.x + first.w <= second.x || second.x + second.w <= first.x
      || first.y + first.h <= second.y || second.y + second.h <= first.y).toBe(true)
  }
})
