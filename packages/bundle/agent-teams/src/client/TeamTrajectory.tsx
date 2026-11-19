/** Mode-owned selection over the shared native Agent trajectory. */
import { useEffect, useState, type ComponentProps } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { OfficeDiscussion } from '../office-types.ts'
import type { ExpertExecution } from '../expert-types.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import css from './OfficePage.module.css'
import { WorkflowTrajectory } from './WorkflowTrajectory.tsx'

type Props = ComponentProps<typeof WorkflowTrajectory> & {
  readOffice(this: void, id: SessionId): Promise<OfficeDiscussion | null>
  readExpertExecutions(this: void, id: SessionId): Promise<ExpertExecution[]>
}

/** Render office member selectors alongside the existing workflow selector. */
export function TeamTrajectory(props: Props) {
  const revision = props.useCatalogue(value => value)
  const [scope, setScope] = useState<{ sessionId: SessionId; office: OfficeDiscussion | null; workflow: boolean }>()
  const [record, setRecord] = useState<{ sessionId: SessionId; items: ExpertExecution[]; failed: boolean }>()
  const office = scope?.sessionId === props.sessionId ? scope.office : null
  const executions = record?.sessionId === props.sessionId ? record.items : []
  const executionFailed = record?.sessionId === props.sessionId && record.failed
  const showExpertExecutions = scope?.sessionId === props.sessionId && !scope.workflow
  const children = props.useProjection('subagentCatalog', value => value)
  useEffect(() => {
    let alive = true
    void props.readExpertExecutions(props.sessionId).then((value) => {
      if (alive) setRecord({ sessionId: props.sessionId, items: value, failed: false })
    }, () => { if (alive) setRecord({ sessionId: props.sessionId, items: [], failed: true }) })
    return () => { alive = false }
  }, [props.readExpertExecutions, props.sessionId, children, revision])
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const read = async (workflow: boolean) => {
      try {
        const result = await props.readOffice(props.sessionId)
        if (alive) {
          setScope({ sessionId: props.sessionId, office: result, workflow })
          if (result) timer = setTimeout(() => { void read(workflow) }, 1500)
        }
      } catch {
        if (alive) setScope({ sessionId: props.sessionId, office: null, workflow })
      }
    }
    void props.read(props.sessionId).then((result) => {
      if (alive) void read(result !== null)
    }, () => { if (alive) setScope(undefined) })
    return () => { alive = false; clearTimeout(timer) }
  }, [props.readOffice, props.read, props.sessionId, revision])
  return <>
    <WorkflowTrajectory {...props} />
    {showExpertExecutions && executions.length > 0 && <div className={css.traceMembers}>
      {executions.map(execution => <Button key={execution.sessionId}
        aria-pressed={props.selectedAgent === execution.sessionId}
        onClick={() => { props.selectAgent(props.selectedAgent === execution.sessionId ? undefined : execution.sessionId) }}>
        {execution.memberName.startsWith('agent-teams:') || execution.memberName === execution.expertName.split(' · v')[0]
          ? execution.expertName : `${execution.memberName} · ${execution.expertName}`}
      </Button>)}
    </div>}
    {showExpertExecutions && executionFailed && <p role="status">{props.t('expertHistoryUnavailable')}</p>}
    {office && <div className={css.traceMembers}>
      {office.office.members.filter(member => !executions.some(execution => execution.memberName === member.name))
        .map(member => <Button key={member.id} disabled={!office.messages.some(message => message.memberId === member.id && (message.status === 'completed' || message.status === 'running'))}
          aria-pressed={props.selectedAgent === member.sessionId}
          onClick={() => { props.selectAgent(props.selectedAgent === member.sessionId ? undefined : member.sessionId) }}>
          {member.name}
        </Button>)}
    </div>}
  </>
}
