/** Project and Inbox navigation into native topic conversations. */
import { useEffect, useRef, useState } from 'react'
import { Button, Input, IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Office, OfficeMemberId } from '../office-types.ts'
import type { OfficeProjectOverview, OfficeProjectId, OfficeTopicId, OfficeTopic, OfficeTopicSubmission } from '../office-project-types.ts'
import type {} from './office-copy.ts'
import css from './OfficeProjects.module.css'

/** Client actions over the Contexera-backed service and native member dispatch. */
export interface OfficeProjectActions {
  overview(this: void, id: Office['id'], member?: OfficeMemberId): Promise<OfficeProjectOverview>
  createProject(this: void, id: Office['id'], name: string, description: string, request: string): Promise<OfficeProjectId>
  startTopic(this: void, id: Office['id'], project: OfficeProjectId, body: string, request: string): Promise<OfficeTopicSubmission>
  topic(this: void, id: Office['id'], topic: OfficeTopicId, throughSequence?: number): Promise<OfficeTopic>
  reply(this: void, id: Office['id'], topic: OfficeTopicId, body: string, revision: number, request: string): Promise<OfficeTopicSubmission>
  send(this: void, office: Office, member: OfficeMemberId, text: string, topic: OfficeTopicSubmission, request: string): Promise<void>
  openTopic(this: void, office: Office, topic: OfficeTopicId): Promise<void>
}

/** Browse projects and open each topic in its own conversation. */
export function OfficeProjects({ office, actions, onBack, initialProjectId, onEditingChange, revision = 0, t }: {
  office: Office
  actions: OfficeProjectActions
  onBack(this: void): void
  revision?: number
  initialProjectId?: OfficeProjectId
  onEditingChange?(this: void, editing: boolean): void
} & PropsLocale<'teamOffice'>) {
  const [view, setView] = useState<OfficeProjectOverview>()
  const [projectId, setProjectId] = useState<OfficeProjectId | undefined>(initialProjectId)
  const [inbox, setInbox] = useState(false)
  const [recipient, setRecipient] = useState<OfficeMemberId>()
  const [notify, setNotify] = useState<OfficeMemberId>()
  const [newProject, setNewProject] = useState(false)
  const [newTopic, setNewTopic] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const locked = useRef(false)
  const request = useRef<{ content: string; id: string } | undefined>(undefined)
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      try {
        const next = await actions.overview(office.id, recipient)
        if (alive) setView(next)
      } catch { if (alive) setError(true) }
      if (alive) timer = setTimeout(() => { void refresh() }, 2000)
    }
    void refresh()
    return () => { alive = false; clearTimeout(timer) }
  }, [actions, office.id, recipient, revision])
  const project = projectId === undefined ? view?.projects[0] : view?.projects.find(item => item.id === projectId)
  const openTopic = async (id: OfficeTopicId) => {
    if (locked.current) return
    locked.current = true; setBusy(true); setError(false)
    try { await actions.openTopic(office, id) }
    catch { setError(true) }
    finally { locked.current = false; setBusy(false) }
  }
  const submit = async () => {
    if (locked.current) return
    locked.current = true; setBusy(true); setError(false)
    try {
      const content = JSON.stringify({ newProject, projectId: project?.id, title, body, notify })
      if (request.current?.content !== content) request.current = { content, id: randomUUID() }
      const id = request.current.id
      if (newProject) {
        setProjectId(await actions.createProject(office.id, title, body, id)); setNewProject(false)
      } else {
        const member = office.members.find(item => item.id === notify)
        const text = (member ? '@' + member.name + '\n' : '') + body
        if (!project) return
        const target = await actions.startTopic(office.id, project.id, title + '\n\n' + text, id)
        if (member) await actions.send(office, member.id, body, target, id)
        await actions.openTopic(office, target.topicId)
        setNewTopic(false)
      }
      request.current = undefined
      onEditingChange?.(false)
      setTitle(''); setBody(''); setView(await actions.overview(office.id, recipient))
    } catch { setError(true) }
    finally { locked.current = false; setBusy(false) }
  }
  return <section className={css.page}>
    <header className={css.header}><Button size="sm" onClick={onBack}>{t('back')}</Button><h3>{office.name}</h3>
      <Button disabled={busy} onClick={() => {
        setNewProject(true); setNewTopic(false); setInbox(false); setTitle(''); setBody(''); onEditingChange?.(true)
      }}>{t('createProject')}</Button></header>
    <div className={css.tabs}><Button aria-pressed={!inbox} onClick={() => { setInbox(false) }}>{t('projects')}</Button>
      <Button aria-pressed={inbox} onClick={() => {
        setInbox(true); setNewProject(false); setNewTopic(false); onEditingChange?.(false)
      }}>{t('inbox')} {view?.unread || ''}</Button>
      {inbox && <select aria-label={t('recipient')} value={recipient ?? ''} onChange={(event) => { setRecipient(office.members.find(member => member.id === event.target.value)?.id) }}>
        <option value="">{t('myInbox')}</option>{office.members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
      </select>}</div>
    {error && <p role="alert">{t('projectFailure')}</p>}
    {view && projectId !== undefined && !project && !busy && <p role="alert">{t('projectMissing')}</p>}
    {inbox ? <div className={css.topicList}>{view?.inbox.map(item => <button type="button" key={item.topicId} className={css.topicRow} disabled={busy} onClick={() => { void openTopic(item.topicId) }}>
      <span className={css.topicText}><strong>{item.projectName}</strong><span>{item.preview}</span></span>
      <small className={css.unread}>{item.unread}</small><IconChevronRightOutlineRegular size={16} />
    </button>)}{view?.inbox.length === 0 && <p className={css.empty}>{t('inboxEmpty')}</p>}</div> : <div className={css.layout}>
      <aside className={css.list}>
        {view?.projects.map(item => <button type="button" key={item.id} className={css.row} aria-pressed={project?.id === item.id}
          onClick={() => {
            setProjectId(item.id); setNewProject(false); setNewTopic(false); onEditingChange?.(false)
          }}>
          <span><strong>{item.name}</strong><small>{item.topics.length}</small></span>
          {item.description && <p>{item.description}</p>}</button>)}
        {view?.projects.length === 0 && <p className={css.empty}>{t('projectEmpty')}</p>}
      </aside>
      <div className={css.detail}>
        {newProject || newTopic ? <form className={css.form} onSubmit={(event) => { event.preventDefault(); void submit() }}>
          <h4>{t(newProject ? 'createProject' : 'createTopic')}</h4>
          <label>{t('titleLabel')}<Input required value={title} onChange={(event) => { setTitle(event.target.value) }} /></label>
          <label>{t(newProject ? 'description' : 'message')}<textarea required={!newProject} rows={4} value={body} onChange={(event) => { setBody(event.target.value) }} /></label>
          {newTopic && <label>{t('notifyMember')}<select aria-label={t('notifyMember')} value={notify ?? ''} onChange={(event) => { setNotify(office.members.find(member => member.id === event.target.value)?.id) }}><option value="">{t('publishOnly')}</option>{office.members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>}
          <Button type="submit" variant="primary" disabled={busy}>{t(newProject ? 'createProject' : 'publish')}</Button>
        </form> : project ? <>
          <div className={css.projectHeading}><div><h4>{project.name}</h4>{project.description && <p>{project.description}</p>}</div>
            <Button size="sm" disabled={busy} onClick={() => {
              setNewTopic(true); setNewProject(false); setNotify(office.leaderId); setTitle(''); setBody(''); onEditingChange?.(true)
            }}>{t('createTopic')}</Button></div>
          <div className={css.topicList}>{project.topics.map(topic => <button type="button" key={topic.id} className={css.topicRow} disabled={busy} onClick={() => { void openTopic(topic.id) }}><span className={css.topicText}><strong>{topic.title}</strong></span><IconChevronRightOutlineRegular size={16} /></button>)}</div>
          {project.topics.length === 0 && <p className={css.empty}>{t('topicEmpty')}</p>}
        </> : <div className={css.empty}><p>{t('projectHint')}</p></div>}
      </div>
    </div>}
  </section>
}
