/** Compact approval card for a durable reusable-team proposal. */
import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ExpertDefinition } from '../expert-types.ts'
import type { TeamAuthoringDraft, TeamAuthoringInput } from '../team-authoring-types.ts'
import { TeamProfileFields } from './TeamProfileFields.tsx'
import { AgentAvatar } from './TeamCard.tsx'
import type { ExpertPickerActions } from './ExpertPicker.tsx'
import css from './TeamTemplates.module.css'

/** Host-owned actions retain revision fencing and restore the same card after a restart. */
export interface TeamAuthoringCardProps {
  draft: TeamAuthoringDraft
  experts: ExpertDefinition[]
  maxMembers: number
  busy?: boolean
  failed?: boolean
  expertPicker?: ExpertPickerActions
  update(this: void, value: TeamAuthoringInput): Promise<void>
  confirm(this: void): void
  discard(this: void): void
  t: PropsLocale<'expertTeamTemplates'>['t']
}

/** The reusable-team card uses the same member editor as the Teams page. */
export function TeamAuthoringCard({ draft, experts, maxMembers, busy, failed, expertPicker, update,
  confirm, discard, t }: TeamAuthoringCardProps) {
  const [editing, setEditing] = useState<TeamAuthoringInput>()
  const [pickerPending, setPickerPending] = useState(false)
  const closed = draft.status === 'saved' || draft.status === 'discarded'
  return <section className={css.reviewCard} aria-label={t('reviewTitle')}>
    <header className={css.reviewHeading}><div><strong>{draft.name}</strong><p>{draft.profile.description}</p></div>
      <span className={css.reviewStatus}>{t(draft.status === 'saved' ? 'saved' : draft.status === 'discarded' ? 'discarded' : 'pendingReview')}</span></header>
    {editing ? <form onSubmit={(event) => {
      event.preventDefault()
      if (busy || pickerPending) return
      void update(editing).then(() => { setEditing(undefined) }).catch((_error: unknown) => {
        // The owner renders failure and retains this editor.
      })
    }}>
      <TeamProfileFields value={editing} onChange={setEditing} experts={experts} maxMembers={maxMembers} disabled={Boolean(busy)} t={t}
        {...(expertPicker === undefined ? {} : { expertPicker })} onPendingChange={setPickerPending} />
      <footer className={css.actions}><Button type="submit" variant="primary" disabled={Boolean(busy) || pickerPending}>{t('updateDraft')}</Button>
        <Button disabled={Boolean(busy) || pickerPending} onClick={() => { setEditing(undefined) }}>{t('cancel')}</Button></footer>
    </form> : <>
      <div className={css.reviewMembers}>{draft.profile.members.map((member, index) => <div key={index}>
        <AgentAvatar index={index} label={member.name} /><span><strong>{member.name}</strong><small>{member.role}</small></span>
      </div>)}</div>
      {draft.profile.deliverables && <p className={css.reviewOutput}>{draft.profile.deliverables}</p>}
      {!closed && <footer className={css.reviewActions}>
        <span>{t('saveWithoutRunning')}</span><div className={css.actions}>
          <Button disabled={Boolean(busy)} onClick={() => { setEditing({ name: draft.name, profile: structuredClone(draft.profile), ...(draft.replace !== undefined ? { replace: draft.replace } : {}) }) }}>{t('edit')}</Button>
          <Button disabled={Boolean(busy)} onClick={discard}>{t('discardDraft')}</Button>
          <Button variant="primary" disabled={Boolean(busy)} onClick={confirm}>{t(busy ? 'saving' : 'confirmSave')}</Button>
        </div></footer>}
    </>}
    {failed && <p role="alert" className={css.error}>{t('failure')}</p>}
  </section>
}
