/** Separate resource management for native skills, MCP connections and local tools. */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Button, Input, Modal, SegmentedControl, ReferenceIconRegular, Switch, Tooltip, IconPlusOutlineRegular,
  IconSettingsOutlineRegular, IconRefreshOutlineRegular, IconPlayOutlineRegular,
  IconTrashOutlineRegular, IconUsersOutlineRegular, IconLinkOutlineRegular, IconCodeOutlineRegular, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { McpManagedServerView } from '@deepseek-ai/dsh-mcp-manager/types'
import type { ListPayload, SkillEntry, SkillScope, ToolPresentation, ToolPurpose, ToolboxCatalogSnapshot } from '../types.ts'
import type { ToolboxMcpConnection, ToolboxMcpInventory } from '../mcp-types.ts'
import type { CliCatalogue, CliToolView } from '../cli-types.ts'
import type { AuthorizationState } from '../authorization-types.ts'
import type { ToolboxActions } from './toolbox-actions.ts'
import { SkillEditor, SkillImportDialog, type SkillEditState } from './SkillEditor.tsx'
import { SkillPreview, sourceLabel } from './SkillsPage.tsx'
import { AgentAccessDialog } from './AgentAccessDialog.tsx'
import { ConnectionDialog, LocalToolDialog, PresentationDialog, RunToolDialog, savePresentation } from './ToolboxDialogs.tsx'
import { TOOL_PURPOSES, toolPresentation } from './toolbox-presentation.ts'
import type {} from './locales.ts'
import css from './Toolbox.module.css'

type Kind = 'skill' | 'mcp' | 'cli'
type Resource = {
  key: string
  presentation: ToolPresentation
  status: string
  statusHint: string
  state: 'ready' | 'off' | 'connecting' | 'attention'
} & (
  { kind: 'skill'; value: SkillEntry } | { kind: 'mcp'; value: ToolboxMcpConnection } | { kind: 'cli'; value: CliToolView })
type Props = PropsRuntime<'main'> & PropsLocale<'skillExplorer'>
  & InjectFace<{ actions: ToolboxActions; useConnections: SnapshotSelectorHook<{ items: McpManagedServerView[] }> }>

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Separate resource types and keep global management independent of execution directories.
 * @param props - Native workspace, live connection status and owner actions.
 * @returns The toolbox and its in-place configuration dialogs.
 */
export function ToolboxPage({ t, actions, useWorkspaces, useConnections }: Props) {
  const workspaces = useWorkspaces(value => value.items)
  const connections = useConnections(value => value.items)
  const [workspaceChoice, setWorkspaceChoice] = useState('')
  const workspace = workspaces.find(item => item.workspaceId === workspaceChoice)
  const scope = useMemo<SkillScope>(() => workspace ? { workspaceId: workspace.workspaceId } : {}, [workspace?.workspaceId])
  const [skillSnapshot, setSkillSnapshot] = useState<{ workspaceId: string | undefined; value: ListPayload }>()
  const skills = skillSnapshot?.workspaceId === scope.workspaceId ? skillSnapshot?.value : undefined
  const [catalog, setCatalog] = useState<ToolboxCatalogSnapshot>()
  const [mcp, setMcp] = useState<ToolboxMcpInventory>()
  const [cli, setCli] = useState<CliCatalogue>()
  const [authorization, setAuthorization] = useState<AuthorizationState>()
  const [purpose, setPurpose] = useState<ToolPurpose | 'all'>('all')
  const [kind, setKind] = useState<Kind>('skill')
  const tabs = useId()
  const [skillEditor, setSkillEditor] = useState<SkillEditState>()
  const [importing, setImporting] = useState(false)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [noticeDetails, setNoticeDetails] = useState('')
  const [connectionEditor, setConnectionEditor] = useState<{ connection?: ToolboxMcpConnection }>()
  const [cliEditor, setCliEditor] = useState<{ tool?: CliToolView }>()
  const [skillPreview, setSkillPreview] = useState<SkillEntry>()
  const [access, setAccess] = useState(false)
  const [presentationEditor, setPresentationEditor] = useState<{
    resource: Resource
    original: ToolPresentation | undefined
  }>()
  const [running, setRunning] = useState<CliToolView>()
  const [deleting, setDeleting] = useState<Resource>()
  const [checkResult, setCheckResult] = useState<{ message: string; details?: string | undefined }>()
  const generation = useRef(0)
  const locked = useRef(false)
  const lifetime = useRef(new AbortController())
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => { controller.abort() }
  }, [])
  const refresh = useCallback(async () => {
    const current = ++generation.current
    setLoading(true)
    setNotice('')
    setNoticeDetails('')
    const accept = <T,>(value: T, update: (value: T) => void) => {
      if (current === generation.current) update(value)
    }
    const results = await Promise.allSettled([
      actions.skills.list(scope).then((value) => {
        accept(value, (value) => { setSkillSnapshot({ workspaceId: scope.workspaceId, value }) })
      }),
      actions.catalog.read().then((value) => { accept(value, setCatalog) }),
      actions.mcp.inventory().then((value) => { accept(value, setMcp) }),
      actions.cli.list().then((value) => { accept(value, setCli) }),
      actions.authorization.list().then((value) => { accept(value, setAuthorization) }),
    ])
    if (current !== generation.current) return
    const sources = [t('kind.skill'), t('editPresentation'), t('kind.mcp'), t('kind.cli'), t('agentAccess')]
    const failures = results.flatMap((result, index) => result.status === 'rejected'
      ? [`${sources[index]}\n${errorMessage(result.reason)}`] : [])
    setLoading(false)
    setNotice(failures.length ? t('loadFailure') : '')
    setNoticeDetails(failures.join('\n\n'))
  }, [actions, scope, t])
  useEffect(() => {
    void refresh()
    return () => { generation.current += 1 }
  }, [refresh])
  const mutate = async (operation: () => Promise<void>) => {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setNotice('')
    setNoticeDetails('')
    try {
      await operation()
      await refresh()
    } catch (error) {
      setNotice(t('failure'))
      setNoticeDetails(errorMessage(error))
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  const overrides = catalog?.items ?? {}
  const skillItems = skills?.groups.flatMap(group => group.skills) ?? []
  const resources: Resource[] = [
    ...(mcp?.connections ?? []).map((connection): Resource => {
      const value = { ...connection, status: connections.find(item => item.name === connection.name)?.status ?? connection.status }
      return { kind: 'mcp', value, key: `mcp:${value.name}`,
        presentation: toolPresentation(`mcp:${value.name}`, value.name, t('kind.mcp'), overrides),
        status: t(value.status.state === 'connected' ? 'serviceConnected' : value.status.state === 'disabled' ? 'off'
          : value.status.state === 'connecting' || value.status.state === 'reconnecting' ? 'connecting' : 'connectionFailed'),
        statusHint: t('serviceStatusHint'),
        state: value.status.state === 'connected' ? 'ready' : value.status.state === 'disabled' ? 'off'
          : value.status.state === 'connecting' || value.status.state === 'reconnecting' ? 'connecting' : 'attention' }
    }),
    ...(cli?.tools ?? []).map((value): Resource => ({ kind: 'cli', value, key: `cli:${value.id}`,
      presentation: toolPresentation(`cli:${value.id}`, value.name, value.description, overrides,
        TOOL_PURPOSES.find(purpose => purpose === value.category)),
      status: t(!value.enabled ? 'off' : value.availability.state === 'ready' ? 'programFound'
        : value.availability.state === 'missing' ? 'missing' : 'programCheckFailed'),
      statusHint: t('programStatusHint'),
      state: !value.enabled ? 'off' : value.availability.state === 'ready' ? 'ready' : 'attention' })),
    ...skillItems.map((value): Resource => ({ kind: 'skill', value, key: `skill:${value.name}`,
      presentation: toolPresentation(`skill:${value.name}`, value.name, value.description, overrides),
      status: t(value.modelInvocable ? 'enabled' : 'off'), statusHint: t('skillStatusHint'),
      state: value.modelInvocable ? 'ready' : 'off' })),
  ]
  const visible = resources.filter(resource => kind === resource.kind
    && (purpose === 'all' || purpose === resource.presentation.purpose)
    && `${resource.presentation.title} ${resource.presentation.description}`.toLowerCase().includes(query.toLowerCase()))
  const check = async (resource: Resource) => {
    if (resource.kind === 'mcp') {
      const result = await actions.mcp.probe(resource.value.name, lifetime.current.signal)
      setCheckResult(result.ok && result.closeConfirmed && !result.cleanupError
        ? { message: t('connected'), details: result.toolNames.join('\n') }
        : { message: t('testFailed'), details: result.ok ? result.cleanupError : result.message })
    } else if (resource.kind === 'cli') {
      const result = await actions.cli.probe({ id: resource.value.id }, lifetime.current.signal)
      setCheckResult(result.state === 'ready' ? { message: t('installed'), details: result.version }
        : { message: t('testFailed'), details: result.message })
    }
  }
  const toggle = async (resource: Resource, enabled: boolean) => {
    if (resource.kind === 'skill' && resource.value.path && resource.value.fileState === 'editable' && resource.value.level !== 'bundled' && !resource.value.linked) {
      await actions.skills.setEnabled({ ...scope, name: resource.value.name, path: resource.value.path, enabled })
    } else if (resource.kind === 'mcp' && mcp) {
      await actions.mcp.setEnabled({ name: resource.value.name, revision: mcp.revision, enabled })
    } else if (resource.kind === 'cli' && cli) {
      const value = resource.value
      await actions.cli.save({ id: value.id, expectedRevision: cli.revision, recipe: {
        name: value.name, description: value.description, category: value.category,
        command: value.command, args: value.args, versionArgs: value.versionArgs, enabled,
      } })
    }
  }
  return <main className={css.page} data-toolbox-page="" aria-busy={loading}><div className={css.content}>
    <header className={css.header}><h1>{t('title')}</h1><div className={css.headerActions}>
      <Tooltip label={t('agentAccess')} side="bottom" portal><Button size="sm" className={css.icon} disabled={!authorization}
        aria-label={t('agentAccess')} onClick={() => { setAccess(true) }}><IconUsersOutlineRegular size={16} /></Button></Tooltip>
      {kind === 'skill' && <Button size="sm" disabled={busy || !skills} onClick={() => { setImporting(true) }}>{t('importSkills')}</Button>}
      <Button size="sm" variant="primary" className={css.primary} disabled={busy}
        onClick={() => { if (kind === 'skill') setSkillEditor({ scope, draft: { name: '', description: '', content: '' } }); else if (kind === 'mcp') setConnectionEditor({}); else setCliEditor({}) }}><IconPlusOutlineRegular size={13} />{t(kind === 'skill' ? 'newSkill' : kind === 'mcp' ? 'connectService' : 'localTool')}</Button>
    </div></header>
    <SegmentedControl id={tabs} label={t('source')} value={kind} onChange={setKind}
      options={(['skill', 'mcp', 'cli'] as const).map(value => ({ value, label: t(`kind.${value}`) }))} />
    <p className={css.hint}>{t(`kindHint.${kind}`)}</p>
    <section role="tabpanel" id={`${tabs}-${kind}-panel`} aria-labelledby={`${tabs}-${kind}`}>
      <div className={css.filters}>{(['all', ...TOOL_PURPOSES] as const).map(value => <Button size="sm" key={value}
        className={css.filter} aria-pressed={purpose === value} onClick={() => { setPurpose(value) }}>{t(`purpose.${value}`)}</Button>)}</div>
      <div className={css.toolbar}><Input className={css.search ?? ''} type="search" placeholder={t('toolboxSearch')}
        aria-label={t('toolboxSearch')} value={query} onChange={(event) => { setQuery(event.target.value) }} />
      {kind === 'skill' && <select className={css.select} aria-label={t('workspace')} value={workspaceChoice} disabled={busy}
        onChange={(event) => { setSkillPreview(undefined); setWorkspaceChoice(event.target.value) }}>
        <option value="">{t('globalScope')}</option>
        {workspaces.map(item => <option key={item.workspaceId} value={item.workspaceId}>{item.title}</option>)}
      </select>}<Button size="sm" className={css.icon} aria-label={t('refresh')} disabled={busy || loading}
        onClick={() => { void refresh() }}><IconRefreshOutlineRegular size={16} /></Button>
      </div>
      {loading && visible.length === 0 && <div className={css.empty} role="status" aria-label={t('loadingTools')}>
        <StateDot state="ongoing" />
      </div>}
      {notice && <div className={css.notice} role="alert"><span>{notice}
        {noticeDetails && <details><summary>{t('errorDetails')}</summary><pre className={css.output}>{noticeDetails}</pre></details>}
      </span><Button size="sm" disabled={busy || loading} onClick={() => { void refresh() }}>{t('retry')}</Button></div>}
      {visible.length === 0 ? !loading && !notice && <div className={css.empty}>{t('noTools')}<p>{t('choosePurpose')}</p></div>
        : <div className={css.grid}>{visible.map(resource => <article className={css.card} key={resource.kind === 'skill' ? `${resource.key}:${resource.value.level}:${resource.value.path ?? ''}` : resource.key}>
          <div className={css.cardHeading}><span className={css.glyph} data-kind={resource.kind}>
            {resource.kind === 'mcp' ? <IconLinkOutlineRegular size={18} /> : resource.kind === 'cli'
              ? <IconCodeOutlineRegular size={18} /> : <ReferenceIconRegular kind="file" size={18} />}
          </span>
          <h3 className={css.title} title={resource.presentation.title}>{resource.presentation.title}</h3>
          {(resource.kind === 'skill' ? resource.value.fileState === 'editable' && resource.value.level !== 'bundled' && !resource.value.linked : resource.kind !== 'mcp' || resource.value.editable)
          && <Switch checked={resource.kind === 'mcp' ? resource.value.config?.enabled !== false : resource.kind === 'skill' ? resource.value.modelInvocable : resource.value.enabled}
            label={`${t('enabled')} ${resource.presentation.title}`} disabled={busy}
            onChange={(enabled) => { void mutate(() => toggle(resource, enabled)) }} />}
          </div><p className={css.description}>{resource.presentation.description}</p>
          <div className={css.footer}><span className={css.hint}>{t(`kind.${resource.kind}`)}{resource.kind === 'skill' && ` · ${sourceLabel(resource.value.level, t)}`}</span><Tooltip label={resource.statusHint} side="top" portal>
            <span className={css.status} data-state={resource.state} tabIndex={0}>{resource.status}</span>
          </Tooltip><div className={css.footerActions}>
            <div className={css.cardActions}>
              <Tooltip label={t('configure')} side="top" portal><Button size="sm" className={css.icon} disabled={busy}
                aria-label={`${t('configure')} ${resource.presentation.title}`} onClick={() => {
                  if (resource.kind === 'mcp') setConnectionEditor({ connection: resource.value })
                  else if (resource.kind === 'cli') setCliEditor({ tool: resource.value })
                  else setPresentationEditor({ resource, original: overrides[resource.key] })
                }}><IconSettingsOutlineRegular size={15} /></Button></Tooltip>
              {(resource.kind === 'mcp' ? resource.value.removable : resource.kind === 'cli' && !resource.value.inherited)
              && <Button size="sm" className={css.icon} disabled={busy} aria-label={`${t('remove')} ${resource.presentation.title}`}
                onClick={() => { setDeleting(resource) }}><IconTrashOutlineRegular size={15} /></Button>}
            </div>
            {resource.kind === 'skill'
              ? <Button size="sm" onClick={() => { setSkillPreview(resource.value) }}>{t('preview')}</Button>
              : resource.kind === 'cli' && resource.state === 'ready'
                ? <Button size="sm" disabled={busy} onClick={() => { setRunning(resource.value) }}><IconPlayOutlineRegular size={13} />{t('run')}</Button>
                : <Button size="sm" disabled={busy} onClick={() => { void mutate(() => check(resource)) }}>{t('test')}</Button>}
            {resource.kind === 'mcp' && resource.state === 'attention' && <Button size="sm" disabled={busy}
              onClick={() => { void mutate(() => actions.mcp.restart(resource.value.name)) }}>{t('reconnect')}</Button>}

          </div>
          </div>
        </article>)}</div>}
    </section>
  </div>
  {connectionEditor && mcp && <ConnectionDialog
    inventory={mcp}
    connection={connectionEditor.connection}
    actions={actions}
    presentation={connectionEditor.connection
      ? toolPresentation(`mcp:${connectionEditor.connection.name}`, connectionEditor.connection.name, t('kind.mcp'), overrides)
      : { title: '', description: '', purpose: 'general' }}
    originalPresentation={connectionEditor.connection ? overrides[`mcp:${connectionEditor.connection.name}`] : undefined}
    onSaved={refresh}
    onClose={() => { setConnectionEditor(undefined) }}
    t={t}
  />}
  {cliEditor && cli && <LocalToolDialog
    inventory={cli} tool={cliEditor.tool} actions={actions} onSaved={refresh}
    onClose={() => { setCliEditor(undefined) }} t={t}
  />}
  {skillPreview && <SkillPreview
    skill={skillPreview} scope={scope} read={actions.skills.read}
    onClose={() => { setSkillPreview(undefined) }} t={t}
  />}
  {access && authorization && <AgentAccessDialog
    state={authorization} skills={skillItems} mcp={mcp} cli={cli} presentations={overrides} actions={actions}
    onSaved={refresh} onClose={() => { setAccess(false) }} t={t}
  />}
  {skillEditor && <SkillEditor state={skillEditor} actions={actions.skills} onSaved={refresh}
    onClose={() => { setSkillEditor(undefined) }} t={t} />}
  {importing && skills && <SkillImportDialog scope={scope} importLimitBytes={skills.importLimitBytes}
    importSkills={actions.skills.importSkills} onImported={refresh} onClose={() => { setImporting(false) }} t={t} />}
  {running && <RunToolDialog
    tool={running} workspaces={workspaces} actions={actions}
    onClose={() => { setRunning(undefined) }} t={t}
  />}
  {presentationEditor && <PresentationDialog
    presentation={presentationEditor.resource.presentation} t={t}
    onClose={() => { setPresentationEditor(undefined) }}
    save={async (value) => {
      const saved = await savePresentation(actions, presentationEditor.resource.key, value, presentationEditor.original)
      if (saved) await refresh()
      return saved
    }}
  />}
  {checkResult && <Modal open title={t('test')} closeLabel={t('close')} onClose={() => { setCheckResult(undefined) }}>
    <p>{checkResult.message}</p>{checkResult.details && <details className={css.advanced}><summary>{t('advanced')}</summary><pre className={css.output}>{checkResult.details}</pre></details>}
  </Modal>}
  {deleting && <Modal open title={t('removeTitle')} closeLabel={t('cancel')} onClose={() => { setDeleting(undefined) }}
    footer={<div className={css.formFooter}><Button disabled={busy} onClick={() => { setDeleting(undefined) }}>{t('cancel')}</Button>
      <Button variant="primary" disabled={busy} onClick={() => { void mutate(async () => {
        if (deleting.kind === 'mcp' && mcp) await actions.mcp.remove({ name: deleting.value.name, revision: mcp.revision })
        else if (deleting.kind === 'cli' && cli) await actions.cli.remove({ id: deleting.value.id, expectedRevision: cli.revision })
        setDeleting(undefined)
      }) }}>{t('remove')}</Button></div>}><p>{deleting.presentation.title}</p><p>{t('removeHint')}</p></Modal>}
  </main>
}
