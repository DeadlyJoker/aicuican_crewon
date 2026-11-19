/** Studio's creation card retains the native editor, attachment lifecycle and submit button. */
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  IconChevronDownOutlineRegular, IconCloseOutlineRegular, IconEditOutlineRegular, IconLayersOutlineRegular,
  IconPlusOutlineMedium, IconListPenOutlineRegular, IconPersonalizationOutlineRegular, IconPlayOutlineRegular, IconDeliverDocRegular,
  Button, IconCheckOutlineRegular, IconFolderOpenOutlineRegular, Input, Menu, SegmentedControl, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { createStudioContext, StudioCreationPreferences } from './studio-context.ts'
import css from './StudioEntry.module.css'

type Shared = PropsLocale<'shortDrama'> & InjectFace<{
  hooks: { studio: ReturnType<typeof createStudioContext> }
  overview(this: void): void
  edit(this: void, value: Partial<StudioCreationPreferences>): void
}>
type TitleProps = PropsRuntime<'conversation.hero.title'> & Shared
type EntryProps = PropsRuntime<'conversation.input.header'> & Shared
type OptionsProps = PropsRuntime<'conversation.input.left'> & Shared
type SubmitProps = PropsRuntime<'conversation.input.submit.label'> & Shared

const defaults: StudioCreationPreferences = { category: 'drama', genre: 'auto', mode: 'idea', style: 'auto', ratio: '16:9', episodes: '1' }

function Choice({ label, value, items, icon, disabled, customLabel, confirmLabel, onChange }: {
  label: string
  value: string
  items: { id: string; label: string; icon?: ReactNode }[]
  icon?: ReactNode
  disabled: boolean
  customLabel?: string
  confirmLabel?: string
  onChange(this: void, value: string): void
}) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const valid = /^\d+$/.test(custom) && Number(custom) >= 1 && Number(custom) <= 100
  const applyCustom = () => { if (valid) { onChange(String(Number(custom))); setOpen(false) } }
  const menuClass = items.some(item => item.icon !== undefined) ? css.illustratedMenu : icon === undefined ? '' : css.iconMenu
  return <Menu open={open} onClose={() => { setOpen(false) }} portal autoFocus compact align="start" side="top"
    listClassName={`${css.optionMenu} ${menuClass}`}
    children={customLabel === undefined ? undefined : <div className={css.customCount} onKeyDown={(event) => {
      event.stopPropagation()
      if (event.key === 'Enter') { event.preventDefault(); applyCustom() }
      if (event.key === 'Escape') setOpen(false)
    }}>
      <Input type="number" min={1} max={100} step={1} value={custom} aria-label={customLabel} placeholder={customLabel}
        onChange={(event) => { setCustom(event.target.value) }} />
      <button type="button" aria-label={confirmLabel} disabled={!valid} onClick={applyCustom}><IconCheckOutlineRegular size={14} /></button>
    </div>}
    selectedId={value} items={items} onSelect={(id) => { onChange(id); setOpen(false) }}
    anchor={<button type="button" className={icon === undefined ? `${css.option} ${css.textOption}` : css.option}
      aria-label={label} aria-haspopup="menu" aria-expanded={open}
      disabled={disabled} onClick={() => { setOpen(!open) }}>
      {icon !== undefined && <span className={css.optionIcon}>{icon}</span>}
      <span>{label}</span><IconChevronDownOutlineRegular size={12} /></button>} />
}

/**
 * @param props - Native headline copy and Studio navigation.
 * @returns The Demo's creation heading and category switcher for a new project.
 */
export function StudioEntryTitle({ useStudio, title, badge, className, badgeClassName, edit, overview, t }: TitleProps) {
  const state = useStudio(value => value)
  if (!state.active || state.projectId) return <span className={className}>{title}<span className={badgeClassName}>{badge}</span></span>
  const category = state.creation?.category ?? 'drama'
  return <div className={css.hero}>
    <Tooltip label={t('entryProjects')} side="bottom" portal><Button className={css.library} size="sm" variant="ghost"
      aria-label={t('entryProjects')} onClick={overview}><IconFolderOpenOutlineRegular size={16} /></Button></Tooltip>
    <h1>{t(category === 'drama' ? 'entryDramaHeadline' : category === 'interactive' ? 'entryInteractiveHeadline' : 'entryCreateHeadline')}</h1>
    <SegmentedControl id="studio-create" value={category} label={t('entryCategory')} className={css.categories}
      options={[
        { value: 'create', label: t('entryCreate') }, { value: 'drama', label: t('entryDrama') },
        { value: 'interactive', label: t('entryInteractive') },
      ]} onChange={(value) => { edit({ category: value }) }} />
  </div>
}

/** @param props - Native editor context. @returns Card-attached creation tabs and contextual placeholder without a second text editor. */
export function StudioEntry({ sessionId, useStudio, useInput, inputActions, edit, t }: EntryProps) {
  const state = useStudio(value => value), input = useInput(value => value)
  if (!state.active || state.projectId || state.entrySessionId !== sessionId) return null
  const value = { ...defaults, ...state.creation }, category = value.category ?? 'drama'
  const busy = input.phase !== 'plain'
  const hint = category === 'create' ? 'entryCreateHint' : category === 'interactive' ? 'entryInteractiveHint'
    : value.mode === 'idea' ? 'entryIdeaHint' : value.mode === 'script' ? 'entryScriptHint'
      : value.mode === 'redraw' ? 'entryRedrawHint' : 'entryAdaptHint'
  const style = value.style === 'cinema' ? 'entryCinema' : value.style === 'live' ? 'entryLive' : 'entryAnime'
  return <section className={`${css.entry} ${category !== 'drama' ? css.simple : ''}`} id={`studio-create-${category}-panel`}
    role="tabpanel" aria-labelledby={`studio-create-${category}`}>
    {category === 'drama' && <div className={css.modes} role="group" aria-label={t('entryMode')}>
      {([
        ['idea', 'entryWrite', IconListPenOutlineRegular], ['adapt', 'entryRewrite', IconDeliverDocRegular],
        ['script', 'entryProduce', IconEditOutlineRegular], ['redraw', 'entryRedraw', IconPlayOutlineRegular],
      ] as const).map(([mode, label, Icon]) => <button key={mode} type="button" disabled={busy}
        className={value.mode === mode ? css.selectedMode : ''} aria-pressed={value.mode === mode}
        onClick={() => { edit({ mode }) }}><Icon size={17} /><span>{t(label)}</span></button>)}
    </div>}
    <Tooltip label={t('entryAttach')} side="top" portal><button type="button" className={css.upload}
      disabled={busy} aria-label={t('entryAttach')} onClick={() => { inputActions.pickFiles() }}><IconPlusOutlineMedium size={18} /></button></Tooltip>
    {value.style !== 'auto' && <span className={css.styleChip}>{t(style)}<button type="button" aria-label={t('entryClearStyle')}
      disabled={busy} onClick={() => { edit({ style: 'auto' }) }}><IconCloseOutlineRegular size={12} /></button></span>}
    {input.draft === '' && input.attachmentIds.length === 0 && <span className={css.placeholder} aria-hidden>{t(hint)}</span>}
  </section>
}

/** @param props - Shared native tool row and entry preferences. @returns Compact Demo-style parameter menus inside the creation card. */
export function StudioEntryOptions({ sessionId, useStudio, useInput, edit, t }: OptionsProps) {
  const state = useStudio(value => value), busy = useInput(value => value.phase !== 'plain')
  if (!state.active || state.projectId || state.entrySessionId !== sessionId) return null
  const value = { ...defaults, ...state.creation }, genre = value.genre ?? 'auto'
  const genres = [['auto', 'entryDefaultGenre'], ['life', 'entryLifeGenre'], ['romance', 'entryRomanceGenre'], ['mystery', 'entryMysteryGenre']] as const
  const styles = [['auto', 'entryStyle'], ['cinema', 'entryCinema'], ['live', 'entryLive'], ['anime', 'entryAnime']] as const
  return <div className={css.parameters}>
    <Choice label={t(genres.find(([id]) => id === genre)?.[1] ?? 'entryDefaultGenre')} value={genre} disabled={busy}
      icon={<IconLayersOutlineRegular size={16} />} items={genres.map(([id, label]) => ({ id, label: t(label) }))}
      onChange={(genre) => { edit({ genre }) }} />
    <Choice label={t('entryStyle')} value={value.style} disabled={busy}
      icon={<IconPersonalizationOutlineRegular size={16} />} items={styles.map(([id, label]) => ({ id, label: t(label) }))}
      onChange={(style) => { edit({ style }) }} />
    <Choice label={value.ratio === 'auto' ? t('entryDefaultRatio') : value.ratio} value={value.ratio} disabled={busy} icon={<span className={css.ratioIcon} aria-hidden />}
      items={[
        { id: 'auto', label: t('entryDefaultRatio') }, { id: '9:16', label: t('entryPortraitRatio') },
        { id: '16:9', label: t('entryLandscapeRatio') }, { id: '21:9', label: t('entryCinemaRatio') },
        ...['3:4', '4:3', '1:1'].map(id => ({ id, label: id })),
      ].map(item => ({ ...item, icon: <span className={css.ratioIcon} aria-hidden /> }))} onChange={(ratio) => { edit({ ratio }) }} />
    <Choice label={t('entryEpisodeCount', { count: value.episodes })} value={value.episodes} disabled={busy}
      customLabel={t('entryCustomEpisodes')} confirmLabel={t('entryConfirmEpisodes')}
      items={['1', '5', '10', '30', '60', '80', '100'].map(id => ({ id, label: t('entryEpisodeCount', { count: id.padStart(2, '0') }) }))}
      onChange={(episodes) => { edit({ episodes }) }} />
  </div>
}

/**
 * @param props - Native submit-button context.
 * @returns Entry-specific copy while native admission and keyboard behavior stay unchanged.
 */
export function StudioEntrySubmit({ sessionId, useStudio, t }: SubmitProps) {
  const state = useStudio(value => value)
  return state.active && !state.projectId && state.entrySessionId === sessionId ? <span className={css.submitText}>{t('entryBegin')}</span> : null
}
