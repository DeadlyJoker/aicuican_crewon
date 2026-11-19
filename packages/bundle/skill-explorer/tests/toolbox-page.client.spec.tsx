// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { McpManagedServerView } from '@deepseek-ai/dsh-mcp-manager/types'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/types'
import type { ListPayload, SkillEntry, ToolboxCatalogSnapshot } from '../src/types.ts'
import type { ToolboxMcpConnection, ToolboxMcpInventory } from '../src/mcp-types.ts'
import type { CliCatalogue, CliRunResult, CliToolId, CliToolView } from '../src/cli-types.ts'
import type { AuthorizationState } from '../src/authorization-types.ts'
import type { ToolboxActions } from '../src/client/toolbox-actions.ts'
import { ToolboxPage } from '../src/client/ToolboxPage.tsx'
import { ConnectionDialog } from '../src/client/ToolboxDialogs.tsx'
import { AgentAccessDialog } from '../src/client/AgentAccessDialog.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const translations: Record<string, string> = zh
const translate = (key: string, params: Record<string, unknown> = {}) => Object.entries(params)
  .reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), translations[key] ?? key)
const skill: SkillEntry = {
  name: 'report-format', description: '整理报告', level: 'bundled', path: '/skills/report-format/SKILL.md',
  fileState: 'provider-file', modelInvocable: true, userInvocable: true,
}
const skills: ListPayload = {
  importLimitBytes: 4096, cwd: '/workspace', projectRoots: [], complete: true,
  groups: [{ key: 'bundled', title: '', hint: '', skills: [skill] }],
}
const connection: ToolboxMcpConnection = {
  name: 'kb', origin: 'user', editable: true, removable: true, status: { state: 'connecting', attempt: 0 },
  config: { transport: 'streamable-http', command: '', args: [], env: {}, cwd: '',
    url: 'https://knowledge.example.test/mcp', headers: { Authorization: null, 'X-Company': null }, enabled: true },
}
const mcp: ToolboxMcpInventory = { revision: 4, writable: true, connections: [connection] }
const cliTool: CliToolView = {
  id: 'count-text' as CliToolId, toolName: 'local_count_text', name: '文字长度', description: '统计字符数量',
  category: 'data', command: 'python3', args: ['-c', 'print(len(input()))', '{input}'], versionArgs: ['--version'],
  enabled: true, inherited: false, availability: { state: 'ready', executable: '/usr/bin/python3' },
}
const cli: CliCatalogue = { revision: 7, host: '测试设备', tools: [cliTool] }
const runResult: CliRunResult = {
  id: cliTool.id, name: cliTool.name, cwd: '/workspace', executable: '/usr/bin/python3',
  stdout: '6\n', stderr: '', exitCode: 0, signal: null, timedOut: false, aborted: false, truncated: false,
}
const authorization: AuthorizationState = {
  revision: 9, presets: [{ id: 'standard', name: '通用助手' }], policies: {},
  nativeTools: [{ name: 'read_file', description: '读取文件' }],
}
const catalog: ToolboxCatalogSnapshot = { revision: 2, writable: true, items: {
  'skill:report-format': { title: '报告整理', description: '统一报告格式', purpose: 'writing' },
  'mcp:kb': { title: '资料检索', description: '查询团队知识库', purpose: 'research' },
  'cli:count-text': { title: cliTool.name, description: cliTool.description, purpose: 'data' },
} }

function actionsFixture(): ToolboxActions {
  return {
    skills: {
      list: vi.fn().mockResolvedValue(skills),
      read: vi.fn().mockResolvedValue({ name: skill.name, path: skill.path, description: skill.description,
        content: '# 报告整理', revision: 'first' }),
      create: vi.fn().mockResolvedValue(undefined), update: vi.fn().mockResolvedValue(undefined),
      setEnabled: vi.fn().mockResolvedValue(undefined),
      trash: vi.fn().mockResolvedValue({ name: skill.name, path: skill.path, trashedPath: '/trash/report' }),
      restore: vi.fn().mockResolvedValue(undefined),
      importSkills: vi.fn().mockResolvedValue({ level: 'user-dsh', outcomes: [], imported: 0, skipped: 0 }),
    },
    catalog: { read: vi.fn().mockResolvedValue(catalog), save: vi.fn().mockResolvedValue(catalog) },
    mcp: {
      inventory: vi.fn().mockResolvedValue(mcp), save: vi.fn().mockResolvedValue({ ...mcp, revision: 5 }),
      setEnabled: vi.fn().mockResolvedValue(mcp), remove: vi.fn().mockResolvedValue(mcp),
      probe: vi.fn().mockResolvedValue({ ok: true, toolNames: ['search'], truncated: false, durationMs: 1, closeConfirmed: true }),
      restart: vi.fn().mockResolvedValue(undefined), setCredential: vi.fn().mockResolvedValue(undefined),
    },
    cli: {
      list: vi.fn().mockResolvedValue(cli), save: vi.fn().mockResolvedValue(cli), remove: vi.fn().mockResolvedValue(cli),
      probe: vi.fn().mockResolvedValue({ state: 'ready', executable: runResult.executable, version: '1.0', result: runResult }),
      run: vi.fn().mockResolvedValue(runResult),
    },
    authorization: { list: vi.fn().mockResolvedValue(authorization), save: vi.fn().mockResolvedValue(authorization) },
  }
}

async function mountPage(actions = actionsFixture(), workspaces: WorkspaceView[] = []) {
  let connections: McpManagedServerView[] = []
  const props: Partial<ComponentProps<typeof ToolboxPage>> = {
    actions, t: translate, useConnections: select => select({ items: connections }),
    useWorkspaces: select => select({ items: workspaces, archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null }),
  }
  const view = await act(async () => render(<ToolboxPage {...props as ComponentProps<typeof ToolboxPage>} />))
  return {
    actions,
    updateConnections: async (next: McpManagedServerView[]) => {
      connections = next
      await act(async () => { view.rerender(<ToolboxPage {...props as ComponentProps<typeof ToolboxPage>} />) })
    },
  }
}

it('separates skills, connectors and local tools into explicit tabs', async () => {
  await mountPage()
  const cards = () => screen.getAllByRole('article').map(card => ({
    title: within(card).getByRole('heading').textContent,
    actions: within(card).getAllByRole('button').map(button => button.getAttribute('aria-label') ?? button.textContent),
  }))
  const skillCards = cards()
  expect(screen.queryByRole('heading', { name: '资料检索' })).toBeNull()
  fireEvent.click(screen.getByRole('tab', { name: zh['kind.mcp'] }))
  const connectorCards = cards()
  expect(screen.queryByRole('combobox', { name: zh.workspace })).toBeNull()
  expect(screen.getByText('连接中')).toBeTruthy()
  fireEvent.click(screen.getByRole('tab', { name: zh['kind.cli'] }))
  const localCards = cards()
  expect(screen.getByText('已找到程序')).toBeTruthy()
  expect({ skillCards, connectorCards, localCards }).toMatchInlineSnapshot(`
    {
      "connectorCards": [
        {
          "actions": [
            "设置 资料检索",
            "移除 资料检索",
            "检测",
          ],
          "title": "资料检索",
        },
      ],
      "localCards": [
        {
          "actions": [
            "设置 文字长度",
            "移除 文字长度",
            "使用",
          ],
          "title": "文字长度",
        },
      ],
      "skillCards": [
        {
          "actions": [
            "设置 报告整理",
            "预览",
          ],
          "title": "报告整理",
        },
      ],
    }
  `)
})

it('shows personal and provider skills, authoring actions and the same skills in Agent choices', async () => {
  const actions = actionsFixture()
  const additional = ['user-dsh', 'user-agents', 'runtime', 'custom'].map(level => ({
    ...skill, name: `available-${level}`, level, fileState: 'editable' as const,
  }))
  vi.mocked(actions.skills.list).mockResolvedValue({ ...skills, groups: [
    ...skills.groups, ...additional.map(item => ({ key: item.level, title: '', hint: '', skills: [item] })),
  ] })
  await mountPage(actions)
  for (const item of additional) expect(screen.getByRole('heading', { name: item.name })).toBeTruthy()
  expect(screen.getByRole('button', { name: zh.newSkill })).toBeTruthy()
  expect(screen.getByRole('button', { name: zh.importSkills })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: zh.agentAccess }))
  const access = within(screen.getByRole('dialog'))
  fireEvent.click(access.getByRole('switch', { name: zh.limitAgent }))
  expect(access.getByRole('checkbox', { name: skill.name })).toBeTruthy()
  for (const item of additional) expect(access.getByRole('checkbox', { name: item.name })).toBeTruthy()
})

it('uses native live connection state after the initial inventory has loaded', async () => {
  const page = await mountPage()
  fireEvent.click(screen.getByRole('tab', { name: zh['kind.mcp'] }))
  const card = screen.getByRole('heading', { name: '资料检索' }).closest('article')!
  expect(within(card).getByText('连接中')).toBeTruthy()
  await page.updateConnections([{ name: connection.name, configured: true,
    status: { state: 'connected', toolCount: 2, connectedAt: 1 } }])
  expect(within(card).getByText('已连接', { exact: true })).toBeTruthy()
  expect(within(card).queryByText('连接中')).toBeNull()
})

it('shows ready catalogues while another source loads and reports its failure without an empty state', async () => {
  const actions = actionsFixture()
  const pending = Promise.withResolvers<CliCatalogue>()
  vi.mocked(actions.cli.list).mockReturnValue(pending.promise)
  await mountPage(actions)
  fireEvent.click(screen.getByRole('tab', { name: zh['kind.mcp'] }))
  expect(screen.getByRole('main').getAttribute('aria-busy')).toBe('true')
  expect(screen.getByRole('heading', { name: '资料检索' })).toBeTruthy()
  expect(screen.queryByText('没有找到工具')).toBeNull()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '刷新' }).disabled).toBe(true)
  await act(async () => { pending.reject(new Error('unavailable')) })
  expect(screen.getByRole('main').getAttribute('aria-busy')).toBe('false')
  expect(screen.getByRole('alert').textContent).toContain('部分工具未能加载')
  expect(screen.getByRole('alert').textContent).toContain('本地工具\nunavailable')
  expect(screen.getByRole('heading', { name: '资料检索' })).toBeTruthy()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '刷新' }).disabled).toBe(false)
})

it('hides stale workspace skills and ignores results from an earlier workspace request', async () => {
  const actions = actionsFixture()
  const second = Promise.withResolvers<ListPayload>()
  const refreshed = Promise.withResolvers<ListPayload>()
  vi.mocked(actions.skills.list).mockResolvedValueOnce(skills).mockReturnValueOnce(second.promise)
    .mockReturnValueOnce(refreshed.promise)
  const workspaces = ['first', 'second'].map(id => ({ workspaceId: id as WorkspaceId, title: id,
    path: `/${id}`, sessionIds: [], createdAt: '', updatedAt: '' }))
  await mountPage(actions, workspaces)
  expect(screen.getByRole('heading', { name: '报告整理' })).toBeTruthy()
  expect(actions.skills.list).toHaveBeenNthCalledWith(1, {})
  expect(screen.getByRole('combobox', { name: zh.workspace })).toHaveProperty('value', '')
  await act(async () => { fireEvent.change(screen.getByRole('combobox', { name: zh.workspace }), { target: { value: 'second' } }) })
  expect(screen.queryByRole('heading', { name: '报告整理' })).toBeNull()
  await act(async () => { fireEvent.change(screen.getByRole('combobox', { name: zh.workspace }), { target: { value: 'first' } }) })
  await act(async () => { refreshed.resolve({ ...skills, groups: [{ ...skills.groups[0]!, skills: [{ ...skill, name: 'fresh-first' }] }] }) })
  await act(async () => { second.resolve({ ...skills, groups: [{ ...skills.groups[0]!, skills: [{ ...skill, name: 'late-second' }] }] }) })
  expect(screen.getByRole('heading', { name: 'fresh-first' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'late-second' })).toBeNull()
  expect(actions.skills.list).toHaveBeenNthCalledWith(2, { workspaceId: 'second' })
})

it('restarts a failed live service once for repeated clicks and permits retry after failure', async () => {
  const page = await mountPage()
  fireEvent.click(screen.getByRole('tab', { name: zh['kind.mcp'] }))
  await page.updateConnections([{ name: connection.name, configured: true,
    status: { state: 'failed', reason: 'load', lastError: 'connection refused' } }])
  const pending = Promise.withResolvers<undefined>()
  vi.mocked(page.actions.mcp.restart).mockReturnValueOnce(pending.promise)
  const reconnect = screen.getByRole('button', { name: '重新连接' })
  fireEvent.click(reconnect)
  fireEvent.click(reconnect)
  expect(page.actions.mcp.restart).toHaveBeenCalledOnce()
  expect(page.actions.mcp.probe).not.toHaveBeenCalled()
  await act(async () => { pending.reject(new Error('connection refused')) })
  expect(screen.getByRole('alert').textContent).toContain('操作未完成')
  expect(screen.getByRole('alert').textContent).toContain('connection refused')
  await act(async () => { fireEvent.click(reconnect) })
  expect(page.actions.mcp.restart).toHaveBeenCalledTimes(2)
  await page.updateConnections([{ name: connection.name, configured: true,
    status: { state: 'connected', toolCount: 2, connectedAt: 1 } }])
  expect(screen.queryByRole('button', { name: '重新连接' })).toBeNull()
})

it('edits connection fields without replacing masked headers and saves its display metadata', async () => {
  const actions = actionsFixture()
  const onClose = vi.fn()
  render(<ConnectionDialog inventory={mcp} connection={connection}
    presentation={catalog.items['mcp:kb']!} originalPresentation={catalog.items['mcp:kb']}
    actions={actions} onSaved={vi.fn()} onClose={onClose} t={translate} />)
  fireEvent.change(screen.getByRole('textbox', { name: '服务地址' }), { target: { value: 'https://new.example.test/mcp' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存' })) })
  expect(actions.mcp.save).toHaveBeenCalledWith({ name: connection.name, originalName: connection.name, revision: 4,
    config: { ...connection.config, url: 'https://new.example.test/mcp', headers: { Authorization: null, 'X-Company': null } } })
  expect(actions.mcp.setCredential).not.toHaveBeenCalled()
  expect(actions.catalog.save).toHaveBeenCalledWith('mcp:kb', catalog.items['mcp:kb'], 2)
  expect(onClose).toHaveBeenCalledOnce()
})

it('retains a connection draft when another window changes its display settings', async () => {
  const actions = actionsFixture()
  const onClose = vi.fn()
  const initial = catalog.items['mcp:kb']!
  const view = render(<ConnectionDialog inventory={mcp} connection={connection}
    presentation={initial} originalPresentation={initial}
    actions={actions} onSaved={vi.fn()} onClose={onClose} t={translate} />)
  fireEvent.change(screen.getByRole('textbox', { name: '显示名称' }), { target: { value: '我的草稿' } })
  const concurrent = { ...initial, title: '另一窗口的名称' }
  vi.mocked(actions.catalog.read).mockResolvedValue({ ...catalog, revision: 20,
    items: { ...catalog.items, 'mcp:kb': concurrent } })
  view.rerender(<ConnectionDialog inventory={mcp} connection={connection}
    presentation={concurrent} originalPresentation={concurrent}
    actions={actions} onSaved={vi.fn()} onClose={onClose} t={translate} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存' })) })
  expect(actions.mcp.save).toHaveBeenCalledOnce()
  expect(actions.catalog.save).not.toHaveBeenCalled()
  expect(screen.getByRole('alert').textContent).toBe(zh.presentationChanged)
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: '显示名称' }).value).toBe('我的草稿')
  expect(onClose).not.toHaveBeenCalled()
})

it('uses the latest revision after its own connection save while the original display fields still match', async () => {
  const actions = actionsFixture()
  const onClose = vi.fn()
  vi.mocked(actions.mcp.save).mockImplementation(async () => {
    vi.mocked(actions.catalog.read).mockResolvedValue({ ...catalog, revision: 20 })
    return { ...mcp, revision: 5 }
  })
  render(<ConnectionDialog inventory={mcp} connection={connection}
    presentation={catalog.items['mcp:kb']!} originalPresentation={catalog.items['mcp:kb']}
    actions={actions} onSaved={vi.fn()} onClose={onClose} t={translate} />)
  fireEvent.change(screen.getByRole('textbox', { name: '显示名称' }), { target: { value: '新的名称' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存' })) })
  expect(actions.catalog.save).toHaveBeenCalledWith('mcp:kb', { ...catalog.items['mcp:kb'], title: '新的名称' }, 20)
  expect(onClose).toHaveBeenCalledOnce()
})

it('retries a partially saved connection with the committed native revision and preserved display draft', async () => {
  const actions = actionsFixture()
  const onClose = vi.fn()
  vi.mocked(actions.catalog.save).mockRejectedValueOnce(new Error('temporarily unavailable'))
  render(<ConnectionDialog inventory={mcp} connection={connection}
    presentation={catalog.items['mcp:kb']!} originalPresentation={catalog.items['mcp:kb']}
    actions={actions} onSaved={vi.fn()} onClose={onClose} t={translate} />)
  fireEvent.change(screen.getByRole('textbox', { name: '显示名称' }), { target: { value: '保留草稿' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存' })) })
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: '显示名称' }).value).toBe('保留草稿')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存' })) })
  expect(vi.mocked(actions.mcp.save).mock.calls[1]?.[0]).toMatchObject({ name: 'kb', originalName: 'kb', revision: 5 })
  expect(actions.catalog.save).toHaveBeenLastCalledWith('mcp:kb', { ...catalog.items['mcp:kb'], title: '保留草稿' }, 2)
  expect(onClose).toHaveBeenCalledOnce()
})

it('protects standalone display settings against edits made after its dialog opened', async () => {
  const { actions } = await mountPage()
  fireEvent.click(screen.getByRole('button', { name: '设置 报告整理' }))
  fireEvent.change(screen.getByRole('textbox', { name: '显示名称' }), { target: { value: '待保存的名称' } })
  vi.mocked(actions.catalog.read).mockResolvedValue({ ...catalog, revision: 20,
    items: { ...catalog.items, 'skill:report-format': { ...catalog.items['skill:report-format']!, title: '已被别人修改' } } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存' })) })
  expect(actions.catalog.save).not.toHaveBeenCalled()
  expect(screen.getByRole('alert').textContent).toBe(zh.presentationChanged)
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: '显示名称' }).value).toBe('待保存的名称')
  expect(screen.getByRole('dialog')).toBeTruthy()
})

it('detects a display override created elsewhere after opening an uncustomized resource', async () => {
  const actions = actionsFixture()
  vi.mocked(actions.catalog.read).mockResolvedValue({ ...catalog, items: {} })
  await mountPage(actions)
  fireEvent.click(screen.getByRole('button', { name: `设置 ${skill.name}` }))
  vi.mocked(actions.catalog.read).mockResolvedValue(catalog)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存' })) })
  expect(actions.catalog.save).not.toHaveBeenCalled()
  expect(screen.getByRole('alert').textContent).toBe(zh.presentationChanged)
})

it('stores a newly entered token through the credential API and sends only its reference in config', async () => {
  const actions = actionsFixture()
  render(<ConnectionDialog inventory={mcp} connection={connection}
    presentation={catalog.items['mcp:kb']!} originalPresentation={catalog.items['mcp:kb']}
    actions={actions} onSaved={vi.fn()} onClose={vi.fn()} t={translate} />)
  fireEvent.change(screen.getByLabelText(/访问密钥/u), { target: { value: 'a-private-token' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存' })) })
  expect(actions.mcp.setCredential).toHaveBeenCalledWith('TOOLBOX_kb_TOKEN', 'a-private-token')
  const request = vi.mocked(actions.mcp.save).mock.calls[0]?.[0]
  expect(request?.config.headers).toEqual({ Authorization: 'Bearer ${credential:TOOLBOX_kb_TOKEN}', 'X-Company': null })
  expect(JSON.stringify(request)).not.toContain('a-private-token')
})

it('clears HTTP-only fields when switching a connection to a local service', async () => {
  const actions = actionsFixture()
  render(<ConnectionDialog inventory={mcp} connection={connection}
    presentation={catalog.items['mcp:kb']!} originalPresentation={catalog.items['mcp:kb']}
    actions={actions} onSaved={vi.fn()} onClose={vi.fn()} t={translate} />)
  fireEvent.change(screen.getByLabelText(/访问密钥/u), { target: { value: 'unused-token' } })
  fireEvent.change(screen.getByRole('combobox', { name: '连接方式' }), { target: { value: 'stdio' } })
  fireEvent.change(screen.getByRole('textbox', { name: '程序' }), { target: { value: 'node' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存' })) })
  expect(vi.mocked(actions.mcp.save).mock.calls[0]?.[0].config).toMatchObject({
    transport: 'stdio', command: 'node', url: '', headers: {},
  })
  expect(actions.mcp.setCredential).not.toHaveBeenCalled()
})

it('clears local-only fields when switching a connection to an HTTP service', async () => {
  const actions = actionsFixture()
  const local: ToolboxMcpConnection = { ...connection, config: { transport: 'stdio', command: 'node', args: ['server.js'],
    env: { TOKEN: null }, cwd: '/local-service', url: '', headers: {}, enabled: true } }
  render(<ConnectionDialog inventory={mcp} connection={local}
    presentation={catalog.items['mcp:kb']!} originalPresentation={catalog.items['mcp:kb']}
    actions={actions} onSaved={vi.fn()} onClose={vi.fn()} t={translate} />)
  fireEvent.change(screen.getByRole('combobox', { name: '连接方式' }), { target: { value: 'streamable-http' } })
  fireEvent.change(screen.getByRole('textbox', { name: '服务地址' }), { target: { value: 'https://new.example.test/mcp' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存' })) })
  expect(vi.mocked(actions.mcp.save).mock.calls[0]?.[0].config).toMatchObject({
    transport: 'streamable-http', command: '', args: [], env: {}, cwd: '', url: 'https://new.example.test/mcp',
  })
})

it('opens a local tool from its card and passes the supplied input to native execution', async () => {
  const { actions } = await mountPage()
  fireEvent.click(screen.getByRole('tab', { name: zh['kind.cli'] }))
  const card = screen.getByRole('heading', { name: cliTool.name }).closest('article')!
  fireEvent.click(within(card).getByRole('button', { name: '使用' }))
  fireEvent.change(screen.getByRole('textbox', { name: '输入内容' }), { target: { value: '你好，工具箱' } })
  await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '使用' })) })
  expect(actions.cli.run).toHaveBeenCalledWith({ id: cliTool.id, input: '你好，工具箱' }, expect.any(AbortSignal))
  expect(screen.getByRole('region', { name: '执行结果' }).textContent).toBe('6\n')
})

it('saves the selected capabilities against the chosen Agent revision', async () => {
  const actions = actionsFixture()
  const onClose = vi.fn()
  render(<AgentAccessDialog state={authorization} skills={[skill]} mcp={mcp} cli={cli}
    actions={actions} onSaved={vi.fn()} onClose={onClose} t={translate} />)
  fireEvent.click(screen.getByRole('switch', { name: '限定此 Agent 可使用的能力' }))
  fireEvent.click(screen.getByRole('checkbox', { name: skill.name }))
  fireEvent.click(screen.getByRole('checkbox', { name: connection.name }))
  fireEvent.click(screen.getByRole('checkbox', { name: cliTool.name }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存' })) })
  expect(actions.authorization.save).toHaveBeenCalledWith({ agentPreset: 'standard', revision: 9, policy: {
    enabled: true, nativeTools: [], skillNames: [skill.name], mcpServers: [connection.name], cliToolIds: [cliTool.id],
  } })
  expect(onClose).toHaveBeenCalledOnce()
})

it('shows the restriction label and friendly service names while saving native server identities', async () => {
  const { actions } = await mountPage()
  fireEvent.click(screen.getByRole('button', { name: 'Agent 能力' }))
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByText('限定此 Agent 可使用的能力')).toBeTruthy()
  fireEvent.click(dialog.getByRole('switch', { name: '限定此 Agent 可使用的能力' }))
  expect(dialog.getByText('资料检索').getAttribute('title')).toBe(connection.name)
  fireEvent.change(dialog.getByRole('searchbox', { name: '按名称或用途搜索' }), { target: { value: '资料' } })
  fireEvent.click(dialog.getByRole('checkbox', { name: '资料检索' }))
  await act(async () => { fireEvent.click(dialog.getByRole('button', { name: '保存' })) })
  expect(actions.authorization.save).toHaveBeenCalledWith({ agentPreset: 'standard', revision: 9, policy: {
    enabled: true, nativeTools: [], skillNames: [], mcpServers: [connection.name], cliToolIds: [],
  } })
})

it('keeps the capability draft visible when the authorization write fails', async () => {
  const actions = actionsFixture()
  vi.mocked(actions.authorization.save).mockRejectedValue(new Error('revision changed'))
  const onClose = vi.fn()
  render(<AgentAccessDialog state={authorization} skills={[skill]} mcp={mcp} cli={cli}
    actions={actions} onSaved={vi.fn()} onClose={onClose} t={translate} />)
  fireEvent.click(screen.getByRole('switch', { name: '限定此 Agent 可使用的能力' }))
  fireEvent.click(screen.getByRole('checkbox', { name: skill.name }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存' })) })
  expect(screen.getByRole('alert').textContent).toBe('操作未完成，输入内容已保留')
  expect(screen.getByRole<HTMLInputElement>('checkbox', { name: skill.name }).checked).toBe(true)
  expect(screen.getByRole('switch', { name: '限定此 Agent 可使用的能力' }).getAttribute('aria-checked')).toBe('true')
  expect(onClose).not.toHaveBeenCalled()
})

it('stages expert capabilities and copies the policy to the new immutable preset', async () => {
  const actions = actionsFixture()
  const { ExpertCapabilities } = await import('../src/client/ExpertCapabilities.tsx')
  let prepare: import('../src/client/capability-slot.ts').CapabilityCommit | undefined
  const registerCommit = (value: NonNullable<typeof prepare>) => { prepare = value; return () => { prepare = undefined } }
  await act(async () => { render(<ExpertCapabilities {...{ agentPreset: 'standard', busy: false, actions, registerCommit, t: translate } as ComponentProps<typeof ExpertCapabilities>} />) })
  fireEvent.click(screen.getByRole('switch', { name: zh.limitAgent }))
  fireEvent.click(screen.getByRole('checkbox', { name: skill.name }))
  fireEvent.click(screen.getByRole('checkbox', { name: connection.name }))
  const commit = await prepare!()
  expect(actions.authorization.save).not.toHaveBeenCalled()
  await commit('expert-new-v1')
  expect(actions.authorization.save).toHaveBeenCalledWith({ agentPreset: 'expert-new-v1', revision: 9, policy: {
    enabled: true, nativeTools: ['read_file'], skillNames: [skill.name], mcpServers: [connection.name], cliToolIds: [],
  } })
})

it('blocks expert preparation while capability discovery is unavailable and rejects concurrent policy changes', async () => {
  const actions = actionsFixture()
  const pending = Promise.withResolvers<AuthorizationState>()
  vi.mocked(actions.authorization.list).mockReturnValueOnce(pending.promise)
  const { ExpertCapabilities } = await import('../src/client/ExpertCapabilities.tsx')
  let prepare: import('../src/client/capability-slot.ts').CapabilityCommit | undefined
  const registerCommit = (value: NonNullable<typeof prepare>) => { prepare = value; return () => { prepare = undefined } }
  await act(async () => { render(<ExpertCapabilities {...{ agentPreset: 'standard', busy: false, actions, registerCommit, t: translate } as ComponentProps<typeof ExpertCapabilities>} />) })
  await expect(prepare!()).rejects.toThrow(zh.capabilitiesUnavailable)
  await act(async () => { pending.resolve(authorization) })
  const commit = await prepare!()
  vi.mocked(actions.authorization.list).mockResolvedValue({ ...authorization, revision: 10, policies: {
    standard: { enabled: true, nativeTools: [], skillNames: [], mcpServers: [], cliToolIds: [] },
  } })
  await expect(commit('expert-new-v1')).rejects.toThrow(zh.capabilitiesChanged)
  expect(actions.authorization.save).not.toHaveBeenCalled()
})
