/** Saved workflow definitions and durable execution summaries shared by Host and Web. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * A workflow task with explicit dependencies and an optional expert preset.
 */
export interface WorkflowStep {
  id: string
  kind?: 'agent' | 'approval' | undefined
  name: string
  instruction: string
  stage: 'prepare' | 'deliver'
  position?: { x: number; y: number }
  dependsOn: string[]
  agentPreset?: string
}

/** A user-authored workflow with independent reviewers and one human gate. */
export interface WorkflowDraft {
  name: string
  description: string
  draft: string
  review: string
  secondReview: string
  delivery: string
  steps?: WorkflowStep[]
  agentPresets?: Partial<Record<'draft' | 'review' | 'secondReview' | 'delivery', string>>
}

/** An immutable, reusable definition. */
export interface WorkflowDefinition extends WorkflowDraft {
  id: string
}

/** Durable state at the boundary between two native executions. */
export type WorkflowStatus = 'preparing' | 'pending' | 'delivering' | 'delivered' | 'rejected' | 'interrupted' | 'failed'

/** A run is bound to the conversation that owns its approval. */
export interface WorkflowHistory {
  workflowId?: string
  sessionId: SessionId
  name: string
  input: string
  createdAt: number
  status: WorkflowStatus
  draft?: string
  reviews?: string[]
  stepOutputs?: Record<string, string>
  pendingApproval?: { id: string; name: string; instruction: string } | undefined
  delivery?: string
}

/** Workflow library and recent runs. */
export interface WorkflowLibrary {
  definitions: WorkflowDefinition[]
  runs: WorkflowHistory[]
}

/** Exclusive position in one workflow's newest-first run history. */
export interface WorkflowHistoryCursor {
  createdAt: number
  sessionId: SessionId
}

/** One workflow's retained runs, with a cursor when more history remains. */
export interface WorkflowHistoryPage {
  runs: WorkflowHistory[]
  next?: WorkflowHistoryCursor
}

/** One Agent execution recorded by the native workflow tool. */
export interface WorkflowTraceNode {
  id: SessionId
  label: string
  phase: string
  state: string
  startedAt: number
  finishedAt?: number
}

/** The workflow's recorded Agents and its durable approval state. */
export interface WorkflowTrace {
  status: WorkflowStatus
  completedSteps?: string[]
  pendingApprovalId?: string | undefined
  nodes: WorkflowTraceNode[]
  steps?: WorkflowStep[]
}

/**
 * Recorded execution events associated with an actual workflow Agent.
 */
export interface WorkflowAgentLog {
  seq: number
  time: number
  kind: 'model' | 'tool'
  name: string
  input?: string
  output?: string
  failed?: boolean
}

/** Task input and response captured in the child conversation. */
export interface WorkflowTraceDetail {
  logs?: WorkflowAgentLog[]
  agentPreset?: string
  model: string
  input: string
  output: string
}

export type { Office, OfficeDraft, OfficeUpdate, OfficeMember, OfficeMessage, OfficeDiscussion, OfficeId, OfficeMemberId, OfficeMessageId, OfficeTopicScope, OfficeTopicConversation } from './office-types.ts'

export type * from './office-project-types.ts'
