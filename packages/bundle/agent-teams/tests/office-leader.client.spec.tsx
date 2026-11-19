// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { CommandId } from '@deepseek-ai/dsh-commands'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { OfficeConversation, OfficePage } from '../src/client/OfficePage.tsx'
import { OfficeEditor } from '../src/client/OfficeEditor.tsx'
import { zh } from '../src/client/office-copy.ts'
import type { Office, OfficeId, OfficeMemberId, OfficeMessageId, OfficeMessage } from '../src/office-types.ts'

afterEach(cleanup)
afterEach(() => { vi.useRealTimers() })
const copy: Record<string, string> = zh
const office: Office = {
  id: 'office' as OfficeId, name: '产品办公室', description: '',
  members: [
    { id: 'researcher' as OfficeMemberId, name: '研究员', role: '用户研究', instruction: '记录用户问题' },
    { id: 'coordinator' as OfficeMemberId, name: '协调员', role: '项目统筹', instruction: '汇总下一步' },
  ],
}

function pageProps(values: Partial<ComponentProps<typeof OfficePage>> = {}): ComponentProps<typeof OfficePage> {
  // These tests exercise the office form's consumed framework seats.
  const props: Partial<ComponentProps<typeof OfficePage>> = {
    useCatalogue: select => select(0),
    navigation: { title: '团队', labels: { specialists: '专家', experts: '专家团', offices: '办公室', workflows: '工作流' }, mode: 'offices', selectMode: vi.fn() },
    t: key => copy[key] ?? key, list: async () => [], presets: async () => [], save: vi.fn(), open: vi.fn(), update: vi.fn(),
    useManagement: select => select(undefined), consumeManagement: vi.fn(),
    useWorkspaces: select => select({ items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null }),
    ...values,
  }
  return props as ComponentProps<typeof OfficePage>
}

it('updates an existing office and leader without recreating its members', async () => {
  const updated = { ...office, name: '更新后的办公室', leaderId: office.members[1]!.id }
  const update = vi.fn().mockResolvedValue(updated)
  const save = vi.fn()
  await act(async () => { render(<OfficePage {...pageProps({
    list: async () => [update.mock.calls.length ? updated : office], update, save,
  })} />) })
  fireEvent.click(screen.getByRole('button', { name: '办公室设置' }))
  fireEvent.change(screen.getByRole('textbox', { name: '办公室名称' }), { target: { value: '更新后的办公室' } })
  fireEvent.change(screen.getByRole('combobox', { name: '组长' }), { target: { value: '1' } })
  const submit = screen.getByRole<HTMLButtonElement>('button', { name: '保存设置' })
  expect(submit.closest('form')).toBeNull()
  await act(async () => { fireEvent.submit(submit.form!) })
  expect(update).toHaveBeenCalledWith(office.id, { name: '更新后的办公室', description: '', members: office.members, leaderIndex: 1 })
  expect(save).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByText('组长').closest('[data-office-leader]')).not.toBeNull()
  expect(screen.getByText('协调员')).toBeTruthy()
})

it('keeps the reusable office editor controlled and binds its footer to its own form', async () => {
  const change = vi.fn()
  const save = vi.fn()
  const close = vi.fn()
  const draft = { name: office.name, description: office.description, members: office.members, leaderIndex: 0 }
  const props: ComponentProps<typeof OfficeEditor> = { draft, change, presets: [], editing: true,
    save, close, busy: false, failed: false, t: key => copy[key] ?? key }
  const view = render(<OfficeEditor {...props} />)
  fireEvent.change(screen.getByRole('combobox', { name: '组长' }), { target: { value: '1' } })
  expect(change).toHaveBeenCalledWith({ ...draft, leaderIndex: 1 })
  view.rerender(<OfficeEditor {...props} draft={{ ...draft, leaderIndex: 1 }} busy />)
  expect(screen.getByRole('combobox', { name: '组长' })).toHaveProperty('disabled', true)
  expect(screen.getByRole('button', { name: '保存设置' })).toHaveProperty('disabled', true)
  view.rerender(<OfficeEditor {...props} draft={{ ...draft, leaderIndex: 1 }} failed />)
  expect(screen.getByRole('alert').textContent).toBe(copy.failure)
  const submit = screen.getByRole<HTMLButtonElement>('button', { name: '保存设置' })
  expect(submit.closest('form')).toBeNull()
  fireEvent.submit(submit.form!)
  expect(save).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByText('取消'))
  expect(close).toHaveBeenCalledTimes(1)
})

it('allows clearing the leader and retains the whole office draft after a failed update', async () => {
  const update = vi.fn().mockRejectedValueOnce(new Error('Temporary save failure')).mockResolvedValue(office)
  await act(async () => { render(<OfficePage {...pageProps({
    list: async () => [{ ...office, leaderId: office.members[1]!.id }], update,
  })} />) })
  fireEvent.click(screen.getByRole('button', { name: '办公室设置' }))
  const selection = screen.getByRole('combobox', { name: '组长' })
  expect(selection).toHaveProperty('value', '1')
  fireEvent.change(selection, { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: /研究员/ }))
  fireEvent.change(screen.getByRole('textbox', { name: '成员职责' }), { target: { value: '记录新职责' } })
  const submit = screen.getByRole<HTMLButtonElement>('button', { name: '保存设置' })
  await act(async () => { fireEvent.submit(submit.form!) })
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(selection).toHaveProperty('value', '')
  expect(screen.getByRole('textbox', { name: '成员职责' })).toHaveProperty('value', '记录新职责')
  expect(screen.getByRole('alert').textContent).toBe(copy.failure)
  await act(async () => { fireEvent.submit(submit.form!) })
  expect(update).toHaveBeenLastCalledWith(office.id, { name: office.name, description: '', members: [
    { ...office.members[0], instruction: '记录新职责' }, office.members[1],
  ] })
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('keeps the selected draft leader after removing an earlier member and clears it when the leader is removed', async () => {
  await act(async () => { render(<OfficePage {...pageProps()} />) })
  fireEvent.click(screen.getByRole('button', { name: '新建办公室' }))
  fireEvent.change(screen.getByRole('textbox', { name: '成员名称' }), { target: { value: '成员1' } })
  fireEvent.click(screen.getByRole('button', { name: '添加成员' }))
  fireEvent.change(screen.getByRole('textbox', { name: '成员名称' }), { target: { value: '成员2' } })
  fireEvent.click(screen.getByRole('button', { name: '添加成员' }))
  fireEvent.change(screen.getByRole('textbox', { name: '成员名称' }), { target: { value: '成员3' } })
  const selection = screen.getByRole('combobox', { name: '组长' })
  fireEvent.change(selection, { target: { value: '1' } })
  fireEvent.click(screen.getAllByRole('button', { name: '移除' })[0]!)
  expect(selection).toHaveProperty('value', '0')
  expect(screen.getByRole('option', { name: '成员2' })).toHaveProperty('selected', true)
  fireEvent.click(screen.getAllByRole('button', { name: '移除' })[0]!)
  expect(selection).toHaveProperty('value', '')
  expect(screen.getByRole('option', { name: '不设组长' })).toHaveProperty('selected', true)
})

it('saves the optional draft leader index', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  await act(async () => { render(<OfficePage {...pageProps({ save })} />) })
  fireEvent.click(screen.getByRole('button', { name: '新建办公室' }))
  fireEvent.change(screen.getByRole('textbox', { name: '办公室名称' }), { target: { value: '新办公室' } })
  fireEvent.change(screen.getByRole('textbox', { name: '成员名称' }), { target: { value: '协调员' } })
  fireEvent.change(screen.getByRole('textbox', { name: '专业角色' }), { target: { value: '统筹' } })
  fireEvent.change(screen.getByRole('textbox', { name: '成员职责' }), { target: { value: '汇总' } })
  fireEvent.change(screen.getByRole('combobox', { name: '组长' }), { target: { value: '0' } })
  const submit = screen.getByRole<HTMLButtonElement>('button', { name: '保存办公室' })
  await act(async () => { fireEvent.submit(submit.form!) })
  expect(save).toHaveBeenCalledWith({ name: '新办公室', description: '', leaderIndex: 0,
    members: [{ name: '协调员', role: '统筹', instruction: '汇总' }] })
})

it('labels a leader reply without changing its message bubble', async () => {
  const props: Partial<ComponentProps<typeof OfficeConversation>> = {
    renderFactorySlot: (_name, _input, options) => options?.fallback,
    node: { kind: 'command', seq: 1, time: 1, commandId: CommandId('command'), name: 'team-office-send',
      args: JSON.stringify({ id: 'reply' }), outcome: { kind: 'success' } },
    sessionId: SessionId('office-session'), t: key => copy[key] ?? key,
    readOffice: async () => ({ office: { ...office, leaderId: office.members[1]!.id }, messages: [
      { id: 'reply' as OfficeMessageId, memberId: office.members[1]!.id, memberName: '协调员', text: '下一步',
        output: '**先确认范围**', status: 'completed', createdAt: 1 },
    ] }),
  }
  await act(async () => { render(<OfficeConversation {...props as ComponentProps<typeof OfficeConversation>} />) })
  expect(screen.getByText('组长').closest('[data-office-leader]')).not.toBeNull()
  expect(screen.getByText('先确认范围').tagName).toBe('STRONG')
})

it('attributes a delegated lobby task to its leader without creating a user question', async () => {
  const props: Partial<ComponentProps<typeof OfficeConversation>> = {
    renderFactorySlot: (_name, _input, options) => options?.fallback,
    node: { kind: 'command', seq: 1, time: 1, commandId: CommandId('delegation'), name: 'team-office-send',
      args: JSON.stringify({ id: 'delegated-reply' }), outcome: { kind: 'success' } },
    sessionId: SessionId('office-session'), t: key => copy[key] ?? key,
    readOffice: async () => ({ office: { ...office, leaderId: office.members[1]!.id }, messages: [
      { id: 'delegated-reply' as OfficeMessageId, memberId: office.members[0]!.id, memberName: '研究员',
        requestedBy: office.members[1]!.id, text: '检查用户问题并返回三条建议', output: '**研究结论**', status: 'completed', createdAt: 1 },
    ] }),
  }
  await act(async () => { render(<OfficeConversation {...props as ComponentProps<typeof OfficeConversation>} />) })
  expect(screen.getByText('协调员 → 研究员')).toBeTruthy()
  expect(screen.queryByText('@研究员')).toBeNull()
  expect(screen.queryByText('检查用户问题并返回三条建议')).toBeNull()
  expect(screen.getByText('研究结论').tagName).toBe('STRONG')
})

const leaderRequest: OfficeMessage = {
  id: 'leader-request' as OfficeMessageId, memberId: office.members[1]!.id, memberName: '协调员',
  text: '用户原始问题', output: '组长最终汇总', status: 'completed', createdAt: 1,
}
const delegatedRequest: OfficeMessage = {
  id: 'delegated-request' as OfficeMessageId, memberId: office.members[0]!.id, memberName: '研究员',
  requestedBy: office.members[1]!.id, requestedFor: leaderRequest.id,
  text: '内部派工说明', output: '研究员核查结果', status: 'completed', createdAt: 2,
}

it('places delegated results between the original question and leader summary without a duplicate command row', async () => {
  const readOffice = async () => ({ office, messages: [leaderRequest, delegatedRequest] })
  const node = { kind: 'command' as const, seq: 1, time: 1, commandId: CommandId('command'), name: 'team-office-send',
    args: JSON.stringify({ id: leaderRequest.id }), outcome: { kind: 'success' as const } }
  const props: Partial<ComponentProps<typeof OfficeConversation>> = {
    renderFactorySlot: (_name, _input, options) => options?.fallback,
    node, sessionId: SessionId('office-session'), t: key => copy[key] ?? key, readOffice,
  }
  let container!: HTMLElement
  await act(async () => {
    ({ container } = render(<>
      <OfficeConversation {...props as ComponentProps<typeof OfficeConversation>} />
      <OfficeConversation {...props as ComponentProps<typeof OfficeConversation>}
        node={{ ...node, commandId: CommandId('child-command'), args: JSON.stringify({ id: delegatedRequest.id }) }} />
    </>))
  })
  expect(screen.getAllByText('研究员核查结果')).toHaveLength(1)
  expect(screen.getByText('协调员 → 研究员')).toBeTruthy()
  expect(screen.queryByText('内部派工说明')).toBeNull()
  const text = container.textContent ?? ''
  expect(text.indexOf('用户原始问题')).toBeLessThan(text.indexOf('研究员核查结果'))
  expect(text.indexOf('研究员核查结果')).toBeLessThan(text.indexOf('组长最终汇总'))
})

it('keeps polling a leader group until an outstanding delegated result settles', async () => {
  vi.useFakeTimers()
  const readOffice = vi.fn().mockResolvedValueOnce({ office, messages: [leaderRequest, {
    ...delegatedRequest, status: 'running', output: undefined,
  }] }).mockResolvedValue({ office, messages: [leaderRequest, delegatedRequest] })
  const props: Partial<ComponentProps<typeof OfficeConversation>> = {
    renderFactorySlot: (_name, _input, options) => options?.fallback,
    node: { kind: 'command', seq: 1, time: 1, commandId: CommandId('command'), name: 'team-office-send',
      args: JSON.stringify({ id: leaderRequest.id }), outcome: { kind: 'success' } },
    sessionId: SessionId('office-session'), t: key => copy[key] ?? key, readOffice,
  }
  await act(async () => { render(<OfficeConversation {...props as ComponentProps<typeof OfficeConversation>} />) })
  expect(screen.queryByText('研究员核查结果')).toBeNull()
  await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
  expect(screen.getByText('研究员核查结果')).toBeTruthy()
  await act(async () => { await vi.advanceTimersByTimeAsync(4500) })
  expect(readOffice).toHaveBeenCalledTimes(2)
})

it('allows an existing member to select an expert while retaining its membership name and identity', () => {
  const member = office.members[0]!
  const change = vi.fn()
  render(<OfficeEditor draft={{ name: office.name, description: '', members: [member] }} change={change}
    presets={[{ id: 'expert-v2', name: 'Reviewer v2', expertName: 'New expert', expertRole: 'Evidence review', expertPrompt: 'Check evidence' }]}
    editing busy={false} failed={false} save={vi.fn()} close={vi.fn()} t={key => copy[key] ?? key} />)
  fireEvent.click(screen.getByRole('button', { name: /研究员/ }))
  const selection = screen.getByRole('button', { name: '选用专家' })
  expect(selection).toHaveProperty('disabled', false)
  fireEvent.click(selection)
  fireEvent.click(screen.getByRole('menuitem', { name: 'Reviewer v2' }))
  expect(change).toHaveBeenCalledWith({ name: office.name, description: '', members: [{
    ...member, agentPreset: 'expert-v2', role: 'Evidence review', instruction: 'Evidence review',
  }] })
})
