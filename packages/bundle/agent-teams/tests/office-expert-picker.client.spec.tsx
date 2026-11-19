// @vitest-environment jsdom
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ExpertDefinition } from '../src/expert-types.ts'
import type { OfficeMemberId, OfficeUpdate } from '../src/office-types.ts'
import type { ExpertPickerActions, ExpertPickerSelection } from '../src/client/ExpertPicker.tsx'
import { OfficeEditor } from '../src/client/OfficeEditor.tsx'
import { zh } from '../src/client/office-copy.ts'

vi.mock('../src/client/ExpertPicker.tsx', () => ({
  ExpertPicker: ({ label, actions, onChange, onPendingChange }: {
    label: string
    actions?: ExpertPickerActions
    onChange: (selection: ExpertPickerSelection | undefined) => void
    onPendingChange?: (pending: boolean) => void
  }) => {
    const select = async () => {
      onPendingChange?.(true)
      try {
        const selected = await actions?.activate('design/design-ui-designer')
        if (selected) onChange({ preset: selected.preset, name: selected.name, expert: selected })
      } finally { onPendingChange?.(false) }
    }
    return <button type="button" aria-label={label} onClick={() => { void select() }}>选择内置专家</button>
  },
}))

afterEach(cleanup)
const expert: ExpertDefinition = {
  id: 'expert', revision: 1, preset: 'expert-ui-v1', name: '界面设计师', description: '审查视觉表达和操作反馈',
  prompt: '完整专业职责'.repeat(1000), basePreset: 'standard',
}
const memberId = 'existing-member' as OfficeMemberId

function mount(members: OfficeUpdate['members'], activate: ExpertPickerActions['activate']) {
  const saved = vi.fn()
  const close = vi.fn()
  let updateDescription!: (description: string) => void
  const actions: ExpertPickerActions = {
    activate,
    catalogue: vi.fn().mockResolvedValue({ entries: [], categories: [] }),
    categoryLabel: category => category.name,
  }
  function Harness() {
    const [draft, change] = useState<OfficeUpdate>({ name: '设计办公室', description: '', members })
    updateDescription = (description) => { change(value => ({ ...value, description })) }
    return <OfficeEditor draft={draft} change={change} presets={[]} expertPicker={actions}
      editing={Boolean(members[0]?.id)} busy={false} failed={false} save={() => { saved(draft) }} close={close}
      t={key => zh[key as keyof typeof zh] ?? key} />
  }
  render(<Harness />)
  return { saved, close, updateDescription: (description: string) => { updateDescription(description) } }
}

it('selects a bundled expert directly and preserves existing member identity and name', async () => {
  const activate = vi.fn().mockResolvedValue(expert)
  const { saved } = mount([{ id: memberId, name: '原成员', role: '原职责', instruction: '原任务' }], activate)
  fireEvent.click(screen.getByRole('button', { name: /原成员/ }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '选用专家' })) })
  expect(activate).toHaveBeenCalledWith('design/design-ui-designer')
  expect(screen.getByRole('textbox', { name: '成员名称' })).toHaveProperty('value', '原成员')
  expect(screen.getByRole('textbox', { name: '成员职责' })).toHaveProperty('value', expert.description)
  const submit = screen.getByRole<HTMLButtonElement>('button', { name: '保存设置' })
  fireEvent.submit(submit.form!)
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({ members: [{ id: memberId, name: '原成员',
    role: expert.description, instruction: expert.description, agentPreset: expert.preset }] }))
})

it('prevents saving or closing while activation is pending and fills a new member after it resolves', async () => {
  let finish!: (value: ExpertDefinition) => void
  const activate = vi.fn(() => new Promise<ExpertDefinition>((resolve) => { finish = resolve }))
  const { saved, close } = mount([{ name: '', role: '', instruction: '' }], activate)
  fireEvent.click(screen.getByRole('button', { name: '选用专家' }))
  const submit = screen.getByRole<HTMLButtonElement>('button', { name: '保存办公室' })
  expect(submit).toHaveProperty('disabled', true)
  const cancel = screen.getAllByRole('button', { name: '取消' }).at(-1)!
  expect(cancel).toHaveProperty('disabled', true)
  fireEvent.submit(submit.form!)
  fireEvent.click(cancel)
  expect(saved).not.toHaveBeenCalled()
  expect(close).not.toHaveBeenCalled()
  await act(async () => { finish(expert) })
  expect(screen.getByRole('textbox', { name: '成员名称' })).toHaveProperty('value', expert.name)
  expect(screen.getByRole('textbox', { name: '成员职责' })).toHaveProperty('value', expert.description)
  expect(submit).toHaveProperty('disabled', false)
})

it('retains the latest office description when a pending expert selection completes', async () => {
  let finish!: (value: ExpertDefinition) => void
  const activate = vi.fn(() => new Promise<ExpertDefinition>((resolve) => { finish = resolve }))
  const view = mount([{ name: '', role: '', instruction: '' }], activate)
  fireEvent.click(screen.getByRole('button', { name: '选用专家' }))
  act(() => { view.updateDescription('将会议记录整理成行动项') })
  await act(async () => { finish(expert) })
  expect(screen.getByRole('textbox', { name: '用途' })).toHaveProperty('value', '将会议记录整理成行动项')
  const submit = screen.getByRole<HTMLButtonElement>('button', { name: '保存办公室' })
  fireEvent.submit(submit.form!)
  expect(view.saved).toHaveBeenCalledWith(expect.objectContaining({ description: '将会议记录整理成行动项' }))
})
