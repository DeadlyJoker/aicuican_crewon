/** Retain the complete creation UI while native Sessions own submission and execution. */
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { StudioDocument } from '../project-types.ts'
import type { createStudioContext } from './studio-context.ts'
import { createStudioDocumentWriter } from './studio-document.ts'
import css from './StudioCreationFrame.module.css'

const message = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }), z.object({ type: z.literal('flushed') }),
  z.object({ type: z.literal('save'), storage: z.record(z.string(), z.string()) }),
  z.object({ type: z.literal('entry-submit'), text: z.string().trim().min(1).max(400000),
    storage: z.record(z.string(), z.string()), sourceIds: z.array(z.uuid()).max(100) }),
  z.object({ type: z.literal('overview') }),
])
type Props = PropsRuntime<'conversation.input.header'> & PropsLocale<'shortDrama'> & InjectFace<{
  hooks: { studio: ReturnType<typeof createStudioContext>; entryPanel: ILayout['panelInfo'] }
  readEntry(this: void): Promise<StudioDocument>
  saveEntry(this: void, value: StudioDocument): Promise<StudioDocument>
  prepareEntry(this: void, value: { storage: Record<string, string>; sourceIds: string[] }): void
  flushEntry(this: void, callback: (() => Promise<void>) | null): void
  overview(this: void): void
}>

/**
 * @param props - Session input and shared creation document operations.
 * @returns The complete creation UI without a second Agent conversation.
 */
export function StudioCreationFrame({ sessionId, useStudio, useInput, useSession, inputActions,
  readEntry, saveEntry, prepareEntry, flushEntry, overview, useEntryPanel, t }: Props) {
  const state = useStudio(value => value), input = useInput(value => value)
  const panelVisible = useEntryPanel(value => value.activePanelId === null)
  const promptError = useSession(value => value.promptError?.error.message)
  const active = state.active && !state.projectId && state.entrySessionId === sessionId
  const frame = useRef<HTMLIFrameElement>(null)
  const submitting = useRef(false)
  const [failure, setFailure] = useState(false)
  useEffect(() => {
    if (!active) return
    let live = true, ready = false, blocked = false
    let pending = Promise.resolve()
    let flushed: (() => void) | undefined
    flushEntry(async () => {
      if (!ready) return
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => { flushed = undefined; reject(new Error('Studio entry flush timed out')) }, 10000)
        flushed = () => { window.clearTimeout(timer); resolve() }
        send({ type: 'flush' })
      })
      await pending
      if (blocked) throw new Error('The creation draft has unsaved changes')
    })
    let writer: ReturnType<typeof createStudioDocumentWriter> | undefined
    const send = (value: object) => frame.current?.contentWindow?.postMessage({ channel: 'crewon-studio-v1', ...value }, '*')
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== window.location.origin
        || typeof event.data !== 'object' || event.data === null || !('channel' in event.data)
        || event.data.channel !== 'crewon-studio-v1') return
      const parsed = message.safeParse(event.data)
      if (!parsed.success) return
      const value = parsed.data
      pending = pending.then(async () => {
        if (value.type === 'ready' && !live) return
        if (value.type === 'flushed') { flushed?.(); return }
        if (value.type === 'ready') {
          if (ready) return
          const document = await readEntry()
          writer = createStudioDocumentWriter(document, saveEntry, readEntry)
          send({ type: 'initialize', value: { project: null, production: null, document, projects: [], entryDraft: input.draft, creation: state.creation } })
          ready = true
          return
        }
        if (value.type === 'overview') { overview(); return }
        if (!writer || blocked) throw new Error('The creation draft is not ready')
        if (value.type === 'save') { await writer.save(value.storage); return }
        if (submitting.current) return
        submitting.current = true
        await writer.save(value.storage)
        prepareEntry({ storage: value.storage, sourceIds: value.sourceIds })
        inputActions.setDraft(value.text)
        inputActions.persistDraft()
        inputActions.submit()
      }).catch((error: unknown) => {
        blocked = true
        setFailure(true)
        send({ type: 'error', message: error instanceof Error ? error.message : t('entryCreateFailed') })
      })
    }
    window.addEventListener('message', receive)
    return () => { live = false; flushEntry(null); window.removeEventListener('message', receive) }
  }, [active, inputActions, overview, prepareEntry, readEntry, saveEntry, flushEntry, t])
  useEffect(() => {
    if (input.phase === 'plain' && promptError) submitting.current = false
    frame.current?.contentWindow?.postMessage({ channel: 'crewon-studio-v1', type: 'entry-status',
      busy: input.phase !== 'plain', error: promptError ?? null }, '*')
  }, [input.phase, promptError])
  if (!active) return null
  return <section className={css.creationFrame} hidden={!panelVisible}>
    {failure && <p role="alert" className={css.error}>{t('studioSaveFailed')}</p>}
    <iframe ref={frame} title={t('entryTitle')} src="/api/studio-ui/index.html?embedded=1&entry=1"
      sandbox="allow-scripts allow-same-origin allow-downloads allow-modals allow-forms"
      onLoad={() => frame.current?.contentWindow?.postMessage({ channel: 'crewon-studio-v1', type: 'connect' }, '*')} />
  </section>
}
