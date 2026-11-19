import { expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ExpertCatalogEntry } from '../src/expert-types.ts'
import { createExpertReferenceSource, filterExpertEntries } from '../src/client/expert-reference.ts'

const expert: ExpertCatalogEntry = {
  key: 'custom-ux', name: '体验研究员', description: '检查注册流程', category: 'design', tags: ['UX', 'user research'], examples: ['分析首次注册体验'],
  expert: { id: 'ux', name: '体验研究员', description: '检查注册流程', prompt: '独立核查体验', basePreset: 'standard', preset: 'expert-ux-v3', revision: 3 },
}
const builtin: ExpertCatalogEntry = { key: 'builtin-security', builtinSlug: 'security', name: '安全专家', description: '审查权限', category: 'engineering', tags: ['security'], examples: [] }

it('searches names, descriptions, English tags and examples within the selected category', () => {
  expect(filterExpertEntries([expert, builtin], 'ｕｘ 注册', 'design')).toEqual([expert])
  expect(filterExpertEntries([expert, builtin], '首次', '')).toEqual([expert])
  expect(filterExpertEntries([expert, builtin], 'UX', 'engineering')).toEqual([])
})

it('labels @ picks as opening a new conversation and retains the selected immutable revision', async () => {
  const open = vi.fn()
  const source = createExpertReferenceSource(async () => ({ entries: [expert, builtin] }), () => '专家', () => '新对话', open)
  const session = { sessionId: SessionId('original') }
  const signal = new AbortController().signal
  const candidates = await source.candidates(session, { query: 'UX', position: 'inline', drilled: false, signal })
  expect(candidates).toHaveLength(1)
  expect(candidates[0]).toMatchObject({ section: '专家', hint: '新对话', value: 'custom-ux:3' })
  const span = { start: 4, end: 7, draftRev: 9 }
  const outcome = source.onPick({ session, candidate: candidates[0]!, position: 'inline', via: 'menu', action: 'pick', span })
  expect(outcome).toBe('handled')
  expect(open).toHaveBeenCalledWith(expert, { sessionId: session.sessionId, span })
  expect(source.codec).toBeUndefined()
})

it('does not open unknown picks or complete superseded catalog requests', async () => {
  const open = vi.fn()
  const source = createExpertReferenceSource(async () => ({ entries: [expert] }), () => '专家', () => '新对话', open)
  expect(source.onPick({ session: { sessionId: SessionId('original') }, candidate: { name: 'missing', value: 'missing' },
    position: 'leading', via: 'menu', action: 'pick', span: { start: 0, end: 1, draftRev: 1 } })).toBeUndefined()
  const controller = new AbortController()
  controller.abort()
  await expect(source.candidates({ sessionId: SessionId('original') }, { query: '', position: 'leading', drilled: false, signal: controller.signal })).rejects.toThrow()
  expect(open).not.toHaveBeenCalled()
})


it('limits the default menu and search results while putting saved experts first', async () => {
  const entries = Array.from({ length: 45 }, (_, index) => ({ ...builtin, key: `builtin-${index}`, name: `安全专家 ${index}` }))
  const source = createExpertReferenceSource(async () => ({ entries: [...entries, expert] }), () => '专家', () => '搜索更多', vi.fn())
  const request = { query: '', position: 'leading' as const, drilled: false, signal: new AbortController().signal }
  const rows = await source.candidates({ sessionId: SessionId('original') }, request)
  expect(rows).toHaveLength(20)
  expect(rows[0]?.name).toBe(expert.name)
  expect(await source.candidates({ sessionId: SessionId('original') }, { ...request, query: '安全' })).toHaveLength(40)
})


it('matches short English terms as complete words instead of substrings in unrelated prose', () => {
  const misleading = { ...builtin, key: 'builder', name: 'Builder', description: 'Build required interfaces and maintain reliable systems', tags: ['architecture'], examples: ['Explain a building plan'] }
  const ui = { ...builtin, key: 'ui', name: '界面设计师', description: '界面设计', tags: ['UI/UX design'], examples: ['Review UI components'] }
  const ai = { ...builtin, key: 'ai', name: 'AI 工程师', description: 'AI-powered tools', tags: ['machine learning'], examples: [] }
  expect(filterExpertEntries([misleading, ui, ai], 'UI', '')).toEqual([ui])
  expect(filterExpertEntries([misleading, ui, ai], 'AI', '')).toEqual([ai])
  expect(filterExpertEntries([misleading, ui, ai], 'UI design', '')).toEqual([ui])
  expect(filterExpertEntries([misleading, ui, ai], 'UI architecture', '')).toEqual([])
  expect(filterExpertEntries([misleading, ui, ai], 'build', '')).toEqual([misleading])
  expect(filterExpertEntries([misleading, ui, ai], '设计', '')).toEqual([ui])
})
