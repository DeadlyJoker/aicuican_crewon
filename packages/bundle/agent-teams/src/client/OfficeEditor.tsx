/** Shared office configuration form for creation and conversation-owned settings. */
import { useId, useRef, useState } from 'react'
import { Button, Input, Modal, Tooltip, IconChevronDownOutlineRegular, IconPlusOutlineRegular, IconTrashOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { Office, OfficeMemberId, OfficeUpdate } from '../office-types.ts'
import type {} from './office-copy.ts'
import { AgentAvatar } from './TeamCard.tsx'
import { ExpertPicker, type ExpertPickerActions, type ExpertPickerSelection } from './ExpertPicker.tsx'
import css from './OfficePage.module.css'

/** Controlled draft and save state for an office configuration dialog. */
export type OfficeEditorProps = {
  draft: OfficeUpdate
  change: (draft: OfficeUpdate) => void
  presets: readonly { id: string; name?: string; broken?: string; expertName?: string; expertRole?: string; expertPrompt?: string }[]
  presetsFailed?: boolean
  expertPicker?: ExpertPickerActions
  editing?: boolean
  busy: boolean
  failed: boolean
  save: () => void
  close: () => void
} & PropsLocale<'teamOffice'>

/**
 * Copy editable fields without including conversation-specific child sessions.
 * @param office - Persisted office or a topic-scoped office view.
 * @returns An independent draft retaining stable member identities.
 */
export function officeUpdateFrom(office: Office): OfficeUpdate {
  const leaderIndex = office.members.findIndex(member => member.id === office.leaderId)
  return { name: office.name, description: office.description,
    members: office.members.map(({ sessionId: _sessionId, ...member }) => ({ ...member })),
    ...(leaderIndex < 0 ? {} : { leaderIndex }) }
}

/** Edit office fields while retaining existing member identities in the draft. */
export function OfficeEditor({ draft, change, presets, presetsFailed, expertPicker,
  editing, busy, failed, save, close, t }: OfficeEditorProps) {
  const formId = useId()
  const [expanded, setExpanded] = useState(editing ? -1 : 0)
  const [choosing, setChoosing] = useState(false)
  const currentDraft = useRef(draft)
  currentDraft.current = draft
  const locked = busy || choosing
  const names = draft.members.map(member => member.name.trim().normalize('NFKC').toLowerCase())
  const duplicateNames = names.some((name, index) => name && names.indexOf(name) !== index)
  const valid = draft.name.trim() && draft.members.length > 0 && !duplicateNames
    && draft.members.every(member => member.name.trim() && member.role.trim() && member.instruction.trim())
  const patchMember = (index: number, fields: Partial<OfficeUpdate['members'][number]>) => {
    change({ ...draft, members: draft.members.map((member, position) => position === index ? { ...member, ...fields } : member) })
  }
  const selectExpert = (index: number, selection: ExpertPickerSelection | undefined) => {
    const current = currentDraft.current
    const member = current.members[index]
    if (!member) return
    const preset = presets.find(item => item.id === selection?.preset)
    const name = selection?.expert?.name ?? preset?.expertName
    const role = selection?.expert?.description || preset?.expertRole || name
    const { agentPreset: _previous, ...fields } = member
    change({ ...current, members: current.members.map((item, position) => position === index
      ? { ...fields, ...(selection ? { agentPreset: selection.preset } : {}),
        ...(name ? { ...(member.name.trim() ? {} : { name }), role: role || name, instruction: role || name } : {}) } : item) })
  }
  const removeMember = (index: number) => {
    const { leaderIndex, ...fields } = draft
    const nextLeader = leaderIndex === undefined || leaderIndex === index ? undefined
      : leaderIndex > index ? leaderIndex - 1 : leaderIndex
    change({ ...fields, members: draft.members.filter((_, position) => position !== index),
      ...(nextLeader === undefined ? {} : { leaderIndex: nextLeader }) })
    setExpanded(value => value > index ? value - 1 : Math.min(value, draft.members.length - 2))
  }
  return <Modal open title={t(editing ? 'settings' : 'create')} closeLabel={t('cancel')}
    onClose={() => { if (!locked) close() }} className={css.modal ?? ''} contentClassName={css.modalContent ?? ''}
    footer={<div className={css.formActions}>
      <Button disabled={locked} onClick={close}>{t('cancel')}</Button>
      <Button type="submit" form={formId} variant="primary" disabled={locked || !valid}>{t(editing ? 'saveLeader' : 'save')}</Button>
    </div>}>
    <form id={formId} className={css.form} onSubmit={(event) => { event.preventDefault(); if (valid && !locked) save() }}>
      <div className={css.officeFields}>
        <label>{t('name')}<Input required maxLength={80} disabled={locked} value={draft.name}
          onChange={(event) => { change({ ...draft, name: event.target.value }) }} /></label>
        <label>{t('description')}<Input maxLength={400} disabled={locked} value={draft.description}
          onChange={(event) => { change({ ...draft, description: event.target.value }) }} /></label>
      </div>
      <div className={css.membersHeading}><h4>{t('teamMembers')} <span>{draft.members.length}</span></h4>
        <Button size="sm" disabled={locked} onClick={() => {
          setExpanded(draft.members.length)
          change({ ...draft, members: [...draft.members, { ...(editing ? { id: randomUUID() as OfficeMemberId } : {}), name: '', role: '', instruction: '' }] })
        }}><IconPlusOutlineRegular size={16} />{t('add')}</Button>
      </div>
      <div className={css.memberList}>{draft.members.map((member, index) => <section key={member.id ?? index} className={css.memberCard}>
        <div className={css.memberSummary}>
          <button type="button" className={css.memberToggle} disabled={locked} aria-expanded={expanded === index}
            aria-controls={`${formId}-member-${index}`} onClick={() => { setExpanded(value => value === index ? -1 : index) }}>
            <AgentAvatar index={index} label={member.name || t('memberName')} />
            <span className={css.memberIdentity}><strong>{member.name || `${t('memberName')} ${index + 1}`}</strong>
              {member.role && <span>{member.role}</span>}</span>
            {draft.leaderIndex === index && <span className={css.leaderBadge}>{t('leader')}</span>}
            <IconChevronDownOutlineRegular size={14} className={css.memberChevron} />
          </button>
          <Tooltip label={t('remove')} portal><Button size="sm" aria-label={t('remove')} className={css.remove}
            disabled={locked || draft.members.length === 1} onClick={() => { removeMember(index) }}>
            <IconTrashOutlineRegular size={16} /></Button></Tooltip>
        </div>
        {expanded === index && <div id={`${formId}-member-${index}`} className={css.memberEditor}>
          <div className={css.memberFields}>
            <label>{t('memberName')}<Input required maxLength={80} disabled={locked} value={member.name}
              onChange={(event) => { patchMember(index, { name: event.target.value }) }} /></label>
            <label>{t('role')}<Input required maxLength={400} disabled={locked} value={member.role}
              onChange={(event) => { patchMember(index, { role: event.target.value }) }} /></label>
          </div>
          <label>{t('instruction')}<textarea required rows={3} maxLength={4000} disabled={locked} value={member.instruction}
            onChange={(event) => { patchMember(index, { instruction: event.target.value }) }} /></label>
          <ExpertPicker label={t('chooseExpert')} value={member.agentPreset ?? ''} emptyLabel={t('inherit')}
            {...(member.agentPreset ? { selectedLabel: presets.find(item => item.id === member.agentPreset)?.name ?? member.role } : {})}
            {...(expertPicker ? { actions: expertPicker } : {})} presets={presets} disabled={busy}
            onChange={(selection) => { selectExpert(index, selection) }} onPendingChange={setChoosing} />
        </div>}
      </section>)}</div>
      <div className={css.leaderSetting}>
        <label>{t('leader')}<select disabled={locked} value={draft.leaderIndex ?? ''} onChange={(event) => {
          const { leaderIndex: _previous, ...fields } = draft
          change({ ...fields, ...(event.target.value === '' ? {} : { leaderIndex: Number(event.target.value) }) })
        }}><option value="">{t('noLeader')}</option>{draft.members.map((member, index) =>
            <option key={member.id ?? index} value={index}>{member.name || `${t('memberName')} ${index + 1}`}</option>)}</select></label>
        <p className={css.leaderHint}>{t('leaderHint')}</p>
      </div>
      {editing && <p className={css.leaderHint}>{t('editMembersHint')}</p>}
      {presetsFailed && <p role="alert">{t('presetsFailed')}</p>}
      {duplicateNames && <p role="alert">{t('duplicateNames')}</p>}
      {failed && <p role="alert">{t('failure')}</p>}
    </form>
  </Modal>
}
