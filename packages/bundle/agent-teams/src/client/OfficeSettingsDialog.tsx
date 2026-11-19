/** Edit the current office without changing its conversation. */
import { useEffect, useRef, useState } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { Office, OfficeUpdate } from '../office-types.ts'
import { OfficeEditor, officeUpdateFrom } from './OfficeEditor.tsx'
import type { ExpertPickerActions } from './ExpertPicker.tsx'

/** Existing office settings operation and localized form copy. */
export interface OfficeSettingsActions {
  save(this: void, officeId: Office['id'], draft: OfficeUpdate): Promise<void>
  presets(this: void): Promise<readonly { id: string; name?: string; broken?: string }[]>
  text: TranslateNS<'teamOffice'>
  expertPicker?: ExpertPickerActions
}

/**
 * Keep edits until this office's save succeeds or the user dismisses them.
 * @param props - Captured office, settings operation and completion callbacks.
 * @returns The same office form used by the Teams page.
 */
export function OfficeSettingsDialog({ office, actions, close, saved }: {
  office: Office
  actions: OfficeSettingsActions
  close: () => void
  saved: () => void
}) {
  const [draft, setDraft] = useState(() => officeUpdateFrom(office))
  const [presets, setPresets] = useState<Awaited<ReturnType<OfficeSettingsActions['presets']>>>([])
  const [presetsFailed, setPresetsFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const locked = useRef(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  useEffect(() => {
    let active = true
    void actions.presets().then((value) => { if (active) setPresets(value) }, () => { if (active) setPresetsFailed(true) })
    return () => { active = false }
  }, [actions])
  const save = async () => {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setFailed(false)
    try {
      await actions.save(office.id, draft)
      if (alive.current) saved()
    } catch {
      if (alive.current) setFailed(true)
    } finally {
      locked.current = false
      if (alive.current) setBusy(false)
    }
  }
  return <OfficeEditor draft={draft} change={setDraft} presets={presets} presetsFailed={presetsFailed}
    {...(actions.expertPicker ? { expertPicker: actions.expertPicker } : {})}
    editing busy={busy} failed={failed} save={() => { void save() }} close={close} t={actions.text} />
}
