/** Load and edit the current workflow over its owning conversation. */
import { useEffect, useRef, useState } from 'react'
import { Button, Modal, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkflowDefinition, WorkflowDraft } from '../workflow-types.ts'
import { WorkflowEditor } from './WorkflowEditor.tsx'
import { editableWorkflowSteps } from './workflow-editing.ts'
import type { ExpertPickerActions } from './ExpertPicker.tsx'
import css from './WorkflowEditDialog.module.css'

/** Existing workflow configuration operations used by both editing entry points. */
export interface WorkflowEditActions {
  expertPicker?: ExpertPickerActions
  read(this: void, workflowId: string): Promise<WorkflowDefinition | null>
  presets(this: void): Promise<readonly { id: string; name?: string; broken?: string }[]>
  save(this: void, workflowId: string, draft: WorkflowDraft): Promise<void>
  text: TranslateNS<'teamWorkflow'>
}

/**
 * Keep a draft independent of the current run and save only to its captured definition.
 * @param props - Current workflow identity, configuration operations and dismissal.
 * @returns The shared workflow editor or its loading and failure dialog.
 */
export function WorkflowEditDialog({ workflowId, actions, close }: {
  workflowId: string
  actions: WorkflowEditActions
  close: () => void
}) {
  const [draft, setDraft] = useState<WorkflowDraft>()
  const [presets, setPresets] = useState<Awaited<ReturnType<WorkflowEditActions['presets']>>>([])
  const [presetFailed, setPresetFailed] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [missing, setMissing] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const locked = useRef(false)
  const alive = useRef(true)
  const t = actions.text
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  useEffect(() => {
    let active = true
    setLoadFailed(false)
    setMissing(false)
    void Promise.allSettled([actions.read(workflowId), actions.presets()]).then(([definition, available]) => {
      if (!active) return
      if (definition.status === 'rejected') { setLoadFailed(true); return }
      if (!definition.value) { setMissing(true); return }
      const { id: _id, ...fields } = definition.value
      setDraft({ ...fields, steps: editableWorkflowSteps(fields, t) })
      setPresets(available.status === 'fulfilled' ? available.value : [])
      setPresetFailed(available.status === 'rejected')
    })
    return () => { active = false }
  }, [actions, workflowId, attempt, t])
  const save = async () => {
    if (!draft || locked.current) return
    locked.current = true
    setBusy(true)
    setSaveFailed(false)
    try {
      await actions.save(workflowId, draft)
      if (alive.current) close()
    } catch {
      if (alive.current) setSaveFailed(true)
    } finally {
      locked.current = false
      if (alive.current) setBusy(false)
    }
  }
  if (draft) return <WorkflowEditor draft={draft} editing busy={busy} failed={saveFailed}
    presetsFailed={presetFailed} presets={presets} {...actions.expertPicker ? { expertPicker: actions.expertPicker } : {}}
    t={t} change={setDraft}
    save={() => { void save() }} close={close} />
  return <Modal open title={t('edit')} closeLabel={t('cancel')} onClose={close} className={css.dialog ?? ''}>
    {missing ? <p role="alert">{t('managementMissing')}</p> : loadFailed ? <div className={css.failure} role="alert">
      <p>{t('failure')}</p><Button size="sm" onClick={() => { setAttempt(value => value + 1) }}>{t('retry')}</Button>
    </div> : <div className={css.loading} role="status" aria-label={t('loading')}><StateDot state="ongoing" size={20} /></div>}
  </Modal>
}
