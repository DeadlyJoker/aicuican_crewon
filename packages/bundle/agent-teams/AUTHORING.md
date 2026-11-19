# Expert-team authoring

The manual editor and the conversation review card share `TeamProfileFields` and `normalizeTeamDefinition`. A definition can include a recurring goal, constraints, deliverables and example questions. Older profiles keep their existing fields and member execution options. The patched native profile reader passes the explicit guidance into captain planning and the frozen runtime profile.

`expert_team_list` lists saved teams and experts. A query searches the bundled expert catalogue. `expert_team_save` resolves selected catalogue entries into immutable registered expert presets and stages a proposal. It returns a pending draft. The user confirms the card before the definition is saved. The existing team execution-plan approval remains the point where agent work starts.

Authoring activates after the native Agent preset registry and saved expert revisions are ready. The Web profile supplies this registry. A headless composition that needs authoring must also mount `@deepseek-ai/dsh-agent-preset-registry`; team execution itself remains available without the authoring tools.

`team-authoring.sqlite` is profile-local, at schema version 1. Its `drafts` table holds one current proposal per conversation, a stable draft ID, a revision, the originating tool call, the settings revision and its outcome. Updating a pending proposal retains its ID and increments its revision. There is no expiry. Earlier installations have no authoring database, so initialization creates an empty table without changing saved team profiles or execution history.

Confirmation serializes writes and records `saving` before calling the existing revision-fenced settings service. A repeated confirmation returns the recorded `saved` result. A failed write restores `pending`. If a committed write loses its acknowledgement, the raw saved profile is compared with the proposal before treating it as saved. The same comparison recovers a `saving` marker after restart. A conflicting settings revision requires a newly reviewed proposal.

The five starter teams in `team-scenarios.ts` are original CrewON content. They cover product review, engineering review, content and fact review, business decisions and delivery planning. They contain editable role instructions and acceptance-oriented deliverables. They do not copy upstream persona or team documents.
