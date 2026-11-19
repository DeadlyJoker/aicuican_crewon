/** Reusable team definitions and the durable review draft shared by Host and Client. */
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** A team member retains the exact expert revision selected when it was saved. */
export interface TeamMember {
  [key: string]: JsonValue
  name: string
  role?: string
  executionPrompt?: string
  agentPreset?: string
  expertId?: string
}

/** Optional guidance extends earlier profiles without changing their execution fields. */
export interface TeamProfile {
  [key: string]: JsonValue
  description?: string
  goal?: string
  constraints?: string
  deliverables?: string
  examples?: string[]
  protocol?: string
  executionPrompt?: string
  taskPlanning?: string
  members: TeamMember[]
}

/** Canonical authoring fields accepted by both the manual editor and model tools. */
export interface TeamAuthoringInput {
  name: string
  profile: TeamProfile
  replace?: boolean
}

/** One conversation's persisted review state. Confirmation never starts team members. */
export interface TeamAuthoringDraft extends TeamAuthoringInput {
  id: string
  revision: number
  status: 'pending' | 'saving' | 'saved' | 'discarded'
}

/**
 * Validate user-facing team fields while retaining earlier provider-specific options.
 * @param input - Editable team definition.
 * @param maxMembers - Configured maximum roster size.
 * @returns A trimmed definition, with cleared optional guidance omitted from runtime profiles.
 */
export function normalizeTeamDefinition(input: TeamAuthoringInput, maxMembers: number): TeamAuthoringInput {
  const name = input.name.trim()
  const members = input.profile.members.map(member => ({ ...member, name: member.name.trim(),
    role: member.role?.trim() ?? '', executionPrompt: member.executionPrompt?.trim() ?? '' }))
  const names = members.map(member => member.name.normalize('NFC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, ''))
  if (!name || /["\r\n]/u.test(name) || !input.profile.description?.trim()
    || !members.length || members.length > maxMembers || names.includes('captain')
    || new Set(names).size !== names.length || members.some(member => !member.name
      || /["\r\n]/u.test(member.name) || !member.role || !member.executionPrompt)) {
    throw new Error('Provide a team name, scope and distinct members with complete responsibilities.')
  }
  const { goal, constraints, deliverables, protocol, executionPrompt, ...retained } = input.profile
  const guidance = Object.fromEntries(Object.entries({ goal, constraints, deliverables, protocol, executionPrompt })
    .flatMap(([key, value]) => value?.trim() ? [[key, value.trim()]] : []))
  const profile: TeamProfile = { ...retained, ...guidance, description: input.profile.description.trim(), members }
  if (profile.examples !== undefined) profile.examples = profile.examples.map(value => value.trim()).filter(Boolean)
  return { name, profile, ...(input.replace !== undefined ? { replace: input.replace } : {}) }
}
