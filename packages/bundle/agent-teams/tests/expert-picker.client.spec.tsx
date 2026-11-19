// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ExpertPicker, type ExpertPickerActions } from '../src/client/ExpertPicker.tsx'
import type { ExpertDefinition } from '../src/expert-types.ts'
import { zh } from '../src/client/expert-copy.ts'

afterEach(cleanup)
const expert: ExpertDefinition = { id: 'code-reviewer', revision: 1, preset: 'expert-code-v1', name: '代码审查员',
  description: '审阅代码与可靠性', prompt: 'Review the implementation', basePreset: 'standard' }
function setup(overrides: Partial<ExpertPickerActions> = {}, strict = false) {
  const actions: ExpertPickerActions = {
    catalogue: vi.fn().mockResolvedValue({ categories: [], entries: [{ key: 'builtin:code', name: expert.name,
      description: expert.description, category: 'engineering', tags: ['Code review'], examples: [], builtinSlug: 'engineering/code' }] }),
    activate: vi.fn().mockResolvedValue(expert), categoryLabel: value => value.name, text: zh, ...overrides,
  }
  const change = vi.fn()
  const pending = vi.fn<(pending: boolean) => void>()
  const child = <ExpertPicker label="选择专家" emptyLabel="沿用当前配置" value="standard" selectedLabel="标准模式"
    presets={[{ id: 'standard', name: '标准模式' }, { id: 'expert-old-v1', name: '已保存的旧专家' }]}
    actions={actions} onChange={change} onPendingChange={pending} />
  const view = render(strict ? <StrictMode>{child}</StrictMode> : child)
  return { actions, change, pending, view }
}

it('loads lightweight search results on opening and activates only the chosen expert', async () => {
  const test = setup({}, true)
  expect(screen.getByText('选择专家')).toBeTruthy()
  expect(test.actions.catalogue).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '选择专家' }))
  await screen.findByRole('menuitem', { name: /代码审查员/ })
  expect(test.actions.activate).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '审查' } })
  await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: /代码审查员/ })) })
  expect(test.actions.activate).toHaveBeenCalledExactlyOnceWith('engineering/code')
  expect(test.change).toHaveBeenCalledExactlyOnceWith({ preset: 'expert-code-v1', name: expert.name, expert })
  expect(test.pending.mock.calls.map(call => call[0])).toEqual([true, false])
  expect(screen.queryByRole('searchbox')).toBeNull()
})

it('keeps the previous selection after activation fails and supports retrying the same result', async () => {
  const activate = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(expert)
  const test = setup({ activate })
  fireEvent.click(screen.getByRole('button', { name: '选择专家' }))
  const row = await screen.findByRole('menuitem', { name: /代码审查员/ })
  await act(async () => { fireEvent.click(row) })
  expect(screen.getByRole('alert').textContent).toContain(zh.pickerFailed)
  expect(test.change).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '选择专家' }).textContent).toContain('标准模式')
  await act(async () => { fireEvent.click(row) })
  expect(test.change).toHaveBeenCalledTimes(1)
})

it('ignores late activation after Escape and releases the parent form lock', async () => {
  let complete: ((value: ExpertDefinition) => void) | undefined
  const test = setup({ activate: () => new Promise((resolve) => { complete = resolve }) })
  fireEvent.click(screen.getByRole('button', { name: '选择专家' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: /代码审查员/ }))
  expect(test.pending).toHaveBeenLastCalledWith(true)
  fireEvent.keyDown(document, { key: 'Escape' })
  await act(async () => { complete?.(expert) })
  expect(test.change).not.toHaveBeenCalled()
  expect(test.pending).toHaveBeenLastCalledWith(false)
})

it('preserves historical labels and native preset selection without a catalogue', async () => {
  const change = vi.fn()
  render(<ExpertPicker label="选择专家" emptyLabel="自定义职责" value="expert-old-v1" selectedLabel="历史专家"
    presets={[{ id: 'expert-saved-v2', name: '已保存专家' }]} onChange={change} />)
  expect(screen.getByRole('button', { name: '选择专家' }).textContent).toContain('历史专家')
  fireEvent.click(screen.getByRole('button', { name: '选择专家' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '已保存专家' }))
  expect(change).toHaveBeenCalledWith({ preset: 'expert-saved-v2', name: '已保存专家' })
})

it('reports a catalogue failure in place and reloads without losing the configured expert', async () => {
  const catalogue = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ entries: [], categories: [] })
  setup({ catalogue })
  fireEvent.click(screen.getByRole('button', { name: '选择专家' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('menuitem', { name: '已保存的旧专家' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '选择专家' }).textContent).toContain('标准模式')
  fireEvent.click(screen.getByRole('button', { name: zh.retry }))
  await waitFor(() => { expect(screen.queryByRole('alert')).toBeNull() })
  expect(catalogue).toHaveBeenCalledTimes(2)
})
