// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CardForm, type CardActions } from '../src/client/CardForm.tsx'
import { zh } from '../src/client/copy.ts'
import type { CardState } from '../src/types.ts'

afterEach(cleanup)
it('restores values, serializes edits and replaces submitted controls with results', async () => {
  let state: CardState = { values: { goal: 'Saved draft' }, revision: 1, status: 'draft' }
  const submit = vi.fn(async () => ({ ...state, status: 'submitted' as const }))
  const actions: CardActions = { read: async () => state, save: vi.fn<CardActions['save']>(async (_key, values, revision) => {
    state = { values, revision: revision + 1, status: 'draft' }; return state
  }), submit }
  await act(async () => { render(<CardForm cardKey="message:0" schema={{ componentName: 'CrewonForm', title: '需求确认', fields: [
    { name: 'goal', label: '目标', type: 'text', required: true }, { name: 'notes', label: '补充', type: 'textarea' },
  ] }} actions={actions} t={key => (zh as Record<string, string>)[key] ?? key} />) })
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: /目标/ }).value).toBe('Saved draft')
  await act(async () => { fireEvent.change(screen.getByRole('textbox', { name: '补充' }), { target: { value: 'Keep details' } }) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '提交' })) })
  expect(submit).toHaveBeenCalledTimes(1)
  expect(submit.mock.calls[0]).toEqual(['message:0', { goal: 'Saved draft', notes: 'Keep details' }, 2, '需求确认',
    undefined, { goal: '目标', notes: '补充' }])
  expect(screen.getByText('已提交')).toBeTruthy()
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.getByText('Saved draft')).toBeTruthy()
  expect(screen.getByText('Keep details')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '提交' })).toBeNull()
})

it('restores submitted results with explicit checkbox and empty values', async () => {
  const actions: CardActions = { read: async () => ({ values: { approved: false, notes: '' }, revision: 3, status: 'submitted' }), save: vi.fn(), submit: vi.fn() }
  await act(async () => { render(<CardForm cardKey="submitted" schema={{ componentName: 'CrewonForm', title: '已保存结果', fields: [
    { name: 'approved', label: '同意', type: 'checkbox' }, { name: 'notes', label: '备注', type: 'textarea' },
  ] }} actions={actions} t={key => (zh as Record<string, string>)[key] ?? key} />) })
  expect(screen.getByText('否')).toBeTruthy()
  expect(screen.getByText('未填写')).toBeTruthy()
  expect(screen.queryByRole('checkbox')).toBeNull()
  expect(actions.save).not.toHaveBeenCalled()
  expect(actions.submit).not.toHaveBeenCalled()
})
