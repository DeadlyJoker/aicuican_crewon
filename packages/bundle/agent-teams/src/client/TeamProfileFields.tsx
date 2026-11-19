/** Shared fields for manual authoring and the conversation's reviewed team draft. */
import { useCallback, useRef, useState } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ExpertDefinition } from '../expert-types.ts'
import type { TeamAuthoringInput, TeamMember, TeamProfile } from '../team-authoring-types.ts'
import { AgentAvatar } from './TeamCard.tsx'
import { ExpertPicker, type ExpertPickerActions, type ExpertPickerSelection } from './ExpertPicker.tsx'
import css from './TeamTemplates.module.css'

/** The same editable values and expert snapshots are used by both authoring entry points. */
export interface TeamProfileFieldsProps {
  value: TeamAuthoringInput
  onChange(this: void, value: TeamAuthoringInput): void
  experts: ExpertDefinition[]
  maxMembers: number
  disabled?: boolean
  expertPicker?: ExpertPickerActions
  onPendingChange?(this: void, pending: boolean): void
  t: PropsLocale<'expertTeamTemplates'>['t']
}

/** Render compact member rows, expanding only the member being edited. */
export function TeamProfileFields({ value, onChange, experts, maxMembers, disabled, expertPicker,
  onPendingChange, t }: TeamProfileFieldsProps) {
  const [expanded, setExpanded] = useState(0)
  const [pickerPending, setPickerPending] = useState(false)
  const reportPending = useCallback((pending: boolean) => {
    setPickerPending(pending)
    onPendingChange?.(pending)
  }, [onPendingChange])
  const currentValue = useRef(value)
  currentValue.current = value
  const profile = value.profile
  const update = (change: Partial<Pick<TeamProfile, 'description' | 'goal' | 'constraints' | 'deliverables' | 'examples' | 'protocol' | 'members'>>) => { onChange({ ...value, profile: { ...profile, ...change } }) }
  const updateMember = (index: number, change: Partial<Pick<TeamMember, 'name' | 'role' | 'executionPrompt' | 'agentPreset' | 'expertId'>>) => {
    update({ members: profile.members.map((member, position) => position === index ? { ...member, ...change } : member) })
  }
  const chooseExpert = (index: number, member: TeamMember, selection: ExpertPickerSelection | undefined) => {
    if (currentValue.current.name !== value.name || currentValue.current.profile !== profile
      || currentValue.current.profile.members[index] !== member) return
    const expert = selection?.expert ?? experts.find(item => item.preset === selection?.preset)
    if (expert) {
      updateMember(index, { expertId: expert.id, agentPreset: expert.preset, name: expert.name,
        role: expert.description || expert.name, executionPrompt: expert.description || expert.name })
    } else if (selection) {
      const { expertId: _expertId, ...fields } = member
      update({ members: profile.members.map((item, position) => position === index ? { ...fields, agentPreset: selection.preset } : item) })
    } else {
      const { agentPreset: _preset, expertId: _id, ...custom } = member
      update({ members: profile.members.map((item, position) => position === index ? custom : item) })
    }
  }
  return <fieldset className={css.fields} disabled={disabled || pickerPending}>
    <div className={css.headingFields}>
      <label>{t('name')}<Input value={value.name} onChange={(event) => { onChange({ ...value, name: event.target.value }) }} /></label>
      <label>{t('specialty')}<Input value={profile.description ?? ''} onChange={(event) => { update({ description: event.target.value }) }} /></label>
    </div>
    <details className={css.guidance}>
      <summary>{t('guidance')}</summary>
      <div className={css.guidanceFields}>
        <label>{t('teamGoal')}<textarea rows={2} value={profile.goal ?? ''} onChange={(event) => { update({ goal: event.target.value }) }} /></label>
        <label>{t('constraints')}<textarea rows={2} value={profile.constraints ?? ''} onChange={(event) => { update({ constraints: event.target.value }) }} /></label>
        <label>{t('deliverables')}<textarea rows={2} value={profile.deliverables ?? ''} onChange={(event) => { update({ deliverables: event.target.value }) }} /></label>
        <label>{t('protocol')}<textarea rows={2} value={profile.protocol ?? ''} onChange={(event) => { update({ protocol: event.target.value }) }} /></label>
        <label className={css.duties}>{t('examples')}<textarea rows={2} value={profile.examples?.join('\n') ?? ''}
          onChange={(event) => { update({ examples: event.target.value.split('\n') }) }} /></label>
      </div>
    </details>
    <div className={css.membersHeading}><h4>{t('members')} <span>{profile.members.length}</span></h4>
      <Button variant="outline" disabled={profile.members.length >= maxMembers} onClick={() => {
        setExpanded(profile.members.length)
        update({ members: [...profile.members, { name: '', role: '', executionPrompt: '' }] })
      }}>{t('add')}</Button></div>
    <div className={css.memberList}>{profile.members.map((member, index) => <section className={css.memberCard} key={index}>
      <button className={css.memberSummary} type="button" aria-expanded={expanded === index}
        onClick={() => { setExpanded(expanded === index ? -1 : index) }}>
        <AgentAvatar index={index} label={member.name || t('memberCount', { count: index + 1 })} />
        <span className={css.memberIdentity}><strong>{member.name || t('memberName')}</strong><small>{member.role || t('role')}</small></span>
        <span className={css.chevron} aria-hidden>{expanded === index ? '⌄' : '›'}</span>
      </button>
      {expanded === index && <div className={css.member}>
        <ExpertPicker label={t('chooseExpert')} value={member.agentPreset ?? ''} selectedLabel={member.name}
          emptyLabel={t('customRole')} disabled={Boolean(disabled)}
          presets={experts.map(expert => ({ id: expert.preset, name: expert.name }))}
          {...(expertPicker === undefined ? {} : { actions: expertPicker })}
          onPendingChange={reportPending}
          onChange={(selection) => { chooseExpert(index, member, selection) }} />
        <label>{t('memberName')}<Input value={member.name} onChange={(event) => { updateMember(index, { name: event.target.value }) }} /></label>
        <label className={css.duties}>{t('role')}<Input value={member.role ?? ''} onChange={(event) => { updateMember(index, { role: event.target.value }) }} /></label>
        <label className={css.duties}>{t('duties')}<textarea rows={3} value={member.executionPrompt ?? ''}
          onChange={(event) => { updateMember(index, { executionPrompt: event.target.value }) }} /></label>
        <Button disabled={profile.members.length === 1} onClick={() => {
          update({ members: profile.members.filter((_, position) => position !== index) })
          setExpanded(Math.min(index, profile.members.length - 2))
        }}>{t('removeMember')}</Button>
      </div>}
    </section>)}</div>
  </fieldset>
}
