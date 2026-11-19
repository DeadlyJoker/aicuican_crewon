// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { ExpertDefinition } from '../src/expert-types.ts'
import type { ExpertPickerSelection } from '../src/client/ExpertPicker.tsx'
import { TeamProfileFields } from '../src/client/TeamProfileFields.tsx'
import { TeamAuthoringCard, type TeamAuthoringCardProps } from '../src/client/TeamAuthoringCard.tsx'
import { zh } from '../src/client/locales.ts'

interface PickerProps {
  value: string
  selectedLabel?: string
  onChange: (selection: ExpertPickerSelection | undefined) => void
  onPendingChange?: (pending: boolean) => void
}
const capture = vi.hoisted(() => ({ picker: undefined as PickerProps | undefined }))
vi.mock('../src/client/ExpertPicker.tsx', () => ({
  ExpertPicker: (props: PickerProps) => { capture.picker = props; return null },
}))

afterEach(() => { cleanup(); capture.picker = undefined })
function picker(): PickerProps {
  if (!capture.picker) throw new Error('Expected the shared expert selector to be mounted')
  return capture.picker
}
const expert: ExpertDefinition = { id: 'new-expert', revision: 1, preset: 'expert-new-v1', name: '研究员',
  description: '用户研究', prompt: 'Full native persona\n'.repeat(1000), basePreset: 'standard' }
const t: TeamAuthoringCardProps['t'] = key => zh[key as keyof typeof zh] ?? key
const value = { name: '评审团', profile: { description: '界面评审', members: [
  { name: '现有角色', role: '审阅', executionPrompt: '检查给定材料', agentPreset: 'expert-older-v1', expertId: 'old-expert' },
] } }
function fieldsProps(): ComponentProps<typeof TeamProfileFields> {
  return { value, onChange: vi.fn(), experts: [], maxMembers: 8, t }
}

it('binds an activated built-in expert returned by the shared selector without copying its full persona into task duties', () => {
  const props = fieldsProps()
  render(<TeamProfileFields {...props} />)
  act(() => { picker().onChange({ preset: expert.preset, name: expert.name, expert }) })
  expect(props.onChange).toHaveBeenCalledWith({ ...value, profile: { ...value.profile, members: [
    { name: '研究员', role: '用户研究', executionPrompt: '用户研究', agentPreset: 'expert-new-v1', expertId: 'new-expert' },
  ] } })
})

it('retains a historical selection label and leaves inline responsibilities intact when the binding is cleared', () => {
  const props = fieldsProps()
  render(<TeamProfileFields {...props} />)
  expect(picker()).toMatchObject({ value: 'expert-older-v1', selectedLabel: '现有角色' })
  act(() => { picker().onChange(undefined) })
  expect(props.onChange).toHaveBeenCalledWith({ ...value, profile: { ...value.profile, members: [
    { name: '现有角色', role: '审阅', executionPrompt: '检查给定材料' },
  ] } })
})

it('ignores a late selection after another draft replaces the original member', () => {
  const props = fieldsProps()
  const view = render(<TeamProfileFields {...props} />)
  const oldChoice = picker().onChange
  view.rerender(<TeamProfileFields {...props} value={{ ...value, profile: { ...value.profile, members: [
    { name: '另一个角色', role: '实现', executionPrompt: '检查代码' },
  ] } }} />)
  act(() => { oldChoice({ preset: expert.preset, name: expert.name, expert }) })
  expect(props.onChange).not.toHaveBeenCalled()
})

it('prevents draft submission and cancellation while an expert is being activated, then allows retry', async () => {
  const update = vi.fn().mockResolvedValue(undefined)
  render(<TeamAuthoringCard draft={{ ...value, id: 'draft', revision: 1, status: 'pending' }} experts={[]} maxMembers={8}
    update={update} confirm={vi.fn()} discard={vi.fn()} t={t} />)
  fireEvent.click(screen.getByRole('button', { name: '编辑' }))
  act(() => { picker().onPendingChange?.(true) })
  const submit = screen.getByRole<HTMLButtonElement>('button', { name: '更新方案' })
  expect(submit.disabled).toBe(true)
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '取消' }).disabled).toBe(true)
  if (!submit.form) throw new Error('Expected the editor form')
  fireEvent.submit(submit.form)
  expect(update).not.toHaveBeenCalled()
  act(() => { picker().onPendingChange?.(false) })
  await act(async () => { fireEvent.click(submit) })
  expect(update).toHaveBeenCalledTimes(1)
})
