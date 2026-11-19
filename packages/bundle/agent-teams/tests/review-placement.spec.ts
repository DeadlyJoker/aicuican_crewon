// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { Input, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

interface RuntimePlanExpertOwner {
  value: string
  disabled: boolean
  onSelect: (selection: {
    agentPreset: string
    name?: string
    role?: string
    executionPrompt?: string
    provider?: string
    model?: string
  }) => void
  onPendingChange: (pending: boolean) => void
}

interface Task { id: string; subject: string; dependencies: string[] }
interface Team {
  teamId: string
  captainSessionId: string
  name: string
  phase: string
  planReviewState: string
  members: { id: string; name: string; role: string; provider?: string; model?: string; executionPrompt?: string; agentPreset?: string }[]
  tasks: Task[]
}
interface TailProps {
  sessionId: string
  turn: { turn: number; status: string }
  useChat: (select: (snapshot: { nodes: Map<string, never>; timeline: { turnOrder: number[] } }) => unknown) => unknown
  t: (key: string) => string
  profileForm?: {
    getSnapshot: () => { status: string; writable: boolean; revision: number; value: { profiles: Record<string, unknown> } }
    mutate: (operations: unknown[], revision: number) => Promise<boolean>
  }
  modelDirectories: { directoryFor: () => { load: () => Promise<void> } }
}
interface TestModule {
  apply: (ctx: object) => void
  publish: (update: { teams: Team[] }) => void
  dictionary: Record<string, string>
  Dependencies: React.ComponentType<{
    team: Team
    task: Task
    value: string
    onChange: (value: string) => void
    t: (key: string) => string
  }>
  AddMember: React.ComponentType<{
    team: Team
    onPendingChange: (key: string, value: boolean) => void
    t: (key: string) => string
    renderExpertPicker?: (owner: RuntimePlanExpertOwner) => React.ReactNode
  }>
  MemberEditor: React.ComponentType<{
    team: Team
    member: Team['members'][number]
    modelDirectory: object
    onPendingChange: (key: string, value: boolean) => void
    t: (key: string) => string
    renderExpertPicker?: (owner: RuntimePlanExpertOwner) => React.ReactNode
  }>
}

function loadTail(fetch = vi.fn().mockResolvedValue({ ok: true })) {
  let factory!: (require: (id: string) => object) => TestModule
  let Tail!: React.ComponentType<TailProps>
  const source = readFileSync('packages/bundle/agent-teams/node_modules/@nanmicoder/dsh-agent-teams/lib/client.js', 'utf8')
    .replace('return module.exports;', 'return { ...module.exports, publish: updateActivitySnapshots, dictionary: zh, Dependencies: PlanDependencies, AddMember: NewPlanMember, MemberEditor: StagedMemberEditor };')
  runInNewContext(source, {
    window: { setTimeout, clearTimeout, __ModuleLoader__: { load: (entry: { factory: typeof factory }) => { factory = entry.factory } } },
    document, fetch,
  })
  const module = factory(id => id === 'react' ? React : id === 'react/jsx-runtime' ? jsxRuntime : { Input, Menu })
  const dispose = () => undefined
  const ctx = {
    locale: { register: dispose, bind: () => (key: string) => key },
    effect: dispose,
    sessions: {}, layout: {}, modelDirectories: {},
    get: dispose,
    sidebarRight: {}, sidebarRightTabs: { register: dispose },
    inject: (_names: string[], setup: (value: object) => void) => { setup(ctx) },
    slots: {
      inject: (_name: string, setup: () => void) => { setup() },
      register: (options: { name: string }, component: React.ComponentType<TailProps>) => {
        if (options.name === 'conversation.chat.turnTail') Tail = component
        return dispose
      },
    },
    uiConversation: { events: { register: dispose } },
  }
  module.apply(ctx)
  return {
    Tail, Dependencies: module.Dependencies, AddMember: module.AddMember, MemberEditor: module.MemberEditor, publish: module.publish,
    t: (key: string, params: Record<string, string | number> = {}) =>
      (module.dictionary[key] ?? key).replace(/\{(\w+)\}/g, (match: string, token: string) => String(params[token] ?? match)),
  }
}

afterEach(cleanup)

it('keeps a staged plan only below the latest settled reply through updates and remounts', () => {
  const { Tail, publish, t } = loadTail()
  const team: Team = { teamId: 'team', captainSessionId: 'session', name: 'Review', phase: 'staged',
    planReviewState: 'awaiting_review', members: [], tasks: [] }
  publish({ teams: [team] })
  let turnOrder = [1, 2]
  let status = 'closed'
  const props = {
    sessionId: 'session', t,
    useChat: (select: Parameters<TailProps['useChat']>[0]) => select({ nodes: new Map<string, never>(), timeline: { turnOrder } }),
    modelDirectories: { directoryFor: () => ({ load: vi.fn().mockResolvedValue(undefined) }) },
  }
  function Replies() {
    return React.createElement(React.Fragment, null, ...turnOrder.map(turn =>
      React.createElement('div', { key: turn, 'data-reply': turn },
        React.createElement(Tail, { ...props, turn: { turn, status } }))))
  }
  const view = render(React.createElement(Replies))
  const owner = () => view.container.querySelector('[data-staging-editor]')?.closest('[data-reply]')?.getAttribute('data-reply')
  expect(owner()).toBe('2')
  expect(view.container.querySelectorAll('[data-staging-editor]')).toHaveLength(1)
  expect(view.container.querySelector('[aria-label="plan.flow.aria"]')).toBeNull()
  expect(view.container.querySelector('img')).toBeNull()
  expect(Array.from(view.container.querySelectorAll('[data-staging-editor] button')).map(button => button.textContent))
    .toMatchInlineSnapshot(`
      [
        "团队成员0 名成员",
        "新增成员",
        "任务与依赖0 项任务 · 0 条依赖",
        "添加任务",
        "确认启动",
        "修改计划",
        "放弃计划",
      ]
    `)
  status = 'open'
  view.rerender(React.createElement(Replies))
  expect(owner()).toBeUndefined()
  status = 'closed'
  turnOrder = [1, 2, 3]
  view.rerender(React.createElement(Replies))
  expect(owner()).toBe('3')
  act(() => { publish({ teams: [{ ...team, planReviewState: 'awaiting_feedback' }] }) })
  expect(owner()).toBe('3')
  view.unmount()
  const reopened = render(React.createElement(Replies))
  expect(reopened.container.querySelectorAll('[data-staging-editor]')).toHaveLength(1)
  act(() => { publish({ teams: [{ ...team, phase: 'running' }] }) })
  expect(reopened.container.querySelector('[data-staging-editor]')).toBeNull()
  act(() => { publish({ teams: [] }) })
  expect(reopened.container.querySelector('[data-staging-editor]')).toBeNull()
  act(() => { publish({ teams: [{ ...team, teamId: 'new-plan' }] }) })
  expect(reopened.container.querySelectorAll('[data-staging-editor]')).toHaveLength(1)
})

it('does not place another session’s pending plan in the current reply', () => {
  const { Tail, publish, t } = loadTail()
  publish({ teams: [{ teamId: 'team', captainSessionId: 'other', name: 'Other', phase: 'staged',
    planReviewState: 'awaiting_review', members: [], tasks: [] }] })
  const view = render(React.createElement(Tail, {
    sessionId: 'session', turn: { turn: 1, status: 'closed' }, t,
    useChat: select => select({ nodes: new Map<string, never>(), timeline: { turnOrder: [1] } }),
    modelDirectories: { directoryFor: () => ({ load: vi.fn().mockResolvedValue(undefined) }) },
  }))
  expect(view.container.querySelector('[data-staging-editor]')).toBeNull()
})


it('offers actual prerequisite IDs and excludes the current task and its dependents', () => {
  const { Dependencies, t } = loadTail()
  const task = { id: 't1', subject: 'First', dependencies: [] }
  const team: Team = { teamId: 'team', captainSessionId: 'session', name: 'Review', phase: 'staged', planReviewState: 'awaiting_review', members: [],
    tasks: [task, { id: 't2', subject: 'Second', dependencies: ['t1'] }, { id: 't3', subject: 'Third', dependencies: [] }] }
  const onChange = vi.fn()
  render(React.createElement(Dependencies, { team, task, value: '', onChange, t }))
  fireEvent.click(screen.getByRole('button', { name: '已选 0 项' }))
  expect(screen.queryByRole('menuitem', { name: /First|Second/ })).toBeNull()
  fireEvent.click(screen.getByRole('menuitem', { name: /t3 · Third/ }))
  expect(screen.getByRole('menu')).toBeTruthy()
  expect(onChange).toHaveBeenCalledWith('t3')
})

it('adds a planned member with explicit responsibilities and protects approval while editing', async () => {
  const request = vi.fn<(url: string, init: { body: string }) => Promise<{ ok: boolean }>>().mockResolvedValue({ ok: true })
  const { AddMember, t } = loadTail(request)
  const onPendingChange = vi.fn()
  const team: Team = { teamId: 'team', captainSessionId: 'session', name: 'Review', phase: 'staged', planReviewState: 'awaiting_review', members: [], tasks: [] }
  render(React.createElement(AddMember, { team, onPendingChange, t }))
  fireEvent.click(screen.getByText('新增成员', { selector:'summary' }))
  fireEvent.change(screen.getByLabelText('成员名称'), { target:{ value:'体验专家' } })
  fireEvent.change(screen.getByLabelText('角色'), { target:{ value:'交互设计' } })
  fireEvent.change(screen.getByLabelText('职责与工作指令'), { target:{ value:'审阅流程并给出建议' } })
  expect(onPendingChange).toHaveBeenLastCalledWith('new-member', true)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name:'新增成员' })) })
  expect(request).toHaveBeenCalledTimes(1)
  expect(JSON.parse(request.mock.calls[0]![1].body)).toEqual({
    sessionId: 'session', teamId: 'team', action: 'add_member', name: '体验专家', role: '交互设计',
    executionPrompt: '审阅流程并给出建议',
  })
  expect(onPendingChange).toHaveBeenLastCalledWith('new-member', false)
})


it.each([true, false])('saves the reusable roster before launch and blocks launch on refusal (%s)', async (accepted) => {
  const request = vi.fn().mockResolvedValue({ ok: true })
  const { Tail, publish, t } = loadTail(request)
  const mutate = vi.fn().mockResolvedValue(accepted)
  publish({ teams: [{ teamId: 'team', captainSessionId: 'session', name: 'Review', phase: 'staged',
    planReviewState: 'awaiting_review', members: [{ id: '', name: 'Reviewer', role: 'Design', executionPrompt: 'Review input' }],
    tasks: [{ id: 't1', subject: 'Review input', dependencies: [] }] }] })
  render(React.createElement(Tail, {
    sessionId: 'session', turn: { turn: 1, status: 'closed' }, t,
    useChat: select => select({ nodes: new Map<string, never>(), timeline: { turnOrder: [1] } }),
    modelDirectories: { directoryFor: () => ({ load: vi.fn().mockResolvedValue(undefined) }) },
    profileForm: { getSnapshot: () => ({ status: 'ready', writable: true, revision: 4, value: { profiles: {} } }), mutate },
  }))
  fireEvent.click(screen.getByLabelText('保留为可复用团队'))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '确认启动' })) })
  expect(mutate).toHaveBeenCalledWith([{ op: 'set', path: ['profiles', 'Review'], value: {
    description: 'Review', taskPlanning: 'captain',
    members: [{ name: 'Reviewer', role: 'Design', executionPrompt: 'Review input' }],
  } }], 4)
  expect(request).toHaveBeenCalledTimes(accepted ? 1 : 0)
  if (accepted) expect(request).toHaveBeenCalledWith('/plugins/dsh-agent-teams/plan', expect.objectContaining({
    body: JSON.stringify({ sessionId: 'session', teamId: 'team', action: 'approve', savedProfileName: 'Review' }),
  }))
  if (!accepted) expect(screen.getByRole('alert').textContent).toContain('团队配置已更新')
})

it('adds an expert preset from the runtime review card and locks submission during activation', async () => {
  const request = vi.fn<(url: string, init: { body: string }) => Promise<{ ok: boolean }>>().mockResolvedValue({ ok: true })
  const { AddMember, t } = loadTail(request)
  const team: Team = { teamId: 'team', captainSessionId: 'session', name: 'Review', phase: 'staged',
    planReviewState: 'awaiting_review', members: [], tasks: [] }
  let owner: RuntimePlanExpertOwner | undefined
  const renderExpertPicker = (value: RuntimePlanExpertOwner) => {
    owner = value
    return React.createElement('button', { type: 'button', onClick: () => { value.onSelect({
      agentPreset: 'expert-proof-v1', name: '证据收集者', role: '核对证据', executionPrompt: '检查事实',
      provider: 'chosen', model: 'chosen-model',
    }) } }, '选用专家')
  }
  render(React.createElement(AddMember, { team, onPendingChange: vi.fn(), renderExpertPicker, t }))
  fireEvent.click(screen.getByText('新增成员', { selector: 'summary' }))
  act(() => { owner?.onPendingChange(true) })
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '新增成员' }).disabled).toBe(true)
  act(() => { owner?.onPendingChange(false) })
  fireEvent.click(screen.getByRole('button', { name: '选用专家' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '新增成员' })) })
  expect(JSON.parse(request.mock.calls[0]![1].body)).toEqual({ sessionId: 'session', teamId: 'team',
    action: 'add_member', name: '证据收集者', role: '核对证据', executionPrompt: '检查事实',
    agentPreset: 'expert-proof-v1', provider: 'chosen', model: 'chosen-model' })
})

it('updates the runtime member preset while retaining its task-specific name and responsibilities', async () => {
  const request = vi.fn<(url: string, init: { body: string }) => Promise<{ ok: boolean }>>().mockResolvedValue({ ok: true })
  const { MemberEditor, t } = loadTail(request)
  const member = { id: '', name: '验收负责人', role: '核对本项目', executionPrompt: '按当前任务验收',
    provider: 'base', model: 'base-model', reasoningEffort: 'high', agentPreset: 'expert-old-v1' }
  const team: Team = { teamId: 'team', captainSessionId: 'session', name: 'Review', phase: 'staged',
    planReviewState: 'awaiting_review', members: [member], tasks: [] }
  const snapshot = { groups: [], failures: [], status: 'ready' }
  const modelDirectory = { load: async () => undefined, store: { subscribe: () => () => undefined, getSnapshot: () => snapshot } }
  const renderExpertPicker = (owner: RuntimePlanExpertOwner) => React.createElement('button', {
    type: 'button', onClick: () => { owner.onSelect({ agentPreset: 'expert-proof-v2', name: '新的专家',
      role: '通用职责', executionPrompt: '通用指令', provider: 'chosen', model: 'chosen-model' }) },
  }, owner.value)
  render(React.createElement(MemberEditor, { team, member, modelDirectory, onPendingChange: vi.fn(), renderExpertPicker, t }))
  fireEvent.click(screen.getByRole('button', { name: /验收负责人/ }))
  fireEvent.click(screen.getByRole('button', { name: 'expert-old-v1' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存' })) })
  expect(JSON.parse(request.mock.calls[0]![1].body)).toEqual({ sessionId: 'session', teamId: 'team',
    action: 'update_member', memberName: '验收负责人', role: '核对本项目', executionPrompt: '按当前任务验收',
    agentPreset: 'expert-proof-v2', provider: 'chosen', model: 'chosen-model', reasoningEffort: '' })
})

it('updates automatically filled expert details while keeping user-written responsibilities', () => {
  const { AddMember, t } = loadTail()
  const team: Team = { teamId: 'team', captainSessionId: 'session', name: 'Review', phase: 'staged',
    planReviewState: 'awaiting_review', members: [], tasks: [] }
  let owner: RuntimePlanExpertOwner | undefined
  render(React.createElement(AddMember, { team, onPendingChange: vi.fn(), t,
    renderExpertPicker: (value) => { owner = value; return null } }))
  fireEvent.click(screen.getByText('新增成员', { selector: 'summary' }))
  act(() => { owner?.onSelect({ agentPreset: 'expert-a-v1', name: '专家 A', role: 'A 通用职责', executionPrompt: 'A 工作要求' }) })
  fireEvent.change(screen.getByLabelText('角色'), { target: { value: '本任务特定职责' } })
  act(() => { owner?.onSelect({ agentPreset: 'expert-b-v1', name: '专家 B', role: 'B 通用职责', executionPrompt: 'B 工作要求' }) })
  expect(screen.getByLabelText<HTMLInputElement>('成员名称').value).toBe('专家 B')
  expect(screen.getByLabelText<HTMLInputElement>('角色').value).toBe('本任务特定职责')
  expect(screen.getByLabelText<HTMLTextAreaElement>('职责与工作指令').value).toBe('B 工作要求')
})
