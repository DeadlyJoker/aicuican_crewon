/** Bundled MIT persona metadata and integrity-checked, on-demand instructions. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import type { ExpertCatalogEntry, ExpertCategory, ExpertDraft } from './expert-types.ts'

const manifestSchema = z.object({
  repository: z.url(), revision: z.string().regex(/^[a-f0-9]{40}$/u),
  categories: z.array(z.object({ id: z.string(), name: z.string(), nameEn: z.string() })),
  entries: z.array(z.object({
    slug: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/u), name: z.string(), nameEn: z.string(),
    description: z.string(), descriptionEn: z.string(), category: z.string(),
    tags: z.array(z.string()), examples: z.array(z.string()), promptLength: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  })),
})
const manifest = manifestSchema.parse(JSON.parse(readFileSync(new URL('../assets/experts/catalogue.json', import.meta.url), 'utf8')))
const bySlug = new Map(manifest.entries.map(entry => [entry.slug, entry]))

/** Read lightweight bundled metadata without reading instructions or registering presets.
 * @returns Categories and entries with stable, source-qualified keys.
 */
export function builtinCatalogue(): { categories: ExpertCategory[]; entries: ExpertCatalogEntry[] } {
  return {
    categories: manifest.categories.map(category => ({ ...category })),
    entries: manifest.entries.map(entry => ({
      key: `builtin:${entry.slug}`, name: entry.name, description: entry.description, category: entry.category,
      tags: [...entry.tags], examples: [...entry.examples], builtinSlug: entry.slug,
    })),
  }
}

/** Read one pinned persona, preserving the full body and recording its source revision.
 * @param slug - Exact category and filename identifier from the catalogue.
 * @param basePreset - Native capabilities chosen by the Host configuration.
 * @param maxPromptLength - Configured limit. Over-limit instructions are rejected intact.
 * @returns An editable expert draft without creating a preset or database row.
 */
export function readBuiltinExpert(slug: string, basePreset: string, maxPromptLength: number): ExpertDraft {
  const entry = bySlug.get(slug)
  if (!entry) throw new Error('This bundled expert no longer exists. Refresh the expert catalogue.')
  const text = readFileSync(new URL(`../assets/experts/zh/${slug}.md`, import.meta.url), 'utf8')
  if (createHash('sha256').update(text).digest('hex') !== entry.sha256) {
    throw new Error(`Bundled expert instructions failed integrity validation: ${slug}. Reinstall the team plugin.`)
  }
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/u)
  if (!match?.[1]) throw new Error(`Bundled expert instructions are incomplete: ${slug}.`)
  const prompt = match[1].trim()
  if (prompt.length > maxPromptLength) {
    throw new Error(`This expert requires ${prompt.length} prompt characters. Increase the expert prompt limit from ${maxPromptLength} before activating it.`)
  }
  return {
    name: entry.name, description: entry.description, prompt, basePreset,
    category: entry.category, tags: [...entry.tags], examples: [...entry.examples],
    sourceSlug: slug, sourceRevision: manifest.revision,
  }
}
