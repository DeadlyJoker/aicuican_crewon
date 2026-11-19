# CrewON development preparation index

English | [中文](README.zh.md)

This local research workspace supports secondary development without replacing upstream documentation, type declarations, or tests. Research date: 2026-11-04. Unconfirmed CrewON requirements are not established product decisions.

## Current requirements

The [requirements proposal](requirements-v1.md) prioritizes Agent Team and defers the standalone task center. It defines team configuration, expert teams, office collaboration, recovery, and acceptance cases. The [cuican-aide feature comparison](aide-feature-map.md) records 22 feature areas and their DSH implementation implications.

The [collaboration-mode design](team-modes-design.md) distinguishes workflows, expert teams, and persistent offices, compares both referenced implementations, and defines the built-in integration stages.

The built-in Expert teams bundle adapts the pinned upstream plugin to the current Host. The mode design records its implementation and validation alongside the earlier compatibility findings.

The [short-drama production plan](short-drama-production-plan.md) defines what CrewON, the Agent and the media API each own, with acceptance criteria through an editable, playable episode.

## Reading order

1. [Environment and source baseline](readiness.md): verify source completeness, Node version, and validation status first.
2. [Architecture reading map](architecture.md): understand startup, conversations, model calls, and persistence.
3. [Feature-to-code map](extension-map.md): locate implementation owners and validation requirements by feature.
4. [Official development lessons](official-lessons.md): learn from incidents while distinguishing historical accounts from current rules.
5. [CrewON UI and interaction roadmap](ui-first-roadmap.md): locate UI extension points and the general UI work planned after Agent Team.
6. [Generated package index](generated/packages.json): look up names, directories, dependencies, exports, and plugin declarations instead of maintaining a manual inventory.

## Usage

For each requirement, describe the user action, observable outcome, change scope, and failure behavior. Follow the map to the owning README and subtree AGENTS.md before inspecting source. UI and interaction work has priority; specific product design remains undecided, including tenancy, billing, deployment topology, and brand replacement.

Upstream authorities are the [architecture](../docs/architecture.md), [development guide](../docs/development.md), [testing policy](../docs/testing.md), [extension cookbook](../docs/cookbook/extension-cookbook.md), and [defensive rules](../docs/defensive-patterns/README.md). Resolve conflicts against current source, current rules, and verification results.

## Refreshing the notes

`python3 dev-notes/tools/inventory.py` reads package manifests and refreshes the generated index. After an upstream update, regenerate it and review changed package READMEs, types, and tests. Explanatory notes in this directory do not update automatically.

Record the upstream baseline, changed packages, affected Session/Remote/UI types, executed checks, and unverified items for each task. An available command is not a passing check, and model self-reports do not replace external file or UI evidence.
