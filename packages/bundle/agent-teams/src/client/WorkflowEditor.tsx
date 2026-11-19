/** Visual authoring of the persisted native workflow graph. */
import { useMemo, useRef, useState } from 'react'
import {
  Background, Controls, Handle, MarkerType, Position, ReactFlow,
  type Connection, type Node, type NodeProps, type ReactFlowInstance,
} from '@xyflow/react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkflowDraft, WorkflowStep } from '../workflow-types.ts'
import { layoutWorkflowSteps, orderWorkflowSteps } from '../workflow-graph.ts'
import { ExpertPicker, type ExpertPickerActions } from './ExpertPicker.tsx'
import '@xyflow/react/dist/style.css'
import css from './WorkflowEditor.module.css'

type GraphNode = Node<{ title: string; kind: string; preset: string }, 'task'>

function TaskNode({ data, selected }: NodeProps<GraphNode>) {
  return <div className={css.node} data-selected={selected} data-kind={data.kind}>
    <Handle type="target" position={Position.Left} />
    <span className={css.nodeKind}>{data.kind}</span>
    <strong>{data.title}</strong>
    <span className={css.nodePreset}>{data.preset}</span>
    <Handle type="source" position={Position.Right} />
  </div>
}
const nodeTypes = { task: TaskNode }

interface Props {
  draft: WorkflowDraft
  editing: boolean
  busy: boolean
  failed: boolean
  presetsFailed: boolean
  presets: readonly { id: string; name?: string; broken?: string }[]
  expertPicker?: ExpertPickerActions
  t: TranslateNS<'teamWorkflow'>
  change(this: void, draft: WorkflowDraft): void
  save(this: void): void
  close(this: void): void
}

/** Edit node configuration and dependency edges without replacing execution history. */
export function WorkflowEditor({ draft, editing, busy: saving, failed, presetsFailed, presets,
  expertPicker, t, change, save, close }: Props) {
  const [selectingExpert, setSelectingExpert] = useState(false)
  const [expertNames, setExpertNames] = useState<Record<string, string>>({})
  const currentDraft = useRef(draft)
  currentDraft.current = draft
  const busy = saving || selectingExpert
  const steps = draft.steps ?? []
  const [selectedId, select] = useState(steps[0]?.id)
  const [connectionError, setConnectionError] = useState(false)
  const flow = useRef<ReactFlowInstance<GraphNode> | null>(null)
  const positions = useMemo(() => new Map(layoutWorkflowSteps(steps)
    .flatMap(step => step.position ? [[step.id, step.position] as const] : [])), [steps])
  const selected = steps.find(step => step.id === selectedId)
  const update = (next: WorkflowStep[]) => { change({ ...draft, steps: next }) }
  const patch = (id: string, fields: Partial<WorkflowStep>) => {
    update(steps.map(step => step.id === id ? { ...step, ...fields } : step))
  }
  const remove = (ids: ReadonlySet<string>) => {
    update(steps.filter(step => !ids.has(step.id)).map(step => ({
      ...step, dependsOn: step.dependsOn.filter(id => !ids.has(id)),
    })))
    if (selectedId && ids.has(selectedId)) select(undefined)
  }
  const nodes: GraphNode[] = steps.map(step => ({
    id: step.id, type: 'task', position: step.position ?? positions.get(step.id) ?? { x: 40, y: 80 },
    selected: selectedId === step.id,
    data: {
      title: step.name || t('untitledNode'),
      kind: t(step.kind === 'approval' ? 'approvalStep' : 'agentStep'),
      preset: step.kind === 'approval' ? t('waitForApproval')
        : (step.agentPreset ? expertNames[step.agentPreset] : undefined)
          ?? presets.find(preset => preset.id === step.agentPreset)?.name ?? step.agentPreset ?? t('inheritPreset'),
    },
  }))
  const edges = steps.flatMap(step => step.dependsOn.map(source => ({
    id: source + ':' + step.id, source, target: step.id,
    markerEnd: { type: MarkerType.ArrowClosed },
  })))
  const connect = ({ source, target }: Connection) => {
    if (!source || !target || source === target) { setConnectionError(true); return }
    const next = steps.map(step => step.id === target
      ? { ...step, dependsOn: [...new Set([...step.dependsOn, source])] } : step)
    if (!orderWorkflowSteps(next)) { setConnectionError(true); return }
    setConnectionError(false)
    update(next)
  }
  const add = (kind: 'agent' | 'approval', position?: { x: number; y: number }) => {
    if (steps.length >= 24) return
    const id = randomUUID()
    const center = flow.current?.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    update([...steps, {
      id, kind, name: `${t(kind === 'approval' ? 'approvalStep' : 'agentStep')} ${steps.length + 1}`,
      instruction: '', stage: 'prepare', dependsOn: [],
      position: position ?? center ?? { x: 40, y: 80 },
    }])
    select(id)
  }
  const valid = draft.name.trim() && steps.some(step => step.kind !== 'approval')
    && steps.every(step => step.name.trim() && (step.kind === 'approval' || step.instruction.trim()))
    && orderWorkflowSteps(steps)
  return <Modal open title={t(editing ? 'edit' : 'create')} closeLabel={t('cancel')} onClose={() => { if (!busy) close() }}
    className={css.modal ?? ''} contentClassName={css.content ?? ''}>
    <div className={css.editor}>
      <div className={css.toolbar}>
        <Input aria-label={t('name')} placeholder={t('name')} value={draft.name} maxLength={80}
          disabled={busy} onChange={(event) =>{  change({ ...draft, name: event.target.value }) }} />
        <Button disabled={busy} onClick={() => { update(layoutWorkflowSteps(steps)); requestAnimationFrame(() => { void flow.current?.fitView({ padding: 0.12 }) }) }}>{t('autoLayout')}</Button>
        <Button variant="primary" disabled={busy || !valid} onClick={save}>{t('save')}</Button>
      </div>
      <div className={css.workspace}>
        <nav className={css.palette} aria-label={t('nodePalette')}>
          <span className={css.sectionTitle}>{t('nodePalette')}</span>
          {(['agent', 'approval'] as const).map(kind => <button type="button" key={kind} draggable={!busy}
            disabled={busy || steps.length >= 24} onClick={() =>{  add(kind) }}
            onDragStart={(event) => { event.dataTransfer.setData('application/crewon-node', kind); event.dataTransfer.effectAllowed = 'copy' }}>
            <span>{kind === 'agent' ? '+' : '◇'}</span>{t(kind === 'agent' ? 'agentStep' : 'approvalStep')}
          </button>)}
          <p>{t('canvasHint')}</p>
          <label>{t('description')}<textarea value={draft.description} disabled={busy} maxLength={400}
            onChange={(event) =>{  change({ ...draft, description: event.target.value }) }} /></label>
        </nav>
        <div className={css.canvas} data-workflow-canvas=""
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
          onDrop={(event) => {
            event.preventDefault()
            const kind = event.dataTransfer.getData('application/crewon-node')
            if (!busy && (kind === 'agent' || kind === 'approval')) add(kind, flow.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }))
          }}>
          <ReactFlow<GraphNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onInit={(instance) => { flow.current = instance }} fitView fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
            ariaLabelConfig={{ 'controls.zoomIn.ariaLabel': t('zoomIn'), 'controls.zoomOut.ariaLabel': t('zoomOut'), 'controls.fitView.ariaLabel': t('fitCanvas') }}
            minZoom={0.25} maxZoom={1.5} nodesDraggable={!busy} nodesConnectable={!busy} elementsSelectable={!busy}
            onNodeClick={(_, node) => { if (!busy) { setConnectionError(false); select(node.id) } }}
            onPaneClick={() => { if (!busy) { setConnectionError(false); select(undefined) } }}
            onNodeDragStop={(_, node) =>{  patch(node.id, { position: node.position }) }}
            onNodesChange={(changes) => {
              if (busy) return
              const deleted = new Set(changes.filter(item => item.type === 'remove').map(item => item.id))
              if (deleted.size) remove(deleted)
              const moved = changes.filter(item => item.type === 'position')
              if (moved.length) update(steps.map((step) => {
                const move = moved.find(item => item.id === step.id)
                return move?.type === 'position' && move.position ? { ...step, position: move.position } : step
              }))
            }}
            onEdgesDelete={(deleted) => {
              if (!busy) update(steps.map(step => ({ ...step,
                dependsOn: step.dependsOn.filter(id => !deleted.some(edge => edge.source === id && edge.target === step.id)),
              })))
            }}
            onConnect={connect} deleteKeyCode={['Backspace', 'Delete']}>
            <Background gap={22} size={1} /><Controls showInteractive={false} />
          </ReactFlow>
          {connectionError && <div role="alert" className={css.canvasNotice}>{t('invalidConnection')}</div>}
          {!steps.length && <div className={css.canvasEmpty}>{t('canvasHint')}</div>}
        </div>
        <aside className={css.properties} aria-label={t('nodeProperties')}>
          <span className={css.sectionTitle}>{t('nodeProperties')}</span>
          {!selected ? <p>{t('selectNode')}</p> : <>
            <label>{t('stepName')}<Input value={selected.name} disabled={busy} maxLength={80}
              onChange={(event) =>{  patch(selected.id, { name: event.target.value }) }} /></label>
            <span className={css.typeLabel}>{t(selected.kind === 'approval' ? 'approvalStep' : 'agentStep')}</span>
            {selected.kind !== 'approval' && <ExpertPicker key={selected.id} label={t('chooseExpert')}
              value={selected.agentPreset ?? ''} emptyLabel={t('inheritPreset')} disabled={saving}
              selectedLabel={expertNames[selected.agentPreset ?? ''] ?? presets.find(item => item.id === selected.agentPreset)?.name
                ?? selected.agentPreset ?? t('inheritPreset')}
              presets={presets} {...expertPicker ? { actions: expertPicker } : {}} onPendingChange={setSelectingExpert}
              onChange={(selection) => {
                const latest = currentDraft.current
                if (!latest.steps?.some(step => step.id === selected.id)) return
                if (selection) setExpertNames(names => ({ ...names, [selection.preset]: selection.name }))
                change({ ...latest, steps: latest.steps.map((step) => {
                  if (step.id !== selected.id) return step
                  const { agentPreset: _previous, ...fields } = step
                  return { ...fields, ...(selection ? { agentPreset: selection.preset } : {}) }
                }) })
              }} />}
            {presetsFailed && <p role="alert">{t('presetLoadError')}</p>}
            <label>{t(selected.kind === 'approval' ? 'approvalInstruction' : 'instruction')}
              <textarea rows={8} maxLength={4000} value={selected.instruction} disabled={busy}
                placeholder={t(selected.kind === 'approval' ? 'approvalHint' : 'instructionHint')}
                onChange={(event) =>{  patch(selected.id, { instruction: event.target.value }) }} /></label>
            <div className={css.dependencies}>
              <span className={css.sectionTitle}>{t('dependencies')}</span>
              {!selected.dependsOn.length && <p>{t('parallelReady')}</p>}
              {selected.dependsOn.map(id => <div key={id}><span>{steps.find(step => step.id === id)?.name}</span>
                <Button disabled={busy} onClick={() =>{  patch(selected.id, { dependsOn: selected.dependsOn.filter(value => value !== id) }) }}>{t('disconnect')}</Button></div>)}
            </div>
            <Button disabled={busy} onClick={() =>{  remove(new Set([selected.id])) }}>{t('removeStep')}</Button>
          </>}
        </aside>
      </div>
      <footer className={css.footer}>
        <span role="status">{failed ? t('failure') : valid ? t('graphReady') : t('graphIncomplete')}</span>
        <span>{steps.length} {t('nodesUnit')} · {edges.length} {t('edgesUnit')}</span>
      </footer>
    </div>
  </Modal>
}
