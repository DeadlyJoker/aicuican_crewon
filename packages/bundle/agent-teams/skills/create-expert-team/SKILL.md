---
name: create-expert-team
description: Design a reusable expert team with clear roles and deliverables, then stage it for confirmation in the conversation.
---

# Create an expert team

Use this skill when the user asks to create, improve, or save a reusable specialist team.

1. Call `expert_team_list` to inspect saved teams. Search its expert catalogue with a short `query` matching the required professional skills. Reuse a suitable team when the user wants to use it.
2. Identify the recurring goal, scope boundaries and expected deliverable. Ask a short question only when a missing fact would materially change the team. Otherwise propose a small team with distinct responsibilities.
3. Select available experts by their exact `expertKey`. Use an existing `expertId` or registered `agentPreset` only when returned by the catalogue. Never invent keys, IDs or presets. A custom role may omit all three fields.
4. Call `expert_team_save` with the same fields used in the manual editor. Provide `name`, `description`, `goal`, `constraints`, `deliverables`, `protocol`, realistic `examples`, and `members` with distinct `role` and `executionPrompt`. Each instruction states the evidence to inspect, contribution and expected handoff. The captain merges duplicate findings and preserves meaningful disagreement.
5. The tool stages a persistent review card. Reply with one short sentence pointing to that card, then wait. The card saves the definition after the user confirms. Do not claim it is saved or start agents during authoring.
6. When the user requests a revision, call `expert_team_save` again to update the pending card. Use `replace: true` only when explicitly updating an already saved team. Existing execution history keeps its original expert revisions.

Expert teams solve open-ended problems through specialist analysis. Offices maintain long-lived members and projects. Workflows execute repeatable steps with explicit inputs, outputs, and human gates. Explain which mode fits when the user's request mixes these needs.
