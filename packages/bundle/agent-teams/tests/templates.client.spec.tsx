// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { ComponentProps } from 'react'
import { TeamTemplates } from '../src/client/TeamTemplates.tsx'
import { zh } from '../src/client/locales.ts'
import { teamCommand, type TeamSettings } from '../src/client/templates.ts'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'

afterEach(cleanup)
const translations: Record<string, string> = zh

function mount(profiles: TeamSettings['profiles'] = {}, accepted = true, launchTask = vi.fn(), selectMode = vi.fn()) {
  const saveProfiles = vi.fn().mockResolvedValue(accepted)
  const state: ConfigFormSnapshot<TeamSettings> = {
    status: 'ready', value: { profiles, maxMembers: 8 }, base: {}, user: {}, revision: 4, writable: true,
  }
  // This component consumes its own injected hooks; unrelated framework seats are omitted.
  const props: Partial<ComponentProps<typeof TeamTemplates>> = {
    useCatalogue: select => select(0),
    navigation: { title: '团队', labels: { specialists: '专家', experts: '专家团', offices: '办公室', workflows: '工作流' }, mode: 'experts', selectMode },
    t: key => translations[key] ?? key, useTeams: select => select(state), saveProfiles,
    listExperts: vi.fn().mockResolvedValue({ experts: [] }),
    useLaunch: select => select({ pending: false }), launchTask, openCreated: vi.fn(),
    useWorkspaces: select => select({ items: [{ workspaceId: 'workspace-1' as WorkspaceId, title: 'Demo',
      path: '/workspace', sessionIds: [], createdAt: '', updatedAt: '' }], archivedSessionIds: [], pinnedSessionIds: [],
    state: 'idle', phase: 'ready', error: null }),
  }
  render(<TeamTemplates {...props as ComponentProps<typeof TeamTemplates>} />)
  return saveProfiles
}

it('places expert team creation beside the page title and switches categories through the shared navigation', () => {
  const selectMode = vi.fn()
  mount({}, true, vi.fn(), selectMode)
  const create = screen.getByRole('button', { name: zh.create })
  const title = screen.getByRole('heading', { name: '团队', level: 1 })
  expect(create.parentElement).toBe(title.parentElement)
  expect(screen.queryByRole('heading', { name: zh.title })).toBeNull()
  expect(create.hasAttribute('data-team-create')).toBe(true)
  expect(create.closest('[data-team-mode-header]')).toBeTruthy()
  expect(create.querySelector('[data-icon="dsw-icon-plus-outline-regular"]')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /^办公室$/ }))
  expect(selectMode).toHaveBeenCalledWith('offices')
  fireEvent.click(create)
  expect(screen.getByLabelText('团队名称')).toBeTruthy()
})

it('saves a reusable specialist definition with the revision read before editing', async () => {
  const save = mount()
  fireEvent.click(screen.getByText('新建专家团'))
  fireEvent.change(screen.getByLabelText('团队名称'), { target: { value: '产品专家团' } })
  fireEvent.change(screen.getByLabelText('专业方向与适用问题'), { target: { value: '审阅产品交互方案' } })
  fireEvent.change(screen.getByLabelText('成员名称'), { target: { value: '体验专家' } })
  fireEvent.change(screen.getByLabelText('专业角色'), { target: { value: '交互设计师' } })
  fireEvent.change(screen.getByLabelText('职责与工作指令'), { target: { value: '检查关键操作路径，给出具体改进与验收标准' } })
  await act(async () => { fireEvent.click(screen.getByText('保存团队')) })
  expect(save).toHaveBeenCalledWith([{ op: 'set', path: ['profiles'], value: {
    产品专家团: { description: '审阅产品交互方案', taskPlanning: 'captain', members: [
      { name: '体验专家', role: '交互设计师', executionPrompt: '检查关键操作路径，给出具体改进与验收标准' },
    ] },
  } }], 4)
})

it('retains the draft on a conflicting save and rejects incomplete roles before sending', async () => {
  const save = mount({}, false)
  fireEvent.click(screen.getByText('新建专家团'))
  await act(async () => { fireEvent.click(screen.getByText('保存团队')) })
  expect(save).not.toHaveBeenCalled()
  expect(screen.getByRole('alert').textContent).toContain('请填写团队名称')
  for (const [label, value] of [['团队名称', '测试团队'], ['专业方向与适用问题', '产品'], ['成员名称', '专家'], ['专业角色', '设计师'], ['职责与工作指令', '审阅方案']]) {
    fireEvent.change(screen.getByLabelText(label!), { target: { value } })
  }
  await act(async () => { fireEvent.click(screen.getByText('保存团队')) })
  expect(screen.getByRole('alert').textContent).toContain('草稿已保留')
  expect(screen.getByLabelText<HTMLInputElement>('团队名称').value).toBe('测试团队')
})

it('requires a deletion confirmation and retains unrelated profiles', async () => {
  const profile = { description: '产品', members: [{ name: '专家', role: '设计师', executionPrompt: '审阅方案' }] }
  const save = mount({ 产品团队: profile, 保留团队: profile })
  fireEvent.click(screen.getAllByRole('button', { name: '删除团队' })[0]!)
  expect(save).not.toHaveBeenCalled()
  await act(async () => { fireEvent.click(screen.getByText('确认删除')) })
  expect(save).toHaveBeenCalledWith([{ op: 'set', path: ['profiles'], value: { 保留团队: profile } }], 4)
})

it('keeps the selected profile separate from each concrete task', () => {
  expect(teamCommand('产品 专家团', '  审阅登录页  ')).toBe('/agent-teams --profile "产品 专家团" 审阅登录页')
})

it('launches the selected team and problem directly from its form', async () => {
  const launch = vi.fn()
  mount({ 产品专家团: { description: '产品评审', members: [] } }, true, launch)
  fireEvent.click(screen.getByRole('button', { name: '使用这个团队' }))
  expect(screen.queryByText('复制任务指令')).toBeNull()
  fireEvent.change(screen.getByLabelText('要解决的具体问题'), { target: { value: '  评审新手流程  ' } })
  await act(async () => { fireEvent.click(screen.getByText('发起任务')) })
  expect(launch).toHaveBeenCalledWith('产品专家团', '评审新手流程', 'workspace-1')
})

it('shows compact member identities and labelled icon actions without exposing working instructions', () => {
  mount({ 产品团队: { description: '产品评审', members: [
    { name: '体验专家', role: '设计师', executionPrompt: '审阅复杂流程的完整工作指令' },
  ] } })
  expect(screen.getByRole('heading', { name: '产品团队' })).toBeTruthy()
  expect(screen.getByLabelText('体验专家 · 设计师')).toBeTruthy()
  expect(screen.queryByText('审阅复杂流程的完整工作指令')).toBeNull()
  expect(screen.getByRole('button', { name: '编辑' })).toBeTruthy()
})
