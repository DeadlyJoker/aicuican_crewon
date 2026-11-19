/** Mixed Markdown and interactive cards in the native message body slot. */
import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { MarkdownText, Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MessageBodyOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from './copy.ts'
import type { FormValues } from '../types.ts'
import { splitAssistantText } from './split-assistant-text.ts'
import { loadGenuiRuntime } from './load-genui-runtime.ts'
import { CardForm, type CardActions } from './CardForm.tsx'
import { formSchema, safeChart } from './schema.ts'
import css from './cards.module.css'
import { repairChartJson, themeChart } from './chart-theme.ts'

type Props = { matched: MessageBodyOwnerProps } & PropsRuntime<'conversation.chat.message.body'> & PropsLocale<'interactiveUi'> & InjectFace<CardActions>
type ChartElement = HTMLElement & { content: string; generating: boolean; isJsonComplete: boolean }

function Chart({ content, complete, t }: { content: unknown; complete: boolean } & PropsLocale<'interactiveUi'>) {
  const ref = useRef<ChartElement>(null)
  const [status, setStatus] = useState('loading')
  const [dark, setDark] = useState(() => document.body.hasAttribute('data-ds-dark-theme'))
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.body.hasAttribute('data-ds-dark-theme')))
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    return () => observer.disconnect()
  }, [])
  const load = () => { setStatus('loading'); void loadGenuiRuntime().then(() => { setStatus('ready') }, () => { setStatus('error') }) }
  useEffect(load, [])
  useLayoutEffect(() => {
    if (status !== 'ready' || !ref.current) return
    ref.current.content = JSON.stringify(themeChart(content, dark))
    ref.current.generating = !complete
    ref.current.isJsonComplete = complete
  }, [status, content, complete, dark])
  if (status !== 'ready') return <div className={css.notice} role="status">{t(status === 'error' ? 'failed' : 'loading')}{status === 'error' && <Button onClick={load}>{t('retry')}</Button>}</div>
  return <div className={css.chart}>{createElement('dsh-genui-card', { ref })}</div>
}

/** @param props - Scoped text and immutable submission destination. @returns Prose with validated form/chart cards. */
export function Cards({
  text, identity, streaming, interrupted, labels, fileMentions, pathImages, textInteractionSource = false, recipient, read, save, submit, t,
}: Props) {
  const actions = useMemo(() => ({
    read, save,
    submit: (key: string, values: FormValues, revision: number, title: string,
      _recipient?: { namespace: 'office'; id: string }, labels?: Record<string, string>) =>
      submit(key, values, revision, title,
        recipient?.namespace === 'office' ? { namespace: 'office', id: recipient.id } : undefined, labels),
  }), [read, save, submit, recipient?.namespace, recipient?.id])
  return <div className={css.body}>{splitAssistantText(text, streaming, interrupted).map((segment, index) => {
    if (segment.kind === 'markdown') return <MarkdownText key={index} text={segment.text} streaming={streaming} labels={labels} fileMentions={fileMentions} pathImages={pathImages} textInteractionSource={textInteractionSource} />
    let value: unknown
    try { value = segment.complete ? JSON.parse(segment.text) : repairChartJson(segment.text) } catch { return <div key={index} className={css.notice}>{t(segment.complete ? 'invalid' : 'loading')}</div> }
    const items = Array.isArray(value) ? value : [value]
    return items.map((item, itemIndex) => {
      const key = `${identity}:${index}:${itemIndex}`
      const parsed = formSchema.safeParse(item)
      if (parsed.success && segment.complete) return <CardForm key={key} cardKey={key} schema={parsed.data} actions={actions} t={t} />
      if (safeChart(item)) return <Chart key={key} content={item} complete={segment.complete} t={t} />
      return <div key={key} className={css.notice}>{t(segment.complete ? 'invalid' : 'loading')}</div>
    })
  })}</div>
}
