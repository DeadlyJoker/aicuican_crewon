/** Native infinite canvas projects existing script, asset and shot identities without copying their history. */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  NodeToolbar,
  Position,
  ReactFlow,
  applyNodeChanges,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react'
import {
  Button,
  Input,
  IconPlayOutlineRegular,
  IconPlusOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { DramaCanvasLayout, DramaProject } from '../project-types.ts'
import type { DramaProduction } from '../production-types.ts'
import type { createDramaWorkbench } from './workbench.ts'
import '@xyflow/react/dist/style.css'
import css from './StudioCanvas.module.css'

type Actions = ReturnType<typeof createDramaWorkbench>['actions']
type CanvasNode = Node<
  {
    title: string
    kind: string
    prompt: string
    emptyLabel?: string
    media?: { url: string; kind: string } | undefined
    versionLabel: string
  },
  'content'
>

function ContentNode({ data, selected }: NodeProps<CanvasNode>) {
  return (
    <article className={css.node} data-selected={selected}>
      <Handle type="target" position={Position.Left} />
      <div className={css.nodePreview}>
        {data.media?.kind === 'image' ? (
          <img src={data.media.url} alt={data.title} draggable={false} />
        ) : data.media?.kind === 'video' ? (
          <video src={data.media.url} controls className="nodrag nowheel" />
        ) : data.media?.kind === 'voice' ? (
          <audio src={data.media.url} controls className="nodrag nowheel" />
        ) : (
          <p>{data.prompt || data.emptyLabel}</p>
        )}
        <span className={css.kind}>{data.kind}</span>
      </div>
      <footer>
        <span>{data.title}</span>
        <small>{data.versionLabel}</small>
      </footer>
      <Handle type="source" position={Position.Right} />
    </article>
  )
}
const nodeTypes = { content: ContentNode }

interface Props {
  project: DramaProject
  production: DramaProduction
  layout: DramaCanvasLayout
  actions: Actions
  busy: boolean
  t: TranslateNS<'shortDrama'>
  addAsset(this: void): void
  addShot(this: void): void
  details(this: void, stage: 'script' | 'assets' | 'shots' | 'edit'): void
}

/**
 * Render movable content cards, asset-reference links and a node-following prompt editor.
 * @param props - Host-backed project, production and saved layout with native operations.
 * @returns A canvas that preserves the host shell, theme and navigation.
 */
export function StudioCanvas({
  project,
  production,
  layout,
  actions,
  busy,
  t,
  details,
  addAsset,
  addShot,
}: Props) {
  const flow = useRef<ReactFlowInstance<CanvasNode> | null>(null)
  const [positions, setPositions] = useState(layout.positions)
  const [viewport, setViewport] = useState(layout.viewport)
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    setPositions(layout.positions)
    setViewport(layout.viewport)
    setDirty(false)
  }, [layout])
  const [selected, select] = useState<string | null>(null)
  const [draft, edit] = useState<{ key: string; prompt: string; title: string } | null>(null)
  const script = project.scripts.find(item => item.id === project.adoptedScriptId) ?? project.scripts.at(-1)
  const nodes = useMemo(() => {
    const rows: CanvasNode[] = []
    const media = (id: string | null) =>
      production.jobs.flatMap(job => job.outputs).find(item => item.id === id)
    const add = (id: string, x: number, y: number, data: CanvasNode['data']) =>
      rows.push({
        id,
        type: 'content',
        position: positions[id] ?? { x, y },
        selected: selected === id,
        data,
      })
    add('script', 0, 100, {
      title: t('tabScript'),
      kind: t('tabScript'),
      prompt: script?.body || project.synopsis || '',
      emptyLabel: t('canvasStart'),
      versionLabel: t('version', { number: script ? project.scripts.findIndex(item => item.id === script.id) + 1 : 0 }),
    })
    production.assets.forEach((asset, index) =>
      add(`asset:${asset.id}`, 390, index * 310, {
        title: asset.name,
        kind: t(asset.kind),
        prompt: asset.prompt,
        versionLabel: t('version', { number: asset.version }),
        media: media(asset.adoptedMediaId),
      }),
    )
    production.shots.forEach((shot, index) =>
      add(`shot:${shot.id}`, 810 + Math.floor(index / 4) * 390, (index % 4) * 310, {
        title: shot.title,
        kind: t('tabShots'),
        prompt: shot.prompt,
        versionLabel: t('version', { number: shot.version }),
        media: media(shot.adoptedVideoId ?? shot.adoptedImageId),
      }),
    )
    return rows
  }, [positions, selected, production, project.synopsis, project.scripts.length, script, t])
  const edges = production.shots.flatMap(shot => [
    { id: `script:${shot.id}`, source: 'script', target: `shot:${shot.id}` },
    ...shot.assetIds.map(id => ({
      id: `${id}:${shot.id}`,
      source: `asset:${id}`,
      target: `shot:${shot.id}`,
    })),
  ])
  const current = nodes.find(node => node.id === selected)
  const asset = production.assets.find(item => `asset:${item.id}` === selected)
  const shot = production.shots.find(item => `shot:${item.id}` === selected)
  const pendingJobs = production.jobs.filter(job =>
    ['submitting', 'running', 'unknown'].includes(job.state),
  )
  async function savePrompt() {
    if (!draft) return
    let saved: boolean
    if (asset) saved = await actions.saveAsset({ ...asset, name: draft.title, prompt: draft.prompt })
    else if (shot) saved = await actions.saveShot({ ...shot, title: draft.title, prompt: draft.prompt })
    else
      saved = await actions.save(
        project,
        { revision: project.revision, script: draft.prompt },
        script?.id ?? null,
      )
    if (saved) edit(null)
  }
  function choose(node: CanvasNode) {
    select(node.id)
    edit({ key: node.id, prompt: node.data.prompt, title: node.data.title })
    void flow.current?.setCenter(node.position.x + 130, node.position.y + 245, {
      zoom: Math.min(flow.current.getZoom(), 0.9),
      duration: 160,
    })
  }
  function updateAssetReference(source: string | null, target: string | null) {
    const linked = production.assets.find(item => `asset:${item.id}` === source)
    const targetShot = production.shots.find(item => `shot:${item.id}` === target)
    if (!linked || !targetShot || targetShot.assetIds.includes(linked.id)) return
    void actions.saveShot({ ...targetShot, assetIds: [...targetShot.assetIds, linked.id] })
  }
  return (
    <section className={css.studio} aria-label={t('canvas')}>
      <header className={css.toolbar}>
        <div className={css.tabs}>
          <Button
            size="sm"
            onClick={() => {
              details('script')
            }}
          >
            {t('tabScript')}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              details('assets')
            }}
          >
            {t('tabAssets')} <small>{production.assets.length}</small>
          </Button>
          <Button
            size="sm"
            onClick={() => {
              details('shots')
            }}
          >
            {t('tabShots')} <small>{production.shots.length}</small>
          </Button>
        </div>
        <div className={css.tools}>
          {dirty && <span className={css.unsaved}>{t('canvasUnsaved')}</span>}
          <Button
            size="sm"
            disabled={busy || !dirty}
            onClick={() => {
              void actions.saveCanvas({ revision: layout.revision, positions, viewport }).then((saved) => {
                if (saved) setDirty(false)
              })
            }}
          >
            {t('saveCanvas')}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              details('edit')
            }}
            icon={<IconPlayOutlineRegular size={14} />}
          >
            {t('tabEdit')}
          </Button>
        </div>
      </header>
      <div className={css.canvas}>
        <ReactFlow<CanvasNode>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          minZoom={0.1}
          maxZoom={4}
          defaultViewport={layout.viewport}
          fitViewOptions={{ maxZoom: 0.85, padding: 0.25 }}
          fitView={layout.revision === 0}
          onInit={(instance) => {
            flow.current = instance
          }}
          onNodesChange={(changes) => {
            if (!changes.some(change => change.type === 'position')) return
            const updated = applyNodeChanges(changes, nodes)
            setPositions(Object.fromEntries(updated.map(node => [node.id, node.position])))
            setDirty(true)
          }}
          onNodeDragStop={(_event, node) => {
            const next = { ...positions, [node.id]: node.position }
            setPositions(next)
            void actions
              .saveCanvas({
                revision: layout.revision,
                positions: next,
                viewport: flow.current?.getViewport() ?? viewport,
              })
              .then((saved) => {
                if (saved) setDirty(false)
              })
          }}
          isValidConnection={(connection) => {
            const linked = production.assets.find(item => `asset:${item.id}` === connection.source)
            const target = production.shots.find(item => `shot:${item.id}` === connection.target)
            return Boolean(linked && target && !target.assetIds.includes(linked.id))
          }}
          onMoveEnd={(_event, next) => {
            setViewport(next)
            setDirty(true)
          }}
          onNodeClick={(_event, node) => {
            choose(node)
          }}
          onPaneClick={() => {
            if (!draft || draft.prompt === current?.data.prompt) {
              select(null)
              edit(null)
            }
          }}
          onConnect={(connection) => {
            updateAssetReference(connection.source, connection.target)
          }}
          nodesDraggable={!busy}
          nodesConnectable={!busy}
          deleteKeyCode={null}
          ariaLabelConfig={{
            'controls.zoomIn.ariaLabel': t('studioZoomIn'),
            'controls.zoomOut.ariaLabel': t('studioZoomOut'),
            'controls.fitView.ariaLabel': t('studioFitView'),
          }}
          proOptions={{ hideAttribution: false }}
        >
          <Background gap={22} size={1} />
          <Controls showInteractive={false} />
          {current && draft?.key === current.id && (
            <NodeToolbar nodeId={current.id} isVisible position={Position.Bottom} offset={14}>
              <form
                className={`${css.prompt} nodrag nowheel`}
                onSubmit={(event) => {
                  event.preventDefault()
                  void savePrompt()
                }}
              >
                <header>
                  <span>{t('promptEditor')}</span>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      select(null)
                      edit(null)
                    }}
                  >
                    {t('close')}
                  </Button>
                </header>
                {current.id !== 'script' && (
                  <Input
                    aria-label={t('name')}
                    value={draft.title}
                    disabled={busy}
                    onChange={(event) => {
                      edit({ ...draft, title: event.currentTarget.value })
                    }}
                  />
                )}
                <textarea
                  aria-label={t('descriptionField')}
                  value={draft.prompt}
                  rows={5}
                  maxLength={current.id === 'script' ? 16000 : 8000}
                  onChange={(event) => {
                    edit({ ...draft, prompt: event.currentTarget.value })
                  }}
                />
                <footer>
                  <span>{t('canvasCandidateHint')}</span>
                  <Button size="sm" type="submit" variant="primary" disabled={busy || !draft.prompt.trim()}>
                    {t('save')}
                  </Button>
                </footer>
              </form>
            </NodeToolbar>
          )}
        </ReactFlow>
        <nav className={css.addTools} aria-label={t('canvasTools')}>
          <Button size="sm" disabled={busy} icon={<IconPlusOutlineRegular size={15} />} onClick={addAsset}>
            {t('addAsset')}
          </Button>
          <Button
            size="sm"
            disabled={busy || !project.adoptedScriptId}
            icon={<IconPlusOutlineRegular size={15} />}
            onClick={addShot}
          >
            {t('addShot')}
          </Button>
        </nav>
        {!selected && !production.assets.length && !production.shots.length && (
          <div className={css.guide}>
            <span>{t('canvasStart')}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                void actions.openConversation(project.id)
              }}
            >
              {t('openConversation')}
            </Button>
          </div>
        )}
        {pendingJobs.length > 0 && (
          <div className={css.jobs}>{t('canvasPending', { number: pendingJobs.length })}</div>
        )}
      </div>
    </section>
  )
}
