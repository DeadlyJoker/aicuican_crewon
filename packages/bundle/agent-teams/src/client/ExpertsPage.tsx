/** Discover and configure reusable experts backed by native Agent presets. */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  Button, Input, MarkdownText, Modal, SegmentedControl, Tooltip,
  IconCopyOutlineRegular, IconInfoOutlineRegular, IconPlayOutlineRegular, IconSettingsOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { ExpertCatalogEntry, ExpertCategory, ExpertDefinition, ExpertDraft } from '../expert-types.ts'
import type { AgentPresetRow } from '@deepseek-ai/dsh-agent-preset-registry/types'
import type { CatalogueFace } from './catalogue.ts'
import type { TeamModeProps } from './TeamHub.tsx'
import { TeamPageHeader } from './TeamPageHeader.tsx'
import { AgentAvatar } from './TeamCard.tsx'
import { filterExpertEntries } from './expert-reference.ts'
import css from './ExpertsPage.module.css'
import type {} from './expert-copy.ts'
import type { CapabilityCommit } from '@deepseek-ai/dsh-skill-explorer-bundle/client'

interface Actions {
  catalogue(this: void): Promise<{ entries: ExpertCatalogEntry[]; categories: ExpertCategory[] }>
  readBuiltin(this: void, slug: string): Promise<ExpertDraft>
  categoryLabel(this: void, category: ExpertCategory): string
  openExpert(this: void, entry: ExpertCatalogEntry, prompt?: string): Promise<void>
  presets(this: void): Promise<readonly AgentPresetRow[]>
  save(this: void, input: ExpertDraft, id?: string, revision?: number): Promise<ExpertDefinition>
}
type Props = TeamModeProps & PropsLocale<'teamExperts'> & PropsRenderSlots<'toolbox.expert-capabilities'> & InjectFace<Actions & CatalogueFace>
type Library = Awaited<ReturnType<Actions['catalogue']>>

function editableExpert({ id: _id, revision: _revision, preset: _preset, ...draft }: ExpertDefinition): ExpertDraft {
  return draft
}

/** @param props - Catalogue operations and team navigation. @returns The expert library and editor. */
export function ExpertsPage({ navigation, catalogue, readBuiltin, categoryLabel, openExpert, presets, save,
  useCatalogue, renderSlot, t }: Props) {
  const revision = useCatalogue(value => value)
  const [library, setLibrary] = useState<Library>()
  const [bases, setBases] = useState<readonly AgentPresetRow[]>([])
  const [source, setSource] = useState<'builtin' | 'mine'>('builtin')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [draft, setDraft] = useState<ExpertDraft>()
  const [capabilitySource, setCapabilitySource] = useState<string>()
  const [editing, setEditing] = useState<ExpertDefinition>()
  const [detail, setDetail] = useState<{ entry: ExpertCatalogEntry; draft: ExpertDraft }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const capabilityCommit = useRef<CapabilityCommit>()
  const pendingSave = useRef<{ draft: ExpertDraft; expert: ExpertDefinition }>()
  const [capabilityPending, setCapabilityPending] = useState(false)
  const registerCommit = useCallback((commit: CapabilityCommit) => {
    capabilityCommit.current = commit
    return () => { if (capabilityCommit.current === commit) capabilityCommit.current = undefined }
  }, [])
  const locked = useRef(false)
  const alive = useRef(true)
  const form = useId()
  const tabs = useId()
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    let active = true
    void Promise.all([catalogue(), presets()]).then(([data, options]) => {
      if (active) { setLibrary(data); setBases(options.filter(item => !item.id.startsWith('expert-'))); setError('') }
    }, () => { if (active) setError(t('loadFailed')) })
    return () => { active = false }
  }, [catalogue, presets, revision, retry, t])
  const run = async (operation: () => Promise<void>) => {
    if (locked.current) return
    locked.current = true; setBusy(true); setError('')
    try { await operation() }
    catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : t('operationFailed')) }
    finally { locked.current = false; if (alive.current) setBusy(false) }
  }
  const entryDraft = async (entry: ExpertCatalogEntry): Promise<ExpertDraft> => {
    if (entry.expert) return editableExpert(entry.expert)
    if (entry.builtinSlug) return readBuiltin(entry.builtinSlug)
    throw new Error(t('unavailable'))
  }
  const edit = (expert?: ExpertDefinition) => {
    pendingSave.current = undefined; setCapabilityPending(false)
    setCapabilitySource(expert?.preset)
    setEditing(expert); setError(''); setDetail(undefined)
    setDraft(expert ? editableExpert(expert) : { name: '', description: '', prompt: '', basePreset: 'standard' })
  }
  const duplicate = (entry: ExpertCatalogEntry) => run(async () => {
    const value = await entryDraft(entry)
    if (!alive.current) return
    const { sourceSlug: _slug, sourceRevision: _revision, ...fields } = value
    pendingSave.current = undefined; setCapabilityPending(false)
    setCapabilitySource(entry.expert?.preset)
    setEditing(undefined); setDetail(undefined); setDraft({ ...fields, name: t('copyName', { name: value.name }) })
  })
  const inspect = (entry: ExpertCatalogEntry) => run(async () => {
    const value = await entryDraft(entry)
    if (alive.current) setDetail({ entry, draft: value })
  })
  const open = (entry: ExpertCatalogEntry, prompt?: string) => run(async () => {
    await openExpert(entry, prompt)
    if (alive.current) setDetail(undefined)
  })
  const valid = Boolean(draft?.name.trim() && draft.prompt.trim() && draft.basePreset.trim())
  const submit = () => run(async () => {
    if (!draft || !valid) return
    const commit = await capabilityCommit.current?.()
    const prior = pendingSave.current?.expert ?? editing
    const result = pendingSave.current?.draft === draft ? pendingSave.current.expert : await save(draft, prior?.id, prior?.revision)
    pendingSave.current = { draft, expert: result }
    setCapabilityPending(true)
    await commit?.(result.preset)
    setCapabilityPending(false)
    const updated = await catalogue()
    if (!alive.current) return
    pendingSave.current = undefined
    setLibrary(updated)
    setDraft(undefined); setSource('mine')
    setEditing(result)
  })
  const entries = library?.entries.filter(entry => source === 'builtin' ? entry.builtinSlug !== undefined : entry.expert !== undefined) ?? []
  const visible = filterExpertEntries(entries, query, category)
  const categoryName = (id: string) => {
    const category = library?.categories.find(item => item.id === id)
    return category === undefined ? id : categoryLabel(category)
  }
  return <>
    <TeamPageHeader navigation={navigation} create={{ label: t('create'), disabled: busy, onClick: () => { edit() } }} />
    <div className={css.toolbar}>
      <SegmentedControl id={tabs} label={t('source')} value={source} onChange={setSource}
        options={[{ value: 'builtin', label: t('builtin') }, { value: 'mine', label: t('mine') }]} />
      <div className={css.filters}>
        <Input aria-label={t('search')} placeholder={t('search')} value={query} onChange={(event) => { setQuery(event.target.value) }} />
        <select aria-label={t('category')} value={category} onChange={(event) => { setCategory(event.target.value) }}>
          <option value="">{t('allCategories')}</option>
          {library?.categories.map(item => <option key={item.id} value={item.id}>{categoryLabel(item)}</option>)}
        </select>
      </div>
    </div>
    {error && <div className={css.error} role="alert">{error}{!library && <Button size="sm" onClick={() => { setRetry(value => value + 1) }}>{t('retry')}</Button>}</div>}
    <section role="tabpanel" id={`${tabs}-${source}-panel`} aria-labelledby={`${tabs}-${source}`}>
      {!library && !error && <div className={css.grid} aria-busy="true" aria-label={t('loading')}>
        {[0, 1, 2, 3, 4, 5].map(key => <div key={key} className={css.skeleton} />)}
      </div>}
      <div className={css.grid}>{visible.map(entry => <article className={css.card} key={entry.key}>
        <div className={css.heading}><AgentAvatar label={entry.name}
          index={Array.from(entry.key).reduce((total, character) => total + character.charCodeAt(0), 0)} /><h4>{entry.name}</h4>
        <div className={css.cardActions}>
          <Tooltip label={t('openHint')} side="top" portal><Button size="sm" aria-label={t('openNamed', { name: entry.name })} disabled={busy} onClick={() => { void open(entry) }}><IconPlayOutlineRegular size={16} /></Button></Tooltip>
          <Tooltip label={t('details')} side="top" portal><Button size="sm" aria-label={t('details')} disabled={busy} onClick={() => { void inspect(entry) }}><IconInfoOutlineRegular size={16} /></Button></Tooltip>
          <Tooltip label={t('copy')} side="top" portal><Button size="sm" aria-label={t('copy')} disabled={busy} onClick={() => { void duplicate(entry) }}><IconCopyOutlineRegular size={16} /></Button></Tooltip>
          {entry.expert && <Tooltip label={t('edit')} side="top" portal><Button size="sm" aria-label={t('edit')} disabled={busy} onClick={() => { edit(entry.expert) }}><IconSettingsOutlineRegular size={16} /></Button></Tooltip>}
        </div>
        </div>
        <p className={css.description}>{entry.description}</p>
        <div className={css.cardFooter}><span className={css.category}>{categoryName(entry.category)}</span>
          {entry.expert && <span>{t('version', { version: String(entry.expert.revision) })}</span>}
        </div>
      </article>)}</div>
      {library && !visible.length && <p className={css.empty}>{t(query || category ? 'noResults' : 'empty')}</p>}
    </section>
    {detail && <Modal open className={css.modal ?? ''} contentClassName={css.modalContent ?? ''} title={detail.entry.name} closeLabel={t('close')} onClose={() => { if (!busy) setDetail(undefined) }}
      footer={<div className={css.actions}><Button disabled={busy} onClick={() => { void duplicate(detail.entry) }}>{t('copy')}</Button><Button variant="primary" disabled={busy} onClick={() => { void open(detail.entry) }}>{t('openHint')}</Button></div>}>
      <div className={css.detail}><p className={css.summary}>{detail.entry.description}</p>
        {detail.entry.examples.length > 0 && <section><h3>{t('examples')}</h3><div className={css.examples}>{detail.entry.examples.map(example => <Button key={example} disabled={busy} onClick={() => { void open(detail.entry, example) }}>{example}</Button>)}</div></section>}
        <details><summary>{t('prompt')}</summary><div className={css.instructions}><MarkdownText omitHtml labels={{ code: { copyLabel: t('copyText'), copiedLabel: t('copied') }, footnotes: t('footnotes') }} text={detail.draft.prompt} /></div></details>
      </div>
    </Modal>}
    {draft && <Modal open className={css.modal ?? ''} contentClassName={css.modalContent ?? ''} title={t(editing ? 'edit' : 'create')} closeLabel={t('cancel')}
      onClose={() => { if (!busy) setDraft(undefined) }}
      footer={<div className={css.actions}><Button disabled={busy} onClick={() => { setDraft(undefined) }}>{t('cancel')}</Button>
        <Button type="submit" form={form} variant="primary" disabled={busy || !valid}>{t(busy ? 'saving' : 'save')}</Button></div>}>
      <form id={form} className={css.form} onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <label>{t('name')}<Input value={draft.name} maxLength={80} disabled={busy} onChange={(event) => { setDraft({ ...draft, name: event.target.value }) }} /></label>
        <label>{t('scope')}<Input value={draft.description} maxLength={400} disabled={busy} onChange={(event) => { setDraft({ ...draft, description: event.target.value }) }} /></label>
        <div className={css.formRow}>
          <label>{t('category')}<select value={draft.category ?? ''} disabled={busy} onChange={(event) => { const { category: _category, ...fields } = draft; setDraft(event.target.value ? { ...fields, category: event.target.value } : fields) }}><option value="">{t('otherCategory')}</option>{library?.categories.map(item => <option key={item.id} value={item.id}>{categoryLabel(item)}</option>)}</select></label>
          <label>{t('base')}<select value={draft.basePreset} disabled={busy} onChange={(event) => { setCapabilitySource(undefined); setDraft({ ...draft, basePreset: event.target.value }) }}>{bases.map(base => <option key={base.id} value={base.id} disabled={Boolean(base.broken)}>{base.name ?? base.id}</option>)}</select></label>
        </div>
        <label>{t('prompt')}<textarea rows={7} value={draft.prompt} disabled={busy} onChange={(event) => { setDraft({ ...draft, prompt: event.target.value }) }} /></label>
        <details><summary>{t('modelSettings')}</summary><div className={css.formRow}>
          <label>{t('provider')}<Input value={draft.provider ?? ''} disabled={busy} onChange={(event) => { const { provider: _provider, model: _model, ...rest } = draft; setDraft(event.target.value ? { ...rest, provider: event.target.value, model: draft.model ?? '' } : rest) }} /></label>
          <label>{t('model')}<Input value={draft.model ?? ''} disabled={busy || !draft.provider} onChange={(event) => { setDraft({ ...draft, model: event.target.value }) }} /></label>
        </div></details>
        {renderSlot('toolbox.expert-capabilities', {
          agentPreset: capabilitySource ?? draft.basePreset, busy, registerCommit,
        }, { fallback: <p className={css.hint}>{t('capabilitiesDisabled')}</p> })}
        <p className={css.hint}>{t('snapshot')}</p>
        {capabilityPending && <p role="status" className={css.hint}>{t('capabilitiesPending')}</p>}
        {error && <p role="alert" className={css.error}>{error}</p>}
      </form>
    </Modal>}
  </>
}
