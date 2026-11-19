/** Studio owns its product navigation while reusing native conversations, workspaces and authenticated storage. */
import { StudioDirectorTail } from './StudioDirectorTail.tsx'
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { DramaProjectId } from '../project-types.ts'
import type { DramaProduction } from '../production-types.ts'
import { brandString } from '@deepseek-ai/dsh-brand'
import remote from '@deepseek-ai/dsh-short-drama-bundle/remote'
import { StudioNavigationBridge } from './StudioNavigationBridge.tsx'
import { createStudioEntrySubmission, studioEntryProjectTitle } from './studio-entry-submit.ts'
import { StudioCreationFrame } from './StudioCreationFrame.tsx'
import { StudioLauncher } from './StudioLauncher.tsx'
import { StudioFrame, type StudioFrameActions } from './StudioFrame.tsx'
import { createStudioContext, type StudioCreationPreferences } from './studio-context.ts'
import { createStudioNavigation } from './studio-navigation.ts'
import { DramaPanelIcon } from './StudioPanelIcon.tsx'
import { en, zh } from './locales.ts'
import { studioActionTextRule, studioEntryTextRule } from './studio-entry-text.ts'

const PANEL_ID = 'crewon-short-drama' as MainPanelId
/** Native client dependencies; Studio does not launch a second server or conversation renderer. */
export const inject = ['slots', 'locale', 'remote', 'layout', 'uiWorkspace', 'sidebarRight', 'sidebarRightTabs', 'sessions', 'uiConversation', 'conversation']
function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: Error }): T {
  if (!result.ok) throw result.error
  return result.value
}
/** @param ctx - Native plugin registration context. @returns Completion after typed Remote and UI contributions are mounted. */
export async function apply(ctx: Context): Promise<void> {
  await ctx.remote.$mount(remote)
  ctx.effect(() => ctx.locale.register('shortDrama', { en, zh }), 'studio copy')
  const t = ctx.locale.bind('shortDrama')
  ctx.inject(['remote.shortDrama', 'remote.shortDramaProduction', 'remote.studioDirector', 'remote.studioMediaAnalysis'], (scope) => {
    const api = scope.remote.shortDrama, production = scope.remote.shortDramaProduction
    const state = createStudioContext()
    const lifetime = new AbortController()
    let flush: (() => Promise<void>) | null = null
    let submitting = false
    scope.effect(() => () => { lifetime.abort() }, 'studio navigation lifetime')
    const navigation = createStudioNavigation({
      state, layout: scope.layout, workspace: scope.uiWorkspace, panelId: PANEL_ID, lifetime: lifetime.signal,
      readProjects: async () => unwrap(await api.studioCatalogue()),
      openConversation: async id => unwrap(await api.openConversation(id)),
      createConversation: async id => unwrap(await api.createConversation(id)),
      openEntry: async () => unwrap(await api.openStudioEntry()),
      primaryActionLabel: () => t('newProjectAction'),
      hasPanel: id => scope.slots.entries('main').some(entry => entry.options.key === id),
      flush: () => flush?.(), failed: (error) => { scope.logger.warn('Studio navigation failed', error) },
    })
    const { actions, catalogue, reveal, navigate, openProject, openCreation, restoreHome } = navigation
    scope.slots.inject('shell.overlay', () => scope.slots.register({
      name: 'shell.overlay', id: 'studio.session-navigation', inject: () => ({
        hooks: { mounted: scope.sidebarRight.mounted, studio: state },
        changed: navigation.changed,
        show: (sessionId: SessionId) => {
          navigation.show(sessionId, () => { scope.sidebarRight.openTab('crewon-studio') }, () => {
            const current = scope.sidebarRight.active()
            if (current?.kind === 'crewon-studio') scope.sidebarRight.close(current.id)
          })
        },
      }),
    }, StudioNavigationBridge))
    scope.effect(() => scope.uiConversation.userText.register(studioEntryTextRule(value => [
      t(value.mode === 'produce' ? 'entryProduce' : value.mode === 'adapt' ? 'entryRewrite'
        : value.mode === 'redraw' ? 'entryRedraw' : value.category === 'interactive' ? 'entryInteractive'
          : value.category === 'create' ? 'entryCreate' : 'entryWrite'),
      value.options.ratio, value.productionEpisodes ?? value.options.episodes,
      value.options.style === '风格' ? undefined : value.options.style,
    ].filter(Boolean).join(' · '))), 'Studio creation input summary')
    scope.effect(() => scope.uiConversation.userText.register(studioActionTextRule()), 'Studio canvas action summary')
    scope.on('ui-workspace/before-open-session', (_target, next) => {
      if (!state.getSnapshot().active || !flush || navigation.isNavigating() || submitting) { next(); return }
      void flush().then(next, (error: unknown) => {
        state.update((value) => { value.error = true })
        scope.logger.warn('Studio draft could not be saved before conversation navigation', error)
      })
    })
    scope.on('sidebar/return-home', (next) => {
      if (state.getSnapshot().active) { void actions.leave(); return }
      next()
    })
    scope.on('ui-workspace/context-add-workspace', (next) => {
      if (!state.getSnapshot().active) { next(); return }
      void navigate((signal) => { restoreHome(signal); next() })
    })
    scope.on('ui-workspace/context-new-session', (next) => {
      if (!state.getSnapshot().active) { next(); return }
      void actions.overview()
    })
    scope.on('ui-workspace/context-new-session-in-workspace', (workspaceId, next) => {
      if (!state.getSnapshot().active) { next(); return }
      const project = state.getSnapshot().projects.find(item => item.workspaceId === workspaceId)
      if (!project) { next(); return }
      void navigation.newConversation(project.id)
    })
    const creationInject = () => ({
      hooks: { studio: state, entryPanel: scope.layout.panelInfo }, overview: () => { void actions.overview() },
      flushEntry: (callback: (() => Promise<void>) | null) => { flush = callback },
      readEntry: async () => unwrap(await api.readEntryDocument()),
      saveEntry: async (document: import('../project-types.ts').StudioDocument) => unwrap(await api.saveEntryDocument(document)),
      prepareEntry: (value: { storage: Record<string, string>; sourceIds: string[] }) => {
        state.update((current) => { current.entrySubmission = value })
      },
    })
    scope.slots.inject('conversation.input.header', () => scope.slots.register({
      name: 'conversation.input.header', id: 'studio.create', locale: 'shortDrama', inject: creationInject,
    }, StudioCreationFrame))
    const submitEntry = createStudioEntrySubmission({
      read: () => state.getSnapshot(),
      remember: (id) => { state.update((value) => { value.creationProjectId = id }) },
      busy: () => new Error(t('studioAgentBusy')),
      create: async (request) => {
        const project = unwrap(await api.create(studioEntryProjectTitle(request.text, t('entryNewProject'))))
        return project.id
      },
      deliver: async (id, request) => {
        const current = unwrap(await production.read(id))
        if (current.revision === 0) {
          const shared = unwrap(await production.readSharedSettings())
          if (shared.settings.image || shared.settings.video || shared.settings.voice) {
            unwrap(await production.saveSettings(id, current.revision, shared.settings))
          }
        }
        const project = unwrap(await api.read(id))
        if (!project.synopsis && request.text) unwrap(await api.saveDraft(id, project.revision, request.text.slice(0, 4000), ''))
        const sessionId = unwrap(await api.openConversation(id))
        const preference: StudioCreationPreferences = state.getSnapshot().creation ?? { mode: 'idea', style: 'auto', ratio: '16:9', episodes: '1' }
        const submission = state.getSnapshot().entrySubmission
        const sources = submission ? unwrap(await api.copyEntrySources(id, submission.sourceIds.map(brandString<import('../project-types.ts').EntrySourceId>))) : []
        if (submission) {
          const document = unwrap(await api.readStudio(id))
          unwrap(await api.saveStudio(id, { revision: document.revision, storage: submission.storage }))
        }
        const text = submission ? request.text + '\n\n' + JSON.stringify({ originalFiles: sources }) : request.text + '\n\n' + t('entryInstruction', {
          mode: t(preference.category === 'create' ? 'entryCreate' : preference.category === 'interactive' ? 'entryInteractive'
            : preference.mode === 'idea' ? 'entryWrite' : preference.mode === 'script' ? 'entryProduce'
              : preference.mode === 'redraw' ? 'entryRedraw' : 'entryRewrite'),
          style: t(preference.style === 'cinema' ? 'entryCinema' : preference.style === 'live' ? 'entryLive'
            : preference.style === 'anime' ? 'entryAnime' : 'entryAuto'),
          ratio: preference.ratio === 'auto' ? t('entryAuto') : preference.ratio, episodes: preference.episodes,
          genre: t(preference.genre === 'life' ? 'entryLifeGenre' : preference.genre === 'romance' ? 'entryRomanceGenre'
            : preference.genre === 'mystery' ? 'entryMysteryGenre' : 'entryDefaultGenre'),
        })
        return scope.sessions.using(sessionId, { source: 'controllerOperation', signal: request.signal }, async (reference) => {
          const binding = await reference.ready
          return scope.conversation.sendToSession(
            binding.session, text, request.attachmentIds, request.mode, request.signal, request.accept,
          )
        })
      },
      accepted: async (id) => {
        const submitted = state.getSnapshot().entrySubmission
        try { if (submitted) {
          const current = unwrap(await api.readEntryDocument())
          if (JSON.stringify(current.storage) === JSON.stringify(submitted.storage)) {
            const raw = current.storage['crewon-studio-demo-v1']
            if (raw) {
              const parsed = z.record(z.string(), z.json()).parse(JSON.parse(raw))
              delete parsed.referenceScriptInput
              parsed.referenceEntryDrafts = {}
              parsed.drafts = {}
              parsed.referenceEntrySources = []
              unwrap(await api.saveEntryDocument({ revision: current.revision,
                storage: { 'crewon-studio-demo-v1': JSON.stringify(parsed) } }))
            }
          }
        }
        } catch (error) {
          scope.logger.warn('Studio prompt accepted; creation draft cleanup needs retry', error)
        }
        const revealProject = state.getSnapshot().active && !state.getSnapshot().projectId
        state.update((value) => {
          delete value.creationProjectId
          delete value.entrySubmission
          if (revealProject) { value.projectId = id; value.creating = false }
        })
        try {
          if (revealProject) reveal(unwrap(await api.openConversation(id)), false)
          await catalogue()
        } catch (error) {
          state.update((value) => { value.error = true })
          scope.logger.warn('Studio prompt accepted; project navigation needs retry', error)
        }
      },
    })
    scope.on('conversation/input-submit', async (request, next) => {
      const current = state.getSnapshot()
      if (!current.active || current.projectId || current.entrySessionId !== request.sessionId) return next()
      try { return await submitEntry(request, next) }
      catch (error) {
        scope.logger.warn('Studio first submission failed; retaining the creation draft', error)
        throw new Error(t('entryCreateFailed'))
      }
    })
    const run = async (id: DramaProjectId, text: string) => {
      const selectedProject = () => state.getSnapshot().active && state.getSnapshot().projectId === id
      if (submitting || !selectedProject()) return
      submitting = true
      try {
        const projects = await catalogue()
        if (!selectedProject()) return
        const currentSession = scope.uiWorkspace.captureSelection().sessionId
        const selected = projects.find(project => project.id === id)
        const sessionId = currentSession && selected && [...selected.sessionIds, ...selected.historySessionIds].includes(currentSession)
          ? currentSession : unwrap(await api.openConversation(id))
        await scope.sessions.using(sessionId, { source: 'controllerOperation', signal: lifetime.signal }, async (reference) => {
          const binding = await reference.ready
          if (!selectedProject()) return
          if (currentSession !== sessionId) reveal(sessionId, false)
          scope.uiConversation.binding(sessionId).activate('chat')
          const submission = binding.session.beginSubmission({ mode: 'queue', text, attachments: [] })
          const result = await binding.session.prompt([{ type: 'text', text }], 'queue', lifetime.signal, submission.requestId)
          if (!result.ok) { submission.abandon(); throw result.error }
        })
      } finally { submitting = false }
    }
    scope.slots.inject('conversation.chat.turnTail', () => scope.slots.register({
      name: 'conversation.chat.turnTail', id: 'studio-director', locale: 'shortDrama', inject: () => ({ actions: {
        read: async (sessionId: SessionId) => unwrap(await scope.remote.studioDirector.read(sessionId)),
        confirm: async (sessionId: SessionId, token: string) => unwrap(await scope.remote.studioDirector.confirm(sessionId, token)),
        run: (id: DramaProjectId, stage: import('../director-model.ts').DirectorStage,
          action: import('../director-model.ts').DirectorProgress['action'], retry: boolean) => run(id,
          t(retry ? 'directorRetryRequest' : stage === 'assets' && action === 'continue' ? 'directorGenerateAssetsRequest'
            : stage === 'video' && action === 'continue' ? 'directorGenerateVideosRequest'
              : stage === 'script' && action === 'repair' ? 'directorRepairScriptRequest' : 'directorContinueRequest')),
        settings: async (id: DramaProjectId) => ({ production: unwrap(await production.read(id)),
          shared: unwrap(await production.readSharedSettings()) }),
        saveSettings: async (id: DramaProjectId, revision: number, settings: DramaProduction['settings'], shared: boolean) => {
          if (shared) unwrap(await production.saveSharedSettings(revision, settings))
          else unwrap(await production.saveSettings(id, revision, settings))
        },
        open: (id: DramaProjectId) => actions.select(id),
      } }),
    }, StudioDirectorTail))
    const frameActions: StudioFrameActions = {
      watch: (id, changed, failed) => {
        const stream = scope.remote.$stream<DramaProduction>({
          name: 'Studio production', open: signal => production.watch(id, signal),
          ended: () => new Error('Studio production updates stopped'),
        })
        void (async () => {
          try { for await (const frame of stream) { frame.accept(); changed(frame.value) } }
          catch (error) { if (!lifetime.signal.aborted) { scope.logger.warn('Studio production updates stopped', error); failed() } }
        })()
        return () => { void stream.dispose() }
      },
      load: async (id) => {
        const projects = await catalogue()
        const sessionId = projects.find(project => project.id === id)?.sessionIds[0]
        const director = sessionId ? unwrap(await scope.remote.studioDirector.read(sessionId)) : null
        return { project: id ? unwrap(await api.read(id)) : null,
          direction: director?.brief ?? null, preferences: director?.preferences ?? null,
          production: id ? unwrap(await production.read(id)) : null,
          document: id ? unwrap(await api.readStudio(id)) : { revision: 0, storage: {} }, projects }
      },
      save: async (id, document) => unwrap(await api.saveStudio(id, document)),
      saveAsset: async (id, revision, draft) => {
        const next = unwrap(await production.saveAsset(id, revision, draft))
        const asset = draft.id ? next.assets.find(item => item.id === draft.id) : next.assets.at(-1)
        if (!asset) throw new Error('The saved Studio asset is missing')
        return { production: next, assetId: asset.id }
      },
      removeAsset: async (id, revision, assetId) => unwrap(await production.removeAsset(id, revision, assetId)),
      run,
      adoptMedia: async (id, revision, jobId, mediaId) => {
        unwrap(await production.adoptMedia(id, revision, jobId, mediaId))
        const project = (await catalogue()).find(item => item.id === id)
        const sessionId = project?.sessionIds[0]
        const next = sessionId ? unwrap(await scope.remote.studioDirector.read(sessionId)) : null
        if (next && ['storyboard', 'edit'].includes(next.progress.stage)) await run(id, t('directorContinueRequest'))
      },
      cut: async (id, revision, clips, exportId) => {
        if (exportId) {
          const current = unwrap(await production.read(id))
          const previous = current.exports.find(item => item.id === exportId)
          if (previous) {
            if (JSON.stringify(previous.clips) !== JSON.stringify(clips)) throw new Error('The export identity belongs to another edit')
            return current
          }
        }
        const saved = unwrap(await production.saveTimeline(id, revision, clips))
        return exportId ? unwrap(await production.exportEpisode(id, saved.revision, exportId)) : saved
      },
      edit: async (id, revision, edit, exportId) => {
        if (exportId) {
          const current = unwrap(await production.read(id))
          const previous = current.exports.find(item => item.id === exportId)
          if (previous) {
            if (JSON.stringify(previous.edit) !== JSON.stringify(edit)) throw new Error('The export identity belongs to another edit')
            return current
          }
        }
        const saved = unwrap(await production.saveEdit(id, revision, edit))
        return exportId ? unwrap(await production.exportEpisode(id, saved.revision, exportId)) : saved
      },
      readAnalysis: async (id, mediaId) => unwrap(await scope.remote.studioMediaAnalysis.read(id, mediaId)),
      analyze: async (id, mediaId, mode, requestId) => unwrap(await scope.remote.studioMediaAnalysis.analyze(id, mediaId, mode, requestId)),
      compile: async (id, shotId) => unwrap(await production.compileShot(id, shotId)),
      review: async (id, revision, document) => { unwrap(await production.saveCreative(id, revision, 'review', document)) },
      sharedSettings: async () => unwrap(await production.readSharedSettings()),
      saveSharedSettings: async (revision, settings) => { unwrap(await production.saveSharedSettings(revision, settings)) },
      settings: async (id, revision, settings) => { unwrap(await production.saveSettings(id, revision, settings)) },
      saveScript: async (id, revision, body) => {
        const project = unwrap(await api.read(id))
        unwrap(await api.saveDraft(id, revision, project.synopsis, body))
      },
      adopt: async (id, revision, scriptId, body) => {
        let project = unwrap(await api.read(id))
        if (project.revision !== revision) {
          unwrap(await api.adoptScript(id, revision, scriptId))
          return
        }
        if (project.scripts.find(script => script.id === scriptId)?.body !== body) {
          project = unwrap(await api.saveDraft(id, revision, project.synopsis, body))
          const candidate = project.scripts.at(-1)
          if (!candidate) throw new Error('The reviewed script was not saved')
          scriptId = candidate.id
        }
        unwrap(await api.adoptScript(id, project.revision, scriptId))
        await run(id, t('directorContinueRequest'))
      },
      create: async (title, synopsis) => {
        let created: DramaProjectId | undefined
        await navigate(async (signal) => {
          const project = unwrap(await api.create(title))
          signal.throwIfAborted()
          if (synopsis) unwrap(await api.saveDraft(project.id, project.revision, synopsis, ''))
          signal.throwIfAborted()
          created = project.id
          await openProject(project.id, signal)
        })
        if (created && synopsis) await run(created, t('studioScriptRequest'))
      },
      open: async (id) => { await actions.select(brandString<DramaProjectId>(id)) },
      overview: actions.overview,
      newProject: () => navigate(openCreation),
      flush: (callback) => { flush = callback },
    }
    const tab = '@deepseek-ai/dsh-short-drama-bundle/studio'
    scope.effect(() => scope.sidebarRightTabs.register({ id: tab, kind: 'crewon-studio', priority: 'builtin', title: () => t('title') }), 'studio workspace page')
    scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
      name: 'sidebar.right.pane.tab', key: tab, locale: 'shortDrama', inject: () => ({ actions: frameActions, hooks: { studio: state } }),
    }, StudioFrame))
    scope.slots.inject('main', () => scope.slots.register({
      name: 'main', key: PANEL_ID, inject: () => ({ open: () => { void actions.enter() } }),
    }, StudioLauncher))
    scope.slots.inject('sidebar.panellist', () => scope.slots.register({
      name: 'sidebar.panellist', id: PANEL_ID, order: 17, label: () => t('title'),
    }, DramaPanelIcon))
  })
}
