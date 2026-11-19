/** Compose team management and conversation-owned expert selection. */
import type { Context } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import remote from '@deepseek-ai/dsh-agent-teams-bundle/remote'
import type { ExpertDraft, ExpertCatalogEntry } from '../expert-types.ts'
import { createExpertReferenceSource, type ExpertPickOrigin } from './expert-reference.ts'
import { expertInitialPrompt, openExpertConversation } from './expert-launch.ts'
import type { ExpertPickerActions } from './ExpertPicker.tsx'
import { RuntimePlanExpertPicker } from './RuntimePlanExpertPicker.tsx'
import { TeamAuthoringTail } from './TeamAuthoringTail.tsx'
import type { TeamAuthoringDraft, TeamAuthoringInput } from '../team-authoring-types.ts'
import { ExpertsPage } from './ExpertsPage.tsx'
import { en as expertEn, zh as expertZh } from './expert-copy.ts'
import { TeamTrajectory } from './TeamTrajectory.tsx'
import type { OfficeProjectActions } from './OfficeProjects.tsx'
import { OfficePage, OfficeMessage, OfficeTopicConversation } from './OfficePage.tsx'
import { officeMessageDefinition, workflowMessageDefinition } from './office-conversation.ts'
import { en as officeEn, zh as officeZh } from './office-copy.ts'
import { createOfficeReferenceSource } from './office-reference.ts'
import type { Office, OfficeDraft, OfficeUpdate } from '../office-types.ts'
import type { OfficeTopicId } from '../office-project-types.ts'
import { WorkflowApproval, WorkflowCommand, WorkflowMessage, WorkflowPage } from './WorkflowPage.tsx'
import { en as workflowEn, zh as workflowZh } from './workflow-copy.ts'
import type { WorkflowDraft } from '../workflow-types.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { createTeamLauncher } from './launch.ts'
import { TeamTemplates } from './TeamTemplates.tsx'
import { TeamHub, type TeamMode } from './TeamHub.tsx'
import type { TeamManagementTarget } from './team-management.ts'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { registerTeamDetails } from './TeamDetails.tsx'
import { installOfficeChatPresentation } from './office-chat-presentation.ts'
import { TeamHubIcon } from './TeamHubIcon.tsx'
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import { createTeamReferenceSource, routeTeamReference, teamMentionDisplayRule } from './team-reference.ts'
import { en, zh } from './locales.ts'
import { type TeamSettings } from './templates.ts'

const PANEL_ID = 'crewon-teams' as MainPanelId

/** Browser services required by team management and composer selection. */
export const inject = ['slots', 'uiConversation', 'conversation', 'workspaces', 'locale', 'configForms', 'sessions', 'uiWorkspace', 'layout', 'inputTriggers', 'commandUi', 'remote', 'remote.commands', 'sidebarRight', 'sidebarRightTabs', 'chatVisibility']

/**
 * Mount shared management and transform selected-team messages through normal prompt submission.
 * @param ctx - Browser plugin context.
 */
export async function apply(ctx: Context): Promise<void> {
  await ctx.remote.$mount(remote)
  ctx.effect(() => ctx.locale.register('expertTeamTemplates', { en, zh }), 'expert-team dictionaries')
  ctx.effect(() => ctx.locale.register('teamExperts', { en: expertEn, zh: expertZh }), 'expert dictionaries')
  const t = ctx.locale.bind('expertTeamTemplates')
  const teamMode = createSnapshotStore<TeamMode>('experts')
  const management = createSnapshotStore<TeamManagementTarget | undefined>(undefined)
  const consumeManagement = (target: TeamManagementTarget) => {
    if (management.getSnapshot() === target) management.set(undefined)
  }
  ctx.effect(() => ctx.commandUi.present({
    name: 'create-expert-panel', inputHint: () => t('createCommandHint'), token: () => t('createCommand'), label: () => t('createCommand'),
    description: () => t('createCommandDescription'),
  }), 'expert-team creation presentation')
  ctx.effect(() => ctx.commandUi.present({
    name: 'agent-teams', hidden: true, inputHint: () => t('taskCommandHint'), token: () => t('taskCommand'), label: () => t('taskCommand'),
    description: () => t('taskCommandDescription'),
  }), 'expert-team task presentation')
  const form = ctx.configForms.get<TeamSettings>('agent-teams')
  const launcher = createTeamLauncher(ctx.sessions, ctx.uiWorkspace)
  ctx.effect(() => () => { launcher.dispose() }, 'expert-team launcher lifetime')
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PANEL_ID, locale: 'expertTeamTemplates',
    inject: () => ({ hooks: { teamMode }, selectMode: (mode: TeamMode) => { teamMode.set(mode) } }),
    children: { 'teams.mode': { kind: 'keyed', scope: 'root' } },
  }, TeamHub))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: 15,
    label: () => t('teamsPage'),
  }, TeamHubIcon))
  ctx.effect(() => ctx.locale.register('teamOffice', { en: officeEn, zh: officeZh }), 'office dictionaries')
  ctx.effect(() => ctx.locale.register('teamWorkflow', { en: workflowEn, zh: workflowZh }), 'team workflow dictionaries')
  ctx.inject(['remote.teamWorkflows', 'remote.teamOffices', 'remote.teamOfficeProjects', 'remote.agentPresets', 'remote.teamExperts', 'remote.teamCatalogue', 'remote.teamAuthoring'], (ctx) => {
    const lifetime = new AbortController()
    ctx.effect(() => () => { lifetime.abort() }, 'expert conversation lifetime')
    const expertText = ctx.locale.bind('teamExperts')
    const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    }
    const expertCatalogue = async () => unwrap(await ctx.remote.teamExperts.catalogue())
    const expertPicker: ExpertPickerActions = {
      catalogue: expertCatalogue,
      activate: async slug => unwrap(await ctx.remote.teamExperts.activate(slug)),
      categoryLabel: category => ctx.locale.getLocale().active === 'zh' ? category.name : category.nameEn,
      get text() {
        return { search: expertText('search'), builtin: expertText('builtin'), mine: expertText('mine'),
          noResults: expertText('noResults'), loadFailed: expertText('loadFailed'), retry: expertText('retry'),
          pickerNative: expertText('pickerNative'), pickerHint: expertText('pickerHint'),
          pickerPending: expertText('pickerPending'), pickerFailed: expertText('pickerFailed') }
      },
    }
    let openingExpert = false
    const openExpert = async (entry: ExpertCatalogEntry, prompt?: string, origin?: ExpertPickOrigin) => {
      if (openingExpert) return
      openingExpert = true
      const signal = AbortSignal.any([lifetime.signal, ctx.layout.beginNavigation()])
      try {
        const source = origin === undefined ? undefined : ctx.sessions.binding(origin.sessionId)
        const state = source === undefined ? undefined : ctx.conversation.input.for(source.ctx).state.getSnapshot()
        const text = origin && state ? expertInitialPrompt(state, origin.span) : prompt
        const workspaces = ctx.workspaces.list.getSnapshot().items
        const sessions = ctx.sessions.list.getSnapshot()
        const selectedId = origin?.sessionId ?? sessions.ids.find(id => (sessions.byId[id]?.retainedBy.mainView ?? 0) > 0)
        const workspaceId = workspaces.find(item => selectedId !== undefined && item.sessionIds.includes(selectedId))?.workspaceId
        await openExpertConversation({ sessions: ctx.sessions, input: ctx.conversation.input, navigation: ctx.uiWorkspace,
          activate: async slug => unwrap(await ctx.remote.teamExperts.activate(slug)),
          cloneAttachments: id => state ? ctx.conversation.cloneDraftAttachments(id, state.attachmentIds) : [],
          releaseAttachments: (ids) => { for (const id of ids) ctx.conversation.releaseDraftAttachment(id) },
        }, entry, { signal, ...(workspaceId === undefined ? {} : { workspaceId }), ...(text === undefined ? {} : { prompt: text }) })
      } finally { openingExpert = false }
    }
    ctx.effect(() => ctx.inputTriggers.registerSource(createExpertReferenceSource(expertCatalogue,
      () => expertText('mentionGroup'), () => expertText('mentionHint'), (entry, origin) => {
        void openExpert(entry, undefined, origin).catch((error: unknown) => {
          if (lifetime.signal.aborted) return
          const binding = ctx.sessions.binding(origin.sessionId)
          if (binding) ctx.conversation.input.for(binding.ctx).notify('error', expertText('operationFailed'))
          ctx.logger.warn('Expert conversation could not open', error)
        })
      })), 'expert mentions')
    const catalogue = createSnapshotStore(0)
    ctx.effect(() => {
      const stream = ctx.remote.$stream<number>({
        name: 'team catalogue', open: signal => ctx.remote.teamCatalogue.watch(signal),
        ended: () => new Error('Team catalogue stream ended'),
      })
      void (async () => {
        try {
          for await (const frame of stream) {
            frame.accept()
            catalogue.set(catalogue.getSnapshot() + 1)
          }
        } catch (error) { ctx.logger.warn('Team catalogue updates stopped', error) }
      })()
      return () => stream.dispose()
    }, 'team catalogue subscription')
    ctx.slots.inject('teams.mode', () => ctx.slots.register({
      name: 'teams.mode', key: 'experts', locale: 'expertTeamTemplates',
      inject: () => ({
        hooks: { teams: form, launch: launcher.state, catalogue },
        expertPicker,
        scenarioLanguage: ctx.locale.getLocale().active === 'zh' ? 'zh' as const : 'en' as const,
        listExperts: async () => unwrap(await ctx.remote.teamExperts.list()),
        saveProfiles: form.mutate.bind(form), launchTask: launcher.launch, openCreated: launcher.openCreated,
      }),
    }, TeamTemplates))
    ctx.slots.inject('teams.mode', () => ctx.slots.register({
      name: 'teams.mode', key: 'specialists', locale: 'teamExperts',
      children: { 'toolbox.expert-capabilities': { kind: 'single', scope: 'root' } },
      inject: () => ({
        hooks: { catalogue },
        catalogue: expertCatalogue,
        categoryLabel: (category: import('../expert-types.ts').ExpertCategory) => ctx.locale.getLocale().active === 'zh' ? category.name : category.nameEn,
        readBuiltin: async (slug: string) => unwrap(await ctx.remote.teamExperts.readBuiltin(slug)),
        openExpert,
        presets: async () => unwrap(await ctx.remote.agentPresets.list()).presets,
        save: async (draft: ExpertDraft, id?: string, revision?: number) => unwrap(await ctx.remote.teamExperts.save(draft, id, revision)),
      }),
    }, ExpertsPage))
    ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
      name: 'conversation.chat.turnTail', id: 'expert-team-authoring', locale: 'expertTeamTemplates',
      inject: () => ({
        hooks: { catalogue },
        read: async (sessionId: SessionId) => unwrap(await ctx.remote.teamAuthoring.read(sessionId)),
        expertPicker,
        listExperts: async () => unwrap(await ctx.remote.teamExperts.list()),
        maxMembers: () => form.getSnapshot().value?.maxMembers ?? 8,
        update: async (sessionId: SessionId, draft: TeamAuthoringDraft, input: TeamAuthoringInput) =>
          unwrap(await ctx.remote.teamAuthoring.update(sessionId, draft.id, draft.revision, input)),
        confirm: async (sessionId: SessionId, draft: TeamAuthoringDraft) =>
          unwrap(await ctx.remote.teamAuthoring.confirm(sessionId, draft.id, draft.revision)),
        discard: async (sessionId: SessionId, draft: TeamAuthoringDraft) =>
          unwrap(await ctx.remote.teamAuthoring.discard(sessionId, draft.id, draft.revision)),
      }),
    }, TeamAuthoringTail))
    const api = ctx.remote.teamWorkflows
    const execute = async (sessionId: SessionId, line: string) => {
      const outcome = unwrap(await ctx.remote.commands.execute(sessionId, line, []))
      if (!outcome || outcome.result.kind === 'error') throw new Error(outcome?.result.text ?? 'Workflow action unavailable')
    }
    const open = (sessionId: SessionId) => {
      void ctx.sessions.using(sessionId, { source: 'controllerOperation' }, async (reference) => {
        await reference.ready
        ctx.uiConversation.binding(sessionId).activate('chat')
        ctx.uiWorkspace.openSession(sessionId)
      })
    }
    const availablePresets = async () => {
      const [roster, catalogue] = await Promise.all([ctx.remote.agentPresets.list(), ctx.remote.teamExperts.list()])
      const experts = unwrap(catalogue).experts
      return unwrap(roster).presets.filter(item => !item.id.startsWith('expert-') || experts.some(expert => expert.preset === item.id)).map((item) => {
        const expert = experts.find(value => value.preset === item.id)
        return expert ? { ...item, expertName: expert.name,
          expertRole: expert.description || expert.name, expertPrompt: expert.prompt } : item
      })
    }
    ctx.slots.inject('agent-teams.staged-expert', () => ctx.slots.register({
      name: 'agent-teams.staged-expert', locale: 'expertTeamTemplates',
      inject: () => ({ expertPicker, presets: async () => unwrap(await ctx.remote.agentPresets.list()).presets }),
    }, RuntimePlanExpertPicker))
    const actions = {
      hooks: { management, catalogue }, consumeManagement,
      expertPicker,
      list: async () => unwrap(await api.list()),
      presets: availablePresets,
      save: async (draft: WorkflowDraft, id?: string) => { unwrap(id === undefined ? await api.save(draft) : await api.update(id, draft)) },
      open,
      run: async (id: string, name: string, input: string, workspaceId: WorkspaceId) => {
        const sessionId = await ctx.sessions.create({ workspaceId })
        await ctx.sessions.using(sessionId, { source: 'controllerOperation' }, async (reference) => {
          const binding = await reference.ready
          unwrap(await binding.session.rename(name))
          open(sessionId)
          await execute(sessionId, '/team-workflow-run ' + JSON.stringify({ id, input }))
        })
      },
    }
    const approval = {
      read: async (sessionId: SessionId) => unwrap(await api.read(sessionId)),
      decide: (sessionId: SessionId, decision: 'approve' | 'reject', approvalId?: string) => execute(sessionId, '/team-workflow-decide ' + decision + (approvalId ? ' ' + approvalId : '')),
    }
    const readOffice = async (id: SessionId) => unwrap(await ctx.remote.teamOffices.read(id))
    installOfficeChatPresentation(ctx, readOffice, () => ctx.locale.bind('teamOffice')('chooseMember'),
      (sessionId, text, id) => execute(sessionId, '/team-office-send ' + JSON.stringify({ text, id })),
      () => ctx.locale.bind('teamOffice')('attachmentsUnsupported'))
    const trajectory = {
      readOffice,
      readExpertExecutions: async (sessionId: SessionId) => unwrap(await ctx.remote.teamExperts.executions(sessionId)),
      read: approval.read,
      trace: async (sessionId: SessionId) => unwrap(await api.trace(sessionId)),
    }
    registerTeamDetails(ctx, {
      readOffice, readWorkflow: approval.read, readWorkflowTrace: trajectory.trace,
      readWorkflowHistory: async (workflowId, before) => unwrap(await api.listHistory(workflowId, before)),
      workflowEditor: {
        expertPicker,
        read: async workflowId => unwrap(await api.list()).definitions.find(item => item.id === workflowId) ?? null,
        presets: actions.presets,
        save: (workflowId, draft) => actions.save(draft, workflowId),
        text: ctx.locale.bind('teamWorkflow'),
      },
      officeSettings: {
        expertPicker,
        save: async (officeId, draft) => { unwrap(await ctx.remote.teamOffices.update(officeId, draft)) },
        presets: actions.presets,
        text: ctx.locale.bind('teamOffice'),
      },
      openManagement: (target) => {
        management.set({ ...target })
        teamMode.set(target.kind === 'office' ? 'offices' : 'workflows')
        ctx.layout.selectPanel(PANEL_ID)
      },
    }, catalogue)
    ctx.slots.inject('conversation.trajectory.execution', () => ctx.slots.register({
      name: 'conversation.trajectory.execution', locale: 'teamWorkflow', inject: () => ({ ...trajectory, hooks: { catalogue } }),
    }, TeamTrajectory))
    ctx.slots.inject('teams.mode', () => ctx.slots.register({
      name: 'teams.mode', key: 'workflows', locale: 'teamWorkflow', inject: () => actions,
    }, WorkflowPage))
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
      name: 'conversation.input.dock', id: 'team-workflow-approval', locale: 'teamWorkflow', inject: () => approval,
    }, WorkflowApproval))
    const projects = ctx.remote.teamOfficeProjects
    const openingTopics = new Map<OfficeTopicId, Promise<SessionId>>()
    const topicSession = (office: Office, topicId: OfficeTopicId): Promise<SessionId> => {
      const pending = openingTopics.get(topicId)
      if (pending) return pending
      const task = (async () => {
        const target = unwrap(await ctx.remote.teamOffices.resolveTopicSession(office.id, topicId))
        const sessionId = target.sessionId ?? await ctx.sessions.create({ workspaceId: target.workspaceId })
        await ctx.sessions.using(sessionId, { source: 'controllerOperation' }, async (reference) => {
          const binding = await reference.ready
          if (!target.sessionId) {
            unwrap(await binding.session.rename(`${target.scope.projectName} · ${target.scope.title}`))
            await execute(sessionId, '/team-office-topic-open ' + JSON.stringify({ officeId: office.id, topicId }))
          }
        })
        const opened = unwrap(await ctx.remote.teamOffices.resolveTopicSession(office.id, topicId))
        if (!opened.sessionId) throw new Error('Office topic conversation unavailable')
        return opened.sessionId
      })()
      openingTopics.set(topicId, task)
      void task.then(() => openingTopics.delete(topicId), () => openingTopics.delete(topicId))
      return task
    }
    const projectActions: OfficeProjectActions = {
      overview: async (id, member) => unwrap(await projects.overview(id, member)),
      createProject: async (id, name, description, request) => unwrap(await projects.createProject(id, name, description, request)),
      startTopic: async (id, project, body, request) => unwrap(await projects.startTopic(id, project, body, request)),
      topic: async (id, topic, throughSequence) => unwrap(await projects.topic(id, topic, throughSequence)),
      reply: async (id, topic, body, revision, request) => unwrap(await projects.reply(id, topic, body, revision, request)),
      openTopic: async (office, topicId) => { open(await topicSession(office, topicId)) },
      send: async (office, memberId, text, submission, request) => {
        const sessionId = await topicSession(office, submission.topicId)
        await ctx.sessions.using(sessionId, { source: 'controllerOperation' }, async (reference) => {
          await reference.ready
          await execute(sessionId, '/team-office-send ' + JSON.stringify({ memberId, text, topicId: submission.topicId, sourceMessageRef: submission.sourceMessageRef, id: request }))
        })
      },
    }
    const officeActions = {
      hooks: { management, catalogue }, consumeManagement,
      expertPicker,
      projectActions,
      list: async () => unwrap(await ctx.remote.teamOffices.list()),
      presets: actions.presets,
      save: async (draft: OfficeDraft) => { unwrap(await ctx.remote.teamOffices.save(draft)) },
      update: async (id: Office['id'], draft: OfficeUpdate) => unwrap(await ctx.remote.teamOffices.update(id, draft)),
      open: async (office: Office, workspaceId: WorkspaceId) => {
        if (office.sessionId) { open(office.sessionId); return }
        const sessionId = await ctx.sessions.create({ workspaceId })
        await ctx.sessions.using(sessionId, { source: 'controllerOperation' }, async (reference) => {
          const binding = await reference.ready
          unwrap(await binding.session.rename(office.name))
          await execute(sessionId, '/team-office-open ' + office.id)
          open(sessionId)
        })
      },
    }
    ctx.slots.inject('teams.mode', () => ctx.slots.register({
      name: 'teams.mode', key: 'offices', locale: 'teamOffice', inject: () => officeActions,
    }, OfficePage))
    ctx.effect(() => ctx.uiConversation.events.register(officeMessageDefinition), 'office conversation messages')
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
      name: 'conversation.chat.node', key: 'office-message', locale: 'teamOffice',
      inject: () => ({ readOffice }),
    }, OfficeMessage))
    ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({
      name: 'conversation.chat.commandview', key: 'team-office-open',
    }, () => null))
    ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({
      name: 'conversation.chat.commandview', key: 'team-office-send',
    }, () => null))
    ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({
      name: 'conversation.chat.commandview', key: 'team-office-topic-open', locale: 'teamOffice',
      inject: () => ({ readOffice, readTopic: projectActions.topic,
        ackTopic: async (id: Office['id'], topic: OfficeTopicId, throughSequence: number) => {
          unwrap(await projects.acknowledgeTopic(id, topic, throughSequence))
        },
      }),
    }, OfficeTopicConversation))
    ctx.effect(() => ctx.inputTriggers.registerSource(createOfficeReferenceSource(readOffice, () => t('offices'),
      (sessionId, memberId, text, id) => execute(sessionId, '/team-office-send ' + JSON.stringify({ memberId, text, id })))), 'office member mentions')
    ctx.effect(() => ctx.uiConversation.events.register(workflowMessageDefinition), 'workflow conversation activity')
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
      name: 'conversation.chat.node', key: 'workflow-message', locale: 'teamWorkflow',
      inject: () => ({ read: approval.read }),
    }, WorkflowMessage))
    for (const name of ['team-workflow-run', 'team-workflow-decide']) {
      ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({
        name: 'conversation.chat.commandview', key: name, locale: 'teamWorkflow',
        inject: () => ({ read: approval.read }),
      }, WorkflowCommand))
    }
  })
  for (const name of ['team-workflow-run', 'team-workflow-decide', 'team-office-open', 'team-office-topic-open', 'team-office-send']) {
    ctx.effect(() => ctx.commandUi.present({ name, hidden: true, token: () => name, label: () => name, description: () => '' }), 'hide internal workflow command')
  }
  ctx.effect(() => ctx.inputTriggers.registerSource(createTeamReferenceSource(
    () => form.getSnapshot().value?.profiles ?? {}, () => t('experts'), () => t('unavailable'),
  )), 'expert-team mentions')
  ctx.uiConversation.userText.register(teamMentionDisplayRule)
  ctx.on('conversation/input-transform', (request, next) => {
    request.text = routeTeamReference(request.text, form.getSnapshot().value?.profiles ?? {}, t('mentionInvalid'))
    return next()
  })
}
