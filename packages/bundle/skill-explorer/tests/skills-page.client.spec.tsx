// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { ListPayload, SkillEntry } from '../src/types.ts'
import type { SkillExplorerActions } from '../src/client/actions.ts'
import { SkillsPage } from '../src/client/SkillsPage.tsx'
import { SkillImportDialog } from '../src/client/SkillEditor.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const writable: SkillEntry = { name: 'review-copy', description: 'Review release copy', level: 'user-dsh',
  path: '/skills/review-copy/SKILL.md', fileState: 'editable', modelInvocable: true, userInvocable: true }
const provided: SkillEntry = { name: 'bundled-expert', description: 'Built-in expert', level: 'bundled',
  fileState: 'virtual', modelInvocable: true, userInvocable: true }
const catalogue: ListPayload = { cwd: '/workspace', projectRoots: [], complete: true, importLimitBytes: 4 * 1024 * 1024,
  groups: [{ key: 'user-dsh', title: '', hint: '', skills: [writable] }, { key: 'bundled', title: '', hint: '', skills: [provided] }] }
const translations: Record<string, string> = zh
const translate = (key: string, params: Record<string, unknown> = {}) => Object.entries(params)
  .reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), translations[key] ?? key)

async function mount() {
  const actions: SkillExplorerActions = {
    list: vi.fn().mockResolvedValue(catalogue),
    read: vi.fn().mockResolvedValue({ name: writable.name, description: writable.description,
      content: '# Review\nCheck names and dates.', path: writable.path, revision: 'rev-1' }),
    create: vi.fn().mockResolvedValue(undefined), update: vi.fn().mockResolvedValue(undefined),
    setEnabled: vi.fn().mockResolvedValue(undefined),
    trash: vi.fn().mockResolvedValue({ name: writable.name, path: writable.path, trashedPath: '/skills/.trash/review-copy' }),
    restore: vi.fn().mockResolvedValue(undefined), importSkills: vi.fn().mockResolvedValue({ level: 'user-dsh', outcomes: [], imported: 0, skipped: 0 }),
  }
  const props: Partial<ComponentProps<typeof SkillsPage>> = {
    actions, t: translate,
    useWorkspaces: select => select({ items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null }),
  }
  await act(async () => { render(<SkillsPage {...props as ComponentProps<typeof SkillsPage>} />) })
  return actions
}

it('groups the catalogue and leaves provider-managed skills without a misleading toggle', async () => {
  await mount()
  expect(screen.getByRole('heading', { name: '工具箱' })).toBeTruthy()
  expect(screen.getByText('由提供方管理')).toBeTruthy()
  expect(screen.getAllByRole('switch')).toHaveLength(1)
  expect({
    heading: screen.getByRole('heading', { name: '工具箱' }).textContent,
    create: screen.getByRole('button', { name: '新建技能' }).textContent,
    groups: [...document.querySelectorAll('summary')].map(item => item.textContent),
    rows: screen.getAllByRole('article').map(item => ({
      text: item.textContent,
      actions: [...item.querySelectorAll('[aria-label]')].map(action => action.getAttribute('aria-label')),
    })),
  }).toMatchInlineSnapshot(`
    {
      "create": "新建技能",
      "groups": [
        "个人技能1",
        "内置技能1",
      ],
      "heading": "工具箱",
      "rows": [
        {
          "actions": [
            "编辑技能 review-copy",
            "另存为新技能 review-copy",
            "移入回收站 review-copy",
            "允许模型调用 review-copy",
          ],
          "text": "review-copyReview release copy允许模型调用",
        },
        {
          "actions": [],
          "text": "bundled-expertBuilt-in expert由提供方管理允许模型调用",
        },
      ],
    }
  `)
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索技能' }), { target: { value: 'bundled' } })
  expect(screen.queryByText('review-copy')).toBeNull()
  expect(screen.getByText('bundled-expert')).toBeTruthy()
})

it('saves a new skill through the same page-level creation action', async () => {
  const actions = await mount()
  fireEvent.click(screen.getByRole('button', { name: '新建技能' }))
  fireEvent.change(screen.getByRole('textbox', { name: '技能名称' }), { target: { value: 'release-review' } })
  fireEvent.change(screen.getByRole('textbox', { name: '功能说明' }), { target: { value: 'Check release text' } })
  fireEvent.change(screen.getByRole('textbox', { name: '技能指令' }), { target: { value: 'Check product names.' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存技能' })) })
  expect(actions.create).toHaveBeenCalledWith({ scope: 'user', draft: {
    name: 'release-review', description: 'Check release text', content: 'Check product names.',
  } })
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('sends the read revision when editing an existing instruction file', async () => {
  const actions = await mount()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '编辑技能 review-copy' })) })
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: '技能名称' }).disabled).toBe(true)
  fireEvent.change(screen.getByRole('textbox', { name: '技能指令' }), { target: { value: 'Check dates first.' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存技能' })) })
  expect(actions.update).toHaveBeenCalledWith({
    name: 'review-copy', path: writable.path, revision: 'rev-1',
    draft: { name: writable.name, description: writable.description, content: 'Check dates first.' },
  })
})

it('retains a recoverable trash identity and restores it from Undo', async () => {
  const actions = await mount()
  fireEvent.click(screen.getByRole('button', { name: '移入回收站 review-copy' }))
  const dialog = screen.getByRole('dialog', { name: '将此技能移入回收站？' })
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '移入回收站' })) })
  expect(actions.trash).toHaveBeenCalledWith({ name: writable.name, path: writable.path })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '撤销' })) })
  expect(actions.restore).toHaveBeenCalledWith({ name: writable.name, path: writable.path, trashedPath: '/skills/.trash/review-copy' })
})

it('sends the real invocation toggle to the Host', async () => {
  const actions = await mount()
  await act(async () => { fireEvent.click(screen.getByRole('switch', { name: '允许模型调用 review-copy' })) })
  expect(actions.setEnabled).toHaveBeenCalledWith({ name: writable.name, path: writable.path, enabled: false })
})

it('imports directory definitions into the selected destination and retains the result', async () => {
  const actions = await mount()
  fireEvent.click(screen.getByRole('button', { name: '导入技能' }))
  fireEvent.change(screen.getByRole('combobox', { name: '导入来源' }), { target: { value: 'directory' } })
  fireEvent.change(screen.getByRole('textbox', { name: '目录路径' }), { target: { value: '/skill-import' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '开始导入' })) })
  expect(actions.importSkills).toHaveBeenCalledWith({ scope: 'user', source: { kind: 'directory', path: '/skill-import' } })
  expect(screen.getByRole('region', { name: '导入结果' })).toBeTruthy()
})

it('retains an edited draft when the Host rejects its revision', async () => {
  const actions = await mount()
  vi.mocked(actions.update).mockRejectedValue(new Error('changed'))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '编辑技能 review-copy' })) })
  fireEvent.change(screen.getByRole('textbox', { name: '技能指令' }), { target: { value: 'Keep this draft.' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存技能' })) })
  expect(screen.getByRole('alert').textContent).toBe('操作未完成，输入内容已保留')
  expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: '技能指令' }).value).toBe('Keep this draft.')
})

it('uses the Host-advertised import limit before reading a ZIP archive', async () => {
  const importSkills = vi.fn()
  render(<SkillImportDialog scope={{}} importLimitBytes={100} importSkills={importSkills}
    onImported={vi.fn()} onClose={vi.fn()} t={translate} />)
  fireEvent.change(screen.getByLabelText('选择 ZIP 文件'), { target: { files: [new File(['x'.repeat(200)], 'large.zip')] } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '开始导入' })) })
  expect(screen.getByRole('alert').textContent).toBe('请选择不超过 100B 的 ZIP 文件')
  expect(importSkills).not.toHaveBeenCalled()
})

it('does not offer writes for bundled files even when a scan resolves their paths', async () => {
  const actions = await mount()
  vi.mocked(actions.list).mockResolvedValue({ ...catalogue, groups: [{ key: 'bundled', title: '', hint: '',
    skills: [{ ...writable, name: 'bundled-copy', level: 'bundled' }] }] })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '刷新' })) })
  expect(screen.queryByRole('switch')).toBeNull()
  expect(screen.queryByRole('button', { name: '编辑技能 bundled-copy' })).toBeNull()
  expect(screen.getByText('由提供方管理')).toBeTruthy()
})
