// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkflowEditDialog, type WorkflowEditActions } from '../src/client/WorkflowEditDialog.tsx'
import { OfficeSettingsDialog, type OfficeSettingsActions } from '../src/client/OfficeSettingsDialog.tsx'
import { zh as workflowCopy } from '../src/client/workflow-copy.ts'
import { zh as officeCopy } from '../src/client/office-copy.ts'
import type { WorkflowDraft, WorkflowDefinition } from '../src/workflow-types.ts'
import type { Office, OfficeId, OfficeMemberId } from '../src/office-types.ts'

vi.mock('../src/client/WorkflowEditor.tsx', () => ({
  WorkflowEditor: ({ draft, change, save, close, busy, failed }: {
    draft: WorkflowDraft
    change: (value: WorkflowDraft) => void
    save: () => void
    close: () => void
    busy: boolean
    failed: boolean
  }) => <section role="dialog" aria-label="编辑工作流"><input aria-label="名称" value={draft.name}
    onChange={(event) => { change({ ...draft, name: event.target.value }) }} />
  <button disabled={busy} onClick={save}>保存</button><button disabled={busy} onClick={close}>取消</button>
  {failed && <p role="alert">保存失败</p>}</section>,
}))
afterEach(cleanup)
const workflowLabels: Record<string, string> = workflowCopy
const officeLabels: Record<string, string> = officeCopy
const definition: WorkflowDefinition = { id: 'flow', name: '原名称', description: '', draft: '', review: '', secondReview: '', delivery: '',
  steps: [{ id: 'stable-step', name: '处理', instruction: '处理输入', kind: 'agent', stage: 'prepare', dependsOn: [], agentPreset: 'standard' }] }

function workflowActions(): WorkflowEditActions {
  return { read: vi.fn().mockResolvedValue(definition), presets: vi.fn().mockResolvedValue([{ id: 'standard' }]),
    save: vi.fn().mockResolvedValue(undefined), text: key => workflowLabels[key] ?? key }
}

it('keeps an edited draft after failure and saves back to the captured workflow identity', async () => {
  const actions = workflowActions()
  vi.mocked(actions.save).mockRejectedValueOnce(new Error('offline'))
  const close = vi.fn()
  await act(async () => { render(<WorkflowEditDialog workflowId="flow" actions={actions} close={close} />) })
  fireEvent.change(screen.getByRole('textbox', { name: '名称' }), { target: { value: '当前页修改' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存' })) })
  expect(screen.getByRole('alert').textContent).toBe('保存失败')
  expect(screen.getByRole('textbox')).toHaveProperty('value', '当前页修改')
  expect(close).not.toHaveBeenCalled()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存' })) })
  expect(actions.save).toHaveBeenLastCalledWith('flow', expect.objectContaining({ name: '当前页修改', steps: definition.steps }))
  expect(close).toHaveBeenCalledTimes(1)
})

it('locks repeated saves and ignores completion after its dialog has unmounted', async () => {
  const actions = workflowActions()
  let finish!: () => void
  vi.mocked(actions.save).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const close = vi.fn()
  const view = await act(async () => render(<WorkflowEditDialog workflowId="flow" actions={actions} close={close} />))
  const button = screen.getByRole('button', { name: '保存' })
  fireEvent.click(button); fireEvent.click(button)
  expect(actions.save).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: '取消' })).toHaveProperty('disabled', true)
  view.unmount()
  await act(async () => { finish() })
  expect(close).not.toHaveBeenCalled()
})

const office: Office = { id: 'office' as OfficeId, name: '当前办公室', description: '持续协作', members: [
  { id: 'member' as OfficeMemberId, name: '现有成员', role: '统筹', instruction: '整理任务', agentPreset: 'standard' },
] }

it('keeps the complete office draft after failure and saves to the captured office identity', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
  const saved = vi.fn()
  const close = vi.fn()
  await act(async () => { render(<OfficeSettingsDialog office={office} actions={{ save,
    presets: async () => [{ id: 'standard' }], text: key => officeLabels[key] ?? key }} close={close} saved={saved} />) })
  expect(screen.queryByRole('textbox', { name: '成员名称' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /现有成员/ }))
  fireEvent.change(screen.getByRole('textbox', { name: '办公室名称' }), { target: { value: '更新后的办公室' } })
  fireEvent.change(screen.getByRole('textbox', { name: '成员名称' }), { target: { value: '项目协调员' } })
  fireEvent.change(screen.getByRole('textbox', { name: '专业角色' }), { target: { value: '项目统筹' } })
  fireEvent.change(screen.getByRole('textbox', { name: '成员职责' }), { target: { value: '拆解任务\n汇总真实结果' } })
  fireEvent.change(screen.getByRole('combobox', { name: '组长' }), { target: { value: '0' } })
  expect(save).not.toHaveBeenCalled()
  const submit = screen.getByRole<HTMLButtonElement>('button', { name: '保存设置' })
  await act(async () => { fireEvent.submit(submit.form!) })
  expect(screen.getByRole('textbox', { name: '办公室名称' })).toHaveProperty('value', '更新后的办公室')
  expect(screen.getByRole('textbox', { name: '成员职责' })).toHaveProperty('value', '拆解任务\n汇总真实结果')
  expect(screen.getByRole('combobox', { name: '组长' })).toHaveProperty('value', '0')
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(saved).not.toHaveBeenCalled()
  await act(async () => { fireEvent.submit(submit.form!) })
  expect(save).toHaveBeenLastCalledWith('office', {
    name: '更新后的办公室', description: '持续协作', leaderIndex: 0,
    members: [{ id: 'member', name: '项目协调员', role: '项目统筹', instruction: '拆解任务\n汇总真实结果', agentPreset: 'standard' }],
  })
  expect(saved).toHaveBeenCalledTimes(1)
})

it('cancels office edits without saving and retains the original member preset', async () => {
  const save = vi.fn()
  const close = vi.fn()
  await act(async () => { render(<OfficeSettingsDialog office={office} actions={{ save,
    presets: async () => [{ id: 'standard' }, { id: 'ptc' }], text: key => officeLabels[key] ?? key }} close={close} saved={vi.fn()} />) })
  fireEvent.change(screen.getByRole('textbox', { name: '办公室名称' }), { target: { value: '未保存修改' } })
  fireEvent.click(screen.getByRole('button', { name: /现有成员/ }))
  const picker = screen.getByRole('button', { name: '选用专家' })
  expect(picker).toHaveProperty('disabled', false)
  fireEvent.click(picker)
  expect(screen.getByRole('menuitem', { name: 'standard' }).getAttribute('aria-current')).toBe('page')
  fireEvent.click(screen.getByRole('menuitem', { name: 'ptc' }))
  fireEvent.click(screen.getAllByRole('button', { name: '取消' }).at(-1)!)
  expect(close).toHaveBeenCalledTimes(1)
  expect(save).not.toHaveBeenCalled()
})

it('locks repeated office saves and ignores completion after its dialog has unmounted', async () => {
  let finish!: () => void
  const save = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
  const close = vi.fn()
  const saved = vi.fn()
  const view = await act(async () => render(<OfficeSettingsDialog office={office} actions={{ save,
    presets: async () => [{ id: 'standard' }], text: key => officeLabels[key] ?? key }} close={close} saved={saved} />))
  const button = screen.getByRole<HTMLButtonElement>('button', { name: '保存设置' })
  fireEvent.submit(button.form!); fireEvent.submit(button.form!)
  expect(save).toHaveBeenCalledTimes(1)
  expect(screen.getAllByRole('button', { name: '取消' }).at(-1)!).toHaveProperty('disabled', true)
  view.unmount()
  await act(async () => { finish() })
  expect(saved).not.toHaveBeenCalled()
})

it('keeps a new member identity and leader selection across removal and a failed save', async () => {
  const save = vi.fn<OfficeSettingsActions['save']>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
  await act(async () => { render(<OfficeSettingsDialog office={office} actions={{ save,
    presets: async () => [{ id: 'standard' }], text: key => officeLabels[key] ?? key }} close={vi.fn()} saved={vi.fn()} />) })
  fireEvent.click(screen.getByRole('button', { name: '添加成员' }))
  fireEvent.change(screen.getByRole('textbox', { name: '成员名称' }), { target: { value: '新增专家' } })
  fireEvent.change(screen.getByRole('textbox', { name: '专业角色' }), { target: { value: '数据核查' } })
  fireEvent.change(screen.getByRole('textbox', { name: '成员职责' }), { target: { value: '复核每项数据' } })
  const preset = screen.getByRole('button', { name: '选用专家' })
  expect(preset).toHaveProperty('disabled', false)
  fireEvent.click(preset)
  fireEvent.click(screen.getByRole('menuitem', { name: 'standard' }))
  fireEvent.change(screen.getByRole('combobox', { name: '组长' }), { target: { value: '1' } })
  fireEvent.click(screen.getAllByRole('button', { name: '移除' })[0]!)
  expect(screen.getByRole('combobox', { name: '组长' })).toHaveProperty('value', '0')
  const submit = screen.getByRole<HTMLButtonElement>('button', { name: '保存设置' })
  await act(async () => { fireEvent.submit(submit.form!) })
  expect(save.mock.calls[0]?.[0]).toBe(office.id)
  const firstDraft = save.mock.calls[0]?.[1]
  expect(firstDraft).toMatchObject({ name: office.name, description: office.description, leaderIndex: 0,
    members: [{ name: '新增专家', role: '数据核查', instruction: '复核每项数据', agentPreset: 'standard' }],
  })
  expect(firstDraft?.members[0]?.id).toEqual(expect.any(String))
  expect(screen.getByRole('alert')).toBeTruthy()
  await act(async () => { fireEvent.submit(submit.form!) })
  expect(save).toHaveBeenCalledTimes(2)
  expect(save.mock.calls[1]?.[1]).toEqual(firstDraft)
})
