/** Compact reusable appearance editor; previews are temporary until a Host write succeeds. */
import { useEffect, useRef, useState } from 'react'
import { Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { newAppearancePreset, type AppearanceLibrary, type AppearancePreset } from '../appearance-settings.ts'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { AppearanceRowInjected } from './AppearanceRow.tsx'
import css from './AppearanceLibrary.module.css'

type Props = PropsLocale<'settings.theme'> & Pick<AppearanceRowInjected, 'saveAppearance' | 'previewAppearance'> & { library: AppearanceLibrary }

/**
 * Render preset selection and an inline editor using Host theme controls.
 * @param props Accepted collection, temporary preview and persistence actions.
 * @returns The collection and optional editor.
 */
export function AppearanceLibraryEditor({ library, t, saveAppearance, previewAppearance }: Props) {
  const [editing, setEditing] = useState<{ original: string; expected: string; draft: AppearancePreset }>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const uploadGeneration = useRef(0)
  useEffect(() => () => { uploadGeneration.current++; previewAppearance() }, [previewAppearance])
  const explain = (error: unknown): string => {
    const code = error instanceof Error ? error.message : ''
    switch (code) {
      case 'appearance.duplicate': return t('appearance.duplicate')
      case 'appearance.contrast': return t('appearance.contrastError')
      case 'appearance.conflict': return t('appearance.conflict')
      case 'appearance.imageRequired': return t('appearance.imageRequired')
      case 'appearance.missing': return t('appearance.missing')
      default: return t('appearance.failed')
    }
  }
  const commit = async (next: AppearanceLibrary, expected = JSON.stringify(library)): Promise<void> => {
    if (busy) return
    setBusy(true); setNotice('')
    try {
      if (!await saveAppearance(next, expected)) { setNotice(t('appearance.failed')); return }
      setEditing(undefined); setPreviewing(false); setNotice(t('appearance.saved')); setConfirmDelete(false)
    } catch (error) { setNotice(explain(error)) }
    finally { setBusy(false) }
  }
  const open = (preset?: AppearancePreset): void => {
    uploadGeneration.current++
    previewAppearance(); setPreviewing(false); setNotice(''); setConfirmDelete(false)
    let name = t('appearance.newName'), suffix = 1
    while (library.presets.some(p => p.name === name)) name = `${t('appearance.newName')} ${++suffix}`
    setEditing({ original: preset?.name ?? '', expected: JSON.stringify(library), draft: structuredClone(preset ?? newAppearancePreset(name)) })
  }
  const update = (draft: AppearancePreset): void => {
    if (!editing) return
    setEditing({ ...editing, draft }); setNotice('')
    if (previewing) {
      try { previewAppearance(draft) } catch (error) { setNotice(explain(error)) }
    }
  }
  const draft = editing?.draft
  return <section className={css.section}>
    <div className={css.heading}><div><div>{t('appearance.presets')}</div><p>{t('appearance.hint')}</p></div>
      <button type="button" className={css.button} disabled={busy || library.presets.length >= 24} onClick={() => { open() }}>{t('appearance.new')}</button></div>
    <div className={css.grid}>
      <button type="button" className={css.card} aria-pressed={!library.active} disabled={busy} onClick={() => { previewAppearance(); void commit({ ...library, active: '' }) }}>
        <span className={css.sample}><i /><i /><i /></span><span>{t('appearance.default')}</span>{!library.active && <small>{t('appearance.active')}</small>}
      </button>
      {library.presets.map(preset => <div className={css.card} data-active={preset.name === library.active || undefined} key={preset.name}>
        <button type="button" className={css.pick} disabled={busy} aria-label={`${t('appearance.apply')} ${preset.name}`} aria-pressed={preset.name === library.active} onClick={() => { previewAppearance(); void commit({ ...library, active: preset.name }) }}>
          <span className={css.sample} style={{ background: preset.light.background }}>
            <i style={{ background: preset.light.accent }} /><i style={{ background: preset.dark.background }} />
            <i style={{ background: preset.dark.accent }} />
          </span>
          <span>{preset.name}</span>{preset.name === library.active && <small>{t('appearance.active')}</small>}
        </button><button type="button" className={css.edit} disabled={busy} aria-label={`${t('appearance.edit')} ${preset.name}`} onClick={() => { open(preset) }}>{t('appearance.edit')}</button>
      </div>)}
    </div>
    {draft && <div className={css.editor}>
      <label className={css.name}>{t('appearance.name')}<Input value={draft.name} maxLength={60} onChange={(event) => { update({ ...draft, name: event.currentTarget.value }) }} /></label>
      <div className={css.palettes}>{(['light', 'dark'] as const).map(mode => <fieldset key={mode}><legend>{t(`appearance.${mode}Palette`)}</legend>
        {(['accent', 'background', 'foreground'] as const).map(field => <label className={css.color} key={field}><span>{t(`appearance.${field}`)}</span><input type="color" aria-label={`${t(`appearance.${mode}Palette`)} · ${t(`appearance.${field}`)}`} value={draft[mode][field]} onInput={(event) => { update({ ...draft, [mode]: { ...draft[mode], [field]: event.currentTarget.value } }) }} /><input className={css.hex} aria-label={`${t(`appearance.${mode}Palette`)} · ${t(`appearance.${field}`)} · ${t('appearance.hex')}`} key={`${mode}-${field}-${draft[mode][field]}`} defaultValue={draft[mode][field]} maxLength={7} spellCheck={false} onBlur={(event) => { const value = event.currentTarget.value; if (/^#[0-9a-f]{6}$/iu.test(value)) update({ ...draft, [mode]: { ...draft[mode], [field]: value } }); else event.currentTarget.value = draft[mode][field] }} /></label>)}
        <label className={css.range}>{t('appearance.contrast')}<input type="range" min={0} max={100} value={draft[mode].contrast} onChange={(event) => { update({ ...draft, [mode]: { ...draft[mode], contrast: Number(event.currentTarget.value) } }) }} /><output>{draft[mode].contrast}</output></label>
      </fieldset>)}</div>
      <div className={css.background}><span>{t('appearance.wallpaper')}</span><div className={css.segment}>{(draft.background.image ? ['none', 'gradient', 'image'] as const : ['none', 'gradient'] as const).map(kind => <button type="button" aria-pressed={draft.background.kind === kind} key={kind} onClick={() => { update({ ...draft, background: { ...draft.background, kind } }) }}>{t(`appearance.${kind}`)}</button>)}</div>
        {draft.background.kind === 'gradient' && <input type="color" aria-label={t('appearance.wallpaper')} value={draft.background.color} onInput={(event) => { update({ ...draft, background: { ...draft.background, color: event.currentTarget.value } }) }} />}
        {draft.background.kind === 'image' && <p className={css.hint}>{t('wallpaper.hint')}</p>}
        {draft.background.kind !== 'none' && <>
          <div className={css.wallpaperPreview} style={{ backgroundColor: draft.light.background, backgroundImage: draft.background.kind === 'image' ? `url("${draft.background.image}")` : `linear-gradient(125deg, ${draft.background.color}, ${draft.light.accent})` }} />
          {(['opacity', 'blur'] as const).map(field => <label className={css.range} key={field}>{t(`appearance.${field}`)}<input type="range" min={0} max={field === 'opacity' ? 40 : 24} value={draft.background[field]} onChange={(event) => { update({ ...draft, background: { ...draft.background, [field]: Number(event.currentTarget.value) } }) }} /><output>{draft.background[field]}{field === 'opacity' ? '%' : t('fontSize.unit')}</output></label>)}
        </>}
      </div>
      <div className={css.actions}>
        {editing.original && <button type="button" className={css.delete} disabled={busy} onClick={() => {
          if (!confirmDelete) { setConfirmDelete(true); return }
          const presets = library.presets.filter(preset => preset.name !== editing.original)
          void commit({ ...library, presets, active: library.active === editing.original ? '' : library.active }, editing.expected)
        }}>{t(confirmDelete ? 'appearance.removeConfirm' : 'appearance.remove')}</button>}
        <button type="button" className={css.button} disabled={busy} onClick={() => { uploadGeneration.current++; previewAppearance(); setEditing(undefined); setPreviewing(false); setNotice('') }}>{t('appearance.cancel')}</button>
        <button type="button" className={css.button} disabled={busy} onClick={() => { try { previewAppearance(draft); setPreviewing(true); setNotice('') } catch (error) { setNotice(explain(error)) } }}>{t('appearance.preview')}</button>
        <button type="button" className={`${css.button} ${css.primary}`} disabled={busy} onClick={() => {
          const name = draft.name.trim()
          if (library.presets.some(p => p.name === name && p.name !== editing.original)) { setNotice(t('appearance.duplicate')); return }
          const presets = editing.original
            ? library.presets.map(p => p.name === editing.original ? { ...draft, name } : p)
            : [...library.presets, { ...draft, name }]
          void commit({ ...library, version: 1, active: name, presets }, editing.expected)
        }}>{t('appearance.save')}</button>
      </div>
      {previewing && <p className={css.hint}>{t('appearance.previewing')}</p>}
    </div>}
    {notice && <p role="status" className={css.hint}>{notice}</p>}
  </section>
}
