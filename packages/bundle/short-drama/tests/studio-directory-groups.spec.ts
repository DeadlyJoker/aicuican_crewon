/** Native asset categories never absorb screenplay or shot nodes. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

const groups = readFileSync(new URL('../studio/reference-group-model.js', import.meta.url), 'utf8')
const navigation = readFileSync(new URL('../studio/canvas-navigation.js', import.meta.url), 'utf8')
  .split('function canvasCurrentNavigationGroups')[0]!

it('separates legacy mixed prop groups and labels screenplay and shot sections', () => {
  const state = { nodes: [
    { id: 'story', kind: 'story', title: 'Story' },
    { id: 'asset:prop', kind: 'image', assetCategory: 'prop', title: 'Boat' },
    { id: 'shot:one', kind: 'shot', title: 'Shot one' },
  ], referenceGroups: { version: 1, groups: [
    { id: 'prop', name: '道具组', nodeIds: ['story', 'asset:prop', 'shot:one'] },
  ] } }
  const result: unknown = runInNewContext(groups + '\n' + navigation
    + '\ncanvasManagedGroups(state.nodes,referenceReadGroups(state))', { state })
  expect(result).toEqual([
    { id: 'story', title: '故事与设定', nodes: [state.nodes[0]] },
    { id: 'prop', title: '道具组', nodes: [state.nodes[1]] },
    { id: 'videos', title: '镜头与视频', nodes: [state.nodes[2]] },
  ])
  expect(state.referenceGroups.groups[0]!.nodeIds).toEqual(['story', 'asset:prop', 'shot:one'])
})
