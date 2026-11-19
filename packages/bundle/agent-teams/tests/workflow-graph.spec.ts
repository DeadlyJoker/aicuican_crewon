import { describe, expect, it } from 'vitest'
import { layoutWorkflowSteps, orderWorkflowSteps } from '../src/workflow-graph.ts'
import type { WorkflowStep } from '../src/workflow-types.ts'

const node = (id: string, dependsOn: string[] = []): WorkflowStep => ({
  id, kind: 'agent', name: id, instruction: 'Task', stage: 'prepare', dependsOn,
})

describe('workflow canvas dependencies', () => {
  it('orders backward canvas connections and preserves parallel siblings', () => {
    const graph = [node('output', ['left', 'right']), node('right', ['input']), node('input'), node('left', ['input'])]
    expect(orderWorkflowSteps(graph)?.map(step => step.id)).toEqual(['input', 'right', 'left', 'output'])
    const layout = layoutWorkflowSteps(graph)
    expect(layout.find(step => step.id === 'left')?.position?.x).toEqual(layout.find(step => step.id === 'right')?.position?.x)
  })

  it.each([
    [node('a', ['b']), node('b', ['a'])],
    [node('a', ['a'])],
    [node('a', ['missing'])],
    [node('a'), node('a')],
  ])('rejects cycles, absent nodes and duplicate identities', (...steps) => {
    expect(orderWorkflowSteps(steps)).toBeUndefined()
  })

  it('keeps saved layout independent from execution ordering', () => {
    const graph = [{ ...node('b', ['a']), position: { x: 0, y: 0 } }, { ...node('a'), position: { x: 400, y: 60 } }]
    expect(orderWorkflowSteps(graph)).toEqual([graph[1], graph[0]])
    expect(graph[0]?.position).toEqual({ x: 0, y: 0 })
  })
})
