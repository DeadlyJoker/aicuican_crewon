/** Project director persists creative intent and exposes reviewable native handoffs. */
import { readCreationPreferences } from './creation-preferences.ts'
import { directorStageSkills } from './creative-skills.ts'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { principalOf, Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { DramaProjectId, DramaScriptId } from './project-types.ts'
import type { ShortDramaProjects } from './projects.ts'
import type { ShortDramaProduction } from './production.ts'
import { directionSchema, directorProgress, type CreativeDirection, type DirectorView } from './director-model.ts'
import { productionIds } from './production-schema.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Native project creative direction and human review handoffs. */
    studioDirector: StudioDirector
  }
}

const record = z.object({ revision: z.number().int().nonnegative(), confirmedRevision: z.number().int().nullable(),
  versions: z.array(z.object({ revision: z.number().int(), brief: directionSchema, createdAt: z.number().int().optional(),
    scriptIdAtSave: z.uuid().transform(brandString<DramaScriptId>).nullable().optional() })) })
/** Independent additive storage leaves released project and media records unchanged. */
export const directorDomain = defineDomain({ name: 'short_drama_director', version: 1, layout: 'per-record',
  tables: { directions: domainTable<DramaProjectId, z.infer<typeof record>>(record) } })

const policy = `You are the Studio project director. Use native studio-director and specialist skills, not a second pipeline or files as project truth.
Read short_drama_read_direction for the separate creative direction revision before saving it. Never use a script or production revision for a direction write. If any save conflicts, re-read its owning tool and preserve the user draft; do not inspect source code or files to repair an ordinary project revision conflict.
Use the saved creation preferences as user choices: do not ask again for genre, selected style, ratio or episode count, and do not silently replace them. Defaults allow a creative recommendation, but label it as a recommendation. Story positioning explains audience, genre promise and emotional experience, not a title. The logline states protagonist, goal, obstacle and stakes in one sentence. The synopsis has a causal beginning, development, reversal and ending. Character biographies include background, motivation, change and relationships. Save one distinct episode outline per requested episode with concrete events, conflict, turning point and ending; scenes or shots within one episode are not separate episodes. For short films, be concise but complete; never fill these fields by repeating the title.
For a one-line idea, ask at most two short creative questions only when they materially change the story; recommend defaults for audience, duration and style. Do not ask the user technical model, API or skill questions. If they accept your recommendation, save a complete creative brief using short_drama_save_direction. Label invented details as assumptions. Save background, characters, conflict and outline, not just a chat answer. Asset definitions are editable text records, not adoptable media. Present them for review; do not ask users to adopt definitions before generation. The native Generate assets or Generate videos button explicitly authorizes that generation stage; do not ask again. Blocking script diagnoses must be repaired as a new candidate before paid generation.
For direction, script or media confirmation, end the turn with a short final reply so the native review card can appear. Do NOT call a question tool for these confirmations: question tools are only for missing creative preferences, and a question response does not commit adoption. The user confirms in the native review card.
Follow the next action in the project snapshot. A user can enter with an existing script or assets: do not force earlier stages or recreate work. After direction confirmation, write and save a complete script candidate. Wait for human script adoption. Then diagnose, extract source-linked reusable assets and save their briefs. Adopting a screenplay does not authorize media generation. After saving asset definitions, stop for the native Generate assets button unless the user has explicitly requested those generations. Generate missing visual assets only when that generation stage is authorized. Reuse existing stable job identities and observe unresolved attempts. Never silently regenerate or pay for a failed job. Preserve adoption for human review.
After asset adoption, construct the required structured shots and plans using studio-storyboard; compile each with studio-u22-compiler, then generate missing video candidates when authorized. Human adoption is separate from generation. Review real outputs with studio-media-review; unknown sound is not passed. Never invent visual acceptance.
After video adoption, assemble the adopted clips in story order and export a real MP4 with the native timeline/export tools. Existing native video audio can be used without a separate speech service; never promise narration if no voice service exists. Continue authorized unblocked work in the same turn; stop only at a creative question, human review, missing service or unresolved job. Keep the entire final reply to at most two short sentences. Do not repeat the brief, screenplay, identifiers or saved canvas content in prose; the native card presents them. End with a short next-step sentence; do not give the user tool names or a list of commands. Manual canvas edits and chat use the same records; re-read after changes.`

/** Native director operations shared by both GUI clients and project tools. */
export class StudioDirector extends TypertRemoteService {
  private readonly directions
  private readonly writes = new Map<DramaProjectId, Promise<unknown>>()
  /**
   * @param ctx - Host service scope.
   * @param domain - Durable creative directions.
   * @param projects - Native project owner.
   * @param production - Existing production operations.
   */
  constructor(ctx: Context, domain: Domain<typeof directorDomain>, private readonly projects: ShortDramaProjects,
    private readonly production: ShortDramaProduction) {
    super(ctx, 'studioDirector')
    this.directions = domain.table('directions')
    ctx.effect(() => async () => { await Promise.allSettled(this.writes.values()); await domain.close() }, 'Studio director storage')
    ctx.systemPrompt.context({ name: 'studio-director', order: 450, required: true, interpolate: false,
      text: (context) => {
        const agent = context.agent
        const project = agent && projects.projectForSession(agent.session.id)
        if (!project) return ''
        const direction = this.read(agent.session.id)
        if (!direction) return ''
        return policy + '\nProject snapshot:\n' + JSON.stringify({ direction })
          + '\nActive specialist instructions:\n' + directorStageSkills(direction.progress.stage)
      } })
    const admission = { when: ({ agent }: { agent: { session: { id: SessionId } } }) =>
      projects.projectForSession(agent.session.id) !== undefined }
    ctx.effect(() => ctx.tools.register(defineTool({ name: 'short_drama_read_direction',
      description: 'Read the current creative brief, directionRevision and next project handoff. The directionRevision is separate from script and production revisions. Read this before saving a creative brief.',
      parameters: {}, output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute: (_args, exec) => {
        exec.signal.throwIfAborted()
        if (!exec.agent) throw new Error('Open a Studio project first')
        const view = this.read(exec.agent.session.id)
        if (!view) throw new Error('Open a Studio project first')
        return Promise.resolve(z.json().parse({ directionRevision: view.revision, confirmed: view.confirmed,
          brief: view.brief, preferences: view.preferences, progress: view.progress }))
      }, presentCall: () => ({ card: 'generic', title: 'Read story direction', kind: 'read' }),
    }), admission), 'Studio creative direction read')
    ctx.effect(() => ctx.tools.register(defineTool({ name: 'short_drama_save_direction',
      description: 'Save the project creative brief and visible assumptions. Call short_drama_read_direction and use its directionRevision, never the script/production revision. Supply the typed brief fields. Characters, background and outline are plain text. Human confirmation stays separate.',
      parameters: {
        expectedRevision: { type: 'integer', required: true, description: 'directionRevision from short_drama_read_direction.' },
        brief: { type: 'object', required: true, additionalProperties: false, properties: {
          idea: { type: 'string', required: true }, audience: { type: 'string', required: true },
          durationSeconds: { type: 'integer', required: true }, style: { type: 'string', required: true },
          background: { type: 'string', required: true }, characters: { type: 'string', required: true },
          conflict: { type: 'string', required: true }, outline: { type: 'string', required: true },
          storyPositioning: { type: 'string', required: true }, logline: { type: 'string', required: true },
          synopsis: { type: 'string', required: true },
          characterBios: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
            name: { type: 'string', required: true }, background: { type: 'string', required: true },
            motivation: { type: 'string', required: true }, arc: { type: 'string', required: true }, relationships: { type: 'string', required: true },
          } } },
          episodeOutlines: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
            number: { type: 'integer', required: true }, title: { type: 'string', required: true }, summary: { type: 'string', required: true },
            conflict: { type: 'string', required: true }, turningPoint: { type: 'string', required: true }, ending: { type: 'string', required: true },
            durationSeconds: { type: 'integer', required: true },
          } } },
          constraints: { type: 'array', items: { type: 'string' }, required: true },
          assumptions: { type: 'array', items: { type: 'string' }, required: true },
        } },
      },
      output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute: async (args, exec) => {
        exec.signal.throwIfAborted()
        if (!exec.agent) throw new Error('Open a Studio project first')
        const brief = directionSchema.required({ storyPositioning: true, logline: true, synopsis: true,
          characterBios: true, episodeOutlines: true }).parse(args.brief)
        const count = this.read(exec.agent.session.id)?.preferences?.episodes
        if (!brief.characterBios.length || !brief.episodeOutlines.length
          || (count !== null && count !== undefined && brief.episodeOutlines.length !== count)
          || brief.episodeOutlines.some((episode, index) => episode.number !== index + 1)) {
          throw new RemoteError('short-drama/invalid-input', 'Save character biographies and one sequential outline for each selected episode.', {})
        }
        return this.save(exec.agent.session.id, args.expectedRevision, brief)
      }, presentCall: () => ({ card: 'generic', title: 'Save story direction', kind: 'edit' }),
    }), admission), 'Studio creative direction tool')
  }
  private owner(): void {
    if (principalOf(this.ctx.invocation) !== undefined) throw new RemoteError('short-drama/owner-required', 'Studio belongs to the Host owner.', {})
  }
  /** Read the direction and review state of a Studio conversation.
   * @param sessionId - Bound project conversation.
   * @returns Current brief, derived stage and exact review candidates, or null outside Studio.
   */
  @Remote
  read(sessionId: SessionId): DirectorView | null {
    this.owner()
    const project = this.projects.projectForSession(sessionId)
    if (!project) return null
    const direction = this.directions.get(project.id) ?? { revision: 0, confirmedRevision: null, versions: [] }
    const brief = direction.versions.at(-1)?.brief ?? null
    const production = this.production.read(project.id)
    const progress = directorProgress(project, production, brief !== null, direction.confirmedRevision === direction.revision,
      direction.versions.at(-1)?.scriptIdAtSave)
    const targets = progress.stage === 'assets' ? production.assets.filter(item => item.kind !== 'voice' && !item.adoptedMediaId)
      : production.shots.filter(item => !item.adoptedVideoId)
    const candidates = progress.action !== 'adopt-media' ? [] : targets.map((target) => {
      const job = production.jobs.filter(item => item.targetId === target.id && item.targetVersion === target.version && item.state === 'ready'
        && item.kind === (progress.stage === 'assets' ? 'image' : 'video')).at(-1)
      const media = job?.outputs.find(item => item.kind === (progress.stage === 'assets' ? 'image' : 'video'))
      return { name: 'name' in target ? target.name : target.title, jobId: job?.id ?? null, media: media ?? null }
    })
    return { projectId: project.id, title: project.title, revision: direction.revision,
      confirmed: direction.confirmedRevision === direction.revision, brief, progress, candidates,
      preferences: readCreationPreferences(this.projects.readStudio(project.id)),
      assets: progress.stage === 'assets' ? production.assets.map(({ name, kind, prompt }) => ({ name, kind, prompt })) : [],
      issues: progress.action === 'repair' ? production.creative?.diagnoses.filter(item => item.scriptId === project.adoptedScriptId)
        .at(-1)?.issues.filter(item => item.severity === 'blocking').map(({ problem, suggestion }) => ({ problem, suggestion })) ?? [] : [],
      script: progress.action === 'adopt-script' ? project.scripts.at(-1) ?? null : null,
      serviceIssue: production.jobs.at(-1)?.state === 'failed'
        && ['workflow-unavailable', 'http-401', 'http-403', 'http-404'].includes(production.jobs.at(-1)?.reason ?? ''),
      token: `${direction.revision}:${project.revision}:${production.revision}:${progress.stage}:${progress.action}` }
  }
  /** Save a new creative direction revision for the bound project.
   * @param sessionId - Bound conversation.
   * @param expectedRevision - Latest direction revision.
   * @param brief - Complete creative brief.
   * @returns Saved direction revision with prior versions retained.
   */
  async save(sessionId: SessionId, expectedRevision: number, brief: CreativeDirection): Promise<{ revision: number }> {
    this.owner()
    const view = this.read(sessionId)
    if (!view) throw new Error('Open a Studio project first')
    return this.serial(view.projectId, async () => {
      const current = this.directions.get(view.projectId) ?? { revision: 0, confirmedRevision: null, versions: [] }
      if (current.revision !== expectedRevision) throw new RemoteError('short-drama/revision-conflict', 'Creative direction revision conflict: call short_drama_read_direction and use directionRevision, not the script or production revision.', {})
      const revision = current.revision + 1
      await this.directions.put(view.projectId, { revision, confirmedRevision: null,
        versions: [...current.versions, { revision, brief, createdAt: Date.now(),
          scriptIdAtSave: this.projects.read(view.projectId).scripts.at(-1)?.id ?? null }] })
      return { revision }
    })
  }
  /** Confirm the exact project revisions currently shown for review.
   * @param sessionId - Project conversation.
   * @param token - Exact visible project revisions and handoff.
   * @returns Refreshed stage after review; execution remains an ordinary conversation submission.
   */
  @Remote
  async confirm(sessionId: SessionId, token: string): Promise<DirectorView | null> {
    this.owner()
    const before = this.read(sessionId)
    if (!before) throw new Error('Open a Studio project first')
    return this.serial(before.projectId, async () => {
      const current = this.read(sessionId)
      if (!current || current.token !== token) {
        throw new RemoteError('short-drama/revision-conflict', 'The project changed. Review the refreshed results first.', {})
      }
      switch (current.progress.action) {
        case 'confirm-direction': {
          const direction = this.directions.get(current.projectId)
          if (!direction) throw new Error('The creative brief is missing')
          await this.directions.put(current.projectId, { ...direction, confirmedRevision: direction.revision })
          break
        }
        case 'adopt-script': {
          const project = this.projects.read(current.projectId)
          if (!current.script) throw new Error('The script candidate is missing')
          await this.projects.adoptScript(project.id, project.revision, current.script.id)
          break
        }
        case 'adopt-media':
          for (const candidate of current.candidates) {
            if (!candidate.jobId || !candidate.media) throw new Error('The review candidate is missing')
            await this.production.adoptMedia(current.projectId, this.production.read(current.projectId).revision,
              productionIds.job.parse(candidate.jobId), productionIds.media.parse(candidate.media.id))
          }
          break
        default: throw new Error('This project stage has no pending review')
      }
      return this.read(sessionId)
    })
  }
  private async serial<T>(id: DramaProjectId, write: () => Promise<T>): Promise<T> {
    const previous = this.writes.get(id)
    const pending = previous ? previous.then(write, write) : write()
    this.writes.set(id, pending)
    try { return await pending } finally { if (this.writes.get(id) === pending) this.writes.delete(id) }
  }
}
