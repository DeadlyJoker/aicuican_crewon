/** Expert-team definition tools and the bundled team-design skill. */
import type { Context } from '@deepseek-ai/cordis'
import { readFile } from 'node:fs/promises'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { z } from 'zod'
import Schema from '@deepseek-ai/schemastery'
import { TeamAuthoring } from './team-authoring.ts'
export { TeamAuthoring } from './team-authoring.ts'
import type { TeamMember } from './team-authoring-types.ts'
import { TeamExperts } from './expert-controller.ts'
import { TeamCatalogue } from './catalogue.ts'
export { TeamCatalogue } from './catalogue.ts'
import { TeamOfficeProjects } from './office-projects.ts'
import { TeamOffices } from './office-controller.ts'
import { TeamWorkflows } from './workflow-controller.ts'
export { TeamWorkflows } from './workflow-controller.ts'
import { name as teamNamespace } from '@nanmicoder/dsh-agent-teams'

const member = z.object({ name: z.string(), role: z.string().optional(), executionPrompt: z.string().optional() }).loose()
const settings = z.object({ maxMembers: z.number(), profiles: z.record(z.string(), z.object({
  description: z.string().optional(), members: z.array(member),
}).loose()) })

/** Deployment limits for reusable expert definitions. */
export interface Config {
  /** Maximum number of characters stored in one expert's full instructions. */
  expertPromptMaxLength: number
  /** Native preset used when a bundled expert is first activated. */
  expertBuiltinBasePreset: string
}
export const Config = Schema.object({
  expertPromptMaxLength: Schema.natural().min(1).default(32768),
  expertBuiltinBasePreset: Schema.string().min(1).default('standard'),
})

/** Host capabilities required for authoring and persisting team definitions. */
export const inject = ['tools', 'settings', 'skills', 'commands', 'profileContext', 'typert', 'sessions', 'sessionQuery', 'subagents']

/**
 * Register authoring tools over the same version-fenced settings used by the UI.
 * @param ctx - Host plugin context.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  new TeamCatalogue(ctx)
  await ctx.inject(['agentPresets'], async (scope) => {
    const experts = new TeamExperts(scope, {
      maxPromptLength: config.expertPromptMaxLength, builtinBasePreset: config.expertBuiltinBasePreset,
    })
    await experts.initialize()
    const authoring = new TeamAuthoring(scope, experts)
    registerAuthoringTools(scope, experts, authoring)
    scope.effect(() => scope.commands.register({
      name: 'create-expert-panel',
      description: 'Draft a reusable expert team for review.',
      input: { hint: '<team purpose>', attachments: true },
      handler: ({ agent, rawInput, attachments }) => {
        const purpose = rawInput.trim()
        agent.followup(createUserMessage({
          content: [{ type: 'text', text: /\p{Script=Han}/u.test(purpose)
            ? `创建可复用专家团：${purpose}` : `Create a reusable expert team: ${purpose}` }, ...attachments],
          source: { kind: 'user' },
        }))
        return { kind: 'success', text: 'Expert-team draft requested.' }
      },
    }), 'expert-team creation command')
    const content = await readFile(new URL('../skills/create-expert-team/SKILL.md', import.meta.url), 'utf8')
    scope.effect(() => scope.skills.register({
      name: 'create-expert-team', description: 'Design and save a reusable specialist team from a user goal, with clear roles and deliverables.',
      source: 'bundled', content,
    }), 'expert-team authoring skill')
  })
  new TeamWorkflows(ctx)
  new TeamOffices(ctx)
  ctx.inject(['storageDomain', 'workspaceRegistry'], (scope) => { new TeamOfficeProjects(scope) })

}

/** Register authoring after the native preset registry and expert revisions are ready. */
function registerAuthoringTools(ctx: Context, experts: TeamExperts, authoring: TeamAuthoring): void {
  const read = () => {
    const descriptor = ctx.settings.describe().find(item => item.ns === teamNamespace)
    if (!descriptor) throw new Error('Enable the agent-teams plugin before editing expert teams.')
    return { descriptor, value: settings.parse(descriptor.value) }
  }
  const listArgs = z.strictObject({ query: z.string().optional() })
  const savedMember = z.strictObject({ name: z.string(), role: z.string().optional(),
    responsibilities: z.string().optional(), executionPrompt: z.string().optional(),
    expertKey: z.string().optional(), expertId: z.string().optional(), agentPreset: z.string().optional() })
  const saveArgs = z.strictObject({
    name: z.string(), description: z.string(), protocol: z.string().optional(), replace: z.boolean().optional(),
    goal: z.string().optional(), constraints: z.string().optional(), deliverables: z.string().optional(),
    examples: z.array(z.string()).optional(), members: z.array(savedMember),
  })
  ctx.effect(() => ctx.tools.register({
    name: 'expert_team_list',
    description: 'List reusable expert teams and saved experts. Supply query to search bundled experts by role or skill and obtain real catalogue keys. Never invent an expert key or Agent preset.',
    parameters: z.toJSONSchema(listArgs),
    output: {
      schema: { type: 'object', properties: { teams: { type: 'array', items: { type: 'object' } },
        experts: { type: 'array', items: { type: 'object' } } }, required: ['teams', 'experts'] },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: (args, exec) => {
      const { query } = listArgs.parse(args)
      exec.signal.throwIfAborted()
      const { value } = read()
      const text = query?.trim().toLocaleLowerCase()
      const entries = experts.catalogue().entries.filter(item => text
        ? [item.name, item.description, ...item.tags].some(value => value.toLocaleLowerCase().includes(text))
        : item.expert !== undefined)
      return Promise.resolve({ teams: Object.entries(value.profiles).map(([name, profile]) => ({ name, ...profile })),
        experts: entries.map(item => ({ key: item.key, name: item.name, description: item.description, category: item.category,
          ...(item.expert ? { expertId: item.expert.id, agentPreset: item.expert.preset } : {}) })) })
    },
    presentCall: () => ({ card: 'generic', title: 'List expert teams', kind: 'read' }),
  }), 'expert-team list tool')
  ctx.effect(() => ctx.tools.register({
    name: 'expert_team_save',
    description: 'Stage a reusable expert team for a persistent confirmation card. The user reviews and confirms the card before saving. This tool does not save or start agents. Repeated proposals update the same pending card. Select real expertKey values from expert_team_list, or retain a registered agentPreset. Set replace only for an explicitly requested update.',
    parameters: z.toJSONSchema(saveArgs),
    output: {
      schema: { type: 'object', properties: { id: { type: 'string' }, revision: { type: 'integer' },
        status: { type: 'string' }, name: { type: 'string' }, profile: { type: 'object' } },
      required: ['id', 'revision', 'status', 'name', 'profile'] },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: async (input, exec) => {
      const args = saveArgs.parse(input)
      exec.signal.throwIfAborted()
      if (!exec.agent) throw new Error('Create expert teams from a conversation.')
      const members: TeamMember[] = []
      for (const item of args.members) {
        const { expertKey, responsibilities, executionPrompt, expertId, agentPreset, ...fields } = item
        const entry = expertKey ? experts.catalogue().entries.find(value => value.key === expertKey) : undefined
        if (expertKey && !entry) throw new Error(`Unknown expert key: ${expertKey}. Search expert_team_list first.`)
        const expert = entry?.expert ?? (entry?.builtinSlug ? await experts.activate(entry.builtinSlug) : undefined)
        const selectedId = expert?.id ?? expertId
        const selectedPreset = expert?.preset ?? agentPreset
        members.push({ ...fields,
          ...(selectedId ? { expertId: selectedId } : {}),
          ...(selectedPreset ? { agentPreset: selectedPreset } : {}),
          role: fields.role || expert?.description || expert?.name || '',
          executionPrompt: executionPrompt || responsibilities || expert?.prompt || '',
        })
      }
      exec.signal.throwIfAborted()
      const { name, replace } = args
      return authoring.stage(exec.agent.session.id, exec.callId, {
        name, ...(replace !== undefined ? { replace } : {}), profile: {
          description: args.description, taskPlanning: 'captain', members,
          ...(args.protocol !== undefined ? { protocol: args.protocol } : {}),
          ...(args.goal !== undefined ? { goal: args.goal } : {}),
          ...(args.constraints !== undefined ? { constraints: args.constraints } : {}),
          ...(args.deliverables !== undefined ? { deliverables: args.deliverables } : {}),
          ...(args.examples !== undefined ? { examples: args.examples } : {}),
        },
      })
    },
    presentCall: (input) => {
      const parsed = saveArgs.safeParse(input)
      return parsed.success ? { card: 'generic', title: 'Review expert team', kind: 'edit', rawInput: parsed.data.name } : undefined
    },
  }), 'expert-team save tool')
}
