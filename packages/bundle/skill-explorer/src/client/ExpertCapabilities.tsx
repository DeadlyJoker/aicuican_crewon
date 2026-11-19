/** Stage an expert's capabilities using the same authorization owner as the toolbox. */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AgentCapabilityPolicy, AuthorizationState } from '../authorization-types.ts'
import type { SkillEntry } from '../types.ts'
import type { ToolboxMcpInventory } from '../mcp-types.ts'
import type { CliCatalogue } from '../cli-types.ts'
import type { ToolboxActions } from './toolbox-actions.ts'
import type {} from './capability-slot.ts'
import { CapabilityChoices } from './AgentAccessDialog.tsx'
import css from './Toolbox.module.css'

type Props = PropsRuntime<'toolbox.expert-capabilities'> & PropsLocale<'skillExplorer'> & InjectFace<{ actions: ToolboxActions }>
interface Catalogue {
  authorization: AuthorizationState
  skills: SkillEntry[]
  mcp: ToolboxMcpInventory
  cli: CliCatalogue
}

/** Load and stage a policy; commit failures retain the draft and prevent a successful expert-form settlement.
 * @param props - Source preset, parent save lifecycle and authenticated toolbox actions.
 * @returns Inline capability choices with an explicit retry after discovery failure.
 */
export function ExpertCapabilities({ agentPreset, busy, registerCommit, actions, t }: Props) {
  const [catalogue, setCatalogue] = useState<Catalogue>()
  const [policy, setPolicy] = useState<AgentCapabilityPolicy>()
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const current = useRef<{ catalogue: Catalogue; policy: AgentCapabilityPolicy }>()
  useEffect(() => {
    let active = true
    current.current = undefined
    setCatalogue(undefined); setPolicy(undefined); setFailed(false)
    void Promise.all([actions.authorization.list(), actions.skills.list({}), actions.mcp.inventory(), actions.cli.list()])
      .then(([authorization, skills, mcp, cli]) => {
        if (!active) return
        const next = { authorization, skills: skills.groups.flatMap(group => group.skills), mcp, cli }
        const initial = authorization.policies[agentPreset] ?? {
          enabled: false, nativeTools: authorization.nativeTools.map(tool => tool.name), skillNames: [], mcpServers: [], cliToolIds: [],
        }
        current.current = { catalogue: next, policy: initial }
        setCatalogue(next); setPolicy(initial)
      }, () => { if (active) setFailed(true) })
    return () => { active = false; current.current = undefined }
  }, [actions, agentPreset, retry])
  useEffect(() => registerCommit(async () => {
    const value = current.current
    if (!value) throw new Error(t('capabilitiesUnavailable'))
    const source = await actions.authorization.list()
    const original = value.catalogue.authorization.policies[agentPreset]
    if (JSON.stringify(source.policies[agentPreset]) !== JSON.stringify(original)) throw new Error(t('capabilitiesChanged'))
    return async (target) => {
      // Read the current revision: saving the expert may have changed unrelated profile settings.
      const state = await actions.authorization.list()
      if (JSON.stringify(state.policies[agentPreset]) !== JSON.stringify(original)) throw new Error(t('capabilitiesChanged'))
      if (target !== agentPreset && state.policies[target] !== undefined
        && JSON.stringify(state.policies[target]) !== JSON.stringify(value.policy)) throw new Error(t('capabilitiesChanged'))
      await actions.authorization.save({ agentPreset: target, policy: value.policy, revision: state.revision })
    }
  }), [actions, agentPreset, registerCommit, t])
  return <section aria-label={t('accessHeading')}>
    <h3>{t('accessHeading')}</h3>
    <p className={css.hint}>{t('expertCapabilityHint')}</p>
    {catalogue && policy ? <CapabilityChoices state={catalogue.authorization} skills={catalogue.skills}
      mcp={catalogue.mcp} cli={catalogue.cli} policy={policy} busy={busy} t={t}
      setPolicy={(next) => { current.current = { catalogue, policy: next }; setPolicy(next) }} />
      : failed ? <p role="alert">{t('capabilitiesUnavailable')} <Button type="button" disabled={busy} onClick={() => { setRetry(value => value + 1) }}>{t('retry')}</Button></p>
        : <p role="status">{t('loadingTools')}</p>}
  </section>
}
