/** Latest-reply placement for durable reusable-team review cards. */
import { useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TeamAuthoringDraft, TeamAuthoringInput } from '../team-authoring-types.ts'
import type { ExpertDefinition } from '../expert-types.ts'
import type { CatalogueFace } from './catalogue.ts'
import { TeamAuthoringCard } from './TeamAuthoringCard.tsx'
import type { ExpertPickerActions } from './ExpertPicker.tsx'

interface Actions {
  expertPicker?: ExpertPickerActions
  read(sessionId: SessionId): Promise<TeamAuthoringDraft | null>
  listExperts(): Promise<{ experts: ExpertDefinition[] }>
  maxMembers(): number
  update(sessionId: SessionId, draft: TeamAuthoringDraft, input: TeamAuthoringInput): Promise<TeamAuthoringDraft>
  confirm(sessionId: SessionId, draft: TeamAuthoringDraft): Promise<TeamAuthoringDraft>
  discard(sessionId: SessionId, draft: TeamAuthoringDraft): Promise<TeamAuthoringDraft>
}
type Props = PropsRuntime<'conversation.chat.turnTail'> & PropsLocale<'expertTeamTemplates'> & InjectFace<Actions & CatalogueFace>

/** Render one recoverable card below the latest completed reply.
 * @param props - Conversation placement, durable authoring operations and shared catalogue updates.
 * @returns A review card or no content before a proposal exists.
 */
export function TeamAuthoringTail({ sessionId, turn, useChat, useCatalogue, read, listExperts, maxMembers,
  update, confirm, discard, expertPicker, t }: Props) {
  const latest = useChat(snapshot => snapshot.timeline.turnOrder.at(-1))
  const revision = useCatalogue(value => value)
  const [draft, setDraft] = useState<TeamAuthoringDraft | null>(null)
  const [experts, setExperts] = useState<ExpertDefinition[]>([])
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const locked = useRef(false)
  const visible = latest === turn.turn && turn.status === 'closed'
  useEffect(() => {
    if (!visible) return
    let active = true
    void Promise.all([read(sessionId), listExperts()]).then(([value, list]) => {
      if (active) { setDraft(value); setExperts(list.experts); setFailed(false) }
    }, () => { if (active) setFailed(true) })
    return () => { active = false }
  }, [visible, revision, read, listExperts, sessionId])
  const apply = async (operation: () => Promise<TeamAuthoringDraft>) => {
    if (locked.current) return
    locked.current = true; setBusy(true); setFailed(false)
    try { setDraft(await operation()) }
    catch (error) { setFailed(true); throw error }
    finally { locked.current = false; setBusy(false) }
  }
  if (!visible || !draft) return null
  return <TeamAuthoringCard draft={draft} experts={experts} maxMembers={maxMembers()} busy={busy} failed={failed} t={t}
    {...(expertPicker === undefined ? {} : { expertPicker })}
    update={input => apply(() => update(sessionId, draft, input))}
    confirm={() => { void apply(() => confirm(sessionId, draft)).catch(() => { /* Card retains the failure and retry action. */ }) }}
    discard={() => { void apply(() => discard(sessionId, draft)).catch(() => { /* Card retains the failure and retry action. */ }) }} />
}
