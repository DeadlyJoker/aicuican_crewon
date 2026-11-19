/** Searchable native catalogue of filesystem and provider-backed skills. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button, MarkdownText, Modal, ReferenceIconRegular, Switch, Tooltip,
  IconChevronRightOutlineRegular, IconCloseOutlineRegular, IconCopyOutlineRegular,
  IconEditOutlineRegular, IconFolderOpenOutlineRegular, IconPlusOutlineRegular,
  IconRefreshOutlineRegular, IconSearchOutlineRegular, IconTrashOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { ListPayload, SkillDocument, SkillEntry, SkillScope, SkillTarget, SkillTrashEntry } from '../types.ts'
import type { SkillExplorerActions } from './actions.ts'
import { selectGroups, type SkillStatus } from './skill-filter.ts'
import { SkillEditor, SkillImportDialog, type SkillEditState } from './SkillEditor.tsx'
import type {} from './locales.ts'
import css from './SkillsPage.module.css'

type Props = PropsRuntime<'main'> & PropsLocale<'skillExplorer'> & InjectFace<{ actions: SkillExplorerActions }>
const sourceKeys = ['bundled', 'project-dsh', 'project-agents', 'custom', 'user-dsh', 'user-agents', 'runtime'] as const

/** Localize a skill source, retaining an explicit label for unknown providers.
 * @param source - Catalogue source identifier. @param t - Skill locale dictionary.
 * @returns Source label for the skill card.
 */
export function sourceLabel(source: string, t: Props['t']): string {
  const known = sourceKeys.find(key => key === source)
  return known ? t(`source.${known}`) : t('source.other')
}

function editableSkill(skill: SkillEntry): boolean {
  return skill.fileState === 'editable' && skill.level !== 'bundled' && !skill.linked
}

/** Read-only native skill preview, shared with the purpose-based toolbox. */
export function SkillPreview({ skill, scope, read, onClose, t }: {
  skill: SkillEntry
  scope: SkillScope
  read: SkillExplorerActions['read']
  onClose(this: void): void
} & PropsLocale<'skillExplorer'>) {
  const [document, setDocument] = useState<SkillDocument>()
  const [loading, setLoading] = useState(Boolean(skill.path))
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!skill.path) return
    let active = true
    void read({ ...scope, name: skill.name, path: skill.path }).then(
      (value) => { if (active) { setDocument(value); setLoading(false) } },
      () => { if (active) { setError(true); setLoading(false) } },
    )
    return () => { active = false }
  }, [read, scope, skill])
  return <Modal open title={skill.name} closeLabel={t('close')} className={css.modal ?? ''} onClose={onClose}>
    <div className={css.preview}>
      <p>{document?.description ?? skill.description}</p>
      {(document?.whenToUse ?? skill.whenToUse) && <p>{document?.whenToUse ?? skill.whenToUse}</p>}
      {skill.path && <code className={css.path}>{skill.path}</code>}
      {loading ? <div className={css.loading} role="status" aria-label={t('preview')}><span className={css.spinner} /></div>
        : error ? <p role="alert" className={css.error}>{t('failure')}</p>
          : document ? <MarkdownText omitHtml text={document.content}
            labels={{ code: { copyLabel: t('copy'), copiedLabel: t('copied') }, footnotes: t('footnotes') }} />
            : <p>{t('noPreview')}</p>}
    </div>
  </Modal>
}

/**
 * Browse skill sources and perform revision-fenced file operations through the Host.
 * @param props - Native workspace snapshot, locale and authenticated skill actions.
 * @returns The skill-centre page and its local editing dialogs.
 */
export function SkillsPage({ t, useWorkspaces, actions }: Props) {
  const workspaces = useWorkspaces(value => value.items)
  const [workspaceChoice, setWorkspaceChoice] = useState<string>()
  const workspace = workspaceChoice === undefined ? workspaces[0]
    : workspaces.find(item => item.workspaceId === workspaceChoice)
  const workspaceId = workspace?.workspaceId
  const scope = useMemo<SkillScope>(() => workspaceId ? { workspaceId } : {}, [workspaceId])
  const [catalogue, setCatalogue] = useState<ListPayload>()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<SkillStatus>('all')
  const [preview, setPreview] = useState<SkillEntry>()
  const [editor, setEditor] = useState<SkillEditState>()
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState<SkillEntry>()
  const [trashed, setTrashed] = useState<SkillTrashEntry>()
  const generation = useRef(0)
  const locked = useRef(false)
  const reload = useCallback(async () => {
    const current = ++generation.current
    setLoading(true)
    setFailed(false)
    try {
      const value = await actions.list(scope)
      if (current === generation.current) setCatalogue(value)
    } catch {
      if (current === generation.current) setFailed(true)
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }, [actions, scope])
  useEffect(() => {
    setCatalogue(undefined)
    void reload()
    return () => { generation.current += 1 }
  }, [reload])
  const mutate = async (operation: () => Promise<void>) => {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setFailed(false)
    try { await operation(); await reload() } catch { setFailed(true) }
    finally { locked.current = false; setBusy(false) }
  }
  const target = (skill: SkillEntry): SkillTarget | undefined => skill.path
    ? { ...scope, name: skill.name, path: skill.path } : undefined
  const edit = (skill: SkillEntry, duplicate: boolean) => {
    const selected = target(skill)
    if (!selected) return
    void mutate(async () => {
      const document = await actions.read(selected)
      const draft = { name: document.name, description: document.description, content: document.content,
        ...(document.whenToUse === undefined ? {} : { whenToUse: document.whenToUse }) }
      setEditor(duplicate
        ? { scope, draft: { ...draft, name: `${document.name}-copy` } }
        : { scope, document, draft })
    })
  }
  const groups = selectGroups(catalogue?.groups ?? [], { query: search, status, workspace: 'all' })
  const create = () => { setEditor({ scope, draft: { name: '', description: '', content: '' } }) }
  return <main className={css.page} data-skill-page="">
    <div className={css.content}>
      <header className={css.heading}><h1>{t('title')}</h1><div className={css.actions}>
        <Tooltip label={t('importSkills')} side="bottom" portal><Button size="sm" className={css.icon}
          aria-label={t('importSkills')} disabled={busy || !catalogue} onClick={() => { setImporting(true) }}>
          <IconFolderOpenOutlineRegular size={16} /></Button></Tooltip>
        <Button variant="primary" size="sm" className={css.create} disabled={busy} onClick={create}>
          <IconPlusOutlineRegular size={13} />{t('newSkill')}</Button>
      </div></header>
      <div className={css.filters}>
        {(['all', 'enabled', 'disabled'] as const).map(value => <Button size="sm" className={css.filter}
          key={value} aria-pressed={status === value} onClick={() => { setStatus(value) }}>{t(value)}</Button>)}
        <label className={css.workspace}><span>{t('workspace')}</span><select disabled={busy} value={workspace?.workspaceId ?? ''}
          onChange={(event) => { setWorkspaceChoice(event.target.value) }}>
          <option value="">{t('personal')}</option>
          {workspaces.map(item => <option key={item.workspaceId} value={item.workspaceId}>{item.title}</option>)}
        </select></label>
      </div>
      <div className={css.tools}><label className={css.search}><IconSearchOutlineRegular size={16} />
        <input type="search" aria-label={t('search')} placeholder={t('search')} value={search}
          onChange={(event) => { setSearch(event.target.value) }} onKeyDown={(event) => { if (event.key === 'Escape') setSearch('') }} />
      </label><Tooltip label={t('refresh')} side="bottom" portal><Button className={css.icon} size="sm"
        disabled={loading || busy} aria-label={t('refresh')} onClick={() => { void reload() }}>
        <IconRefreshOutlineRegular size={16} /></Button></Tooltip></div>
      {failed && <div role="alert" className={css.notice}><span>{t('failure')}</span>
        <Button size="sm" disabled={loading || busy} onClick={() => { void reload() }}>{t('retry')}</Button></div>}
      {catalogue?.complete === false && <div className={css.notice}>{t('incomplete')}</div>}
      {trashed && <div role="status" className={css.notice}><span>{t('trashDone')} · {trashed.name}</span>
        <Button size="sm" disabled={busy} onClick={() => { void mutate(async () => { await actions.restore(trashed); setTrashed(undefined) }) }}>{t('undo')}</Button>
        <Button size="sm" className={css.icon} aria-label={t('dismiss')} onClick={() => { setTrashed(undefined) }}><IconCloseOutlineRegular size={14} /></Button>
      </div>}
      {loading && !catalogue ? <div className={css.loading} role="status" aria-label={t('refresh')}><span className={css.spinner} /></div>
        : groups.length === 0 ? <div className={css.empty}><ReferenceIconRegular kind="file" size={28} /><p>{t('empty')}</p><p>{t('emptyHint')}</p></div>
          : groups.map(group => <details className={css.group} key={group.key} open>
            <summary className={css.groupTitle}><IconChevronRightOutlineRegular size={14} />{sourceLabel(group.key, t)}
              <span className={css.count}>{group.skills.length}</span></summary>
            <div className={css.list}>{group.skills.map(skill => <article className={css.row} key={`${skill.name}:${skill.path ?? skill.provider}`}>
              <button className={css.rowMain} type="button" onClick={() => { setPreview(skill) }}>
                <span className={css.glyph}><ReferenceIconRegular kind="file" size={18} /></span>
                <span className={css.rowText}><span className={css.name}>{skill.name}</span>
                  <span className={css.description}>{skill.description}</span>
                  <span className={css.meta}>
                    {!editableSkill(skill) && <span>{t('readOnly')}</span>}
                    {skill.linked && <span>{t('linked')}</span>}
                    <span>{t(skill.modelInvocable ? 'modelAllowed' : 'modelBlocked')}</span>
                  </span></span>
              </button>
              <div className={css.rowActions}>
                <div className={css.secondaryActions}>
                  {editableSkill(skill) && <Tooltip label={t('edit')} side="top" portal><Button className={css.icon}
                    size="sm" aria-label={`${t('edit')} ${skill.name}`} disabled={busy} onClick={() => { edit(skill, false) }}>
                    <IconEditOutlineRegular size={15} /></Button></Tooltip>}
                  {skill.path && <Tooltip label={t('duplicate')} side="top" portal><Button className={css.icon}
                    size="sm" aria-label={`${t('duplicate')} ${skill.name}`} disabled={busy} onClick={() => { edit(skill, true) }}>
                    <IconCopyOutlineRegular size={15} /></Button></Tooltip>}
                  {editableSkill(skill) && <Tooltip label={t('trash')} side="top" portal><Button className={css.icon}
                    size="sm" aria-label={`${t('trash')} ${skill.name}`} disabled={busy} onClick={() => { setDeleting(skill) }}>
                    <IconTrashOutlineRegular size={15} /></Button></Tooltip>}
                </div>
                {editableSkill(skill) && <Switch checked={skill.modelInvocable} disabled={busy}
                  label={`${t('toggle')} ${skill.name}`} onChange={(enabled) => {
                    const selected = target(skill)
                    if (selected) void mutate(() => actions.setEnabled({ ...selected, enabled }))
                  }} />}
              </div>
            </article>)}</div>
          </details>)}
    </div>
    {preview && <SkillPreview key={`${preview.name}:${preview.path ?? ''}`} skill={preview} scope={scope}
      read={actions.read} onClose={() => { setPreview(undefined) }} t={t} />}
    {editor && <SkillEditor state={editor} actions={actions} onSaved={reload} onClose={() => { setEditor(undefined) }} t={t} />}
    {importing && catalogue && <SkillImportDialog scope={scope} importLimitBytes={catalogue.importLimitBytes}
      importSkills={actions.importSkills} onImported={reload}
      onClose={() => { setImporting(false) }} t={t} />}
    {deleting && <Modal open title={t('trashTitle')} closeLabel={t('cancel')}
      onClose={() => { if (!busy) setDeleting(undefined) }} footer={<div className={css.footer}>
        <Button disabled={busy} onClick={() => { setDeleting(undefined) }}>{t('cancel')}</Button>
        <Button disabled={busy} variant="primary" onClick={() => {
          const selected = target(deleting)
          if (selected) void mutate(async () => { setTrashed(await actions.trash(selected)); setDeleting(undefined) })
        }}>{t('trash')}</Button>
      </div>}><p>{deleting.name}</p><p>{t('trashHint')}</p></Modal>}
  </main>
}
