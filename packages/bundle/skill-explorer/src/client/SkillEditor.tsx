/** Revision-fenced definition editing and bounded directory/archive import forms. */
import { useId, useRef, useState } from 'react'
import { Button, Input, Modal, fileSizeText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ImportReport, SkillDocument, SkillDraft, SkillScope } from '../types.ts'
import type { SkillExplorerActions } from './actions.ts'
import type {} from './locales.ts'
import css from './SkillsPage.module.css'

/** A new definition or one read with its current file revision. */
export interface SkillEditState {
  draft: SkillDraft
  scope: SkillScope
  document?: SkillDocument
}

/**
 * Edit a definition without changing its original file identity.
 * @param props - Captured definition, file operations and dialog callbacks.
 * @returns The definition editor dialog.
 */
export function SkillEditor({ state, actions, onSaved, onClose, t }: {
  state: SkillEditState
  actions: Pick<SkillExplorerActions, 'create' | 'update'>
  onSaved(this: void): Promise<void>
  onClose(this: void): void
} & PropsLocale<'skillExplorer'>) {
  const formId = useId()
  const [draft, setDraft] = useState(state.draft)
  const [destination, setDestination] = useState<'user' | 'project'>(state.scope.workspaceId ? 'project' : 'user')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const locked = useRef(false)
  const valid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.name) && draft.description.trim() && draft.content.trim()
  const save = async () => {
    if (!valid || locked.current) return
    locked.current = true
    setBusy(true)
    setError(false)
    try {
      if (state.document) {
        await actions.update({ ...state.scope, name: state.document.name, path: state.document.path,
          revision: state.document.revision, draft })
      } else await actions.create({ ...state.scope, scope: destination, draft })
      await onSaved()
      onClose()
    } catch {
      setError(true)
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  return <Modal open title={t(state.document ? 'edit' : 'newSkill')} closeLabel={t('cancel')}
    className={css.modal ?? ''} onClose={() => { if (!busy) onClose() }}
    footer={<div className={css.footer}>
      <Button disabled={busy} onClick={onClose}>{t('cancel')}</Button>
      <Button form={formId} type="submit" variant="primary" disabled={busy || !valid}>{t('save')}</Button>
    </div>}>
    <form id={formId} className={css.form} onSubmit={(event) => { event.preventDefault(); void save() }}>
      <label>{t('name')}<Input required aria-label={t('name')} aria-describedby={`${formId}-name-hint`}
        value={draft.name} disabled={busy || Boolean(state.document)}
        onChange={(event) => { setDraft({ ...draft, name: event.target.value }) }} />
      <small id={`${formId}-name-hint`}>{t('nameHint')}</small></label>
      {!state.document && <label>{t('location')}<select value={destination} disabled={busy}
        onChange={(event) => { setDestination(event.target.value === 'project' ? 'project' : 'user') }}>
        <option value="user">{t('userLocation')}</option>
        <option value="project" disabled={!state.scope.workspaceId}>{t('projectLocation')}</option>
      </select></label>}
      <label>{t('description')}<Input required value={draft.description} disabled={busy}
        onChange={(event) => { setDraft({ ...draft, description: event.target.value }) }} /></label>
      <label>{t('whenToUse')}<Input value={draft.whenToUse ?? ''} disabled={busy}
        onChange={(event) => { setDraft({ ...draft, whenToUse: event.target.value }) }} /></label>
      <label>{t('instructions')}<textarea required rows={12} value={draft.content} disabled={busy}
        onChange={(event) => { setDraft({ ...draft, content: event.target.value }) }} /></label>
      {error && <p className={css.error} role="alert">{t('failure')}</p>}
    </form>
  </Modal>
}

/**
 * Import source definitions while preserving the destination and report on failure.
 * @param props - Captured workspace, importer and dialog callbacks.
 * @returns The directory or ZIP import dialog.
 */
export function SkillImportDialog({ scope, importLimitBytes, importSkills, onImported, onClose, t }: {
  scope: SkillScope
  importLimitBytes: number
  importSkills: SkillExplorerActions['importSkills']
  onImported(this: void): Promise<void>
  onClose(this: void): void
} & PropsLocale<'skillExplorer'>) {
  const formId = useId()
  const [source, setSource] = useState<'directory' | 'archive'>('archive')
  const [destination, setDestination] = useState<'user' | 'project'>(scope.workspaceId ? 'project' : 'user')
  const [directory, setDirectory] = useState('')
  const [archive, setArchive] = useState<File>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'failure' | 'archiveTooLarge'>()
  const [report, setReport] = useState<ImportReport>()
  const locked = useRef(false)
  const valid = source === 'directory' ? Boolean(directory.trim()) : archive !== undefined
  const submit = async () => {
    if (!valid || locked.current) return
    if (source === 'archive' && archive && archive.size > importLimitBytes) { setError('archiveTooLarge'); return }
    locked.current = true
    setBusy(true)
    setError(undefined)
    try {
      let input: { kind: 'directory'; path: string } | { kind: 'archive'; data: string }
      if (source === 'archive' && archive) {
        const bytes = new Uint8Array(await archive.arrayBuffer())
        let binary = ''
        for (let index = 0; index < bytes.length; index += 8192) {
          binary += String.fromCharCode(...bytes.subarray(index, index + 8192))
        }
        input = { kind: 'archive', data: btoa(binary) }
      } else input = { kind: 'directory', path: directory.trim() }
      setReport(await importSkills({ ...scope, scope: destination, source: input }))
      await onImported()
    } catch {
      setError('failure')
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  return <Modal open title={t('importSkills')} closeLabel={t('close')} className={css.modal ?? ''}
    onClose={() => { if (!busy) onClose() }} footer={<div className={css.footer}>
      <Button disabled={busy} onClick={onClose}>{t('close')}</Button>
      <Button form={formId} type="submit" variant="primary" disabled={busy || !valid}>{t('importing')}</Button>
    </div>}>
    <form id={formId} className={css.form} onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <label>{t('location')}<select value={destination} disabled={busy}
        onChange={(event) => { setDestination(event.target.value === 'project' ? 'project' : 'user') }}>
        <option value="user">{t('userLocation')}</option>
        <option value="project" disabled={!scope.workspaceId}>{t('projectLocation')}</option>
      </select></label>
      <label>{t('importSource')}<select value={source} disabled={busy}
        onChange={(event) => { setSource(event.target.value === 'directory' ? 'directory' : 'archive') }}>
        <option value="archive">{t('archive')}</option><option value="directory">{t('directory')}</option>
      </select></label>
      {source === 'archive'
        ? <label>{t('archiveFile')}<input type="file" accept=".zip,application/zip" disabled={busy}
          onChange={(event) => { setArchive(event.target.files?.[0]); setReport(undefined) }} /></label>
        : <label>{t('directoryPath')}<Input required value={directory} disabled={busy}
          onChange={(event) => { setDirectory(event.target.value); setReport(undefined) }} /></label>}
      <small>{t('importHint')}</small>
      {error && <p className={css.error} role="alert">{t(error, { limit: fileSizeText(importLimitBytes) })}</p>}
      {report && <section aria-label={t('importResult')}><p>{t('imported')} {report.imported} · {t('skipped')} {report.skipped}</p>
        <ul className={css.report}>{report.outcomes.map(item => <li key={item.origin}>
          <span>{item.name}</span><span>{t(item.status === 'imported' ? 'imported' : 'skipped')}</span>
        </li>)}</ul>
      </section>}
    </form>
  </Modal>
}
