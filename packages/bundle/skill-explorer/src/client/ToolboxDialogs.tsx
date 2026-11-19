/** Connection and local-tool editors built from native form primitives. */
import { useEffect, useRef, useState } from 'react'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolboxMcpConfig, ToolboxMcpConnection, ToolboxMcpInventory } from '../mcp-types.ts'
import type { CliCatalogue, CliRecipe, CliToolId, CliToolView } from '../cli-types.ts'
import type { ToolPresentation, ToolPurpose } from '../types.ts'
import type { ToolboxActions } from './toolbox-actions.ts'
import { TOOL_PURPOSES } from './toolbox-presentation.ts'
import type {} from './locales.ts'
import css from './Toolbox.module.css'

const CLI_INPUT_TOKEN = '{input}'

type Labels = PropsLocale<'skillExplorer'>
type DialogActions = {
  actions: ToolboxActions
  onSaved(this: void): Promise<void>
  onClose(this: void): void
}

function lines(value: string): string[] { return value.split('\n').filter(line => line !== '') }

function values(value: string): Record<string, string | null> {
  const parsed: unknown = JSON.parse(value || '{}')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid object')
  const entries = Object.entries(parsed)
  if (entries.some(([, item]) => item !== null && typeof item !== 'string')) throw new Error('Invalid field value')
  return Object.fromEntries(entries.map(([key, item]) => [key, typeof item === 'string' ? item : null]))
}

/**
 * Choose a shared purpose label for a resource.
 * @param props - Current purpose and localized change callback.
 * @returns A native select matching the other toolbox form controls.
 */
export function PurposeField({ value, onChange, t }: {
  value: ToolPurpose
  onChange(this: void, value: ToolPurpose): void
} & Labels) {
  return <label className={css.field}>{t('purpose')}
    <select value={value} onChange={(event) => { onChange(event.target.value as ToolPurpose) }}>
      {TOOL_PURPOSES.map(purpose => <option value={purpose} key={purpose}>{t(`purpose.${purpose}`)}</option>)}
    </select>
  </label>
}

/**
 * Save display fields only while they still match the editor's opening snapshot.
 * @param actions - Native catalogue operations.
 * @param key - Stable resource identity.
 * @param presentation - Edited display fields.
 * @param original - Stored fields when editing began, or undefined for an uncustomized resource.
 * @returns False when another editor changed this resource; unrelated edits may advance the revision.
 */
export async function savePresentation(
  actions: ToolboxActions, key: string, presentation: ToolPresentation, original: ToolPresentation | undefined,
): Promise<boolean> {
  const current = await actions.catalog.read()
  const stored = current.items[key]
  if (stored?.title !== original?.title || stored?.description !== original?.description || stored?.purpose !== original?.purpose) {
    return false
  }
  await actions.catalog.save(key, presentation, current.revision)
  return true
}

/**
 * Edit native MCP configuration and human-readable connection metadata.
 * @param props - Native inventory revision, optional connection and display fields.
 * @returns A connection editor with technical options under an expandable section.
 */
export function ConnectionDialog({ inventory, connection, presentation, originalPresentation, actions, onSaved, onClose, t }: {
  inventory: ToolboxMcpInventory
  connection?: ToolboxMcpConnection | undefined
  presentation: ToolPresentation
  originalPresentation: ToolPresentation | undefined
} & DialogActions & Labels) {
  const [name, setName] = useState(() => connection?.name ?? `service_${randomUUID().slice(0, 8)}`)
  const [originalName, setOriginalName] = useState(connection?.name)
  const [revision, setRevision] = useState(inventory.revision)
  const [display, setDisplay] = useState(presentation)
  const [originalDisplay, setOriginalDisplay] = useState(originalPresentation)
  const [config, setConfig] = useState<ToolboxMcpConfig>(connection?.config ?? {
    transport: 'streamable-http', command: '', args: [], env: {}, cwd: '', url: '', headers: {}, enabled: true,
  })
  const [argumentText, setArgumentText] = useState(config.args.join('\n'))
  const [environment, setEnvironment] = useState(JSON.stringify(config.env, null, 2))
  const [headers, setHeaders] = useState(JSON.stringify(config.headers, null, 2))
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const locked = useRef(false)
  const editable = inventory.writable && connection?.editable !== false
  const valid = display.title.trim() && /^[A-Za-z0-9_-]{1,32}$/u.test(name)
    && (config.transport === 'stdio' ? config.command.trim() : config.url.trim())
  const save = async () => {
    if (!valid || locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    try {
      const headerValues = config.transport === 'streamable-http' ? values(headers) : {}
      if (config.transport === 'streamable-http' && token.trim()) {
        const reference = `TOOLBOX_${name.replaceAll('-', '_')}_TOKEN`
        await actions.mcp.setCredential(reference, token.trim())
        headerValues.Authorization = `Bearer \${credential:${reference}}`
      }
      const savedConfig = config.transport === 'stdio'
        ? { ...config, args: lines(argumentText), env: values(environment), url: '', headers: {} }
        : { ...config, command: '', args: [], env: {}, cwd: '', headers: headerValues }
      const saved = await actions.mcp.save({ name, ...(originalName ? { originalName } : {}), revision, config: savedConfig })
      setOriginalName(name)
      setRevision(saved.revision)
      if (!await savePresentation(actions, `mcp:${name}`, display, originalDisplay)) {
        setError(t('presentationChanged'))
        return
      }
      setOriginalDisplay(display)
      await onSaved()
      onClose()
    } catch {
      setError(t('failure'))
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  return <Modal open title={connection ? t('configure') : t('connectService')} closeLabel={t('close')}
    className={css.modal ?? ''} onClose={() => { if (!busy) onClose() }}
    footer={<div className={css.formFooter}><Button disabled={busy} onClick={onClose}>{t('cancel')}</Button>
      {editable && <Button variant="primary" disabled={busy || !valid} onClick={() => { void save() }}>{t('saveChanges')}</Button>}
    </div>}>
    <div className={css.form}>
      <label className={css.field}>{t('displayName')}<Input value={display.title} disabled={!editable || busy}
        onChange={(event) => { setDisplay({ ...display, title: event.target.value }) }} /></label>
      <PurposeField value={display.purpose} onChange={(purpose) => { setDisplay({ ...display, purpose }) }} t={t} />
      <label className={css.field}>{t('description')}<Input value={display.description} disabled={!editable || busy}
        onChange={(event) => { setDisplay({ ...display, description: event.target.value }) }} /></label>
      <label className={css.field}>{t('connectionMode')}<select disabled={!editable || busy} value={config.transport}
        onChange={(event) => { setConfig({ ...config, transport: event.target.value === 'stdio' ? 'stdio' : 'streamable-http' }) }}>
        <option value="streamable-http">{t('remoteService')}</option><option value="stdio">{t('localService')}</option>
      </select></label>
      {config.transport === 'streamable-http'
        ? <><label className={css.field}>{t('connectionAddress')}<Input value={config.url} disabled={!editable || busy}
          onChange={(event) => { setConfig({ ...config, url: event.target.value }) }} /></label>
        <label className={css.field}>{t('token')}<Input type="password" autoComplete="new-password" value={token}
          disabled={!editable || busy} onChange={(event) => { setToken(event.target.value) }} /><small>{t('tokenHint')}</small></label></>
        : <label className={css.field}>{t('command')}<Input value={config.command} disabled={!editable || busy}
          onChange={(event) => { setConfig({ ...config, command: event.target.value }) }} /></label>}
      <details className={css.advanced} open={config.transport === 'stdio'}><summary>{t('advanced')}</summary>
        <div className={css.form}>
          <label className={css.field}>{t('identifier')}<Input value={name} disabled={!!originalName || busy || !editable}
            onChange={(event) => { setName(event.target.value) }} /><small>{t('identifierHint')}</small></label>
          {config.transport === 'stdio' && <><label className={css.field}>{t('arguments')}<textarea rows={4}
            value={argumentText} disabled={!editable || busy} onChange={(event) => { setArgumentText(event.target.value) }} /></label>
          <label className={css.field}>{t('environment')}<textarea rows={3} value={environment} disabled={!editable || busy}
            onChange={(event) => { setEnvironment(event.target.value) }} /></label></>}
          {config.transport === 'streamable-http' && <label className={css.field}>{t('headers')}<textarea rows={3}
            value={headers} disabled={!editable || busy} onChange={(event) => { setHeaders(event.target.value) }} /></label>}
        </div>
      </details>
      {error && <p role="alert">{error}</p>}
    </div>
  </Modal>
}

/**
 * Configure a named command recipe whose arguments remain structured.
 * @param props - Current native catalogue and optional selected recipe.
 * @returns The local-tool editor with device identity and version check arguments.
 */
export function LocalToolDialog({ inventory, tool, actions, onSaved, onClose, t }: {
  inventory: CliCatalogue
  tool?: CliToolView | undefined
} & DialogActions & Labels) {
  const [id, setId] = useState(() => tool?.id ?? `tool-${randomUUID().slice(0, 8)}` as CliToolId)
  const [revision, setRevision] = useState(inventory.revision)
  const [recipe, setRecipe] = useState<CliRecipe>(tool ?? { name: '', description: '', category: 'general', command: '', args: [], versionArgs: ['--version'], enabled: true })
  const [argumentText, setArgumentText] = useState(recipe.args.join('\n'))
  const [versionText, setVersionText] = useState(recipe.versionArgs.join('\n'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const locked = useRef(false)
  const valid = recipe.name.trim() && recipe.description.trim() && recipe.command.trim() && /^[a-z][a-z0-9-]{0,39}$/u.test(id)
  const useTemplate = (template: string) => {
    if (template === 'text') {
      setRecipe({ name: t('sampleCount'), description: t('sampleDescription'), category: 'data', command: 'node',
        args: [], versionArgs: ['--version'], enabled: true })
      setArgumentText('-e\nprocess.stdout.write(String([...process.argv[1]].length))\n--\n{input}')
      setVersionText('--version')
    } else if (template === 'video') {
      setRecipe({ name: t('sampleVideo'), description: t('sampleVideoDescription'), category: 'media', command: 'ffprobe',
        args: [], versionArgs: ['-version'], enabled: true })
      setArgumentText('-v\nerror\n-show_format\n-show_streams\n-of\njson\n{input}')
      setVersionText('-version')
    }
  }
  const save = async () => {
    if (!valid || locked.current) return
    locked.current = true
    setBusy(true)
    setError(false)
    try {
      const saved = await actions.cli.save({
        id,
        expectedRevision: revision,
        recipe: { ...recipe, args: lines(argumentText), versionArgs: lines(versionText) },
      })
      setRevision(saved.revision)
      await onSaved()
      onClose()
    } catch {
      setError(true)
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  return <Modal open title={tool ? t('configure') : t('localTool')} closeLabel={t('close')}
    className={css.modal ?? ''} onClose={() => { if (!busy) onClose() }}
    footer={<div className={css.formFooter}><Button disabled={busy} onClick={onClose}>{t('cancel')}</Button>
      <Button variant="primary" disabled={busy || !valid} onClick={() => { void save() }}>{t('saveChanges')}</Button></div>}>
    <div className={css.form}>
      <p className={css.hint}>{t('host')} · {inventory.host}</p>
      {!tool && <label className={css.field}>{t('chooseTemplate')}<select defaultValue="" onChange={(event) => { useTemplate(event.target.value) }}>
        <option value="">{t('customTool')}</option><option value="text">{t('sampleCount')}</option><option value="video">{t('sampleVideo')}</option>
      </select></label>}
      <label className={css.field}>{t('displayName')}<Input value={recipe.name} disabled={busy}
        onChange={(event) => { setRecipe({ ...recipe, name: event.target.value }) }} /></label>
      <label className={css.field}>{t('description')}<Input value={recipe.description} disabled={busy}
        onChange={(event) => { setRecipe({ ...recipe, description: event.target.value }) }} /></label>
      <PurposeField value={recipe.category as ToolPurpose} onChange={(category) => { setRecipe({ ...recipe, category }) }} t={t} />
      <details className={css.advanced}><summary>{t('advanced')}</summary><div className={css.form}>
        <label className={css.field}>{t('command')}<Input value={recipe.command} disabled={busy}
          onChange={(event) => { setRecipe({ ...recipe, command: event.target.value }) }} /><small>{t('localHint')}</small></label>
        <label className={css.field}>{t('identifier')}<Input value={id} disabled={!!tool || busy}
          onChange={(event) => { setId(event.target.value as CliToolId) }} /></label>
        <label className={css.field}>{t('arguments')}<textarea rows={4} value={argumentText} disabled={busy}
          onChange={(event) => { setArgumentText(event.target.value) }} /><small>{t('argumentsHint')} <code>{CLI_INPUT_TOKEN}</code></small></label>
        <label className={css.field}>{t('versionArguments')}<textarea rows={2} value={versionText} disabled={busy}
          onChange={(event) => { setVersionText(event.target.value) }} /></label>
      </div></details>
      {error && <p role="alert">{t('failure')}</p>}
    </div>
  </Modal>
}

/**
 * Execute one saved local tool after the user supplies its input.
 * @param props - Selected recipe, execution action and available execution workspaces.
 * @returns An input dialog with the native process result.
 */
export function RunToolDialog({ tool, workspaces, actions, onClose, t }: {
  tool: CliToolView
  workspaces: readonly import('@deepseek-ai/dsh-api-workspace-controller/types').WorkspaceView[]
} & Omit<DialogActions, 'onSaved'> & Labels) {
  const [workspaceId, setWorkspaceId] = useState('')
  const [input, setInput] = useState('')
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const lifetime = useRef<AbortController>()
  const locked = useRef(false)
  useEffect(() => () => lifetime.current?.abort(), [])
  const run = async () => {
    if (locked.current) return
    locked.current = true
    const controller = new AbortController()
    lifetime.current = controller
    setBusy(true)
    setError(false)
    try {
      const workspace = workspaces.find(item => item.workspaceId === workspaceId)
      if (workspaceId && !workspace) throw new Error(t('workspaceUnavailable'))
      const output = await actions.cli.run({ id: tool.id, input,
        ...(workspace ? { workspaceId: workspace.workspaceId } : {}) }, controller.signal)
      if (controller.signal.aborted) return
      setResult(`${output.stdout}${output.stderr ? `\n${output.stderr}` : ''}`)
      setError(output.exitCode !== 0 || output.timedOut || output.aborted)
    } catch {
      if (!controller.signal.aborted) setError(true)
    } finally {
      locked.current = false
      if (!controller.signal.aborted) setBusy(false)
    }
  }
  return <Modal open title={tool.name} closeLabel={t('close')} className={css.modal ?? ''} onClose={onClose}
    footer={<div className={css.formFooter}><Button onClick={onClose}>{t('close')}</Button>
      <Button variant="primary" disabled={busy} onClick={() => { void run() }}>{t('run')}</Button></div>}>
    <div className={css.form}><label className={css.field}>{t('executionWorkspace')}<select value={workspaceId} disabled={busy} onChange={(event) => { setWorkspaceId(event.target.value) }}>
      <option value="">{t('defaultDirectory')}</option>{workspaces.map(item => <option key={item.workspaceId} value={item.workspaceId}>{item.title}</option>)}
    </select></label><label className={css.field}>{t('runInput')}<textarea rows={4} value={input}
      disabled={busy} onChange={(event) => { setInput(event.target.value) }} /></label>
    {result && <section aria-label={t('output')}><pre className={css.output}>{result}</pre></section>}
    {error && <p role="alert">{t('testFailed')}</p>}
    </div>
  </Modal>
}

/**
 * Edit a resource's purpose and readable title while retaining its native identifier.
 * @param props - Saved presentation and the update callback.
 * @returns A compact display-settings dialog.
 */
export function PresentationDialog({ presentation, save, onClose, t }: {
  presentation: ToolPresentation
  save(this: void, value: ToolPresentation): Promise<boolean>
  onClose(this: void): void
} & Labels) {
  const [value, setValue] = useState(presentation)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const locked = useRef(false)
  const submit = async () => {
    if (locked.current || !value.title.trim()) return
    locked.current = true
    setBusy(true)
    setError('')
    try {
      if (!await save(value)) {
        setError(t('presentationChanged'))
        return
      }
      onClose()
    } catch {
      setError(t('failure'))
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  return <Modal open title={t('editPresentation')} closeLabel={t('close')} className={css.modal ?? ''}
    onClose={() => { if (!busy) onClose() }}
    footer={<div className={css.formFooter}><Button disabled={busy} onClick={onClose}>{t('cancel')}</Button>
      <Button variant="primary" disabled={busy || !value.title.trim()} onClick={() => { void submit() }}>
        {t('saveChanges')}
      </Button></div>}>
    <div className={css.form}><label className={css.field}>{t('displayName')}<Input value={value.title}
      onChange={(event) => { setValue({ ...value, title: event.target.value }) }} /></label>
    <label className={css.field}>{t('description')}<textarea value={value.description} rows={3}
      onChange={(event) => { setValue({ ...value, description: event.target.value }) }} /></label>
    <PurposeField value={value.purpose} onChange={(purpose) => { setValue({ ...value, purpose }) }} t={t} />
    {error && <p role="alert">{error}</p>}
    </div>
  </Modal>
}
