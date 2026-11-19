/** Shared, on-demand expert selection for team members and workflow steps. */
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Input, Menu, MenuItemButton, IconChevronDownOutlineRegular, IconCheckOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ExpertCatalogEntry, ExpertCategory, ExpertDefinition } from '../expert-types.ts'
import { filterExpertEntries } from './expert-reference.ts'
import { AgentAvatar } from './TeamCard.tsx'
import { en } from './expert-copy.ts'
import css from './ExpertPicker.module.css'

/** Locale-owned text shared by every selection surface. */
export type ExpertPickerText = { [K in 'search' | 'builtin' | 'mine' | 'noResults' | 'loadFailed' | 'retry' | 'pickerNative' | 'pickerHint' | 'pickerPending' | 'pickerFailed']: string }

/** Host operations activate only the selected bundled expert. */
export interface ExpertPickerActions {
  catalogue(this: void): Promise<{ entries: ExpertCatalogEntry[]; categories: ExpertCategory[] }>
  activate(this: void, slug: string): Promise<ExpertDefinition>
  categoryLabel(this: void, category: ExpertCategory): string
  text?: ExpertPickerText
}

/** Exact immutable preset plus the expert metadata needed for a local role. */
export interface ExpertPickerSelection {
  preset: string
  name: string
  expert?: ExpertDefinition
}

/** Controlled choice; absence retains the caller's native inheritance or custom role. */
export interface ExpertPickerProps {
  label: string
  value: string
  selectedLabel?: string
  emptyLabel: string
  disabled?: boolean
  presets?: readonly { id: string; name?: string; broken?: string }[]
  actions?: ExpertPickerActions
  onChange(this: void, selection: ExpertPickerSelection | undefined): void
  onPendingChange?(this: void, pending: boolean): void
}

/** Search saved and bundled experts in one native menu, preserving old selections.
 * @param props - Controlled selection, labels and on-demand catalogue operations.
 * @returns A compact menu with independent loading, failure and cancellation states.
 */
export function ExpertPicker({ label, value, selectedLabel, emptyLabel, disabled, presets = [], actions,
  onChange, onPendingChange }: ExpertPickerProps) {
  const id = useId()
  const text = actions?.text ?? en
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<ExpertCatalogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState<'load' | 'activate'>()
  const [selected, setSelected] = useState<ExpertPickerSelection>()
  const [retry, setRetry] = useState(0)
  const alive = useRef(true)
  const attempt = useRef(0)
  const pendingRef = useRef(false)
  const currentValue = useRef(value)
  currentValue.current = value
  const pendingCallback = useRef(onPendingChange)
  pendingCallback.current = onPendingChange
  const search = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const reportPending = (next: boolean) => {
    pendingRef.current = next
    setPending(next)
    pendingCallback.current?.(next)
  }
  const close = () => {
    attempt.current++
    setOpen(false)
    if (pendingRef.current) reportPending(false)
  }
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      attempt.current++
      if (pendingRef.current) pendingCallback.current?.(false)
    }
  }, [])
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => { search.current?.focus() })
    return () => { cancelAnimationFrame(frame) }
  }, [open])
  useEffect(() => {
    if (!open) return
    let current = true
    setFailed(undefined)
    if (!actions) { setEntries([]); setLoading(false); return }
    setLoading(true)
    void actions.catalogue().then((data) => {
      if (current) setEntries(data.entries)
    }, () => { if (current) setFailed('load') }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [open, actions, retry])
  const choose = async (entry: ExpertCatalogEntry) => {
    if (pendingRef.current || disabled) return
    const selectedAttempt = ++attempt.current
    const commit = onChange
    const expectedValue = value
    setFailed(undefined)
    reportPending(true)
    try {
      const expert = entry.expert ?? (entry.builtinSlug && actions ? await actions.activate(entry.builtinSlug) : undefined)
      if (!alive.current || attempt.current !== selectedAttempt || currentValue.current !== expectedValue) return
      if (!expert) throw new Error('Expert unavailable')
      const result = { preset: expert.preset, name: expert.name, expert }
      setSelected(result)
      commit(result)
      close()
      trigger.current?.focus()
    } catch (_error) {
      if (alive.current && attempt.current === selectedAttempt) setFailed('activate')
    } finally {
      if (alive.current && attempt.current === selectedAttempt) reportPending(false)
    }
  }
  const matching = filterExpertEntries(entries, query, '').sort((left, right) => Number(Boolean(right.expert)) - Number(Boolean(left.expert)))
    .slice(0, query.trim() ? 40 : 16)
  const saved = matching.filter(entry => entry.expert)
  const builtins = matching.filter(entry => !entry.expert)
  const expertPresets = new Set(entries.flatMap(entry => entry.expert ? [entry.expert.preset] : []))
  const native = presets.filter(preset => !expertPresets.has(preset.id) && (!actions || failed === 'load' || !preset.id.startsWith('expert-'))
    && (!query.trim() || `${preset.name ?? ''} ${preset.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
  const currentName = !value ? emptyLabel : selected?.preset === value ? selected.name
    : presets.find(preset => preset.id === value)?.name ?? entries.find(entry => entry.expert?.preset === value)?.name
      ?? selectedLabel ?? value
  const pickNative = (selection?: ExpertPickerSelection) => { onChange(selection); setSelected(selection); close() }
  const renderEntries = (items: ExpertCatalogEntry[], heading: string) => items.length > 0 && <>
    <div className={css.group}>{heading}</div>
    {items.map((entry, index) => <MenuItemButton key={entry.key} disabled={pending} current={entry.expert?.preset === value}
      icon={<AgentAvatar label={entry.name} index={index} />} onSelect={() => { void choose(entry) }}>
      <span className={css.choice}><span className={css.row}><span className={css.name}>{entry.name}</span>
        <span className={css.description}>{entry.description}</span></span>
      {entry.expert?.preset === value && <IconCheckOutlineRegular size={14} />}</span>
    </MenuItemButton>)}
  </>
  return <div className={css.root} aria-owns={open ? id : undefined}>
    <span className={css.label}>{label}</span>
    <Menu open={open} portal listClassName={css.menu} onClose={close}
      anchor={<Button ref={trigger} disabled={disabled && !pending} className={css.trigger}
        aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => { if (open) close(); else { setQuery(''); setOpen(true) } }}>
        <span className={css.current}>{currentName}</span><IconChevronDownOutlineRegular size={14} />
      </Button>}>
      <div id={id}>
        <div className={css.search}>
          <Input ref={search} role="searchbox" aria-label={text.search} placeholder={text.search} value={query}
            disabled={pending} onChange={(event) => { setQuery(event.target.value) }}
            onKeyDown={(event) => { if (event.key === 'Home' || event.key === 'End') event.stopPropagation() }} />
        </div>
        {pending && <p role="status" className={css.notice}>{text.pickerPending}</p>}
        {failed && <div role="alert" className={css.notice}>{failed === 'load' ? text.loadFailed : text.pickerFailed}
          <Button size="sm" onClick={() => { setRetry(count => count + 1) }}>{text.retry}</Button></div>}
        {!query && <MenuItemButton disabled={pending} current={!value} onSelect={() => { pickNative() }}>{emptyLabel}</MenuItemButton>}
        {loading ? <div className={css.skeleton} aria-busy="true" /> : <>
          {renderEntries(saved, text.mine)}
          {renderEntries(builtins, text.builtin)}
          {native.length > 0 && <div className={css.group}>{text.pickerNative}</div>}
          {native.map(preset => <MenuItemButton key={preset.id} disabled={pending || Boolean(preset.broken)} current={value === preset.id}
            onSelect={() => { pickNative({ preset: preset.id, name: preset.name ?? preset.id }) }}>
            {preset.name ?? preset.id}</MenuItemButton>)}
          {!matching.length && !native.length && query && !failed && <p className={css.notice}>{text.noResults}</p>}
          {!query && builtins.length > 0 && <p className={css.hint}>{text.pickerHint}</p>}
        </>}
      </div>
    </Menu>
  </div>
}
