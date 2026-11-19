import { useEffect, useState } from 'react'
import { DisclosureRow, IconBranchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-trajectory/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkflowHistory, WorkflowTrace, WorkflowTraceNode } from '../workflow-types.ts'
import type { CatalogueFace } from './catalogue.ts'
import css from './WorkflowTrajectory.module.css'

type Actions = {
  read(this: void, id: SessionId): Promise<WorkflowHistory | null>
  trace(this: void, id: SessionId): Promise<WorkflowTrace | null>
}
type Props = PropsRuntime<'conversation.trajectory.execution'> & PropsLocale<'teamWorkflow'> & InjectFace<Actions & CatalogueFace>

const icon = <IconBranchOutlineRegular size={14} />

/** Expand recorded workflow dependencies inside the existing trajectory. */
export function WorkflowTrajectory({ sessionId, t, trace, read, selectedAgent, selectAgent, useCatalogue }: Props) {
  const revision = useCatalogue(value => value)
  const [record, setRecord] = useState<WorkflowTrace | null>(null)
  const [open, setOpen] = useState(true)
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [materials, setMaterials] = useState<WorkflowHistory | null>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const next = await trace(sessionId)
        if (!alive) return
        setRecord(next)
        if (next && (next.status === 'preparing' || next.status === 'pending' || next.status === 'delivering')) {
          timer = setTimeout(() => { void load() }, 2000)
        }
      } catch {
        if (alive) setFailed(true)
      }
    }
    void load()
    return () => { alive = false; clearTimeout(timer) }
  }, [sessionId, trace, revision])
  const selected = record?.nodes.find(candidate => candidate.id === selectedAgent)

  useEffect(() => {
    if (!approvalOpen) return
    let alive = true
    void read(sessionId).then(
      (result) => { if (alive) setMaterials(result) },
      () => { if (alive) setMaterials(null) },
    )
    return () => { alive = false }
  }, [approvalOpen, read, record?.status, sessionId])

  if (!record) return failed ? <p className={css.details}>{t('failure')}</p> : null
  const label = (item: WorkflowTraceNode) => {
    if (item.phase === 'Draft') return t('draftStep')
    if (item.phase === 'Delivery') return t('deliveryNode')
    if (item.label === 'Reviewer 1') return t('reviewOne')
    if (item.label === 'Reviewer 2') return t('reviewTwo')
    return item.label
  }
  const status = (item: WorkflowTraceNode) => {
    switch (item.state) {
      case 'completed': return t('completed')
      case 'running': return t('working')
      case 'failed': return t('failed')
      case 'cancelled': return t('cancelled')
      default: return t('interrupted')
    }
  }
  const layerById = new Map<string, number>()
  const layers = (stage: 'prepare' | 'deliver') => {
    const groups: string[][] = []
    for (const step of record.steps?.filter(item => item.stage === stage) ?? []) {
      const layer = Math.max(0, ...step.dependsOn.map(id => (layerById.get(id) ?? -1) + 1))
      layerById.set(step.id, layer)
      ;(groups[layer] ??= []).push(step.id)
    }
    layerById.clear()
    return groups.filter(Boolean)
  }
  const graph = record.steps?.every(step => step.kind !== undefined)
  const phases = graph
    ? record.steps?.map(step => [step.id]) ?? []
    : record.steps
      ? [...layers('prepare'), ['Approval'], ...layers('deliver')]
      : [['Draft'], ['Review'], ['Approval'], ['Delivery']]
  const approval = record.status === 'pending' ? t('pending') : record.status === 'rejected' ? t('rejected')
    : record.status === 'delivered' || record.status === 'delivering' || record.nodes.some(item => item.phase === 'Delivery')
      ? t('completed') : null
  const columns = phases.flatMap((phases) => {
    const phase = phases.join(':')
    const gate = graph ? record.steps?.find(step => step.id === phase && step.kind === 'approval') : undefined
    if (gate) {
      const state = record.completedSteps?.includes(gate.id) ? t('completed')
        : record.pendingApprovalId === gate.id ? t('pending') : t('queued')
      return [<DisclosureRow key={phase} icon={icon} title={gate.name} open={approvalOpen && record.pendingApprovalId === gate.id}
        expandable expandOnRowClick keepContentWhenOpen
        onToggle={() => {
          if (record.pendingApprovalId !== gate.id) return
          selectAgent(undefined); setMaterials(undefined); setApprovalOpen(!approvalOpen)
        }}
        collapsedContent={<span className={css.status}>{state}</span>} />]
    }
    const members = record.nodes.filter(item => phases.includes(item.phase)).sort((left, right) => left.label.localeCompare(right.label))
    if (phase === 'Approval' && approval) return [<DisclosureRow key={phase} icon={icon} title={t('approvalNode')} open={approvalOpen}
      expandable expandOnRowClick keepContentWhenOpen
      onToggle={() => { selectAgent(undefined); setMaterials(undefined); setApprovalOpen(!approvalOpen) }}
      collapsedContent={<span className={css.status}>{approval}</span>} />]
    if (!members.length) return []
    return [<div key={phase} className={css.members} aria-label={members.length > 1 ? t('parallel') : undefined}>
      {record.steps && members.length > 1 && <span className={css.status}>{t('parallel')}</span>}
      {members.map(item => <DisclosureRow key={item.id} icon={icon} title={label(item)}
        open={selectedAgent === item.id} expandable expandOnRowClick keepContentWhenOpen
        onToggle={() => { setApprovalOpen(false); selectAgent(selectedAgent === item.id ? undefined : item.id) }}
        collapsedContent={<span className={css.status}>{status(item)}</span>} />)}
    </div>]
  })
  return <section className={css.execution} data-workflow-trace="">
    <DisclosureRow icon={icon} title={t('steps')} open={open} expandable expandOnRowClick
      onToggle={() => { if (open) selectAgent(undefined); setOpen(!open) }}
      collapsedContent={<span className={css.status}>{t(record.status)}</span>}>
      <div className={css.body}>
        <ol className={css.graph} aria-label={t('steps')}>
          {columns.map((column, index) => <li key={column.key}>
            {!record.steps && index > 0 && <span aria-hidden="true">→</span>}{column}
          </li>)}
        </ol>
        {approvalOpen && <div className={css.details}>
          <strong>{t('approvalStep')} · {approval}</strong>
          {materials === undefined ? <p>{t('loading')}</p> : materials === null ? <p>{t('failure')}</p> :
            <div className={css.io}>
              <div><strong>{t('nodeInput')}</strong><pre>{[materials.draft, ...(materials.reviews ?? [])].filter(Boolean).join('\n\n') || '—'}</pre></div>
              <div><strong>{t('nodeOutput')}</strong><p>{approval}</p></div>
            </div>}
        </div>}
        {selected && <div className={css.details}>
          <strong>{label(selected)} · {status(selected)}{selected.finishedAt !== undefined && <>
            {' · '}{((selected.finishedAt - selected.startedAt) / 1000).toFixed(1)} {t('durationUnit')}</>}</strong>
          {record.steps && <p>{t('dependencies')} · {record.steps.find(step => step.id === selected.phase)?.dependsOn
            .map(id => record.steps?.find(step => step.id === id)?.name ?? id).join('、') || t('parallelReady')}</p>}
        </div>}
      </div>
    </DisclosureRow>
  </section>
}
