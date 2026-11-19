// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { ExpertsPage } from '../src/client/ExpertsPage.tsx'
import type { ExpertCatalogEntry, ExpertDefinition, ExpertDraft } from '../src/expert-types.ts'
import { zh } from '../src/client/expert-copy.ts'

afterEach(cleanup)
const saved: ExpertDefinition = { id: 'saved', revision: 2, preset: 'expert-saved-v2', name: '交互专家', description: '评估界面流程', prompt: '检查交互路径并提供依据', basePreset: 'standard', category: 'design' }
const builtin: ExpertCatalogEntry = { key: 'builtin-ux', name: '体验研究员', description: '分析用户需求', category: 'design', tags: ['UX'], examples: ['分析注册流程'], builtinSlug: 'ux' }
const own: ExpertCatalogEntry = { key: 'saved', name: saved.name, description: saved.description, category: 'design', tags: [], examples: [], expert: saved }
const labels: Record<string, string> = zh
function mount(overrides: Partial<ComponentProps<typeof ExpertsPage>> = {}) {
  const catalogue = vi.fn().mockResolvedValue({ entries: [builtin, own], categories: [{ id: 'design', name: '设计', nameEn: 'Design' }] })
  const openExpert = vi.fn().mockResolvedValue(undefined)
  const readBuiltin = vi.fn().mockResolvedValue({ name: builtin.name, description: builtin.description, prompt: '研究用户行为', basePreset: 'standard', sourceSlug: 'ux', sourceRevision: 'abc', category: 'design', examples: builtin.examples })
  const save = vi.fn().mockResolvedValue(saved)
  const props: Partial<ComponentProps<typeof ExpertsPage>> = {
    renderSlot: (_name, _owner, options) => options?.fallback,
    catalogue, openExpert, readBuiltin, save, categoryLabel: item => item.name, presets: vi.fn().mockResolvedValue([{ id: 'standard', name: '标准模式' }, { id: 'expert-old-v1' }]),
    useCatalogue: select => select(0),
    t: (key, values) => Object.entries(values ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), labels[key] ?? key),
    navigation: { title: '团队', mode: 'specialists', labels: { specialists: '专家', experts: '专家团', offices: '办公室', workflows: '工作流' }, selectMode: vi.fn() },
    ...overrides,
  }
  const view = render(<ExpertsPage {...props as ComponentProps<typeof ExpertsPage>} />)
  return { ...view, catalogue, openExpert, readBuiltin, save }
}

it('keeps catalogue and saved experts distinct and filters by use case', async () => {
  await act(async () => { mount() })
  expect(screen.getByRole('heading', { name: builtin.name })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: saved.name })).toBeNull()
  fireEvent.change(screen.getByRole('textbox', { name: zh.search }), { target: { value: 'UX' } })
  expect(screen.getByRole('heading', { name: builtin.name })).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox', { name: zh.search }), { target: { value: '' } })
  fireEvent.click(screen.getByRole('tab', { name: zh.mine }))
  expect(screen.getByRole('heading', { name: saved.name })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: builtin.name })).toBeNull()
})

it('opens the selected expert without sending a message and uses examples as optional drafts', async () => {
  let view!: ReturnType<typeof mount>
  await act(async () => { view = mount() })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '使用体验研究员' })) })
  expect(view.openExpert).toHaveBeenCalledWith(builtin, undefined)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: zh.details })) })
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText(zh.examples)).toBeTruthy()
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: builtin.examples[0]! })) })
  expect(view.openExpert).toHaveBeenLastCalledWith(builtin, builtin.examples[0])
})

it('copies built-in responsibilities without retaining source ownership or editing the original', async () => {
  let view!: ReturnType<typeof mount>
  await act(async () => { view = mount() })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: zh.copy })) })
  expect(screen.getByRole('textbox', { name: zh.name })).toHaveProperty('value', '体验研究员副本')
  expect(screen.getByRole('textbox', { name: zh.prompt })).toHaveProperty('value', '研究用户行为')
  const submit = screen.getByRole<HTMLButtonElement>('button', { name: zh.save })
  await act(async () => { fireEvent.submit(submit.form!) })
  expect(view.save).toHaveBeenCalledWith(expect.objectContaining({ name: '体验研究员副本' }), undefined, undefined)
  const draft = view.save.mock.calls[0]?.[0] as ExpertDraft
  expect(draft.sourceSlug).toBeUndefined()
  expect(draft.sourceRevision).toBeUndefined()
})

it('edits the current saved revision and hides historical presets from new choices', async () => {
  let view!: ReturnType<typeof mount>
  await act(async () => { view = mount() })
  fireEvent.click(screen.getByRole('tab', { name: zh.mine }))
  fireEvent.click(screen.getByRole('button', { name: zh.edit }))
  expect(screen.queryByRole('option', { name: 'expert-old-v1' })).toBeNull()
  fireEvent.change(screen.getByRole('textbox', { name: zh.name }), { target: { value: '新版交互专家' } })
  await act(async () => { fireEvent.submit(screen.getByRole<HTMLButtonElement>('button', { name: zh.save }).form!) })
  expect(view.save).toHaveBeenCalledWith(expect.objectContaining({ name: '新版交互专家' }), 'saved', 2)
})

it('preserves edits after save failure and permits retry', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(saved)
  await act(async () => { mount({ save }) })
  fireEvent.click(screen.getByRole('button', { name: zh.create }))
  fireEvent.change(screen.getByRole('textbox', { name: zh.name }), { target: { value: '测试专家' } })
  fireEvent.change(screen.getByRole('textbox', { name: zh.prompt }), { target: { value: '检查数据' } })
  await act(async () => { fireEvent.submit(screen.getByRole<HTMLButtonElement>('button', { name: zh.save }).form!) })
  expect(screen.getByRole('textbox', { name: zh.name })).toHaveProperty('value', '测试专家')
  expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toBe('offline')
})

it('retains the saved expert and retries capability setup without creating another revision', async () => {
  const commit = vi.fn().mockRejectedValueOnce(new Error('Policy write failed')).mockResolvedValueOnce(undefined)
  const prepare = vi.fn().mockResolvedValue(commit)
  const renderCapabilities = ((_name: string, owner: import('@deepseek-ai/dsh-client-ui-slots').SlotMap['toolbox.expert-capabilities']['owner']) => {
    owner.registerCommit(prepare)
    return null
  }) as ComponentProps<typeof ExpertsPage>['renderSlot']
  let view!: ReturnType<typeof mount>
  await act(async () => { view = mount({ renderSlot: renderCapabilities }) })
  fireEvent.click(screen.getByRole('button', { name: zh.create }))
  fireEvent.change(screen.getByRole('textbox', { name: zh.name }), { target: { value: 'New specialist' } })
  fireEvent.change(screen.getByRole('textbox', { name: zh.prompt }), { target: { value: 'Review documents' } })
  const submit = screen.getByRole<HTMLButtonElement>('button', { name: zh.save })
  await act(async () => { fireEvent.submit(submit.form!) })
  expect(view.save).toHaveBeenCalledOnce()
  expect(screen.getByText(zh.capabilitiesPending)).toBeTruthy()
  expect(screen.getByRole('dialog')).toBeTruthy()
  await act(async () => { fireEvent.submit(submit.form!) })
  expect(view.save).toHaveBeenCalledOnce()
  expect(commit).toHaveBeenCalledTimes(2)
  expect(commit).toHaveBeenLastCalledWith(saved.preset)
  expect(screen.queryByRole('dialog')).toBeNull()
})
