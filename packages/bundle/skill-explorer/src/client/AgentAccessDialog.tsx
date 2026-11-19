/** Per-preset capability selection backed by the native authorization adapter. */
import { useRef, useState } from 'react'
import { Button, Input, Modal, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { AgentCapabilityPolicy, AuthorizationState } from '../authorization-types.ts'
import type { ToolboxMcpInventory } from '../mcp-types.ts'
import type { CliCatalogue } from '../cli-types.ts'
import type { SkillEntry, ToolPresentation } from '../types.ts'
import type { ToolboxActions } from './toolbox-actions.ts'
import type {} from './locales.ts'
import css from './Toolbox.module.css'

function emptyPolicy(): AgentCapabilityPolicy {
  return { enabled: false, nativeTools: [], skillNames: [], mcpServers: [], cliToolIds: [] }
}

function toggled(values: readonly string[], value: string, checked: boolean): string[] {
  return checked ? [...new Set([...values, value])] : values.filter(item => item !== value)
}

/**
 * Grant a preset explicit capabilities shared by all modes that use that preset.
 * @param props - Current policy revision and available native resources.
 * @returns A revision-fenced capability editor with native tools under advanced settings.
 */
export function AgentAccessDialog({ state, skills, mcp, cli, presentations = {}, actions, onSaved, onClose, t }: {
  state: AuthorizationState
  skills: SkillEntry[]
  mcp?: ToolboxMcpInventory | undefined
  cli?: CliCatalogue | undefined
  presentations?: Record<string, ToolPresentation> | undefined
  actions: ToolboxActions
  onSaved(this: void): Promise<void>
  onClose(this: void): void
} & PropsLocale<'skillExplorer'>) {
  const [preset, setPreset] = useState(state.presets[0]?.id ?? '')
  const [policy, setPolicy] = useState(state.policies[preset] ?? emptyPolicy())
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const locked = useRef(false)
  const save = async () => {
    if (locked.current || !preset) return
    locked.current = true
    setBusy(true)
    setFailed(false)
    try {
      await actions.authorization.save({ agentPreset: preset, policy, revision: state.revision })
      await onSaved()
      onClose()
    } catch {
      setFailed(true)
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  return <Modal open title={t('agentAccess')} closeLabel={t('close')} className={css.modal ?? ''}
    onClose={() => { if (!busy) onClose() }} footer={<div className={css.formFooter}>
      <Button disabled={busy} onClick={onClose}>{t('cancel')}</Button>
      <Button variant="primary" disabled={busy || !preset} onClick={() => { void save() }}>{t('saveChanges')}</Button>
    </div>}>
    <div className={css.form}>
      <label className={css.field}>{t('selectAgent')}<select value={preset} disabled={busy} onChange={(event) => {
        setPreset(event.target.value)
        setPolicy(state.policies[event.target.value] ?? emptyPolicy())
      }}>{state.presets.map(item => <option key={item.id} value={item.id}>{item.name ?? item.id}</option>)}</select></label>
      <CapabilityChoices state={state} skills={skills} mcp={mcp} cli={cli} presentations={presentations}
        policy={policy} setPolicy={setPolicy} busy={busy} t={t} />
      {failed && <p role="alert">{t('failure')}</p>}
    </div>
  </Modal>
}

/** Select explicit skills, connectors and tools while retaining native authorization semantics.
 * @param props - Available resources, current policy and draft update callback.
 * @returns Policy controls shared by the toolbox and expert editor.
 */
export function CapabilityChoices({ state, skills, mcp, cli, presentations = {}, policy, setPolicy, busy, t }: {
  state: AuthorizationState
  skills: SkillEntry[]
  mcp?: ToolboxMcpInventory | undefined
  cli?: CliCatalogue | undefined
  presentations?: Record<string, ToolPresentation> | undefined
  policy: AgentCapabilityPolicy
  setPolicy(this: void, policy: AgentCapabilityPolicy): void
  busy: boolean
} & PropsLocale<'skillExplorer'>) {
  const [query, setQuery] = useState('')
  const visible = (name: string) => name.toLowerCase().includes(query.toLowerCase())
  const services = (mcp?.connections ?? []).map(({ name }) => ({ name, title: presentations[`mcp:${name}`]?.title ?? name }))
  const visibleSkills = [...new Map(skills.map(item => [item.name, item])).values()].filter(item => visible(item.name))
  const visibleServices = services.filter(item => visible(item.title) || visible(item.name))
  const visibleTools = cli?.tools.filter(item => visible(item.name)) ?? []
  const visibleNativeTools = state.nativeTools.filter(item => visible(item.name))
  const choose = (field: 'skillNames' | 'mcpServers' | 'cliToolIds' | 'nativeTools', id: string, checked: boolean) => {
    setPolicy({ ...policy, [field]: toggled(policy[field], id, checked) })
  }
  return <div className={css.form}>
    <div className={css.choice}><Switch checked={policy.enabled} label={t('limitAgent')} disabled={busy}
      onChange={(enabled) => { setPolicy({ ...policy, enabled }) }} /><span>{t('limitAgent')}</span></div>
    <p className={css.hint}>{t('accessHint')}</p>
    {policy.enabled && <>
      <Input type="search" aria-label={t('toolboxSearch')} placeholder={t('toolboxSearch')} value={query}
        onChange={(event) => { setQuery(event.target.value) }} />
      {visibleSkills.length + visibleServices.length + visibleTools.length + visibleNativeTools.length === 0
          && <p className={css.hint}>{t('noTools')}</p>}
      {visibleSkills.length > 0 && <section><h3 className={css.sectionTitle}>{t('kind.skill')}</h3><div className={css.choices}>
        {visibleSkills.map(item => <label key={item.name} className={css.choice}>
          <input type="checkbox" checked={policy.skillNames.includes(item.name)} disabled={busy}
            onChange={(event) => { choose('skillNames', item.name, event.target.checked) }} /><span>{item.name}</span>
        </label>)}
      </div></section>}
      {visibleServices.length > 0 && <section><h3 className={css.sectionTitle}>{t('kind.mcp')}</h3><div className={css.choices}>
        {visibleServices.map(item => <label key={item.name} className={css.choice}>
          <input type="checkbox" checked={policy.mcpServers.includes(item.name)} disabled={busy}
            onChange={(event) => { choose('mcpServers', item.name, event.target.checked) }} /><span title={item.name}>{item.title}</span>
        </label>)}
      </div></section>}
      {visibleTools.length > 0 && <section><h3 className={css.sectionTitle}>{t('kind.cli')}</h3><div className={css.choices}>
        {visibleTools.map(item => <label key={item.id} className={css.choice}>
          <input type="checkbox" checked={policy.cliToolIds.includes(item.id)} disabled={busy}
            onChange={(event) => { choose('cliToolIds', item.id, event.target.checked) }} /><span>{item.name}</span>
        </label>)}
      </div></section>}
      {visibleNativeTools.length > 0 && <details className={css.advanced}><summary>{t('nativeTools')}</summary>
        <p className={css.hint}>{t('nativeHint')}</p><div className={css.choices}>
          {visibleNativeTools.map(item => <label key={item.name} className={css.choice}>
            <input type="checkbox" checked={policy.nativeTools.includes(item.name)} disabled={busy}
              onChange={(event) => { choose('nativeTools', item.name, event.target.checked) }} /><span>{item.name}</span>
          </label>)}
        </div>
      </details>}
    </>}
  </div>
}
