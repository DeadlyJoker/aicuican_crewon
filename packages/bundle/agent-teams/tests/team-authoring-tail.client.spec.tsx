// @vitest-environment jsdom
import type { ComponentProps } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TeamAuthoringTail } from '../src/client/TeamAuthoringTail.tsx'
import type { TeamAuthoringDraft } from '../src/team-authoring-types.ts'
import { zh } from '../src/client/locales.ts'
import { EMPTY_CHAT_SNAPSHOT } from '@deepseek-ai/dsh-client-ui-chat/client'

afterEach(cleanup)
type Props = ComponentProps<typeof TeamAuthoringTail>
const draft: TeamAuthoringDraft = { id: 'draft', revision: 2, status: 'pending', name: '待确认评审团',
  profile: { description: '测试', members: [{ name: '审阅专家', role: '核对证据', executionPrompt: '检查' }] } }

function setup() {
  let latest = 2
  const read = vi.fn().mockResolvedValue(draft)
  const confirm = vi.fn().mockResolvedValue({ ...draft, status: 'saved' })
  const partial: Partial<Props> = {
    sessionId: 'conversation' as Props['sessionId'], t: key => zh[key as keyof typeof zh] ?? key,
    useChat: select => select({ ...EMPTY_CHAT_SNAPSHOT, timeline: { ...EMPTY_CHAT_SNAPSHOT.timeline, turnOrder: [1, latest] } }),
    useCatalogue: select => select(0), read, confirm, listExperts: vi.fn().mockResolvedValue({ experts: [] }),
    maxMembers: () => 8, update: vi.fn(), discard: vi.fn(),
  }
  const reply = (turn: number) => <TeamAuthoringTail {...partial as Props} turn={{ turn, status: 'closed' } as Props['turn']} />
  const content = () => <><div data-reply="1">{reply(1)}</div><div data-reply={latest}>{reply(latest)}</div></>
  return { read, confirm, content, next: () => { latest++ } }
}

it('restores one proposal below only the latest completed reply and follows the next reply', async () => {
  const test = setup()
  const view = render(test.content())
  await act(async () => {})
  expect(screen.getAllByRole('region', { name: zh.reviewTitle })).toHaveLength(1)
  expect(screen.getByText(draft.name).closest('[data-reply]')?.getAttribute('data-reply')).toBe('2')
  test.next()
  view.rerender(test.content())
  await act(async () => {})
  expect(screen.getByText(draft.name).closest('[data-reply]')?.getAttribute('data-reply')).toBe('3')
  view.unmount()
  render(test.content())
  await act(async () => {})
  expect(screen.getByText(draft.name)).toBeTruthy()
})

it('admits one confirmation while the request is pending', async () => {
  const test = setup()
  let complete: ((value: TeamAuthoringDraft) => void) | undefined
  test.confirm.mockImplementation(() => new Promise<TeamAuthoringDraft>((resolve) => { complete = resolve }))
  render(test.content())
  await act(async () => {})
  const button = screen.getByRole('button', { name: zh.confirmSave })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(test.confirm).toHaveBeenCalledTimes(1)
  await act(async () => { complete?.({ ...draft, status: 'saved' }) })
  expect(screen.queryByRole('button', { name: zh.confirmSave })).toBeNull()
})
