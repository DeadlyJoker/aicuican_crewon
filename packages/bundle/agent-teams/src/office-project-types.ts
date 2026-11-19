/** Wire views owned by the office adapter over Contexera's collaboration ledger. */
import type { OfficeId } from './office-types.ts'
import type { AgentTeamProjectRef, AgentTeamThreadRef, AgentTeamMessageRef } from './contexera-domain/types.ts'
export type { AgentTeamProjectRef as OfficeProjectId, AgentTeamThreadRef as OfficeTopicId } from './contexera-domain/types.ts'

/** A committed user post that can be dispatched to a member. */
export interface OfficeTopicSubmission {
  topicId: AgentTeamThreadRef
  sourceMessageRef: AgentTeamMessageRef
  sourceMessageSequence: number
}

/** A named project with its current discussion topics. */
export interface OfficeProject {
  id: AgentTeamProjectRef
  name: string
  description: string
  topics: { id: AgentTeamThreadRef; title: string; revision: number }[]
}
/** Office projects and the selected recipient's unread queue. */
export interface OfficeProjectOverview {
  officeId: OfficeId
  projects: OfficeProject[]
  inbox: { topicId: AgentTeamThreadRef; projectName: string; preview: string; unread: number }[]
  unread: number
}
/** A topic's native ledger messages and current optimistic revision. */
export interface OfficeTopic {
  id: AgentTeamThreadRef
  revision: number
  title: string
  deliveries: import('./office-types.ts').OfficeMessage[]
  messages: { id: string; author: string; body: string; time: string; sequence: number }[]
}
