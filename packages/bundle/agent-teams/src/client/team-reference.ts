/** Expert-team mentions reuse the composer's reference menu and removable chips. */
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { UserTextRule } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TeamSettings } from './templates.ts'
import { teamCommand } from './templates.ts'

const PREFIX = '@team:'

/** Display existing-team invocations as the original mention while retaining their logged command. */
export const teamMentionDisplayRule: UserTextRule = {
  id: 'expert-team-mention',
  order: 5,
  match(text, from) {
    if (from === 0) {
      const invocation = /^\/agent-teams\s+--profile\s+"([^"\r\n]+)"(?=\s|$)/u.exec(text)
      if (invocation) return { id: 'text', start: 0, end: invocation[0].length,
        data: { text: invocation[0], display: `@${invocation[1]}` } }
    }
    const reference = /@team:([^\s]+)/gu
    reference.lastIndex = from
    const match = reference.exec(text)
    if (!match) return undefined
    try {
      return { id: 'text', start: match.index, end: match.index + match[0].length,
        data: { text: match[0], display: '@' + decodeURIComponent(match[0].slice(PREFIX.length)) } }
    } catch (_malformedReference) {
      return undefined
    }
  },
}

function teamName(reference: string, invalid: string): string {
  if (!reference.startsWith(PREFIX)) throw new Error(invalid)
  try {
    return decodeURIComponent(reference.slice(PREFIX.length))
  } catch (error) {
    throw new Error(invalid, { cause: error })
  }
}

/**
 * Registerable source for saved expert teams.
 * @param profiles - Read the current saved definitions.
 * @param label - Localized menu group title.
 * @param unavailable - Localized error for a removed definition.
 * @returns A source whose picks insert ordinary reference chips.
 */
export function createTeamReferenceSource(
  profiles: () => TeamSettings['profiles'], label: () => string, unavailable: () => string,
): InputTriggerSource {
  return {
    trigger: '@', name: 'expert-teams', order: -10,
    candidates: (_session, request) => {
      request.signal.throwIfAborted()
      const query = request.query.toLocaleLowerCase()
      return Promise.resolve(Object.entries(profiles())
        .filter(([name, profile]) => `${name} ${profile.description ?? ''}`.toLocaleLowerCase().includes(query))
        .map(([name, profile]) => ({ name, label: name, section: label(),
          ...profile.description === undefined ? {} : { description: profile.description },
          value: PREFIX + encodeURIComponent(name),
        })))
    },
    onPick: ({ candidate }) => candidate.value === undefined ? undefined : {
      insert: { source: 'expert-teams', ref: candidate.value, label: candidate.name, clipboardText: candidate.value },
    },
    codec: {
      clipboardText: ref => ref,
      serialize: (ref, signal) => {
        signal.throwIfAborted()
        const name = teamName(ref, unavailable())
        if (!Object.hasOwn(profiles(), name)) return Promise.reject(new Error(unavailable()))
        return Promise.resolve(ref)
      },
    },
  }
}

/**
 * Route a mentioned expert team through the existing logged activation path.
 * @param text - Serialized composer text, including reference chips.
 * @param profiles - Current saved team definitions.
 * @param invalid - Localized refusal for missing, ambiguous, or empty requests.
 * @returns The activation text, or unchanged text when no team was mentioned.
 */
export function routeTeamReference(text: string, profiles: TeamSettings['profiles'], invalid: string): string {
  const mentions = [...text.matchAll(/@team:([^\s]+)/gu)]
  if (mentions.length === 0) return text
  const names = new Set(mentions.map(match => teamName(match[0], invalid)))
  const name = names.values().next().value
  const goal = text.replace(/@team:[^\s]+/gu, '').trim()
  if (names.size !== 1 || !name || !Object.hasOwn(profiles, name) || !goal) throw new Error(invalid)
  return teamCommand(name, goal)
}
