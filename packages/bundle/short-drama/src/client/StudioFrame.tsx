/** Packaged Studio document bridges only validated project-scoped operations to the native Agent UI. */
import type { MediaAnalysisId, MediaAnalysisMode, MediaAnalysisRecord } from '../media-analysis-types.ts'
import type { DramaEditTimeline } from '../edit-types.ts'
import { editTimelineSchema } from '../edit-schema.ts'
import type { ShotCompilation } from '../creative.ts'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { createStudioContext } from './studio-context.ts'
import type { DramaProject, DramaProjectId, DramaScriptId } from '../project-types.ts'
import type { DramaProduction, SharedGenerationSettings, DramaJobId, DramaMediaId, DramaShotId, DramaExportId, DramaTimelineClip, DramaAssetDraft, DramaAssetId } from '../production-types.ts'
import type { StudioDocument } from '../project-types.ts'
import type { StudioProjectEntry } from './studio-context.ts'
import { createStudioDocumentWriter } from './studio-document.ts'
import css from './StudioSurface.module.css'
import { StudioServiceSettings } from './StudioServiceSettings.tsx'

export interface StudioFrameActions {
  watch(this: void, id: DramaProjectId, changed: (value: DramaProduction) => void, failed: () => void): () => void
  load(this: void, id: DramaProjectId | null): Promise<{
    project: DramaProject | null
    preferences?: import('../creation-preferences.ts').CreationPreferences | null
    direction?: import('../director-model.ts').CreativeDirection | null
    production: DramaProduction | null
    document: StudioDocument
    projects: StudioProjectEntry[]
  }>
  save(this: void, id: DramaProjectId, document: StudioDocument): Promise<StudioDocument>
  saveAsset(this: void, id: DramaProjectId, revision: number, draft: DramaAssetDraft):
  Promise<{ production: DramaProduction; assetId: DramaAssetId }>
  removeAsset(this: void, id: DramaProjectId, revision: number, assetId: DramaAssetId): Promise<DramaProduction>
  run(this: void, id: DramaProjectId, text: string): Promise<void>
  settings(this: void, id: DramaProjectId, revision: number, value: DramaProduction['settings']): Promise<void>
  sharedSettings(this: void): Promise<SharedGenerationSettings>
  saveSharedSettings(this: void, revision: number, value: DramaProduction['settings']): Promise<void>
  readAnalysis(this: void, id: DramaProjectId, mediaId: DramaMediaId): Promise<MediaAnalysisRecord[]>
  analyze(this: void, id: DramaProjectId, mediaId: DramaMediaId, mode: MediaAnalysisMode,
    requestId: MediaAnalysisId): Promise<MediaAnalysisRecord>
  compile(this: void, id: DramaProjectId, shotId: import('../production-types.ts').DramaShotId): Promise<ShotCompilation>
  cut(this: void, id: DramaProjectId, revision: number, clips: DramaTimelineClip[],
    exportId: DramaExportId | null): Promise<DramaProduction>
  edit(this: void, id: DramaProjectId, revision: number, edit: DramaEditTimeline,
    exportId: DramaExportId | null): Promise<DramaProduction>
  review(this: void, id: DramaProjectId, revision: number, document: string): Promise<void>
  adoptMedia(this: void, id: DramaProjectId, revision: number, jobId: DramaJobId, mediaId: DramaMediaId): Promise<void>
  saveScript(this: void, id: DramaProjectId, revision: number, body: string): Promise<void>
  adopt(this: void, id: DramaProjectId, revision: number, scriptId: DramaScriptId, body: string): Promise<void>
  create(this: void, title: string, synopsis: string): Promise<void>
  open(this: void, id: string): Promise<void>
  overview(this: void): Promise<void>
  newProject(this: void): Promise<void>
  flush(this: void, callback: (() => Promise<void>) | null): void
}
const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }), z.object({ type: z.literal('flushed') }),
  z.object({ type: z.literal('settings') }),
  z.object({ type: z.literal('read-media-analysis'), mediaId: z.uuid().transform(brandString<DramaMediaId>) }),
  z.object({ type: z.literal('analyze-media'), mediaId: z.uuid().transform(brandString<DramaMediaId>),
    mode: z.enum(['inspect', 'scenes', 'transcript']), requestId: z.uuid().transform(brandString<MediaAnalysisId>) }),
  z.object({ type: z.literal('save-cut'), revision: z.number().int().nonnegative(),
    exportId: z.uuid().transform(brandString<DramaExportId>).nullable(),
    clips: z.array(z.object({ shotId: z.uuid().transform(brandString<DramaShotId>),
      videoId: z.uuid().transform(brandString<DramaMediaId>), voiceId: z.uuid().transform(brandString<DramaMediaId>).nullable(),
      startFrame: z.number().int().nonnegative(), frames: z.number().int().positive().max(1440), subtitle: z.string().max(4000),
    })).min(1).max(120),
  }),
  z.object({ type: z.literal('save-edit'), revision: z.number().int().nonnegative(), edit: editTimelineSchema,
    exportId: z.uuid().transform(brandString<DramaExportId>).nullable() }),
  z.object({ type: z.literal('compile-shot'), shotId: z.uuid().transform(brandString<import('../production-types.ts').DramaShotId>) }),
  z.object({ type: z.literal('save-review'), revision: z.number().int().nonnegative(), document: z.string().max(32000) }),
  z.object({ type: z.literal('adopt-media'), revision: z.number().int().nonnegative(),
    jobId: z.uuid().transform(brandString<DramaJobId>), mediaId: z.uuid().transform(brandString<DramaMediaId>) }),
  z.object({ type: z.literal('new-project') }), z.object({ type: z.literal('focus-agent') }), z.object({ type: z.literal('overview') }),
  z.object({ type: z.literal('save'), storage: z.record(z.string(), z.string()) }),
  z.object({ type: z.literal('save-asset'), requestId: z.uuid(), revision: z.number().int().nonnegative(),
    asset: z.object({ id: z.uuid().transform(brandString<DramaAssetId>).nullable(), kind: z.enum(['character', 'scene', 'prop', 'voice']),
      name: z.string().trim().min(1).max(120), prompt: z.string().trim().min(1).max(8000) }) }),
  z.object({ type: z.literal('remove-asset'), requestId: z.uuid(), revision: z.number().int().nonnegative(),
    assetId: z.uuid().transform(brandString<DramaAssetId>) }),
  z.object({ type: z.literal('run'), text: z.string().trim().min(1).max(32000) }),
  z.object({ type: z.literal('open'), id: z.string().min(1) }),
  z.object({ type: z.literal('save-script'), revision: z.number().int().nonnegative(), body: z.string().trim().min(1).max(16000) }),
  z.object({ type: z.literal('adopt-script'), revision: z.number().int().nonnegative(), scriptId: z.uuid().transform(brandString<DramaScriptId>), body: z.string().trim().min(1).max(16000) }),
  z.object({ type: z.literal('create'), title: z.string().trim().min(1).max(120), synopsis: z.string().max(4000) }),
])
type Props = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'shortDrama'> & InjectFace<{
  actions: StudioFrameActions
  hooks: { studio: ReturnType<typeof createStudioContext> }
}>
/**
 * @param props - Native tab, project selection and scoped Host operations.
 * @returns The retained Studio interface in the native sidebar.
 */
export function StudioFrame({ actions, useStudio, useSession, useTabInfo, t }: Props) {
  const { active, projectId } = useStudio(value => value)
  const visible = useTabInfo().tab.visible
  const running = useSession(value => value.running)
  const frame = useRef<HTMLIFrameElement>(null)
  const refresh = useRef<(() => Promise<void>) | null>(null)
  const [failed, fail] = useState(false)
  const [settings, configure] = useState<{ id: DramaProjectId; production: DramaProduction; shared: SharedGenerationSettings } | null>(null)
  const [configuring, setConfiguring] = useState(false)
  useEffect(() => {
    if (!active || !visible) return
    let live = true, ready = false, initializing = false, blocked = false
    let writer: ReturnType<typeof createStudioDocumentWriter> | undefined
    let stopWatching: (() => void) | undefined
    fail(false)
    let writes: Promise<void> = Promise.resolve()
    let flushed: (() => void) | undefined
    const send = (value: object) => { frame.current?.contentWindow?.postMessage({ channel: 'crewon-studio-v1', ...value }, window.location.origin === 'null' ? '*' : window.location.origin) }
    const load = async (type: 'initialize' | 'refresh') => {
      const value = await actions.load(projectId)
      if (!live) return
      if (type === 'initialize' && projectId) writer = createStudioDocumentWriter(value.document,
        document => actions.save(projectId, document), async () => (await actions.load(projectId)).document)
      send({ type, value: { ...value, previewCopy: {
        empty: t('previewEmpty'), failed: t('previewFailed'), unknown: t('previewUnknown'), unavailable: t('previewUnavailable'),
        generating: t('previewGenerating'), text: t('previewText'), script: t('script'), adopted: t('adopted'), candidate: t('candidate'),
      }, assetCopy: {
        configureImage: t('assetConfigureImage'), importUnavailable: t('assetImportUnavailable'),
        variantsViaAgent: t('assetVariantsViaAgent'), voiceUsesProject: t('assetVoiceUsesProject'), voiceSettings: t('voiceService'),
        requiredFields: t('assetRequiredFields'), promptLimit: t('assetPromptLimit'), referenceUnsupported: t('assetReferenceUnsupported'),
        referenced: t('assetReferenced'), saved: t('assetSavedToProject'), removed: t('assetRemovedFromProject'),
        generatePending: t('assetGeneratePending'), generateFor: t('assetGenerateFor'),
        reviewAdopted: t('assetReviewAdopted'), reviewCandidate: t('assetReviewCandidate'), generating: t('assetGenerating'),
        reparse: t('assetReparse'), batchDelete: t('assetBatchDelete'),
        generateRequest: t('assetGenerateRequest'), generateBatchRequest: t('assetGenerateBatchRequest'),
        services: t('serviceSettings'), generate: t('generate'),
      }, editCopy: {
        title: t('editTitle'), split: t('editSplit'), undo: t('editUndo'), redo: t('editRedo'), zoom: t('editZoom'), playbackFailed: t('editPlaybackFailed'), detachAudio: t('editDetachAudio'), plainSubtitle: t('editPlainSubtitle'),
        videoTrack: t('editVideoTrack'), audioTrack: t('editAudioTrack'), subtitleTrack: t('editSubtitleTrack'),
        originalAudio: t('editOriginalAudio'), muted: t('editMuted'), volume: t('editVolume'),
        addVideoTrack: t('editAddVideoTrack'), addAudioTrack: t('editAddAudioTrack'), addSubtitle: t('editAddSubtitle'),
        subtitleContent: t('editSubtitleContent'), start: t('editStart'), end: t('editEnd'), invalidSubtitle: t('editInvalidSubtitle'),
        confirmSubtitles: t('editConfirmSubtitles'), subtitleAdded: t('editSubtitleAdded'), transcriptCandidates: t('editTranscriptCandidates'),
        subtitleHint: t('editSubtitleHint'), removeSegment: t('editRemoveSegment'), addSegment: t('editAddSegment'),
        position: t('editPosition'), duration: t('editDuration'), emptySubtitle: t('editEmptySubtitle'), trackName: t('editTrackName'),
        unsupportedSource: t('editUnsupportedSource'), invalidEdit: t('editInvalid'), layerAbove: t('editLayerAbove'),
        layerBelow: t('editLayerBelow'), deleteTrack: t('editDeleteTrack'), muteTrack: t('editMuteTrack'), unmuteTrack: t('editUnmuteTrack'),
        trackActions: t('editTrackActions'), mediaLibrary: t('editMediaLibrary'), audioLibrary: t('editAudioLibrary'),
        restoreLegacy: t('editRestoreLegacy'), save: t('editSave'), export: t('editExport'), emptyMedia: t('editEmptyMedia'),
        inspectSource: t('editInspectSource'), background: t('editBackground'), addText: t('editAddText'),
        properties: t('editProperties'), seek: t('editSeek'), trackLocked: t('editTrackLocked'),
      }, analysisCopy: {
        title: t('analysisTitle'), inspect: t('analysisInspect'), scenes: t('analysisScenes'), transcript: t('analysisTranscript'),
        failed: t('analysisFailed'), interrupted: t('analysisInterrupted'), missing: t('analysisMissing'), noAudio: t('analysisNoAudio'),
        video: t('analysisVideo'), audio: t('analysisAudio'), duration: t('analysisDuration'), empty: t('analysisEmpty'),
      } } })
    }
    refresh.current = async () => { if (ready && !blocked) { await writes; await load('refresh') } }
    const flush = async () => {
      if (!ready) return
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => { flushed = undefined; reject(new Error('Studio flush timed out')) }, 10000)
        flushed = () => { window.clearTimeout(timer); resolve() }
        send({ type: 'flush' })
      })
      await writes
      if (blocked) throw new Error('Studio document has unsaved changes')
    }
    actions.flush(flush)
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== frame.current?.contentWindow || typeof event.data !== 'object' || event.data === null
        || !('channel' in event.data) || event.data.channel !== 'crewon-studio-v1') return
      const parsed = messageSchema.safeParse(event.data)
      if (!parsed.success) {
        if ('type' in event.data && (event.data.type === 'save-edit' || event.data.type === 'save-cut')) {
          send({ type: 'cut-failed', message: t('studioCutFailed') })
        }
        return
      }
      const value = parsed.data
      const operation = async () => {
        switch (value.type) {
          case 'ready':
            if (ready || initializing) break
            initializing = true
            await load('initialize')
            if (!live) break
            ready = true
            if (projectId) stopWatching = actions.watch(projectId,
              (production) => { if (live) send({ type: 'production-update', projectId, production }) },
              () => { if (live) send({ type: 'production-unavailable' }) })
            break
          case 'flushed': await writes; flushed?.(); break
          case 'save':
            if (!projectId || blocked) break
            writes = writes.then(async () => {
              if (!writer) throw new Error('Studio document is not ready')
              await writer.save(value.storage)
            }).catch((error: unknown) => { console.error('Studio document save failed', error); blocked = true; fail(true); send({ type: 'error', message: t('studioSaveFailed') }) })
            break
          case 'run':
            if (projectId) {
              await writes
              if (blocked) throw new Error('Studio document has unsaved changes')
              await actions.run(projectId, value.text)
            }
            break
          case 'save-asset':
            if (projectId) {
              try {
                await writes
                if (blocked) throw new Error('Studio document has unsaved changes')
                const saved = await actions.saveAsset(projectId, value.revision, value.asset)
                if (live) {
                  send({ type: 'production-update', projectId, production: saved.production })
                  send({ type: 'asset-saved', requestId: value.requestId, assetId: saved.assetId })
                }
              } catch (_error) { if (live) send({ type: 'asset-save-failed', requestId: value.requestId, message: t('studioSaveFailed') }) }
            }
            break
          case 'remove-asset':
            if (projectId) {
              try {
                await writes
                if (blocked) throw new Error('Studio document has unsaved changes')
                const production = await actions.removeAsset(projectId, value.revision, value.assetId)
                if (live) {
                  send({ type: 'production-update', projectId, production })
                  send({ type: 'asset-removed', requestId: value.requestId, assetId: value.assetId })
                }
              } catch (_error) { if (live) send({ type: 'asset-save-failed', requestId: value.requestId, message: t('studioSaveFailed') }) }
            }
            break
          case 'read-media-analysis':
            if (projectId) {
              try { const records = await actions.readAnalysis(projectId, value.mediaId); if (live) send({ type: 'media-analysis-history', mediaId: value.mediaId, records }) }
              catch (_error) { if (live) send({ type: 'media-analysis-history-failed', mediaId: value.mediaId, message: t('analysisFailed') }) }
            }
            break
          case 'analyze-media':
            if (projectId) {
              try { const record = await actions.analyze(projectId, value.mediaId, value.mode, value.requestId); if (live) send({ type: 'media-analysis-result', mediaId: value.mediaId, record }) }
              catch (_error) { if (live) send({ type: 'media-analysis-failed', mediaId: value.mediaId, requestId: value.requestId, message: t('analysisFailed') }) }
            }
            break
          case 'compile-shot':
            if (projectId) send({ type: 'shot-compiled', value: await actions.compile(projectId, value.shotId) })
            break
          case 'save-cut':
          case 'save-edit':
            if (projectId) {
              try {
                await writes
                if (blocked) throw new Error('Studio document has unsaved changes')
                const production = value.type === 'save-edit'
                  ? await actions.edit(projectId, value.revision, value.edit, value.exportId)
                  : await actions.cut(projectId, value.revision, value.clips, value.exportId)
                if (live) send({ type: 'cut-saved', production, exportId: value.exportId })
              } catch (_error) {
                // Export may fail after the edit commits; retain that revision for the next save.
                let production: DramaProduction | null = null
                try { production = (await actions.load(projectId)).production }
                catch (_reloadError) { /* The retained draft stays available when the Host cannot be read. */ }
                if (live) send({ type: 'cut-failed', production, message: t('studioCutFailed') })
              }
            }
            break
          case 'save-review':
            if (projectId) {
              await actions.review(projectId, value.revision, value.document)
              await load('refresh')
              send({ type: 'review-saved' })
            }
            break
          case 'settings':
            if (projectId) {
              const value = await actions.load(projectId)
              if (live && value.production) {
                configure({ id: projectId, production: value.production, shared: await actions.sharedSettings() })
              }
            }
            break
          case 'adopt-media':
            if (projectId) {
              await actions.adoptMedia(projectId, value.revision, value.jobId, value.mediaId)
              await load('refresh')
              send({ type: 'media-adopted' })
            }
            break
          case 'save-script':
            if (projectId) {
              await writes
              if (blocked) throw new Error('Studio document has unsaved changes')
              await actions.saveScript(projectId, value.revision, value.body)
              await load('refresh')
              send({ type: 'script-saved' })
            }
            break
          case 'adopt-script':
            if (projectId) {
              await writes
              if (blocked) throw new Error('Studio document has unsaved changes')
              await actions.adopt(projectId, value.revision, value.scriptId, value.body)
              await load('refresh')
              send({ type: 'script-adopted' })
            }
            break
          case 'create': await actions.create(value.title, value.synopsis); break
          case 'open': await actions.open(value.id); break
          case 'new-project': await actions.newProject(); break
          case 'overview': await actions.overview(); break
          case 'focus-agent': break
        }
      }
      void operation().catch(() => { if (live) { fail(true); send({ type: 'error', message: t('studioSaveFailed') }) } })
    }
    window.addEventListener('message', onMessage)
    return () => { live = false; stopWatching?.(); actions.flush(null); refresh.current = null; window.removeEventListener('message', onMessage) }
  }, [actions, active, visible, projectId, t])
  useEffect(() => {
    let cancelled = false
    if (!running) void refresh.current?.().then(() => {
      if (!cancelled) frame.current?.contentWindow?.postMessage({ channel: 'crewon-studio-v1', type: 'agent-idle' },
        window.location.origin === 'null' ? '*' : window.location.origin)
    }).catch(() => { if (!cancelled) fail(true) })
    return () => { cancelled = true }
  }, [running])
  return active && visible ? <section className={css.surface}>
    {failed && <p role="alert" className={css.notice}>{t('studioSaveFailed')}</p>}
    <iframe key={projectId ?? 'entry'} ref={frame} src="/api/studio-ui/index.html?embedded=1" title={t('studioWorkspace')}
      onLoad={() => { frame.current?.contentWindow?.postMessage({ channel: 'crewon-studio-v1', type: 'connect' }, '*') }}
      sandbox="allow-scripts allow-same-origin allow-downloads allow-modals allow-forms" />
    {settings && settings.id === projectId && <StudioServiceSettings production={settings.production}
      shared={settings.shared} busy={configuring} t={t}
      close={() => { configure(null) }} save={async (value, scope) => {
        setConfiguring(true)
        try {
          if (scope === 'shared') await actions.saveSharedSettings(settings.shared.revision, value)
          else await actions.settings(settings.id, settings.production.revision, value)
          await refresh.current?.()
          return true
        } catch (_error) { return false } // The settings dialog retains rejected inputs and reports the failure.
        finally { setConfiguring(false) }
      }} />}
  </section> : null
}
