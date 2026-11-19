import { analysisPolicy, mediaAnalysisDomain, StudioMediaAnalysis, type AnalysisPolicy } from './media-analysis-service.ts'
/** Mount the short-drama workbench's Host service and project-scoped tools. */
import { directorDomain, StudioDirector } from './director.ts'
import { registerCreativeSkills } from './creative-skills.ts'
import Schema from '@deepseek-ai/schemastery'
import { isAbsolute } from 'node:path'
import { registerEntrySources } from './entry-source.ts'
import { studioDomain } from './studio-domain.ts'
import { registerStudioUploads } from './studio-uploads.ts'
import { registerStudioAssets } from './studio-assets.ts'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { canvasDomain } from './canvas.ts'
import { projectDomain, ShortDramaProjects } from './projects.ts'
import { ShortDramaProduction, productionConfig, type ProductionConfig } from './production.ts'
import { productionDomain } from './production-schema.ts'
import { registerProductionTools } from './production-tools.ts'

export type { StudioDirector } from './director.ts'
export type { ShortDramaProjects } from './projects.ts'
export type { ShortDramaProduction } from './production.ts'

/** Validated deployment settings for execution APIs and local export. */
export const Config: Schema<Config> = Schema.intersect([productionConfig, analysisPolicy, Schema.object({ projectDirectory: Schema.string().required(), directorPreset: Schema.string().default('studio-director') })])
/** Short-drama execution and media storage configuration. */
export interface Config extends ProductionConfig, AnalysisPolicy {
  /** Absolute root for independent Studio project workspaces. */
  projectDirectory: string
  /** Native preset for newly created Studio conversations; existing Sessions keep their selection. */
  directorPreset: string
}

/** Cordis name of the short-drama project plugin. */
export const name = 'short-drama'

/** Host services required before the workbench opens. */
export const inject = ['systemPrompt', 'skills', 'storageDomain', 'typert', 'sessionController', 'sessions', 'sessionPersistence', 'workspaceRegistry', 'tools', 'credentials', 'subprocess', 'connection']

/**
 * Open durable project storage and admit the writing tools in associated Sessions.
 * @param ctx - Active DSH Host profile.
 * @param config - Profile-owned API budgets, media location and encoder configuration.
 * @returns Completion after the project service is mounted.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  if (!isAbsolute(config.projectDirectory)) throw new Error('Studio projectDirectory must be absolute.')
  const studio = await ctx.storageDomain.open(studioDomain)
  const projects = new ShortDramaProjects(ctx, await ctx.storageDomain.open(projectDomain), await ctx.storageDomain.open(canvasDomain),
    studio, config.projectDirectory, config.resultMaxBytes, config.directorPreset)
  await projects.initializeStudioWorkspaces()
  registerEntrySources(ctx, studio, config.projectDirectory, config)
  await registerStudioAssets(ctx)
  registerStudioUploads(ctx, studio, config.projectDirectory, config.resultMaxBytes, (id) => { projects.read(id) })
  const production = new ShortDramaProduction(ctx, await ctx.storageDomain.open(productionDomain), config)
  const mediaAnalysis = new StudioMediaAnalysis(ctx, await ctx.storageDomain.open(mediaAnalysisDomain), config, production)
  const director = new StudioDirector(ctx, await ctx.storageDomain.open(directorDomain), projects, production)
  registerProductionTools(ctx, projects, production, mediaAnalysis)
  registerCreativeSkills(ctx, projects, config.projectDirectory)
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'short_drama_read_script',
    description: 'Read this project’s synopsis and adopted script. Set latestDraft to read the latest candidate instead. Use the returned revision when saving a candidate.',
    parameters: { latestDraft: { type: 'boolean' } },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          title: { type: 'string', required: true }, synopsis: { type: 'string', required: true },
          scriptId: { type: 'string', required: true }, revision: { type: 'integer', required: true }, script: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: (args, exec) => {
      exec.signal.throwIfAborted()
      const project = exec.agent && projects.projectForSession(exec.agent.session.id)
      if (!project) throw new Error('Open a short drama project conversation first.')
      const script = args.latestDraft ? project.scripts.at(-1) : project.scripts.find(item => item.id === project.adoptedScriptId)
      const { title, synopsis, revision } = project
      return Promise.resolve({ title, synopsis, revision, scriptId: script?.id ?? '', script: script?.body ?? '' })
    },
    presentCall: () => ({ card: 'generic', title: 'Read project script', kind: 'read' }),
  }), { when: ({ agent }) => projects.projectForSession(agent.session.id) !== undefined }), 'short drama script read')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'short_drama_save_script',
    description: 'Save a new script candidate for this project. Use the revision returned by short_drama_read_script. The human can review and adopt the draft in the workbench.',
    parameters: {
      expectedRevision: { type: 'integer', required: true },
      script: { type: 'string', required: true, description: 'Complete candidate script to save.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: { revision: { type: 'integer', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted()
      if (!exec.agent) throw new Error('Open a short drama project conversation first.')
      const direction = director.read(exec.agent.session.id)
      if (direction?.brief && !direction.confirmed) throw new Error('Confirm the creative direction in the review card before writing the script.')
      const { revision } = await projects.saveFromSession(exec.agent.session.id, args.expectedRevision, args.script)
      return { revision }
    },
    presentCall: () => ({ card: 'generic', title: 'Save script candidate', kind: 'edit' }),
  }), { when: ({ agent }) => projects.projectForSession(agent.session.id) !== undefined }), 'short drama script candidate')
}
