/** Long-lived office definitions and explicitly addressed discussions. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { CommandId } from '@deepseek-ai/dsh-commands/brand'

/** Persistent office identity. */
export type OfficeId = Branded<'office-id'>
/** Stable membership identity, independent of its native Session. */
export type OfficeMemberId = Branded<'office-member-id'>
/** Idempotent addressed message identity. */
export type OfficeMessageId = Branded<'office-message-id'>

/** One named specialist, with a native session identity for the containing conversation. */
export interface OfficeMember {
  id: OfficeMemberId
  name: string
  role: string
  instruction: string
  agentPreset?: string
  sessionId?: SessionId
}

/** A reusable office becomes bound to one workspace and conversation on opening. */
export interface Office {
  id: OfficeId
  name: string
  description: string
  members: OfficeMember[]
  /** Default recipient for unaddressed requests; absent when no leader is selected. */
  leaderId?: OfficeMemberId
  sessionId?: SessionId
  workspaceId?: WorkspaceId
}

/** Editable office fields, retained separately from the member session histories. */
export type OfficeDraft = Pick<Office, 'name' | 'description'> & {
  members: Omit<OfficeMember, 'id' | 'sessionId'>[]
  /** Index into the new draft roster; resolved to a stable member identity when saved. */
  leaderIndex?: number
}

/**
 * Editable office configuration. Omitting a member id creates a fresh identity on each save;
 * callers that retry saves must supply stable ids for new members as well as existing members.
 */
export type OfficeUpdate = Omit<OfficeDraft, 'members'> & {
  members: (Omit<OfficeMember, 'id' | 'sessionId'> & { id?: OfficeMemberId })[]
}

/** One accepted message and its eventual result. */
export interface OfficeMessage {
  id: OfficeMessageId
  /** Command that accepted this delivery, absent on earlier records. */
  commandId?: CommandId
  /** Office member that requested this delegated task; absent on direct user requests. */
  requestedBy?: OfficeMemberId
  /** Leader request that owns this delegated subtask. */
  requestedFor?: OfficeMessageId
  memberId: OfficeMemberId
  memberName: string
  /** Immutable preset selected when this message was accepted; absent on legacy messages or inherited presets. */
  agentPreset?: string
  text: string
  createdAt: number
  status: 'running' | 'completed' | 'failed' | 'interrupted'
  topicId?: import('./office-project-types.ts').OfficeTopicId
  /** Exact user message that this delivery answers; absent on earlier records. */
  sourceMessageRef?: import('./contexera-domain/types.ts').AgentTeamMessageRef
  /** Sequence of the addressed user message in the shared topic ledger. */
  sourceMessageSequence?: number
  /** Highest unread fact included in the dispatched topic snapshot. */
  topicInputSequence?: number
  /** Topic revision observed while preparing the dispatched snapshot. */
  topicInputRevision?: number
  /** Native output remains available when the separate topic write is pending or refused. */
  topicDeliveryError?: 'delivery_pending' | 'unread_required' | 'stale_revision' | 'member_not_following' | 'delivery_failed'
  output?: string
}

/** Topic identity and the immutable history cutoff captured when its conversation opens. */
export interface OfficeTopicScope {
  topicId: import('./office-project-types.ts').OfficeTopicId
  projectId: import('./office-project-types.ts').OfficeProjectId
  projectName: string
  title: string
  historyThroughSequence: number
}

/** Workspace and canonical conversation for a topic, including topics not opened yet. */
export interface OfficeTopicConversation {
  sessionId?: SessionId
  workspaceId: WorkspaceId
  scope: OfficeTopicScope
}

/** Conversation-specific members and deliveries; scope is absent for the office lobby. */
export interface OfficeDiscussion {
  office: Office
  messages: OfficeMessage[]
  scope?: OfficeTopicScope
}
