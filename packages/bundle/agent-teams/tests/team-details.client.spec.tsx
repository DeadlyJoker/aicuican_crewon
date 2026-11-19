// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { TeamDetailsButton, TeamDetailsPanel, type TeamDetailsActions } from '../src/client/TeamDetails.tsx'
import { zh } from '../src/client/team-details-copy.ts'
import { zh as officeCopy } from '../src/client/office-copy.ts'
import { zh as workflowCopy } from '../src/client/workflow-copy.ts'
import type { OfficeId, OfficeMemberId, OfficeMessageId } from '../src/office-types.ts'
import type { OfficeProjectId, OfficeTopicId } from '../src/office-project-types.ts'

const sessionId = SessionId('details-session')
const session: SessionSnapshot = { sessionId, pendingSubmissions: [], running: false, subagent: null,
  removed: false, openState: 'open', openError: null, hasMore: false, loadingOlder: false,
  promptError: null, blank: false, lastAgentError: null, promptAttempted: true, awaitingFirstTurn: false }
const copy: Record<string, string> = zh
const officeLabels: Record<string, string> = officeCopy
const workflowLabels: Record<string, string> = workflowCopy
const actions = (): TeamDetailsActions => ({
  readOffice: vi.fn().mockResolvedValue(null), readWorkflow: vi.fn().mockResolvedValue(null),
  readWorkflowTrace: vi.fn().mockResolvedValue(null), readWorkflowHistory: vi.fn().mockResolvedValue({ runs: [] }), openManagement: vi.fn(),
  workflowEditor: { read: vi.fn().mockResolvedValue(null), presets: vi.fn().mockResolvedValue([]),
    save: vi.fn(), text: key => workflowLabels[key] ?? key },
  officeSettings: { save: vi.fn(), presets: vi.fn().mockResolvedValue([]), text: key => officeLabels[key] ?? key },
})

afterEach(() => { cleanup(); vi.useRealTimers() })

it('shows the matching header action only for a team-owned conversation', async () => {
  const api = actions()
  vi.mocked(api.readOffice).mockResolvedValue({ office: { id: 'office' as OfficeId, name: '产品办公室', description: '', members: [] }, messages: [] })
  const openDetails = vi.fn()
  const props: Partial<ComponentProps<typeof TeamDetailsButton>> = {
    useCatalogue: select => select(0),
    sessionId, useSession: select => select(session), t: key => copy[key] ?? key,
    actions: { ...api, openDetails },
  }
  await act(async () => { render(<TeamDetailsButton {...props as ComponentProps<typeof TeamDetailsButton>} />) })
  fireEvent.click(screen.getByRole('button', { name: '查看办公室' }))
  expect(openDetails).toHaveBeenCalledWith('office')
  expect(screen.queryByRole('button', { name: '查看工作流' })).toBeNull()
})

it('shows the saved run step preset and labels the panel as this run', async () => {
  const api = actions()
  vi.mocked(api.readWorkflow).mockResolvedValue({ workflowId: 'workflow-review', sessionId, name: '历史审核', input: '原始输入', createdAt: 0, status: 'delivered', stepOutputs: { review: '**审核通过**' } })
  vi.mocked(api.readWorkflowTrace).mockResolvedValue({ status: 'delivered', completedSteps: ['review'], nodes: [],
    steps: [{ id: 'review', name: '独立审阅', instruction: 'Review', stage: 'prepare', dependsOn: [], kind: 'agent', agentPreset: 'ptc' }] })
  const props: Partial<ComponentProps<typeof TeamDetailsPanel>> = {
    useCatalogue: select => select(0),
    sessionId, useSession: select => select(session), t: key => copy[key] ?? key, actions: api, mode: 'workflow',
    // Other sidebar navigation fields are outside this read-only panel's consumed face.
    useTabInfo: () => ({ tab: { visible: true } } as SidebarRightTabInfo),
  }
  await act(async () => { render(<TeamDetailsPanel {...props as ComponentProps<typeof TeamDetailsPanel>} />) })
  expect(screen.getByText('本次运行')).toBeTruthy()
  expect(screen.getByText('已交付')).toBeTruthy()
  expect(screen.getByText('独立审阅')).toBeTruthy()
  expect(screen.getByText('ptc')).toBeTruthy()
  expect(screen.queryByText('standard')).toBeNull()
  expect(screen.getByText('原始输入')).toBeTruthy()
  expect(screen.getByRole('progressbar').getAttribute('value')).toBe('1')
  expect(screen.getByText('审核通过')).toBeTruthy()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '工作流设置' })) })
  expect(api.workflowEditor.read).toHaveBeenCalledWith('workflow-review')
  expect(screen.getByRole('dialog', { name: '编辑工作流' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '此工作流的运行历史' })) })
  expect(api.readWorkflowHistory).toHaveBeenCalledWith('workflow-review', undefined)
  expect(api.openManagement).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: '运行历史' })).toBeTruthy()
  expect(screen.getByRole('progressbar').getAttribute('value')).toBe('1')
  fireEvent.click(screen.getByRole('button', { name: '关闭' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByText('独立审阅')).toBeTruthy()
})

it('shows the current project and topic in office details', async () => {
  const api = actions()
  vi.mocked(api.readOffice).mockResolvedValue({
    office: { id: 'office' as OfficeId, name: '产品办公室', description: '', members: [] }, messages: [],
    scope: { projectId: 'project' as OfficeProjectId, topicId: 'topic' as OfficeTopicId,
      projectName: '发布准备', title: '检查上线文案', historyThroughSequence: 9 },
  })
  const props: Partial<ComponentProps<typeof TeamDetailsPanel>> = {
    useCatalogue: select => select(0),
    sessionId, useSession: select => select(session), t: key => copy[key] ?? key, actions: api, mode: 'office',
    useTabInfo: () => ({ tab: { visible: true } } as SidebarRightTabInfo),
  }
  await act(async () => { render(<TeamDetailsPanel {...props as ComponentProps<typeof TeamDetailsPanel>} />) })
  expect(screen.getByText('发布准备')).toBeTruthy()
  expect(screen.getByText('检查上线文案')).toBeTruthy()
  expect(screen.queryByText('大厅 · 日常讨论')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '项目与收件箱' }))
  expect(api.openManagement).toHaveBeenCalledWith({ kind: 'office', officeId: 'office', view: 'projects', projectId: 'project' })
})

it('identifies the office leader beside their existing member row', async () => {
  const api = actions()
  const memberId = 'coordinator' as OfficeMemberId
  vi.mocked(api.readOffice).mockResolvedValue({ office: { id: 'office' as OfficeId, name: '产品办公室',
    description: '', leaderId: memberId, members: [{ id: memberId, name: '协调员', role: '项目统筹', instruction: '汇总' }] },
  messages: [] })
  const props: Partial<ComponentProps<typeof TeamDetailsPanel>> = {
    useCatalogue: select => select(0),
    sessionId, useSession: select => select(session), t: key => copy[key] ?? key, actions: api, mode: 'office',
    useTabInfo: () => ({ tab: { visible: true } } as SidebarRightTabInfo),
  }
  await act(async () => { render(<TeamDetailsPanel {...props as ComponentProps<typeof TeamDetailsPanel>} />) })
  const marker = screen.getByText('组长')
  expect(marker.tagName).toBe('SMALL')
  expect(marker.closest('li')?.textContent).toContain('协调员')
  expect(marker.closest('li')?.textContent).toContain('项目统筹')
  expect(screen.getByText('汇总')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '办公室设置' }))
  expect(screen.getByRole('dialog', { name: '办公室设置' })).toBeTruthy()
  expect(screen.getByRole('combobox', { name: '组长' })).toHaveProperty('value', '0')
  expect(api.openManagement).not.toHaveBeenCalled()
})

it('keeps a rejected approval and its unexecuted successors distinct', async () => {
  const api = actions()
  vi.mocked(api.readWorkflow).mockResolvedValue({ sessionId, name: '审核', input: '', createdAt: 0, status: 'rejected' })
  vi.mocked(api.readWorkflowTrace).mockResolvedValue({ status: 'rejected', completedSteps: ['draft'], pendingApprovalId: 'approval', nodes: [], steps: [
    { id: 'draft', name: '起草', instruction: '起草方案', kind: 'agent', stage: 'prepare', dependsOn: [], agentPreset: 'ptc' },
    { id: 'approval', name: '发布审批', instruction: '审核方案', kind: 'approval', stage: 'prepare', dependsOn: ['draft'] },
    { id: 'deliver', name: '交付', instruction: '交付方案', kind: 'agent', stage: 'deliver', dependsOn: ['approval'] },
  ] })
  const props: Partial<ComponentProps<typeof TeamDetailsPanel>> = {
    useCatalogue: select => select(0), sessionId, useSession: select => select(session),
    t: key => copy[key] ?? key, actions: api, mode: 'workflow', useTabInfo: () => ({ tab: { visible: true } } as SidebarRightTabInfo) }
  let container!: HTMLElement
  await act(async () => { container = render(<TeamDetailsPanel {...props as ComponentProps<typeof TeamDetailsPanel>} />).container })
  expect(screen.queryByText('待审批')).toBeNull()
  expect(screen.getByText('未执行')).toBeTruthy()
  expect(screen.getByRole('progressbar').getAttribute('value')).toBe('1')
  expect(screen.getByRole('progressbar').getAttribute('max')).toBe('3')
  expect(screen.queryByRole('button', { name: '工作流设置' })).toBeNull()
  expect([...container.querySelectorAll('summary')].map(row => row.textContent)).toMatchInlineSnapshot(`
    [
      "本次输入",
      "起草ptc已完成",
      "发布审批人工审批已拒绝",
      "交付沿用对话预设未执行",
    ]
  `)
})

it('keeps legacy reviewer results matched by their recorded labels', async () => {
  const api = actions()
  vi.mocked(api.readWorkflow).mockResolvedValue({ sessionId, name: '旧版审核', input: '', createdAt: 0,
    status: 'pending', reviews: ['第一路结果', '第二路结果'] })
  vi.mocked(api.readWorkflowTrace).mockResolvedValue({ status: 'pending', nodes: [
    { id: SessionId('second'), phase: 'Review', label: 'Reviewer 2', state: 'completed', startedAt: 1 },
    { id: SessionId('first'), phase: 'Review', label: 'Reviewer 1', state: 'completed', startedAt: 2 },
  ] })
  const props: Partial<ComponentProps<typeof TeamDetailsPanel>> = {
    useCatalogue: select => select(0), sessionId, useSession: select => select(session),
    t: key => copy[key] ?? key, actions: api, mode: 'workflow', useTabInfo: () => ({ tab: { visible: true } } as SidebarRightTabInfo) }
  await act(async () => { render(<TeamDetailsPanel {...props as ComponentProps<typeof TeamDetailsPanel>} />) })
  expect(screen.getByText('独立审阅 2').closest('details')?.textContent).toContain('第二路结果')
  expect(screen.getByText('独立审阅 1').closest('details')?.textContent).toContain('第一路结果')
  expect(screen.queryByText('无前置步骤')).toBeNull()
  expect(screen.getAllByText('旧版运行未记录')).toHaveLength(2)
  expect(screen.queryByRole('progressbar')).toBeNull()
  expect(screen.getByText('已完成 Agent 执行 2')).toBeTruthy()
})

it('refreshes an idle office when a member starts work without a parent turn', async () => {
  vi.useFakeTimers()
  const api = actions()
  const office = { id: 'office' as OfficeId, name: '办公室', description: '', members: [
    { id: 'member' as OfficeMemberId, name: '研究员', role: '调研', instruction: '研究' },
  ] }
  vi.mocked(api.readOffice).mockResolvedValueOnce({ office, messages: [] }).mockResolvedValue({ office, messages: [
    { id: 'message' as OfficeMessageId, memberId: office.members[0]!.id, memberName: '研究员', text: '核对资料', createdAt: 1, status: 'running' },
  ] })
  const props: Partial<ComponentProps<typeof TeamDetailsPanel>> = {
    useCatalogue: select => select(0), sessionId, useSession: select => select(session),
    t: key => copy[key] ?? key, actions: api, mode: 'office', useTabInfo: () => ({ tab: { visible: true } } as SidebarRightTabInfo) }
  await act(async () => { render(<TeamDetailsPanel {...props as ComponentProps<typeof TeamDetailsPanel>} />) })
  expect(screen.getByText('当前无执行任务')).toBeTruthy()
  await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  expect(screen.getByText('1 项处理中')).toBeTruthy()
  expect(screen.getByText('核对资料')).toBeTruthy()
})

it('hides the previous office immediately when the sidebar changes conversations', async () => {
  const api = actions()
  vi.mocked(api.readOffice).mockResolvedValueOnce({ office: { id: 'old' as OfficeId, name: '旧办公室', description: '', members: [] }, messages: [] })
  const props: Partial<ComponentProps<typeof TeamDetailsPanel>> = {
    useCatalogue: select => select(0), sessionId, useSession: select => select(session),
    t: key => copy[key] ?? key, actions: api, mode: 'office', useTabInfo: () => ({ tab: { visible: true } } as SidebarRightTabInfo) }
  const view = render(<TeamDetailsPanel {...props as ComponentProps<typeof TeamDetailsPanel>} />)
  await act(async () => {})
  expect(screen.getByText('旧办公室')).toBeTruthy()
  vi.mocked(api.readOffice).mockReturnValue(new Promise(() => {}))
  view.rerender(<TeamDetailsPanel {...props as ComponentProps<typeof TeamDetailsPanel>} sessionId={SessionId('next-session')} />)
  expect(screen.queryByText('旧办公室')).toBeNull()
  expect(screen.getByRole('status').getAttribute('aria-label')).toBe('加载中')
})
