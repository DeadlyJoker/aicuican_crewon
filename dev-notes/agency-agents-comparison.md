# Agency Agents comparison

Reviewed on 2026-11-05 against [MichengAI/dsh-agency-agents](https://github.com/MichengAI/dsh-agency-agents), version 1.2.26, commit `3612123`. This is a source review; the reference plugin was not installed or run in CrewON.

| User capability | Reference implementation | CrewON source state | Priority |
| --- | --- | --- | --- |
| Find an expert | 331 advertised built-ins, categories, bilingual search, enabled/source filters and batch actions | User-created, versioned experts with manual configuration; no equivalent built-in catalogue or discovery controls | First |
| Start a task | Expert/team mention pickers and task examples; optional local recommendations | Existing team mentions and office member addressing; individual expert discovery needs a direct path | First |
| Create through conversation | Proposal tools, session-bound drafts, native Ask and prefilled editors | Team authoring tools and staged review exist; individual expert creation remains a manual form | First |
| Configure collaboration | Five built-in teams with explicit goals, constraints, deliverables and task examples | Team roles, instructions and protocols exist; these product fields are not individually exposed | Second |
| Execute and recover | Ordinary subagent or native team engine selection, bounded concurrency and partial results | Native team/workflow/office execution, trace integration and durable approvals | Preserve and test |
| Reuse an expert | Persona catalogue and custom experts; team members inherit the conversation model | Immutable expert revisions, optional model selection, and reuse across teams, workflows and offices | Preserve and improve discovery |

## Integration direction

Keep the Teams plugin as the owner of the catalogue and native Agent presets as the owner of executable revisions. Add a built-in catalogue beside user-owned experts; copying a built-in creates a user-owned version rather than editing packaged files. Reuse existing category/filter controls and mention insertion. The expert picker should show specialties and one useful task example before model identifiers.

Expose team goal, constraints, member responsibilities, deliverables and examples as structured fields. Retain existing protocol-only definitions through an explicit legacy view; do not infer or overwrite old fields. Conversation-assisted creation should update the same draft, show one editable review card, then save the confirmed version. Execution should use the existing native team scheduler and approval records.

Evaluate improvements with complete user journeys: find and use a built-in expert, select a team from a question, create and revise a specialist through conversation, reuse it in all three modes, and recover a partially failed run without repeating completed work. A larger persona count does not establish better output quality; use the same prompts and verifiable output criteria for both implementations.

## Reuse and attribution

The plugin source is Apache-2.0. Its bundled persona snapshots separately retain MIT licensing and upstream attribution in NOTICE. Reusing persona material requires retaining the applicable notices. Reference UI and scheduler code have not been copied into CrewON by this review.
