// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { OfficePage } from '../src/client/OfficePage.tsx'
import { zh } from '../src/client/office-copy.ts'

afterEach(cleanup)
const translations: Record<string, string> = zh

it('keeps multiline responsibilities and submits the member form from the fixed modal footer', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  // Only the component's consumed framework seats participate in this form test.
  const props: Partial<ComponentProps<typeof OfficePage>> = {
    useCatalogue: select => select(0),
    navigation: { title: '团队', labels: { specialists: '专家', experts: '专家团', offices: '办公室', workflows: '工作流' }, mode: 'offices', selectMode: vi.fn() },
    t: key => translations[key] ?? key, list: async () => [], presets: async () => [{ id: 'standard' }],
    save, open: vi.fn(),
    useManagement: select => select(undefined), consumeManagement: vi.fn(),
    useWorkspaces: select => select({ items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null }),
  }
  await act(async () => { render(<OfficePage {...props as ComponentProps<typeof OfficePage>} />) })
  fireEvent.click(screen.getByRole('button', { name: '新建办公室' }))
  for (const [name, value] of [['办公室名称', '产品办公室'], ['成员名称', '研究员'], ['专业角色', '用户研究'], ['成员职责', '记录用户问题\n给出可验证的建议']] as const) {
    fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } })
  }
  const responsibilities = screen.getByRole('textbox', { name: '成员职责' })
  expect(responsibilities.tagName).toBe('TEXTAREA')
  const button = screen.getByRole<HTMLButtonElement>('button', { name: '保存办公室' })
  expect(button.closest('form')).toBeNull()
  expect(button.form).not.toBeNull()
  await act(async () => { fireEvent.submit(button.form!) })
  expect(save).toHaveBeenCalledWith({ name: '产品办公室', description: '', members: [
    { name: '研究员', role: '用户研究', instruction: '记录用户问题\n给出可验证的建议' },
  ] })
  expect(screen.queryByRole('dialog')).toBeNull()
})
