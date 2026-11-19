/**
 * Frontmatter helpers adapted from dsh-skill-explorer 0.4.15 (BSD-3-Clause).
 * Modified for CrewON to use the native YAML parser and preserve unknown fields.
 */
import { parseDocument } from 'yaml'

/** Parsed frontmatter fields consumed by the skill centre. */
export interface Frontmatter {
  name?: string | undefined
  description?: string | undefined
  whenToUse?: string | undefined
  hint?: string | undefined
  recordInput?: boolean | undefined
  disableModelInvocation?: boolean | undefined
  userInvocable?: boolean | undefined
}

/** Resolve the same boolean spellings accepted by the native skill provider.
 * @param value - Parsed YAML scalar.
 * @returns The resolved boolean, or undefined when omitted.
 */
export function parseYamlBool(value: unknown): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  if (typeof value === 'string') {
    const text = value.toLowerCase()
    if (['true', 'yes', 'on'].includes(text)) return true
    if (['false', 'no', 'off'].includes(text)) return false
  }
  throw new TypeError('Skill invocation metadata must be boolean.')
}

function parts(content: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(content)
  if (!match || match[1] === undefined) throw new Error('The skill has no YAML frontmatter.')
  const document = parseDocument(match[1])
  if (document.errors.length) throw new Error('The skill contains invalid YAML frontmatter.')
  const data: unknown = document.toJS()
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('Skill frontmatter must be a mapping.')
  return { document, data: data as Record<string, unknown>, body: content.slice(match[0].length) }
}

/** Read metadata using YAML semantics; malformed files remain absent from discovery.
 * @param content - Complete instruction file text.
 * @returns Recognized metadata, or an empty object for malformed files.
 */
export function parseFrontmatter(content: string): Frontmatter {
  try {
    const { data } = parts(content)
    const input = typeof data.input === 'object' && data.input !== null && !Array.isArray(data.input)
      ? data.input as Record<string, unknown> : undefined
    return {
      name: typeof data.name === 'string' ? data.name : undefined,
      description: typeof data.description === 'string' ? data.description : undefined,
      whenToUse: typeof data.whenToUse === 'string' ? data.whenToUse : undefined,
      hint: typeof input?.hint === 'string' ? input.hint : undefined,
      recordInput: parseYamlBool(input?.recordInput ?? data.recordInput),
      disableModelInvocation: parseYamlBool(data['disable-model-invocation']),
      userInvocable: parseYamlBool(data['user-invocable']),
    }
  } catch (_error) {
    // Discovery excludes malformed metadata without suppressing other files.
    return {}
  }
}

/** Return the original body without changing its whitespace.
 * @param content - Complete instruction file text.
 * @returns Text following its YAML frontmatter.
 */
export function stripFrontmatter(content: string): string {
  return parts(content).body
}

/** Editable fields whose updates preserve all unrelated YAML metadata. */
export interface FrontmatterUpdate {
  name: string
  description: string
  whenToUse?: string | undefined
  content: string
}

/** Update requested fields and preserve unedited metadata, comments, and invocation policy.
 * @param content - Current complete instruction file text.
 * @param update - Editable field values and replacement body.
 * @returns Complete updated file text.
 */
export function updateSkillContent(content: string, update: FrontmatterUpdate): string {
  const { document } = parts(content)
  document.set('name', update.name)
  document.set('description', update.description)
  if (update.whenToUse?.trim()) document.set('whenToUse', update.whenToUse.trim())
  else document.delete('whenToUse')
  return `---\n${document.toString()}---\n${update.content}`
}

/** Update invocation policy while retaining the original body and other fields.
 * @param content - Current complete instruction file text.
 * @param enabled - Whether models may invoke the skill.
 * @returns Complete updated file text.
 */
export function setInvocationContent(content: string, enabled: boolean): string {
  const { document, body } = parts(content)
  document.set('disable-model-invocation', !enabled)
  return `---\n${document.toString()}---\n${body}`
}
