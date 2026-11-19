/** Convert saved workflow formats into editable canvas steps. */
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkflowDraft, WorkflowStep } from '../workflow-types.ts'
import type {} from './workflow-copy.ts'

/** Prepare canvas steps while preserving existing node identities and Agent presets.
 * @param draft - Current graph or older staged workflow definition.
 * @param t - Workflow locale dictionary.
 * @returns Editable steps, including a generated approval node for older staged definitions.
 */
export function editableWorkflowSteps(draft: WorkflowDraft, t: TranslateNS<'teamWorkflow'>): WorkflowStep[] {
  if (draft.steps?.every(step => step.kind !== undefined)) return draft.steps
  if (draft.steps) {
    const before = draft.steps.filter(step => step.stage === 'prepare')
    const after = draft.steps.filter(step => step.stage === 'deliver')
    const gate = { id: randomUUID(), kind: 'approval' as const, name: t('approvalStep'), instruction: '',
      stage: 'prepare' as const, dependsOn: before.map(step => step.id) }
    return [...before.map(step => ({ ...step, kind: 'agent' as const })), gate,
      ...after.map(step => ({ ...step, kind: 'agent' as const, dependsOn: [...step.dependsOn, gate.id] }))]
  }
  const roles = draft.agentPresets ?? {}
  const reviewIds = draft.secondReview ? ['review', 'second-review'] : ['review']
  const legacy: WorkflowStep[] = [
    { id: 'draft', name: t('draftStep'), instruction: draft.draft, stage: 'prepare', dependsOn: [],
      ...(roles.draft ? { agentPreset: roles.draft } : {}) },
    { id: 'review', name: t('reviewOne'), instruction: draft.review, stage: 'prepare', dependsOn: ['draft'],
      ...(roles.review ? { agentPreset: roles.review } : {}) },
    ...(draft.secondReview ? [{ id: 'second-review', name: t('reviewTwo'), instruction: draft.secondReview,
      stage: 'prepare' as const, dependsOn: ['draft'], ...(roles.secondReview ? { agentPreset: roles.secondReview } : {}) }] : []),
    { id: 'approval', kind: 'approval' as const, name: t('approvalStep'), instruction: '', stage: 'prepare' as const, dependsOn: reviewIds },
    { id: 'delivery', name: t('deliveryNode'), instruction: draft.delivery, stage: 'deliver', dependsOn: ['approval'],
      ...(roles.delivery ? { agentPreset: roles.delivery } : {}) },
  ]
  return legacy.map(step => ({ ...step, kind: step.kind ?? 'agent' }))
}
