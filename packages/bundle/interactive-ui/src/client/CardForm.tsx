/** Native controls and serialized durable drafts for an authored form. */
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { CardState, FormValues } from '../types.ts'
import type { FormSchema } from './schema.ts'
import type {} from './copy.ts'
import css from './cards.module.css'

/** Calls are scoped to the original message and recipient by the slot registration. */
export interface CardActions {
  read(this: void, key: string): Promise<CardState>
  save(this: void, key: string, values: FormValues, revision: number): Promise<CardState>
  submit(this: void, key: string, values: FormValues, revision: number, title: string, recipient?: { namespace: 'office'; id: string }, labels?: Record<string, string>): Promise<CardState>
}

/** @param props - Validated schema and scoped persistence operations. @returns Editable draft or compact submitted results. */
export function CardForm({ schema, cardKey, actions, t }: { schema: FormSchema; cardKey: string; actions: CardActions } & PropsLocale<'interactiveUi'>) {
  const id = useId()
  const [values, setValues] = useState<FormValues>(() => Object.fromEntries(schema.fields.map(field => [field.name, field.default ?? (field.type === 'checkbox' ? false : '')])))
  const [loaded, setLoaded] = useState(false)
  const [reload, setReload] = useState(0)
  const [status, setStatus] = useState<CardState['status']>('draft')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const revision = useRef(0)
  const latest = useRef(values)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const locked = useRef(false)
  const mounted = useRef(true)
  const apply = (state: CardState) => {
    revision.current = state.revision
    if (mounted.current) setStatus(state.status)
  }
  useEffect(() => {
    mounted.current = true
    void actions.read(cardKey).then((state) => {
      if (!mounted.current) return
      apply(state); const restored = { ...latest.current, ...state.values }
      latest.current = restored; setValues(restored); setLoaded(true)
    }, (error: unknown) => { console.warn('interactive-ui: draft read failed', error); if (mounted.current) setError(true) })
    return () => { mounted.current = false }
  }, [actions, cardKey, reload])
  const persist = (next: FormValues) => {
    queue.current = queue.current.catch(() => {}).then(async () => {
      const state = await actions.save(cardKey, next, revision.current)
      apply(state)
      if (mounted.current) setError(false)
    }).catch(() => { if (mounted.current) setError(true) })
  }
  const change = (name: string, value: string | boolean) => {
    const next = { ...latest.current, [name]: value }
    latest.current = next; setValues(next); persist(next)
  }
  const submit = async () => {
    if (locked.current) return
    locked.current = true; setBusy(true); setError(false)
    try {
      await queue.current
      const labels = Object.fromEntries(schema.fields.map(field => [field.name, field.label]))
      apply(await actions.submit(cardKey, latest.current, revision.current, schema.title, undefined, labels))
    } catch { setError(true) }
    finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  if (loaded && status === 'submitted') return <section data-interactive-card={cardKey} className={`${css.form} ${css.result}`}>
    <header className={css.header}><h3>{schema.title}</h3><span className={css.status}>{t('submitted')}</span></header>
    <dl className={css.results}>{schema.fields.map((field) => {
      const value = values[field.name]
      const display = field.type === 'checkbox' ? t(value === true ? 'yes' : 'no') : String(value ?? '').trim() || t('notProvided')
      return <div key={field.name} className={css.resultRow}><dt>{field.label}</dt><dd>{display}</dd></div>
    })}</dl>
  </section>
  const disabled = !loaded || busy || status !== 'draft'
  return <form data-interactive-card={cardKey} className={css.form} onSubmit={(event) => { event.preventDefault(); void submit() }}>
    <header className={css.header}><div><h3>{schema.title}</h3>{schema.description && <p>{schema.description}</p>}</div>
      <span className={css.status}>{status === 'submitted' ? t('submitted') : status === 'pending' ? t('submitting') : loaded ? t('draft') : t('loading')}</span></header>
    <fieldset disabled={disabled} className={css.fields}>
      {schema.fields.map(field => <div key={field.name} className={css.field}>
        <label htmlFor={`${id}-${field.name}`}>{field.label}{field.required && <span aria-label={t('required')}> *</span>}</label>
        <div className={css.control}>
          {field.type === 'textarea' ? <textarea id={`${id}-${field.name}`} value={String(values[field.name] ?? '')} rows={3} required={field.required} placeholder={field.placeholder} onChange={(event) => { change(field.name, event.target.value) }} />
            : field.type === 'select' ? <select id={`${id}-${field.name}`} value={String(values[field.name] ?? '')} required={field.required} onChange={(event) => { change(field.name, event.target.value) }}><option value="">{t('empty')}</option>{field.options?.map(option => <option key={option}>{option}</option>)}</select>
              : field.type === 'checkbox' ? <input id={`${id}-${field.name}`} type="checkbox" checked={values[field.name] === true} required={field.required} onChange={(event) => { change(field.name, event.target.checked) }} />
                : <Input className={css.textInput ?? ''} id={`${id}-${field.name}`} type={field.type} value={String(values[field.name] ?? '')} required={field.required} placeholder={field.placeholder} onChange={(event) => { change(field.name, event.target.value) }} />}
        </div>
      </div>)}
    </fieldset>
    <footer className={css.footer}>{error && <p role="alert">{t('error')}</p>}
      {!loaded && error && <Button onClick={() => { setError(false); setReload(value => value + 1) }}>{t('reload')}</Button>}
      {status !== 'submitted' && <Button type="submit" variant="primary" disabled={!loaded || busy}>{busy ? t('submitting') : status === 'pending' ? t('retry') : schema.submitLabel ?? t('submit')}</Button>}
    </footer>
  </form>
}
