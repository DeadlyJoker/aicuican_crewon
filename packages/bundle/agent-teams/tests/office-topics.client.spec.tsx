// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { CommandId } from '@deepseek-ai/dsh-commands'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { OfficeProjects, type OfficeProjectActions } from '../src/client/OfficeProjects.tsx'
import { OfficeConversation, OfficeTopicConversation } from '../src/client/OfficePage.tsx'
import { zh } from '../src/client/office-copy.ts'
import type { Office, OfficeDiscussion, OfficeId, OfficeMemberId, OfficeMessageId } from '../src/office-types.ts'
import type { OfficeProjectId, OfficeProjectOverview, OfficeTopic, OfficeTopicId } from '../src/office-project-types.ts'
import type { AgentTeamMessageRef } from '../src/contexera-domain/types.ts'

afterEach(cleanup)
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const office: Office = { id: 'office' as OfficeId, name: '产品办公室', description: '', members: [
  { id: 'reviewer' as OfficeMemberId, name: '审阅员', role: '独立审阅', instruction: '检查方案' },
] }
const projectId = 'project' as OfficeProjectId
const topicId = 'topic' as OfficeTopicId
const translations: Record<string, string> = zh
const t = (key: string) => translations[key] ?? key
const overview: OfficeProjectOverview = { officeId: office.id, unread: 1,
  projects: [{ id: projectId, name: '产品发布', description: '', topics: [{ id: topicId, title: '首轮方案', revision: 1 }] }],
  inbox: [{ topicId, projectName: '产品发布', preview: '等待审阅', unread: 1 }],
}
function actions(): OfficeProjectActions {
  return { overview: vi.fn().mockResolvedValue(overview), createProject: vi.fn().mockResolvedValue(projectId),
    startTopic: vi.fn().mockResolvedValue({ topicId, sourceMessageRef: 'source' as AgentTeamMessageRef }),
    topic: vi.fn(), reply: vi.fn(), send: vi.fn().mockResolvedValue(undefined), openTopic: vi.fn().mockResolvedValue(undefined) }
}

it('opens topics from projects and Inbox without embedding or acknowledging the discussion in management', async () => {
  const api = actions()
  await act(async () => { render(<OfficeProjects office={office} actions={api} onBack={vi.fn()} t={t} />) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '首轮方案' })) })
  expect(api.openTopic).toHaveBeenCalledWith(office, topicId)
  fireEvent.click(screen.getByRole('button', { name: '收件箱 1' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /产品发布.*等待审阅/ })) })
  expect(api.openTopic).toHaveBeenCalledTimes(2)
  expect(api.topic).not.toHaveBeenCalled()
  expect(screen.queryByRole('textbox', { name: '消息' })).toBeNull()
})

it('retains the creation request through a failed member dispatch before opening its topic', async () => {
  const api = actions()
  vi.mocked(api.send).mockRejectedValueOnce(new Error('Temporary dispatch failure'))
  await act(async () => { render(<OfficeProjects office={office} actions={api} onBack={vi.fn()} t={t} />) })
  fireEvent.click(screen.getByRole('button', { name: '新建话题' }))
  fireEvent.change(screen.getByRole('textbox', { name: '标题' }), { target: { value: '第二轮' } })
  fireEvent.change(screen.getByRole('textbox', { name: '消息' }), { target: { value: '检查新方案' } })
  fireEvent.change(screen.getByRole('combobox', { name: '通知成员' }), { target: { value: office.members[0]!.id } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '发布' })) })
  expect(api.openTopic).not.toHaveBeenCalled()
  expect(screen.getByRole('textbox', { name: '消息' })).toHaveProperty('value', '检查新方案')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '发布' })) })
  expect(api.startTopic).toHaveBeenCalledTimes(2)
  expect(vi.mocked(api.startTopic).mock.calls[0]?.[3]).toBe(vi.mocked(api.startTopic).mock.calls[1]?.[3])
  expect(vi.mocked(api.send).mock.calls[0]?.[4]).toBe(vi.mocked(api.send).mock.calls[1]?.[4])
  expect(api.openTopic).toHaveBeenCalledWith(office, topicId)
})

it.each([
  { label: 'configured leader', withLeader: true, publishOnly: false, sends: true },
  { label: 'office without a leader', withLeader: false, publishOnly: false, sends: false },
  { label: 'explicit post-only selection', withLeader: true, publishOnly: true, sends: false },
])('uses the new-topic recipient for $label', async ({ withLeader, publishOnly, sends }) => {
  const api = actions()
  const configuredOffice = { ...office, ...(withLeader ? { leaderId: office.members[0]!.id } : {}) }
  await act(async () => { render(<OfficeProjects office={configuredOffice} actions={api} onBack={vi.fn()} t={t} />) })
  fireEvent.click(screen.getByRole('button', { name: '新建话题' }))
  const recipient = screen.getByRole('combobox', { name: '通知成员' })
  expect(recipient).toHaveProperty('value', withLeader ? office.members[0]!.id : '')
  if (publishOnly) fireEvent.change(recipient, { target: { value: '' } })
  fireEvent.change(screen.getByRole('textbox', { name: '标题' }), { target: { value: '新话题' } })
  fireEvent.change(screen.getByRole('textbox', { name: '消息' }), { target: { value: '请检查方案' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '发布' })) })
  expect(api.send).toHaveBeenCalledTimes(sends ? 1 : 0)
  if (sends) expect(api.send).toHaveBeenCalledWith(configuredOffice, office.members[0]!.id, '请检查方案',
    { topicId, sourceMessageRef: 'source' }, expect.any(String))
  expect(api.openTopic).toHaveBeenCalledWith(configuredOffice, topicId)
})

const discussion: OfficeDiscussion = { office, messages: [], scope: {
  topicId, projectId, projectName: '产品发布', title: '首轮方案', historyThroughSequence: 3,
} }
const command = (name: string, args = '') => ({ kind: 'command' as const, seq: 1, time: 1,
  commandId: CommandId('command'), name, args, outcome: { kind: 'success' as const } })

it('renders every returned ledger message with Markdown member bubbles', async () => {
  const props: Partial<ComponentProps<typeof OfficeTopicConversation>> = {
    renderFactorySlot: (_name, _input, options) => options?.fallback,
    node: command('team-office-topic-open'), sessionId: SessionId('topic-session'), t,
    readOffice: async () => discussion,
    readTopic: async () => ({ id: topicId, title: '首轮方案', revision: 4, deliveries: [], messages: [
      { id: 'old-human', author: 'human', body: '请审阅首轮方案', time: '2026-11-05T00:00:00Z', sequence: 1 },
      { id: 'old-answer', author: '审阅员', body: '**已记录**\n\n- 保留旧结论', time: '2026-11-05T00:01:00Z', sequence: 3 },
      { id: 'new-answer', author: '审阅员', body: '新回复也在话题时间线', time: '2026-11-05T00:02:00Z', sequence: 4 },
    ] }),
  }
  let container!: HTMLElement
  await act(async () => { ({ container } =
    render(<OfficeTopicConversation {...props as ComponentProps<typeof OfficeTopicConversation>} />)) })
  expect(screen.getByText('请审阅首轮方案')).toBeTruthy()
  expect(screen.getByText('已记录').tagName).toBe('STRONG')
  expect(screen.getByText('保留旧结论').tagName).toBe('LI')
  expect(screen.getByText('新回复也在话题时间线')).toBeTruthy()
  expect([...container.querySelectorAll('[data-topic-history]')].map(item => item.textContent)).toMatchInlineSnapshot(`
    [
      "请审阅首轮方案",
      "审阅员已记录
    保留旧结论",
      "审阅员新回复也在话题时间线",
    ]
  `)
})

it('leaves scoped topic messages to the ledger timeline', async () => {
  const messageId = 'answer' as OfficeMessageId
  const props: Partial<ComponentProps<typeof OfficeConversation>> = {
    renderFactorySlot: (_name, _input, options) => options?.fallback,
    node: command('team-office-send', JSON.stringify({ id: messageId })), sessionId: SessionId('topic-session'), t,
    readOffice: async () => ({ ...discussion, messages: [{ id: messageId, memberId: office.members[0]!.id,
      memberName: '审阅员', text: '已在历史中的问题', output: '本轮新回复', status: 'completed', createdAt: 1, sourceMessageSequence: 1 }] }),
  }
  await act(async () => { render(<OfficeConversation {...props as ComponentProps<typeof OfficeConversation>} />) })
  expect(screen.queryByText('已在历史中的问题')).toBeNull()
  expect(screen.queryByText('本轮新回复')).toBeNull()
})

it('keeps the original history position when a topic is reopened', async () => {
  const readOffice = vi.fn()
  const readTopic = vi.fn()
  const props: Partial<ComponentProps<typeof OfficeTopicConversation>> = {
    renderFactorySlot: (_name, _input, options) => options?.fallback,
    node: command('team-office-topic-open', JSON.stringify({ restore: true })),
    sessionId: SessionId('topic-session'), t, readOffice, readTopic,
  }
  let container!: HTMLElement
  await act(async () => { ({ container } =
    render(<OfficeTopicConversation {...props as ComponentProps<typeof OfficeTopicConversation>} />)) })
  expect(container.childElementCount).toBe(0)
  expect(readOffice).not.toHaveBeenCalled()
  expect(readTopic).not.toHaveBeenCalled()
})

it.each([
  { body: '首轮方案\n\n@审阅员\n检查方案', expected: '@审阅员\n检查方案' },
  { body: '首轮方案\n\n', expected: '首轮方案' },
])('removes a repeated opening title only when a message body remains: $expected', async ({ body, expected }) => {
  const props: Partial<ComponentProps<typeof OfficeTopicConversation>> = {
    renderFactorySlot: (_name, _input, options) => options?.fallback,
    node: command('team-office-topic-open'), sessionId: SessionId('topic-session'), t,
    readOffice: async () => discussion,
    readTopic: async () => ({ id: topicId, title: '首轮方案', revision: 2, deliveries: [], messages: [
      { id: 'opening', author: 'human', body, time: '2026-11-05T00:00:00Z', sequence: 1 },
      { id: 'later', author: 'human', body: '首轮方案\n\n后续消息', time: '2026-11-05T00:01:00Z', sequence: 2 },
    ] }),
  }
  let container!: HTMLElement
  await act(async () => { ({ container } =
    render(<OfficeTopicConversation {...props as ComponentProps<typeof OfficeTopicConversation>} />)) })
  const messages = container.querySelectorAll('[data-topic-history]')
  expect(messages[0]?.textContent).toBe(expected)
  expect(messages[1]?.textContent).toContain('首轮方案')
  expect(messages[1]?.textContent).toContain('后续消息')
})

it('retains legacy lobby questions without a topic scope', async () => {
  const messageId = 'answer' as OfficeMessageId
  const props: Partial<ComponentProps<typeof OfficeConversation>> = {
    renderFactorySlot: (_name, _input, options) => options?.fallback,
    node: command('team-office-send', JSON.stringify({ id: messageId })), sessionId: SessionId('lobby'), t,
    readOffice: async () => ({ office, messages: [{ id: messageId, memberId: office.members[0]!.id,
      memberName: '审阅员', text: '大厅问题', output: '大厅回复', status: 'completed', createdAt: 1 }] }),
  }
  await act(async () => { render(<OfficeConversation {...props as ComponentProps<typeof OfficeConversation>} />) })
  expect(screen.getByText('大厅问题')).toBeTruthy()
  expect(screen.getByText('大厅回复')).toBeTruthy()
})

it('shows an accepted delivery only under its original command', async () => {
  const messageId = 'answer' as OfficeMessageId
  const original = command('team-office-send', JSON.stringify({ id: messageId }))
  const readOffice = vi.fn().mockResolvedValue({ office, messages: [{ id: messageId, commandId: original.commandId,
    memberId: office.members[0]!.id, memberName: '审阅员', text: '只显示一次的问题', output: '只显示一次的回复', status: 'completed', createdAt: 1 }] })
  const props: Partial<ComponentProps<typeof OfficeConversation>> = {
    renderFactorySlot: (_name, _input, options) => options?.fallback,
    node: original, sessionId: SessionId('lobby'), t, readOffice,
  }
  await act(async () => {
    render(<><OfficeConversation {...props as ComponentProps<typeof OfficeConversation>} />
      <OfficeConversation {...props as ComponentProps<typeof OfficeConversation>} node={{ ...original,
        commandId: CommandId('repeated-command') }} /></>)
  })
  expect(screen.getAllByText('只显示一次的问题')).toHaveLength(1)
  expect(screen.getAllByText('只显示一次的回复')).toHaveLength(1)
})

it('keeps completed output while polling topic delivery and stops after a stable delivery failure', async () => {
  vi.useFakeTimers()
  const messageId = 'answer' as OfficeMessageId
  const node = command('team-office-send', JSON.stringify({ id: messageId }))
  const message = { id: messageId, commandId: node.commandId, memberId: office.members[0]!.id,
    memberName: '审阅员', text: '审阅请求', output: '**审阅已完成**', status: 'completed' as const, createdAt: 1 }
  const readOffice = vi.fn().mockResolvedValueOnce({ office, messages: [{ ...message, topicDeliveryError: 'delivery_pending' }] })
    .mockResolvedValue({ office, messages: [{ ...message, topicDeliveryError: 'stale_revision' }] })
  const props: Partial<ComponentProps<typeof OfficeConversation>> = {
    renderFactorySlot: (_name, _input, options) => options?.fallback, node, sessionId: SessionId('lobby'), t, readOffice }
  await act(async () => { render(<OfficeConversation {...props as ComponentProps<typeof OfficeConversation>} />) })
  expect(screen.getByText('审阅已完成').tagName).toBe('STRONG')
  expect(screen.getByRole('status').textContent).toBe('正在同步话题')
  await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
  expect(screen.getByText('审阅已完成').tagName).toBe('STRONG')
  expect(screen.getByRole('alert').textContent).toBe('回复已保留，话题已有更新')
  await act(async () => { await vi.advanceTimersByTimeAsync(4500) })
  expect(readOffice).toHaveBeenCalledTimes(2)
})

it('replaces a pending delivery with its ledger reply without repeating the member output', async () => {
  vi.useFakeTimers()
  const initial: OfficeTopic = { id: topicId, title: '首轮方案', revision: 1, messages: [
    { id: 'source', author: 'human', body: '检查方案', time: '2026-11-05T00:00:00Z', sequence: 1 },
  ], deliveries: [{ id: 'delivery' as OfficeMessageId, memberId: office.members[0]!.id, memberName: '审阅员',
    text: '检查方案', output: '**审阅已完成**', status: 'completed', createdAt: 1,
    sourceMessageRef: 'source' as AgentTeamMessageRef, topicDeliveryError: 'delivery_pending' }] }
  const readTopic = vi.fn().mockResolvedValueOnce(initial).mockResolvedValue({ ...initial, revision: 2, deliveries: [],
    messages: [...initial.messages, { id: 'reply', author: '审阅员', body: '**审阅已完成**', time: '2026-11-05T00:01:00Z', sequence: 2 }] })
  const props: Partial<ComponentProps<typeof OfficeTopicConversation>> = {
    renderFactorySlot: (_name, _input, options) => options?.fallback,
    node: command('team-office-topic-open'), sessionId: SessionId('topic-session'), t,
    readOffice: async () => discussion, readTopic, ackTopic: vi.fn().mockResolvedValue(undefined),
  }
  await act(async () => { render(<OfficeTopicConversation {...props as ComponentProps<typeof OfficeTopicConversation>} />) })
  expect(screen.getAllByText('审阅已完成')).toHaveLength(1)
  expect(screen.getByRole('status').textContent).toBe('正在同步话题')
  await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
  expect(screen.getAllByText('审阅已完成')).toHaveLength(1)
  expect(screen.queryByText('正在同步话题')).toBeNull()
  expect(readTopic).toHaveBeenNthCalledWith(1, office.id, topicId)
  expect(readTopic).toHaveBeenCalledTimes(2)
})

it('acknowledges only the displayed snapshot after its end becomes visible in the active document', async () => {
  let intersect: (visible: boolean) => void = () => { throw new Error('Observer is not ready') }
  vi.stubGlobal('IntersectionObserver', class implements IntersectionObserver {
    readonly root = null
    readonly rootMargin = ''
    readonly scrollMargin = ''
    readonly thresholds = [0]
    constructor(callback: IntersectionObserverCallback) {
      intersect = (visible) => {
        const rect = document.body.getBoundingClientRect()
        callback([{ boundingClientRect: rect, intersectionRatio: visible ? 1 : 0, intersectionRect: rect,
          isIntersecting: visible, rootBounds: null, target: document.body, time: 0 }], this)
      }
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] { return [] }
  })
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  const ackTopic = vi.fn().mockResolvedValue(undefined)
  const props: Partial<ComponentProps<typeof OfficeTopicConversation>> = {
    renderFactorySlot: (_name, _input, options) => options?.fallback,
    node: command('team-office-topic-open'), sessionId: SessionId('topic-session'), t,
    readOffice: async () => discussion, ackTopic,
    readTopic: async () => ({ id: topicId, title: '首轮方案', revision: 4, deliveries: [], messages: [
      { id: 'source', author: 'human', body: '检查方案', time: '2026-11-05T00:00:00Z', sequence: 1 },
      { id: 'answer', author: '审阅员', body: '已有回复', time: '2026-11-05T00:01:00Z', sequence: 4 },
    ] }),
  }
  await act(async () => { render(<OfficeTopicConversation {...props as ComponentProps<typeof OfficeTopicConversation>} />) })
  expect(ackTopic).not.toHaveBeenCalled()
  await act(async () => { intersect(true) })
  expect(ackTopic).not.toHaveBeenCalled()
  visibility.mockReturnValue('visible')
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
  expect(ackTopic).toHaveBeenCalledExactlyOnceWith(office.id, topicId, 4)
  await act(async () => { intersect(true); document.dispatchEvent(new Event('visibilitychange')) })
  expect(ackTopic).toHaveBeenCalledTimes(1)
})

it('refreshes the leader identity while the topic remains open', async () => {
  vi.useFakeTimers()
  const readOffice = vi.fn().mockResolvedValueOnce(discussion).mockResolvedValue({
    ...discussion, office: { ...office, leaderId: office.members[0]!.id },
  })
  const props: Partial<ComponentProps<typeof OfficeTopicConversation>> = {
    renderFactorySlot: (_name, _input, options) => options?.fallback,
    node: command('team-office-topic-open'), sessionId: SessionId('topic-session'), t, readOffice,
    ackTopic: vi.fn().mockResolvedValue(undefined),
    readTopic: async () => ({ id: topicId, title: '首轮方案', revision: 2, deliveries: [], messages: [
      { id: 'answer', author: '审阅员', body: '已有回复', time: '2026-11-05T00:01:00Z', sequence: 2 },
    ] }),
  }
  await act(async () => { render(<OfficeTopicConversation {...props as ComponentProps<typeof OfficeTopicConversation>} />) })
  expect(screen.queryByText('组长')).toBeNull()
  await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
  expect(screen.getByText('组长').closest('[data-office-leader]')).not.toBeNull()
  expect(readOffice).toHaveBeenCalledTimes(2)
})
