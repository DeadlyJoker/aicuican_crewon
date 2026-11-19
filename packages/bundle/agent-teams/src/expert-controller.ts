/** Expert catalogue backed by native, immutable Agent presets. */
import type { Context } from '@deepseek-ai/cordis'
import { principalOf, Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import { entryListProblem } from '@deepseek-ai/dsh-agent-preset-registry'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { load, dump } from 'js-yaml'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { ExpertCatalogEntry, ExpertCategory, ExpertConfiguration, ExpertDefinition, ExpertDraft, ExpertExecution } from './expert-types.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { notifyTeamCatalogue } from './catalogue.ts'
import { builtinCatalogue, readBuiltinExpert } from './expert-catalogue.ts'

const modelSelection = z.object({ provider: z.string().min(1), model: z.string().min(1) })
const draft = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400),
  prompt: z.string().trim().min(1),
  basePreset: z.string().trim().min(1),
  provider: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  tags: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
  examples: z.array(z.string().trim().min(1).max(1000)).max(10).optional(),
  sourceSlug: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/u).optional(),
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u).optional(),
})

const storedExpert = draft.extend({ id: z.uuid(), revision: z.number().int().positive(), preset: z.string().min(1) })

function expertFields(input: z.infer<typeof draft>): ExpertDraft {
  const { provider, model, category, tags, examples, sourceSlug, sourceRevision, ...fields } = input
  return {
    ...fields,
    ...(provider ? { provider } : {}), ...(model ? { model } : {}),
    ...(category ? { category } : {}), ...(tags ? { tags } : {}), ...(examples ? { examples } : {}),
    ...(sourceSlug ? { sourceSlug } : {}), ...(sourceRevision ? { sourceRevision } : {}),
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context { teamExperts: TeamExperts }
}

/** Retains every revision so historical child sessions can recover their original composition. */
export class TeamExperts extends TypertRemoteService {
  private readonly db: DatabaseSync
  private readonly registrations: Array<() => Promise<void>> = []
  private pending: Promise<unknown> = Promise.resolve()
  private readonly configuration: ExpertConfiguration

  /** @param ctx - Host scope owning expert storage and native preset registration.
   * @param configuration - Prompt limit and native preset for newly activated bundled experts.
   */
  constructor(ctx: Context, configuration: ExpertConfiguration) {
    super(ctx, 'teamExperts')
    this.configuration = z.object({
      maxPromptLength: z.number().int().positive(), builtinBasePreset: z.string().trim().min(1),
    }).parse(configuration)
    this.db = new DatabaseSync(join(ctx.profileContext.dir, 'team-experts.sqlite'))
    ctx.on('agent/created', ({ agent }) => {
      const preset = ctx.agentPresets.presetForSession(agent.session)
      if (!preset?.startsWith('expert-')) return
      const row = this.db.prepare('SELECT model FROM revisions WHERE preset = ?').get(preset)
      if (row?.model) agent.model.select(modelSelection.parse(JSON.parse(String(row.model))))
    })
    const version = this.db.prepare('PRAGMA user_version').get()?.user_version
    if (version !== 0 && version !== 1) throw new Error(`Unsupported expert storage version: ${String(version)}`)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS experts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revisions (preset TEXT PRIMARY KEY, name TEXT NOT NULL, composition TEXT NOT NULL, model TEXT);
      PRAGMA user_version = 1;
    `)
    ctx.effect(() => async () => {
      await this.pending
      for (const dispose of this.registrations.reverse()) await dispose()
      this.db.close()
    }, 'expert revisions')
  }

  /** Load immutable revisions before accepting expert catalogue operations. */
  async initialize(): Promise<void> {
    for (const row of this.db.prepare('SELECT * FROM revisions').all()) {
      this.registrations.push(await this.register(String(row.preset), String(row.name), String(row.composition)))
    }
  }

  private async register(id: string, name: string, composition: string): Promise<() => Promise<void>> {
    const plugins = load(composition, { schema: entryListSchema })
    const problem = entryListProblem(plugins)
    if (problem) throw new Error(problem)
    return this.ctx.agentPresets.register({ id, name, plugins: plugins as PresetDefinition['plugins'] })
  }

  /**
   * Read the active expert revisions.
   * @returns The saved experts and their current immutable revisions.
   */
  @Remote('list')
  list(): { experts: ExpertDefinition[] } {
    return { experts: this.db.prepare('SELECT data FROM experts ORDER BY rowid').all()
      .map((row) => {
        const { id, revision, preset, ...value } = storedExpert.parse(JSON.parse(String(row.data)))
        return { ...expertFields(value), id, revision, preset }
      }) }
  }

  /** Read expert identities from native child Session compositions, including earlier revisions.
   * @param sessionId - Owning conversation whose direct child catalog is inspected.
   * @returns Immutable expert names and presets recorded by the actual child Sessions.
   */
  @Remote('executions')
  async executions(sessionId: SessionId): Promise<ExpertExecution[]> {
    if (principalOf(this.ctx.invocation) !== undefined) throw new Error('Expert history requires the Host owner.')
    using parent = await this.ctx.sessionQuery.observeSession(sessionId)
    const executions: ExpertExecution[] = []
    for (const entry of parent.projections?.values.subagentCatalog ?? []) {
      if (entry.mode === 'external' || entry.mode === 'unknown') continue
      using child = await this.ctx.sessionQuery.observeSession(entry.id)
      const preset = child.projections?.values.agentPreset ?? child.header.agentPreset
      if (!preset?.startsWith('expert-')) continue
      const row = this.db.prepare('SELECT name FROM revisions WHERE preset=?').get(preset)
      const name = row ? String(row.name) : preset
      const version = /-v([1-9]\d*)$/u.exec(preset)?.[1]
      const expertName = row && version && !name.endsWith(` · v${version}`) ? `${name} · v${version}` : name
      executions.push({ sessionId: entry.id, memberName: entry.label ?? entry.id,
        preset, expertName })
    }
    return executions
  }

  /** Read searchable bundled metadata together with saved expert revisions.
   * @returns One entry per bundled persona or independent saved expert, and its categories.
   */
  @Remote('catalogue')
  catalogue(): { entries: ExpertCatalogEntry[]; categories: ExpertCategory[] } {
    const catalogue = builtinCatalogue()
    const saved = this.list().experts
    const bySource = new Map(saved.filter(expert => expert.sourceSlug).map(expert => [expert.sourceSlug, expert]))
    const entries: ExpertCatalogEntry[] = catalogue.entries.map((entry) => {
      const expert = entry.builtinSlug ? bySource.get(entry.builtinSlug) : undefined
      return expert ? { ...entry, ...this.catalogueFields(expert), expert } : entry
    })
    const bundledSlugs = new Set(catalogue.entries.map(entry => entry.builtinSlug))
    for (const expert of saved) {
      if (expert.sourceSlug && bundledSlugs.has(expert.sourceSlug)) continue
      entries.push({ key: `expert:${expert.id}`, ...this.catalogueFields(expert), expert })
    }
    const categories = [...catalogue.categories]
    for (const entry of entries) {
      if (!categories.some(category => category.id === entry.category)) {
        categories.push(entry.category === 'custom'
          ? { id: 'custom', name: '我的专家', nameEn: 'My experts' }
          : { id: entry.category, name: entry.category, nameEn: entry.category })
      }
    }
    return { entries, categories }
  }

  private catalogueFields(expert: ExpertDefinition): Pick<ExpertCatalogEntry, 'name' | 'description' | 'category' | 'tags' | 'examples'> {
    return { name: expert.name, description: expert.description, category: expert.category ?? 'custom', tags: expert.tags ?? [], examples: expert.examples ?? [] }
  }

  /** Read full bundled instructions without activating or saving an expert.
   * @param slug - Exact bundled identifier returned by catalogue().
   * @returns An editable draft retaining its pinned source metadata.
   */
  @Remote('readBuiltin')
  readBuiltin(slug: string): ExpertDraft {
    return readBuiltinExpert(slug, this.configuration.builtinBasePreset, this.configuration.maxPromptLength)
  }

  /** Activate a bundled expert once, reusing its saved revision on repeated requests.
   * @param slug - Exact bundled identifier returned by catalogue().
   * @returns The existing or newly saved immutable expert revision.
   */
  @Remote('activate')
  async activate(slug: string): Promise<ExpertDefinition> {
    if (principalOf(this.ctx.invocation) !== undefined) throw new Error('Expert settings require the Host owner.')
    const task = this.pending.then(async () => {
      const existing = this.list().experts.find(expert => expert.sourceSlug === slug)
      return existing ?? this.saveRevision(this.readBuiltin(slug))
    })
    this.pending = task.catch(() => undefined)
    return task
  }

  /** Save a new immutable revision, rejecting stale edits.
   * @param input - Expert instructions and native capabilities.
   * @param id - Existing expert identity when editing.
   * @param revision - Revision the caller edited.
   * @returns The saved expert and its immutable preset.
   */
  @Remote('save')
  async save(input: ExpertDraft, id?: string, revision?: number): Promise<ExpertDefinition> {
    if (principalOf(this.ctx.invocation) !== undefined) throw new Error('Expert settings require the Host owner.')
    const task = this.pending.then(() => this.saveRevision(input, id, revision))
    this.pending = task.catch(() => undefined)
    return task
  }

  private async saveRevision(input: ExpertDraft, id?: string, revision?: number): Promise<ExpertDefinition> {
    const value = expertFields(draft.parse(input))
    if (value.prompt.length > this.configuration.maxPromptLength) {
      throw new Error(`Expert instructions exceed the configured ${this.configuration.maxPromptLength} character limit.`)
    }
    if (Boolean(value.provider) !== Boolean(value.model)) throw new Error('Provide both provider and model.')
    const saved = this.list().experts
    const previous = id ? saved.find(item => item.id === id) : undefined
    if (id && (!previous || previous.revision !== revision)) throw new Error('The expert has changed. Reopen it before saving.')
    if (value.sourceSlug && saved.some(item => item.sourceSlug === value.sourceSlug && item.id !== id)) {
      throw new Error('This bundled expert is already activated. Edit its saved revision or clear the source metadata to save a copy.')
    }
    const document = await this.ctx.agentPresets.readDocument(value.basePreset)
    const parsed = load(document.content, { schema: entryListSchema })
    const problem = entryListProblem(parsed)
    if (problem) throw new Error(problem)
    const plugins = (parsed as PresetDefinition['plugins']).filter(row => row.name !== '@deepseek-ai/dsh-persona')
    const composition = dump([...plugins, { id: 'expert-persona', name: '@deepseek-ai/dsh-persona', config: { prefix: value.prompt } }],
      { schema: entryListSchema, noRefs: true, lineWidth: -1 })
    const expertId = previous?.id ?? randomUUID()
    const nextRevision = (previous?.revision ?? 0) + 1
    const preset = `expert-${expertId}-v${nextRevision}`
    const result: ExpertDefinition = { ...value, id: expertId, revision: nextRevision, preset }
    const displayName = `${value.name} · v${nextRevision}`
    const dispose = await this.register(preset, displayName, composition)
    try {
      const activated = (await this.ctx.agentPresets.list()).find(item => item.id === preset)
      if (!activated || activated.broken) throw new Error(activated?.broken ?? 'Expert preset did not activate.')
      this.db.exec('BEGIN IMMEDIATE')
      const selectedModel = value.provider ? JSON.stringify({ provider: value.provider, model: value.model }) : null
      this.db.prepare('INSERT INTO revisions VALUES (?, ?, ?, ?)').run(preset, displayName, composition, selectedModel)
      this.db.prepare('INSERT INTO experts VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
        .run(expertId, JSON.stringify(result))
      this.db.exec('COMMIT')
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK')
      await dispose()
      throw error
    }
    this.registrations.push(dispose)
    notifyTeamCatalogue(this.ctx)
    return result
  }
}
