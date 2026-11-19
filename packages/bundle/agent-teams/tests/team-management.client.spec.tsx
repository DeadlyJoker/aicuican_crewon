// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { OfficePage } from '../src/client/OfficePage.tsx'
import { WorkflowPage } from '../src/client/WorkflowPage.tsx'
import { zh as officeCopy } from '../src/client/office-copy.ts'
import { zh as workflowCopy } from '../src/client/workflow-copy.ts'
import { zh as sidebarCopy } from '../src/client/team-details-copy.ts'
import type { Office, OfficeId, OfficeMemberId } from '../src/office-types.ts'
import type { OfficeProjectId, OfficeTopicId } from '../src/office-project-types.ts'
import type { WorkflowDraft, WorkflowLibrary } from '../src/workflow-types.ts'
import type { TeamManagementTarget } from '../src/client/team-management.ts'

vi.mock('../src/client/WorkflowEditor.tsx', () => ({
  WorkflowEditor: ({ draft, change, close }: {
    draft: WorkflowDraft
    change: (value: WorkflowDraft) => void
    close: () => void
  }) =>
    <section aria-label="流程编辑器"><input aria-label="工作流名称" value={draft.name}
      onChange={(event) => { change({ ...draft, name: event.target.value }) }} />
    <button onClick={close}>关闭编辑器</button></section>,
}))

const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})
const offices: Office[] = [{ id: 'office-a' as OfficeId, name: '旧办公室', description: '',
  sessionId: SessionId('lobby-a'), members: [] },
{ id: 'office-b' as OfficeId, name: '目标办公室', description: '', sessionId: SessionId('lobby-b'), members: [
  { id: 'member-a' as OfficeMemberId, name: '研究员', role: '研究', instruction: '研究' },
  { id: 'member-b' as OfficeMemberId, name: '统筹员', role: '统筹', instruction: '统筹' },
] }]
const projectId = 'target-project' as OfficeProjectId
const officeLabels: Record<string, string> = officeCopy
const workflowLabels: Record<string, string> = workflowCopy

function navigation(initial?: TeamManagementTarget) {
  const state = createSnapshotStore<TeamManagementTarget | undefined>(initial)
  const consumeManagement = vi.fn((target: TeamManagementTarget) => {
    if (state.getSnapshot() === target) state.set(undefined)
  })
  const face: Pick<ComponentProps<typeof OfficePage>, 'useManagement' | 'consumeManagement'> = {
    useManagement: select => select(state.getSnapshot()), consumeManagement,
  }
  return { state, face, consumeManagement }
}

function officeProps(nav: ReturnType<typeof navigation>): ComponentProps<typeof OfficePage> {
  const props: Partial<ComponentProps<typeof OfficePage>> = {
    useCatalogue: select => select(0),
    navigation: { title: '团队', labels: { specialists: '专家', experts: '专家团', offices: '办公室', workflows: '工作流' }, mode: 'offices', selectMode: vi.fn() },
    ...nav.face, t: key => officeLabels[key] ?? key, list: async () => offices, presets: async () => [],
    save: vi.fn(), update: vi.fn(), open: vi.fn(),
    useWorkspaces: select => select({ items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null }),
    projectActions: {
      overview: async id => ({ officeId: id, unread: 0, inbox: [], projects: [
        { id: 'first-project' as OfficeProjectId, name: '首个项目', description: '', topics: [] },
        { id: projectId, name: '目标项目', description: '', topics: [{ id: 'target-topic' as OfficeTopicId,
          title: '目标话题', revision: 1 }] },
      ] }),
      createProject: vi.fn(), startTopic: vi.fn(), topic: vi.fn(), reply: vi.fn(), send: vi.fn(), openTopic: vi.fn(),
    },
  }
  return props as ComponentProps<typeof OfficePage>
}

const library: WorkflowLibrary = {
  definitions: ['校对流程', '发布流程'].map((name, index) => ({ id: `flow-${index}`, name, description: '',
    draft: '', review: '', secondReview: '', delivery: '', steps: [{ id: 'step', name: '处理', instruction: name,
      stage: 'prepare', dependsOn: [], kind: 'agent', agentPreset: 'standard' }] })),
  runs: [{ sessionId: SessionId('run-a'), workflowId: 'flow-0', name: '校对流程', input: '校对历史输入', createdAt: 1, status: 'delivered' },
    { sessionId: SessionId('run-b'), workflowId: 'flow-1', name: '发布流程', input: '发布历史输入', createdAt: 2, status: 'delivered' }],
}
function workflowProps(nav: ReturnType<typeof navigation>): ComponentProps<typeof WorkflowPage> {
  const props: Partial<ComponentProps<typeof WorkflowPage>> = {
    useCatalogue: select => select(0),
    navigation: { title: '团队', labels: { specialists: '专家', experts: '专家团', offices: '办公室', workflows: '工作流' }, mode: 'workflows', selectMode: vi.fn() },
    ...nav.face, t: key => workflowLabels[key] ?? key, list: async () => library, presets: async () => [],
    save: vi.fn(), run: vi.fn(), open: vi.fn(),
    useWorkspaces: select => select({ items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null }),
  }
  return props as ComponentProps<typeof WorkflowPage>
}

it('uses the sidebar settings labels and gear actions on office and workflow cards', async () => {
  await act(async () => { render(<OfficePage {...officeProps(navigation())} />) })
  for (const button of screen.getAllByRole('button', { name: sidebarCopy.setLeader })) {
    expect(button.querySelector('[data-icon="dsw-icon-settings-outline-regular"]')).toBeTruthy()
  }
  cleanup()
  await act(async () => { render(<WorkflowPage {...workflowProps(navigation())} />) })
  for (const button of screen.getAllByRole('button', { name: sidebarCopy.editWorkflow })) {
    expect(button.querySelector('[data-icon="dsw-icon-settings-outline-regular"]')).toBeTruthy()
  }
})

it('places the current category creation beside the Teams title without repeating category headings', async () => {
  const office = officeProps(navigation())
  await act(async () => { render(<OfficePage {...office} />) })
  const officeCreate = screen.getByRole('button', { name: officeCopy.create })
  expect(officeCreate.parentElement).toBe(screen.getByRole('heading', { name: '团队', level: 1 }).parentElement)
  expect(screen.queryByRole('heading', { name: officeCopy.title })).toBeNull()
  expect(officeCreate.hasAttribute('data-team-create')).toBe(true)
  expect(officeCreate.closest('[data-team-mode-header]')).toBeTruthy()
  expect(officeCreate.querySelector('[data-icon="dsw-icon-plus-outline-regular"]')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /^工作流$/ }))
  expect(office.navigation.selectMode).toHaveBeenCalledWith('workflows')
  const creationClasses = officeCreate.className
  fireEvent.click(officeCreate)
  expect(screen.getByRole('dialog', { name: officeCopy.create })).toBeTruthy()
  cleanup()

  const workflow = workflowProps(navigation())
  await act(async () => { render(<WorkflowPage {...workflow} />) })
  const workflowCreate = screen.getByRole('button', { name: workflowCopy.create })
  expect(workflowCreate.parentElement).toBe(screen.getByRole('heading', { name: '团队', level: 1 }).parentElement)
  expect(screen.queryByRole('heading', { name: workflowCopy.title })).toBeNull()
  expect(workflowCreate.hasAttribute('data-team-create')).toBe(true)
  expect(workflowCreate.closest('[data-team-mode-header]')).toBeTruthy()
  expect(workflowCreate.querySelector('[data-icon="dsw-icon-plus-outline-regular"]')).toBeTruthy()
  expect(workflowCreate.className).toBe(creationClasses)
  fireEvent.click(screen.getByRole('button', { name: /^办公室$/ }))
  expect(workflow.navigation.selectMode).toHaveBeenCalledWith('offices')
  fireEvent.click(workflowCreate)
  expect(screen.getByRole('region', { name: '流程编辑器' })).toBeTruthy()
})

it('waits for office loading and opens the requested project inside the requested office', async () => {
  const nav = navigation({ kind: 'office', officeId: offices[1]!.id, view: 'projects', projectId })
  const props = officeProps(nav)
  let finish!: (value: Office[]) => void
  props.list = () => new Promise((resolve) => { finish = resolve })
  await act(async () => { render(<OfficePage {...props} />) })
  expect(nav.consumeManagement).not.toHaveBeenCalled()
  await act(async () => { finish(offices) })
  expect(screen.getByRole('heading', { name: '目标办公室' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: '目标项目' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '目标话题' })).toBeTruthy()
  expect(nav.consumeManagement).toHaveBeenCalledTimes(1)
})

it('reopens the same office settings without replacing an unsaved office configuration', async () => {
  const target: TeamManagementTarget = { kind: 'office', officeId: offices[1]!.id, view: 'settings' }
  const nav = navigation(target)
  const props = officeProps(nav)
  const view = await act(async () => render(<OfficePage {...props} />))
  fireEvent.change(screen.getByRole('combobox', { name: '组长' }), { target: { value: '1' } })
  nav.state.set({ ...target })
  await act(async () => { view.rerender(<OfficePage {...props} />) })
  expect(screen.getByRole('combobox', { name: '组长' })).toHaveProperty('value', '1')
  expect(screen.queryByRole('dialog', { name: '当前修改尚未保存' })).toBeNull()
  nav.state.set({ kind: 'office', officeId: offices[1]!.id, view: 'projects', projectId })
  await act(async () => { view.rerender(<OfficePage {...props} />) })
  fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
  expect(screen.getByRole('combobox', { name: '组长' })).toHaveProperty('value', '1')
  nav.state.set({ kind: 'office', officeId: offices[1]!.id, view: 'projects', projectId })
  await act(async () => { view.rerender(<OfficePage {...props} />) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '放弃修改并打开' })) })
  expect(screen.getByRole('heading', { name: '目标项目' })).toBeTruthy()
})

it('reports a missing office and a missing scoped project instead of selecting a different item', async () => {
  const nav = navigation({ kind: 'office', officeId: 'missing' as OfficeId, view: 'projects' })
  const props = officeProps(nav)
  const view = await act(async () => render(<OfficePage {...props} />))
  expect(screen.getByRole('alert').textContent).toBe('这个办公室已不可用')
  nav.state.set({ kind: 'office', officeId: offices[1]!.id, view: 'projects', projectId: 'missing' as OfficeProjectId })
  await act(async () => { view.rerender(<OfficePage {...props} />) })
  expect(screen.getByRole('alert').textContent).toBe('这个项目已不可用')
  expect(screen.queryByRole('heading', { name: '首个项目' })).toBeNull()
})

it('preserves an unfinished topic when another office destination is requested', async () => {
  const nav = navigation({ kind: 'office', officeId: offices[1]!.id, view: 'projects', projectId })
  const props = officeProps(nav)
  const view = await act(async () => render(<OfficePage {...props} />))
  fireEvent.click(screen.getByRole('button', { name: '新建话题' }))
  fireEvent.change(screen.getByRole('textbox', { name: '标题' }), { target: { value: '未提交话题' } })
  nav.state.set({ kind: 'office', officeId: offices[0]!.id, view: 'settings' })
  await act(async () => { view.rerender(<OfficePage {...props} />) })
  expect(screen.getByRole('dialog', { name: '当前修改尚未保存' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
  expect(screen.getByRole('textbox', { name: '标题' })).toHaveProperty('value', '未提交话题')
})

it('opens the exact workflow editor after asynchronous library loading', async () => {
  const nav = navigation({ kind: 'workflow', workflowId: 'flow-1', view: 'edit' })
  const props = workflowProps(nav)
  let finish!: (value: WorkflowLibrary) => void
  props.list = () => new Promise((resolve) => { finish = resolve })
  await act(async () => { render(<WorkflowPage {...props} />) })
  expect(screen.queryByRole('textbox', { name: '工作流名称' })).toBeNull()
  await act(async () => { finish(library) })
  expect(screen.getByRole('textbox', { name: '工作流名称' })).toHaveProperty('value', '发布流程')
  expect(nav.consumeManagement).toHaveBeenCalledTimes(1)
})

it('preserves an unsaved workflow on repeated navigation and requires a choice before replacing it', async () => {
  const nav = navigation({ kind: 'workflow', workflowId: 'flow-1', view: 'edit' })
  const props = workflowProps(nav)
  const view = await act(async () => render(<WorkflowPage {...props} />))
  fireEvent.change(screen.getByRole('textbox', { name: '工作流名称' }), { target: { value: '本地草稿' } })
  nav.state.set({ kind: 'workflow', workflowId: 'flow-1', view: 'edit' })
  await act(async () => { view.rerender(<WorkflowPage {...props} />) })
  expect(screen.getByRole('textbox', { name: '工作流名称' })).toHaveProperty('value', '本地草稿')
  nav.state.set({ kind: 'workflow', workflowId: 'flow-0', view: 'edit' })
  await act(async () => { view.rerender(<WorkflowPage {...props} />) })
  fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
  expect(screen.getByRole('textbox', { name: '工作流名称' })).toHaveProperty('value', '本地草稿')
  nav.state.set({ kind: 'workflow', workflowId: 'flow-0', view: 'edit' })
  await act(async () => { view.rerender(<WorkflowPage {...props} />) })
  fireEvent.click(screen.getByRole('button', { name: '放弃修改并打开' }))
  expect(screen.getByRole('textbox', { name: '工作流名称' })).toHaveProperty('value', '校对流程')
})

it('expands and focuses only the requested workflow history', async () => {
  const scroll = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll })
  const nav = navigation({ kind: 'workflow', workflowId: 'flow-1', view: 'history' })
  await act(async () => { render(<WorkflowPage {...workflowProps(nav)} />) })
  const region = screen.getByRole('region', { name: '发布流程 · 运行历史' })
  expect(within(region).getByText('发布历史输入')).toBeTruthy()
  expect(screen.queryByText('校对历史输入')).toBeNull()
  expect(document.activeElement).toBe(region)
  expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
})

it('reports a deleted workflow without opening a replacement editor', async () => {
  const nav = navigation({ kind: 'workflow', workflowId: 'missing', view: 'edit' })
  await act(async () => { render(<WorkflowPage {...workflowProps(nav)} />) })
  expect(screen.getByRole('alert').textContent).toBe('这个工作流已不可用')
  expect(screen.queryByRole('textbox', { name: '工作流名称' })).toBeNull()
  expect(nav.consumeManagement).toHaveBeenCalledTimes(1)
})


it('refreshes office settings from another client while preserving the local editor draft', async () => {
  let revision = 0
  const props = officeProps(navigation())
  props.useCatalogue = select => select(revision)
  props.list = vi.fn().mockResolvedValue(offices)
  const view = await act(async () => render(<OfficePage {...props} />))
  fireEvent.click(screen.getAllByRole('button', { name: '办公室设置' })[1]!)
  fireEvent.change(screen.getByRole('textbox', { name: '办公室名称' }), { target: { value: '未保存的办公室名称' } })
  vi.mocked(props.list).mockResolvedValue([{ ...offices[1]!, name: '另一端修改后的办公室' }])
  revision++
  await act(async () => { view.rerender(<OfficePage {...props} />) })
  expect(screen.getByRole('textbox', { name: '办公室名称' })).toHaveProperty('value', '未保存的办公室名称')
  expect(screen.getByRole('heading', { name: '另一端修改后的办公室' })).toBeTruthy()
  expect(props.list).toHaveBeenCalledTimes(2)
})

it('refreshes workflow history from another client while preserving the local workflow draft', async () => {
  let revision = 0
  const props = workflowProps(navigation({ kind: 'workflow', workflowId: 'flow-1', view: 'edit' }))
  props.useCatalogue = select => select(revision)
  props.list = vi.fn().mockResolvedValue(library)
  const view = await act(async () => render(<WorkflowPage {...props} />))
  fireEvent.change(screen.getByRole('textbox', { name: '工作流名称' }), { target: { value: '未保存的工作流名称' } })
  vi.mocked(props.list).mockResolvedValue({ ...library,
    definitions: library.definitions.map(item => item.id === 'flow-0' ? { ...item, name: '另一端修改后的流程' } : item) })
  revision++
  await act(async () => { view.rerender(<WorkflowPage {...props} />) })
  expect(screen.getByRole('textbox', { name: '工作流名称' })).toHaveProperty('value', '未保存的工作流名称')
  expect(screen.getByRole('heading', { name: '另一端修改后的流程' })).toBeTruthy()
  expect(props.list).toHaveBeenCalledTimes(2)
})
