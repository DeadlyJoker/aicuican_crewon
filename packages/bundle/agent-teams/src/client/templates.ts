/** Editable profile fields; additional upstream fields survive a save. */
import type { TeamProfile } from '../team-authoring-types.ts'
export type { TeamMember as Member, TeamProfile } from '../team-authoring-types.ts'

/** Host settings exposed by the upstream profile entry. */
export interface TeamSettings {
  maxMembers: number
  profiles: Record<string, TeamProfile>
}

/**
 * Build a deterministic invocation with a quoted profile name.
 * @param name - Saved profile name.
 * @param goal - User's concrete problem.
 * @returns A command ready for the conversation composer.
 */
export function teamCommand(name: string, goal: string): string {
  return `/agent-teams --profile "${name}" ${goal.trim()}`
}
