/** Dependency validation and deterministic ordering shared by authoring and execution. */
import type { WorkflowStep } from './workflow-types.ts'

/**
 * Order a DAG without changing the relative order of independent steps.
 * @param steps - Nodes with unique identities and references to nodes in this graph.
 * @returns Ordered nodes, or undefined for duplicate identities, missing references, or cycles.
 */
export function orderWorkflowSteps<T extends { id: string; dependsOn: readonly string[] }>(steps: readonly T[]): T[] | undefined {
  const pending = new Map(steps.map(step => [step.id, step]))
  if (pending.size !== steps.length) return undefined
  const ordered: T[] = []
  const completed = new Set<string>()
  while (pending.size) {
    const ready = [...pending.values()].filter(step => step.dependsOn.every(id => completed.has(id)))
    if (!ready.length) return undefined
    for (const step of ready) {
      ordered.push(step)
      completed.add(step.id)
      pending.delete(step.id)
    }
  }
  return ordered
}

/**
 * Position dependency layers left to right, retaining node configuration.
 * @param steps - An acyclic graph.
 * @returns Nodes with a deterministic canvas position.
 */
export function layoutWorkflowSteps(steps: readonly WorkflowStep[]): WorkflowStep[] {
  const ordered = orderWorkflowSteps(steps)
  if (!ordered) return [...steps]
  const levels = new Map<string, number>()
  const rows = new Map<number, number>()
  return ordered.map((step) => {
    const level = Math.max(0, ...step.dependsOn.map(id => (levels.get(id) ?? -1) + 1))
    const row = rows.get(level) ?? 0
    levels.set(step.id, level)
    rows.set(level, row + 1)
    return { ...step, position: { x: 40 + level * 230, y: 80 + row * 140 } }
  })
}
