// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { TeamTrajectory } from '../src/client/TeamTrajectory.tsx'

vi.mock('../src/client/WorkflowTrajectory.tsx', () => ({ WorkflowTrajectory: () => null }))
afterEach(cleanup)

it('selects the recorded child version rather than the office current member session', async () => {
  const selectAgent = vi.fn()
  const children: [] = []
  const props = {
    sessionId: SessionId('office'), selectedAgent: undefined, selectAgent,
    useCatalogue: (select: (revision: number) => number) => select(0),
    useProjection: () => children,
    read: async () => null,
    readOffice: async () => ({ office: { members: [{ id: 'member', name: '审阅员', sessionId: 'new-child' }] },
      messages: [{ memberId: 'member', status: 'completed' }] }),
    readExpertExecutions: async () => [
      { sessionId: 'old-child', memberName: '审阅员', preset: 'expert-review-v1', expertName: '代码审查员 · v1' },
      { sessionId: 'new-child', memberName: '审阅员', preset: 'expert-review-v2', expertName: '代码审查员 · v2' },
      { sessionId: 'team-child', memberName: 'agent-teams:review-team:代码审查员',
        preset: 'expert-review-v1', expertName: '代码审查员 · v1' },
    ],
  } as ComponentProps<typeof TeamTrajectory>
  render(<TeamTrajectory {...props} />)
  fireEvent.click(await screen.findByRole('button', { name: '审阅员 · 代码审查员 · v1' }))
  expect(selectAgent).toHaveBeenLastCalledWith('old-child')
  fireEvent.click(screen.getByRole('button', { name: '审阅员 · 代码审查员 · v2' }))
  expect(selectAgent).toHaveBeenLastCalledWith('new-child')
  expect(screen.queryByRole('button', { name: '审阅员' })).toBeNull()
  expect(screen.getByRole('button', { name: '代码审查员 · v1' })).toBeTruthy()
})

it('hides the previous conversation rows while the next conversation is loading', async () => {
  const children: [] = []
  const executions = [{ sessionId: SessionId('old-child'), memberName: '审阅员',
    preset: 'expert-review-v1', expertName: '代码审查员 · v1' }]
  const props = {
    sessionId: SessionId('old-office'), selectedAgent: undefined, selectAgent: vi.fn(),
    useCatalogue: (select: (revision: number) => number) => select(0), useProjection: () => children,
    read: async () => null,
    readOffice: async () => ({ office: { members: [{ id: 'member', name: '旧成员', sessionId: 'legacy-child' }] },
      messages: [{ memberId: 'member', status: 'completed' }] }),
    readExpertExecutions: async () => executions,
  } as ComponentProps<typeof TeamTrajectory>
  const view = render(<TeamTrajectory {...props} />)
  await screen.findByRole('button', { name: '审阅员 · 代码审查员 · v1' })
  expect(screen.getByRole('button', { name: '旧成员' })).toBeTruthy()
  await act(async () => {
    view.rerender(<TeamTrajectory {...props} sessionId={SessionId('new-office')}
      read={() => new Promise(() => {})} readExpertExecutions={() => new Promise(() => {})} />)
  })
  expect(screen.queryByRole('button', { name: '审阅员 · 代码审查员 · v1' })).toBeNull()
  expect(screen.queryByRole('button', { name: '旧成员' })).toBeNull()
})

it('leaves workflow child selection to the existing workflow trajectory', async () => {
  const children: [] = []
  const props = {
    sessionId: SessionId('workflow'), selectedAgent: undefined, selectAgent: vi.fn(),
    useCatalogue: (select: (revision: number) => number) => select(0), useProjection: () => children,
    read: async () => ({ name: '流程' }), readOffice: async () => null,
    readExpertExecutions: async () => [{ sessionId: SessionId('step-child'), memberName: '审阅',
      preset: 'expert-review-v1', expertName: '代码审查员 · v1' }],
  } as ComponentProps<typeof TeamTrajectory>
  await act(async () => { render(<TeamTrajectory {...props} />) })
  expect(screen.queryByRole('button', { name: /代码审查员/ })).toBeNull()
})
