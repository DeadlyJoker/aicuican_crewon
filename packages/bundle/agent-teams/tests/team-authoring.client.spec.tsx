// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TeamAuthoringCard, type TeamAuthoringCardProps } from '../src/client/TeamAuthoringCard.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)
function props(): TeamAuthoringCardProps {
  return { draft: { id: 'proposal', revision: 1, status: 'pending', name: '评审团', profile: {
    description: '产品体验', goal: '找出关键问题', deliverables: '三项可执行建议',
    members: [{ name: '体验专家', role: '研究', executionPrompt: '独立审阅' }],
  } }, experts: [{ id: 'expert', revision: 1, preset: 'expert-v1', name: '事实专家', description: '事实核查',
    prompt: '核查来源并说明不确定性', basePreset: 'standard' }], maxMembers: 8,
  update: vi.fn().mockResolvedValue(undefined), confirm: vi.fn(), discard: vi.fn(),
  t: key => zh[key as keyof typeof zh] ?? key }
}

it('shows a concise proposal and requires the explicit confirmation action to save it', () => {
  const value = props()
  render(<TeamAuthoringCard {...value} />)
  expect(screen.getByText('体验专家')).toBeTruthy()
  expect(screen.queryByText('独立审阅')).toBeNull()
  expect(screen.getByText('三项可执行建议')).toBeTruthy()
  expect(value.confirm).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '确认保存' }))
  expect(value.confirm).toHaveBeenCalledTimes(1)
})

it('edits the same fields and saved expert binding as the manual editor', async () => {
  const value = props()
  render(<TeamAuthoringCard {...value} />)
  fireEvent.click(screen.getByRole('button', { name: '编辑' }))
  fireEvent.change(screen.getByLabelText('团队目标'), { target: { value: '找出证据缺口' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '选用专家' })) })
  fireEvent.click(screen.getByRole('menuitem', { name: '事实专家' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '更新方案' })) })
  const updated = vi.mocked(value.update).mock.calls[0]?.[0]
  expect(updated?.profile.goal).toBe('找出证据缺口')
  expect(updated?.profile.members).toEqual([{ name: '事实专家', role: '事实核查', expertId: 'expert',
    agentPreset: 'expert-v1', executionPrompt: '事实核查' }])
  expect(screen.queryByLabelText('团队名称')).toBeNull()
})

it('retains failed edits and keeps closed proposals free of active confirmation controls', async () => {
  const value = props()
  value.update = vi.fn().mockRejectedValue(new Error('Changed'))
  const view = render(<TeamAuthoringCard {...value} />)
  fireEvent.click(screen.getByRole('button', { name: '编辑' }))
  fireEvent.change(screen.getByLabelText('团队名称'), { target: { value: '保留的修改' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '更新方案' })) })
  expect(screen.getByLabelText<HTMLInputElement>('团队名称').value).toBe('保留的修改')
  view.unmount()
  render(<TeamAuthoringCard {...value} draft={{ ...value.draft, status: 'saved' }} />)
  expect(screen.getByText('已保存')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '确认保存' })).toBeNull()
})
