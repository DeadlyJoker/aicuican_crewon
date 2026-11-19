---
kind: upgrade-guide
description: "Expert team creation now stages a review card before saving reusable configuration."
---

# Review reusable expert teams before saving

English | [中文](guide.zh.md)

## Change

In the Teams bundle, `expert_team_save` now creates a persistent proposal instead of immediately writing the team directory. `/create-expert-panel` requests the same authoring flow. Existing team definitions, inline roles, immutable expert revisions and run histories remain readable. Invoking a saved team through `@` or `/agent-teams` keeps its execution-plan review.

## Migration

1. For a custom headless profile that exposes authoring tools, compose `@deepseek-ai/dsh-agent-preset-registry`. Web and Desktop already include it. Then update custom instructions that treat `expert_team_save` as a completed save: wait for the user to confirm the pending conversation card.
2. Pass catalogue-returned `expertKey`, `expertId` or `agentPreset` when binding a reusable expert. Existing inline `role` and `responsibilities` remain supported.
3. Confirm the card and check that the team appears under Teams → Expert teams. Reopening or restarting preserves pending proposals; repeated confirmation does not create another team or start members.
