// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RuntimePlanExpertPicker } from '../src/client/RuntimePlanExpertPicker.tsx'
import { zh } from '../src/client/locales.ts'
import { zh as expertText } from '../src/client/expert-copy.ts'
import type { ExpertDefinition } from '../src/expert-types.ts'

afterEach(cleanup)

it('selects a bundled expert by immutable preset and passes only its short responsibilities and explicit model', async () => {
  const expert: ExpertDefinition = { id: 'reviewer', revision: 2, preset: 'expert-reviewer-v2', name: '审查专家',
    description: '核对代码与证据', prompt: 'Long professional instructions. '.repeat(500), basePreset: 'standard',
    provider: 'provider', model: 'model' }
  const onSelect = vi.fn()
  const onPendingChange = vi.fn()
  const activate = vi.fn().mockResolvedValue(expert)
  render(<RuntimePlanExpertPicker value="" disabled={false} onSelect={onSelect} onPendingChange={onPendingChange}
    t={key => zh[key as keyof typeof zh] ?? key} presets={async () => []} expertPicker={{ categoryLabel: category => category.name,
      text: expertText, activate, catalogue: async () => ({ categories: [], entries: [{
        key: 'builtin:review', builtinSlug: 'engineering/review', name: expert.name,
        description: expert.description, category: 'engineering', tags: [], examples: [],
      }] }) }} />)
  fireEvent.click(screen.getByRole('button', { name: '选用专家' }))
  const choice = await screen.findByRole('menuitem', { name: /审查专家/ })
  await act(async () => { fireEvent.click(choice) })
  expect(activate).toHaveBeenCalledExactlyOnceWith('engineering/review')
  expect(onSelect).toHaveBeenCalledExactlyOnceWith({ agentPreset: expert.preset, name: expert.name,
    role: expert.description, executionPrompt: expert.description, provider: 'provider', model: 'model' })
  expect(onPendingChange).toHaveBeenLastCalledWith(false)
})
