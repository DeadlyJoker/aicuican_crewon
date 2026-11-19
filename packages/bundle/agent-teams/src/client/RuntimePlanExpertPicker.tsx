/** Shared expert selection embedded in the upstream runtime plan editor. */
import { useEffect, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ExpertPicker, type ExpertPickerActions } from './ExpertPicker.tsx'

/** Fields the runtime editor can accept without copying a persona into task instructions. */
export interface RuntimeExpertSelection {
  agentPreset: string
  name?: string
  role?: string
  executionPrompt?: string
  provider?: string
  model?: string
}

/** Transient member form state owned by the existing runtime plan card. */
export interface RuntimePlanExpertOwner {
  value: string
  disabled: boolean
  onSelect(this: void, selection: RuntimeExpertSelection): void
  onPendingChange(this: void, pending: boolean): void
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Expert picker inside the upstream execution plan's member form. */
    'agent-teams.staged-expert': { kind: 'single'; scope: 'session'; owner: RuntimePlanExpertOwner }
  }
}

interface Actions {
  expertPicker: ExpertPickerActions
  presets(this: void): Promise<readonly { id: string; name?: string; broken?: string }[]>
}
type Props = RuntimePlanExpertOwner & PropsLocale<'expertTeamTemplates'> & Actions

/**
 * Reuse the team-wide picker while leaving draft and mutation ownership in the runtime card.
 * @param props - Current preset, transient selection callbacks and native preset catalogue.
 * @returns The same searchable selector used by saved teams, workflows and offices.
 */
export function RuntimePlanExpertPicker({ value, disabled, onSelect, onPendingChange, expertPicker, presets, t }: Props) {
  const [available, setAvailable] = useState<Awaited<ReturnType<Actions['presets']>>>([])
  useEffect(() => {
    let active = true
    void presets().then((items) => { if (active) setAvailable(items) }, () => {
      // Catalogue search still provides expert selection if the native preset list is unavailable.
    })
    return () => { active = false }
  }, [presets])
  return <ExpertPicker label={t('chooseExpert')} value={value} emptyLabel={t('customRole')}
    disabled={disabled} actions={expertPicker} presets={available} onPendingChange={onPendingChange}
    onChange={(selection) => {
      const expert = selection?.expert
      const responsibilities = expert?.description || expert?.name
      onSelect({ agentPreset: selection?.preset ?? '',
        ...(expert ? { name: expert.name } : {}),
        ...(responsibilities ? { role: responsibilities, executionPrompt: responsibilities } : {}),
        ...(expert?.provider && expert.model ? { provider: expert.provider, model: expert.model } : {}) })
    }} />
}
