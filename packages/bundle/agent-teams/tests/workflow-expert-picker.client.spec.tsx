// @vitest-environment jsdom
import { useState, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ExpertDefinition } from '../src/expert-types.ts'
import type { WorkflowDraft } from '../src/workflow-types.ts'
import { zh } from '../src/client/workflow-copy.ts'
import { WorkflowEditor } from '../src/client/WorkflowEditor.tsx'

interface PickerProps {
  value: string
  selectedLabel?: string
  onPendingChange?(pending: boolean): void
  onChange: (selection: { preset: string; name: string; expert?: ExpertDefinition } | undefined) => void
}
let picker: PickerProps
vi.mock('../src/client/ExpertPicker.tsx', () => ({
  ExpertPicker: (props: PickerProps) => {
    picker = props
    return <button type="button" aria-label="选择专家">{props.selectedLabel ?? props.value}</button>
  },
}))
vi.mock('@xyflow/react', () => ({
  Background: () => null, Controls: () => null, Handle: () => null,
  MarkerType: { ArrowClosed: 'closed' }, Position: { Left: 'left', Right: 'right' },
  ReactFlow: ({ nodes, onNodeClick, elementsSelectable, children }: {
    nodes: Array<{ id: string; data: { preset: string } }>
    onNodeClick: (event: object, node: { id: string }) => void
    elementsSelectable: boolean
    children: ReactNode
  }) => <div>{nodes.map(node => <button type="button" key={node.id} disabled={!elementsSelectable}
    onClick={() => { onNodeClick({}, node) }}>{node.id} · {node.data.preset}</button>)}{children}</div>,
}))

afterEach(cleanup)
const definition: WorkflowDraft = {
  name: '评审流程', description: '', draft: '', review: '', secondReview: '', delivery: '',
  steps: [
    { id: 'draft', name: '准备', instruction: '保持起草工作要求', kind: 'agent', stage: 'prepare', dependsOn: [], agentPreset: 'ptc' },
    { id: 'review', name: '复核', instruction: '保持复核工作要求', kind: 'agent', stage: 'prepare', dependsOn: ['draft'], agentPreset: 'standard' },
  ],
}
const expert: ExpertDefinition = { id: 'builtin', name: '事实核查员', description: '核查事实', prompt: '核查证据',
  basePreset: 'standard', revision: 1, preset: 'expert-builtin-v1' }
const labels: Record<string, string> = zh
const t = (key: string) => labels[key] ?? key

it('waits for expert activation and updates only the selected step while displaying its name', async () => {
  const close = vi.fn()
  const save = vi.fn()
  const changed = vi.fn<(value: WorkflowDraft) => void>()
  function Editor() {
    const [draft, setDraft] = useState(definition)
    return <WorkflowEditor draft={draft} editing busy={false} failed={false} presetsFailed={false}
      presets={[{ id: 'ptc', name: 'PTC' }, { id: 'standard', name: '标准模式' }]} t={t} close={close} save={save}
      change={(value) => { changed(value); setDraft(value) }} />
  }
  render(<Editor />)
  act(() => { picker.onPendingChange?.(true) })
  expect(screen.getByRole('button', { name: '保存工作流' })).toHaveProperty('disabled', true)
  expect(screen.getByRole('button', { name: 'review · 标准模式' })).toHaveProperty('disabled', true)
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(close).not.toHaveBeenCalled()
  act(() => {
    picker.onChange({ preset: expert.preset, name: expert.name, expert })
    picker.onPendingChange?.(false)
  })
  expect(screen.getByRole('button', { name: 'draft · 事实核查员' })).toBeTruthy()
  expect(changed.mock.calls.at(-1)?.[0].steps).toEqual([
    { ...definition.steps![0]!, agentPreset: expert.preset }, definition.steps![1],
  ])
  expect(definition.steps![0]!.agentPreset).toBe('ptc')
  expect(screen.getByRole('button', { name: '保存工作流' })).toHaveProperty('disabled', false)
})

it('applies a completed selection to the latest draft and ignores a removed target', () => {
  const change = vi.fn<(value: WorkflowDraft) => void>()
  const props = { editing: true, busy: false, failed: false, presetsFailed: false, presets: [], t,
    change, save: vi.fn(), close: vi.fn() }
  const view = render(<WorkflowEditor {...props} draft={definition} />)
  const choose = picker.onChange
  const latest = { ...definition, description: '新的说明', steps: definition.steps!.map(step => ({ ...step, instruction: step.instruction + '，保留新修改' })) }
  view.rerender(<WorkflowEditor {...props} draft={latest} />)
  act(() => { choose({ preset: expert.preset, name: expert.name, expert }) })
  expect(change.mock.calls.at(-1)?.[0]).toMatchObject({ description: '新的说明' })
  expect(change.mock.calls.at(-1)?.[0].steps?.[0]).toMatchObject({ instruction: '保持起草工作要求，保留新修改', agentPreset: expert.preset })
  expect(change.mock.calls.at(-1)?.[0].steps?.[1]).toEqual(latest.steps?.[1])
  change.mockClear()
  view.rerender(<WorkflowEditor {...props} draft={{ ...latest, steps: latest.steps.filter(step => step.id !== 'draft') }} />)
  act(() => { choose({ preset: expert.preset, name: expert.name, expert }) })
  expect(change).not.toHaveBeenCalled()
})
