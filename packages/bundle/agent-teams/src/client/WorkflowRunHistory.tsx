/** Read-only workflow history that stays over the current conversation. */
import { useEffect, useRef, useState } from 'react'
import { Button, MarkdownText, Modal, StateDot, IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkflowHistory, WorkflowHistoryCursor, WorkflowHistoryPage } from '../workflow-types.ts'
import type {} from './team-details-copy.ts'
import css from './WorkflowRunHistory.module.css'

interface Props extends PropsLocale<'teamDetails'> {
  workflowId: string
  revision?: number
  name: string
  currentSessionId: SessionId
  read(this: void, workflowId: string, before?: WorkflowHistoryCursor): Promise<WorkflowHistoryPage>
  close(this: void): void
}

/**
 * Inspect stored inputs and results without changing the active conversation.
 * @param props - Workflow identity, paged history reader and modal dismissal.
 * @returns A native modal with expandable read-only run records.
 */
export function WorkflowRunHistory({ workflowId, name, currentSessionId, read, close, t, revision = 0 }: Props) {
  const [runs, setRuns] = useState<WorkflowHistory[]>([])
  const [cursor, setCursor] = useState<WorkflowHistoryCursor>()
  const [next, setNext] = useState<WorkflowHistoryCursor>()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const previousRevision = useRef(revision)
  const loadedCursors = useRef<(WorkflowHistoryCursor | undefined)[]>([undefined])
  useEffect(() => {
    if (!loadedCursors.current.some(item => item?.sessionId === cursor?.sessionId)) loadedCursors.current.push(cursor)
    const requested = previousRevision.current !== revision ? loadedCursors.current : [cursor]
    previousRevision.current = revision
    let active = true
    setLoading(true)
    setFailed(false)
    void Promise.all(requested.map(position => read(workflowId, position))).then((pages) => {
      if (!active) return
      const page = pages[requested.findIndex(item => item?.sessionId === cursor?.sessionId)]
      if (!page) return
      setRuns(previous => cursor
        ? [...new Map([...previous, ...pages.flatMap(item => item.runs)]
          .map(run => [run.sessionId, run])).values()]
          .sort((left, right) => right.createdAt - left.createdAt || right.sessionId.localeCompare(left.sessionId))
        : page.runs)
      setNext(page.next)
      setLoading(false)
    }, () => { if (active) { setFailed(true); setLoading(false) } })
    return () => { active = false }
  }, [workflowId, cursor, read, attempt, revision])
  const labels = { code: { copyLabel: t('copy'), copiedLabel: t('copied') }, footnotes: t('footnotes') }
  return <Modal open title={t('historyTitle')} description={name} closeLabel={t('close')} onClose={close}
    className={css.modal ?? ''} contentClassName={css.content ?? ''}>
    <div className={css.history}>
      {runs.length === 0 && !loading && !failed && <p className={css.empty}>{t('emptyHistory')}</p>}
      <ol className={css.list}>{runs.map((run) => {
        const output = run.delivery ?? ([run.draft, ...(run.reviews ?? [])].filter(Boolean).join('\n\n')
          || Object.values(run.stepOutputs ?? {}).join('\n\n'))
        return <li key={run.sessionId}><details className={css.run}>
          <summary>
            <span className={css.runHeading}><time dateTime={new Date(run.createdAt).toISOString()}>
              {new Date(run.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</time>
            {run.sessionId === currentSessionId && <span className={css.badge}>{t('currentRun')}</span>}
            <span className={css.status}>{t(run.status === 'preparing' ? 'working' : run.status)}</span>
            <IconChevronDownOutlineRegular size={14} className={css.chevron} />
            </span>
            <span className={css.preview}>{run.input}</span>
          </summary>
          <div className={css.details}>
            <div><h4>{t('input')}</h4><p className={css.input}>{run.input}</p></div>
            <div><h4>{t(run.delivery ? 'historyDelivery' : 'historyOutput')}</h4>
              {output ? <MarkdownText omitHtml labels={labels} text={output} /> : <p className={css.empty}>{t('noHistoryOutput')}</p>}
            </div>
          </div>
        </details></li>
      })}</ol>
      {failed && <div className={css.notice} role="alert"><span>{t('historyLoadFailed')}</span>
        <Button size="sm" onClick={() => { setAttempt(value => value + 1) }}>{t('retry')}</Button></div>}
      {loading && <div className={css.loading} role="status" aria-label={t('loading')}><StateDot state="ongoing" size={18} /></div>}
      {next && !loading && !failed && <Button size="sm" className={css.more}
        onClick={() => { setCursor(next) }}>{t('loadMoreHistory')}</Button>}
    </div>
  </Modal>
}
