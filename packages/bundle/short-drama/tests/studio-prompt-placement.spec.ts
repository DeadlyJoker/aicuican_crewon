/** Prompt overlays fit the visible canvas without covering their selected node. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

const source = readFileSync(new URL('../studio/canvas-creation.js', import.meta.url), 'utf8')
const helper = source.slice(source.indexOf('function canvasPromptPlacement('), source.indexOf('/** Position media controls'))

it('keeps prompts beside edge nodes in narrow and wide canvases', () => {
  for (const width of [620, 800, 1280]) {
    const bounds = { left: 76, top: 60, right: width - 24, bottom: 696 }
    for (const node of [
      { left: 80, top: 70, right: 340, bottom: 370 },
      { left: width - 290, top: 380, right: width - 30, bottom: 680 },
      { left: 100, top: 270, right: 360, bottom: 570 },
    ]) {
      const size = { width: 600, height: 190 }
      const result = runInNewContext(helper + ';canvasPromptPlacement(node,bounds,size)', { node, bounds, size }) as { left: number; top: number; width: number } | null
      expect(result).not.toBeNull()
      if (!result) continue
      expect(result.left).toBeGreaterThanOrEqual(bounds.left)
      expect(result.top).toBeGreaterThanOrEqual(bounds.top)
      expect(result.left + result.width).toBeLessThanOrEqual(bounds.right)
      expect(result.top + size.height).toBeLessThanOrEqual(bounds.bottom)
      expect(result.left >= node.right || result.left + result.width <= node.left
        || result.top >= node.bottom || result.top + size.height <= node.top).toBe(true)
    }
  }
})

it('does not place an editor over a node filling all available space', () => {
  expect(runInNewContext(helper + ';canvasPromptPlacement(node,bounds,size)', {
    node: { left: 76, top: 60, right: 596, bottom: 696 },
    bounds: { left: 76, top: 60, right: 596, bottom: 696 }, size: { width: 500, height: 190 },
  })).toBeNull()
})
