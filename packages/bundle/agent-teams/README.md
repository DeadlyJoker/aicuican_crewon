---
description: "Add captain-led expert collaboration to a profile."
kind: "package-bundle"
---

# @deepseek-ai/dsh-agent-teams-bundle

English | [中文](README.zh.md)

## Summary

This optional bundle provides expert teams through the pinned `@nanmicoder/dsh-agent-teams` 0.1.28 implementation and a reviewed compatibility patch for the current Host.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Use this package

Teams is visible by default in the Web and Desktop plugin manager, including before activation. Enable it and restart the profile when prompted. Open **Teams → Expert teams** to define a team's professional focus, collaboration requirements and member responsibilities. Use `/create-expert-panel` (shown as “创建专家团” in Chinese) to propose a reusable team for review. Running a selected team creates a separate execution plan; its review card can also retain the specialist roster for reuse. The internal `/agent-teams` spelling remains available for saved-team invocation. In a conversation, type `@`, choose an expert team, enter the problem and send. The team appears as a removable reference chip within the draft. Sent messages display the team mention and the original problem. The logged internal command invokes that saved team and requests its execution plan for approval. The current conversation and its attachments are retained. Review and approve the proposed plan below the latest completed reply. While a plan awaits approval, it follows subsequent replies and is restored after reopening the conversation. Member and task sections support inline additions and expandable editing. The execution review card uses the shared expert selector when adding or editing a member. Selections retain an immutable preset revision and explicit model route, while preserving task-specific responsibilities. Preset activation and unfinished member edits block approval. Prerequisite selection lists actual task IDs and excludes self-dependencies and cycles. Approval creates the members and starts execution. Open the activity view only when you need detailed monitoring; it does not open automatically. Removing the chip before sending leaves an ordinary message. Existing team runs continue through their captain.

Ask the assistant to design a reusable expert team or choose **New expert team**. The bundled `create-expert-team` skill and `expert_team_save` stage a durable review card below the latest completed reply. The card and Teams editor share member, goal, constraint and deliverable fields. Confirmation saves the reviewed definition once without starting agents; editing, reopening and Host restarts retain the draft. The editor includes five editable starter scenarios. `expert_team_list` searches the real expert catalogue, and proposals bind selected experts to immutable preset revisions. Legacy inline roles remain supported.

With Toolbox enabled, the expert editor includes skills, MCP connectors and local tools alongside the base preset. Existing capability selections are staged for the next saved expert revision. Discovery failure blocks saving; if the expert saves but its policy write fails, the form retains the draft and reports the saved version so setup can be retried. Without Toolbox, the editor explicitly retains the base capabilities.

For a custom profile, add `@deepseek-ai/dsh-agent-teams-bundle` after its base and application bundles. Override `agent-teams` through a profile patch to configure the state directory, member provider, member limit or nested delegation depth. Defaults are `.agent-teams`, `spawn`, eight members and zero nested delegation.

Open **Teams → Experts** to search 331 bundled personas by specialty and category, inspect their responsibilities, customize a copy, or save your own expert based on a native Agent preset. Full instructions load only when inspected or used. Choosing Use, a starter question or an expert from the composer's `@` menu prepares a new ordinary conversation with that expert's preset; nothing is sent automatically. The original conversation and draft remain intact. Attachments copied from the composer receive separate draft identities in the new conversation.

Expert-team members, workflow steps and office members use the same searchable picker. It lists bundled and saved experts directly; selecting a bundled expert registers its immutable preset on demand, without visiting the Experts page. Failed or cancelled selection retains the previous binding. Save and other draft edits pause during activation so a late response cannot overwrite another member or step. Native inheritance and earlier preset selections remain available. Goal, constraint, deliverable and coordination fields are optional. Saving omits empty values, and existing profiles with empty values remain runnable.

Expert teams, workflow steps and office members can select the same saved expert. Saving changes creates an immutable preset revision; existing runs and history retain the original revision. Office settings can switch an existing member for subsequent messages. The trajectory selector reads each actual child Session's recorded preset and shows its immutable expert name and version. Selecting an earlier version opens that child's original native trace. Connected Web and Desktop clients receive committed catalogue and history changes through `teamCatalogue.watch`, preserving local editor drafts and navigation. The native `agentPresets` service owns execution. Bundled persona source pins and MIT licenses are recorded in [assets/experts/UPSTREAM.md](assets/experts/UPSTREAM.md).

The bundle's `expertPromptMaxLength` defaults to 32768 characters and `expertBuiltinBasePreset` defaults to `standard`. Oversized instructions are rejected without truncation. Authoring commands and the expert catalogue require the native `agent-preset-registry`, included by the Web and Desktop profile; a custom headless profile must compose it explicitly. Expert definitions and immutable revisions live in `team-experts.sqlite`; reusable-team review drafts live in `team-authoring.sqlite`. Draft confirmation uses revision checks and reconciles a committed save after an interrupted acknowledgement.

## Understand the implementation

<details>
<summary>Understand the implementation</summary>

The bundle mounts the upstream Host entry and a Client editor. The editor writes the upstream `profiles` field through revision-fenced settings updates. Drafts survive a rejected save. Existing profile fields are preserved when editing roles. The upstream package owns coordination and workspace state. The repository patch adapts activation creation and initialization to the current subagent API. The Host owns attributed queue delivery and targeted branch teardown. Profile edits update the configuration used by later team creation and subsequent model requests; existing team state retains its roster.

</details>

## Further Exploration

[Upstream implementation](https://github.com/NanmiCoder/dsh-agent-teams) · [Collaboration design](../../../dev-notes/team-modes-design.md) · [Subagent service](../../subagent/subagent/README.md)

## Saved workflows

Open **Teams → Workflows** to save instructions for drafting, independent review, and delivery. An optional second reviewer runs in parallel with the first. Each run takes a new input and opens a conversation in the selected workspace. The conversation shows an approval card with the draft and review notes, and the library lists recent runs with links to their conversations.

The Host invokes the selected preset's native `workflow` tool before and after the human decision. It stores definitions, inputs, artifacts, and decisions in the profile's `team-workflows.sqlite`. The pending approval survives a Host restart. The Host claims each approval once before starting delivery. A restart during active Agent work marks the run interrupted and requires a new run. Delivery produces a Markdown result inside the conversation card.

In the conversation’s Trajectory tab, expand Execution steps to see recorded dependencies. Select an Agent to switch the current tab to its native timeline and event ledger. Select the same Agent again to return to the run trajectory. The approval node shows the reviewed materials and decision.

Each workflow step may select an existing Agent preset. Leaving it blank inherits the conversation preset, including for older saved workflows. A missing or broken selection stops the affected run instead of switching Agents.

New workflows contain user-named Agent tasks and optional approval nodes connected by dependencies. A workflow may omit approvals or include several. Each decision identifies its pending approval so a repeated confirmation cannot approve a later gate. Saved legacy definitions and run snapshots retain their original execution semantics.

The workflow editor uses a draggable node canvas. Agent and approval nodes are connected through their ports; connections define execution dependencies. The property panel edits the selected node. Node positions are saved independently of dependency order, and older definitions receive an automatic layout. Cycles are rejected before saving and by the Host. Run history and native trajectories keep their existing ownership.

The Teams page owns its vertical scroll area and follows the automation catalogue's content width, page heading, filter height and creation-button styling. All three modes share one Teams heading with New expert team, New office or New workflow on its right and category navigation below it. Mode content omits repeated catalogue headings. Office and workflow cards use the same gear and settings label as their conversation sidebar. Cards reveal labelled actions on hover or keyboard focus; touch devices keep them visible. Specialist responsibilities remain in the editor, while member avatars expose names and roles.

Before the first workflow step, the controller reads the retained Session history to avoid injecting context that was already recorded. A history-read failure stops the step before adding context.

Experts used as team members automatically receive the four native coordination tools for claiming tasks, reporting results, updating their own tasks and reading team status, even when their preset uses an explicit toolbox allowlist. The runtime verifies current membership before supplying these tools. Other capabilities remain constrained by the expert policy; ordinary expert conversations and workflow steps receive no team-role defaults.

## Persistent offices

Create an office under Teams → Offices with named roles and existing Agent presets, then enter it in the selected workspace. Its conversation and member identities are retained. Choosing a member from the composer's @ menu submits directly through the command channel; each member's reply appears under its corresponding message. The first addressed message creates that member's native continuable Session, and later messages resume the same Session, including after a Host restart. The Trajectory tab selects these native member traces.

Office metadata and message outcomes are stored in the profile's team-offices.sqlite; the native Session store owns model history and workspace permission inheritance. Each member accepts one outstanding request per conversation scope. The same role can work concurrently in different topics. Messages interrupted by a Host restart are marked interrupted rather than silently resubmitted. Different offices validate their recipients against their own conversation. This adapter uses native DSH subagents; Contexera's persistent-member model is a design reference.

Office member forms group identity fields together, retain multiline responsibilities, and keep the modal actions outside its scrollable content. Conversation replies show the member identity and execution status above a theme-aware message bubble.

Office settings edit the name, purpose, member roster, roles, responsibilities and optional leader in the current conversation. The Teams page uses the same collapsible member form. Existing members keep their identities and names. Selecting another expert allocates new native execution sessions for subsequent lobby and topic messages. Earlier messages and in-flight executions retain their original sessions and preset revisions. Updated responsibilities apply to subsequent requests. New members select a preset and receive stable identities for save retries. Removing a member retains historical messages and sessions, and is refused while that member has pending work. Projects and Inbox synchronize the saved roster through the existing ledger.

## Office projects and inbox

The office project adapter reuses Contexera `dsh-agent-team` 0.2.6's ledger and operation schemas at commit `08c3e4b6ec41382941236e461cde4ffede234ffd`. The selected source files and MIT license live in `src/contexera-domain`; its upstream note lists the local compiler-only adjustments. Projects, discussion threads, message mentions, unread markers, idempotency and revision checks run through that ledger. The UI lives under the office card's Projects and inbox action.

An existing office imports its member identities and lobby Session IDs idempotently on first project access. Each office has a separate `crewon_office_<id>` domain in the current profile's storage backend. Project and Inbox rows open a canonical topic conversation. Each topic owns distinct native member Sessions and preserves them across reopening and Host restart. Selecting a member while posting dispatches through the office command and records the native reply in that topic. Opening a topic acknowledges the Human's unread markers. Inspecting a member's Inbox preserves that member's unread state. The topic conversation renders the complete ledger history in sequence order, including replies from older lobby clients. Pending native deliveries occupy their source-message position until the ledger result replaces them. Reading the topic is side-effect-free. The visible conversation acknowledges its rendered sequence separately and drains the ledger’s bounded read batches. The upstream task/Claim and private-DM runtime are outside this integration.

## Conversation scope and details

New Session creates an independent conversation when a candidate already belongs to an office lobby, office topic or workflow run. The reuse check reads the existing SQLite bindings on each request, including records saved by earlier versions. Opening a saved office or workflow history continues to use its original Session.

The office card opens its persistent lobby. Projects and topics are created from their named actions; opening an office, topic, or workflow history does not start a new project or rerun completed work. Lobby messages select their recipient with `@`; plain lobby submissions retain the draft and prompt for a member. User questions and member replies remain in the lobby Chat, while main-assistant receipts and repeated summaries are hidden. Actionable failures and approval cards remain visible, and the native Trajectory retains the complete log.

The conversation header uses matching buttons on the right to open expert team, office or workflow details in the right sidebar. The expert team panel shows the team name, member status, and task progress. Office details show the current project/topic, leader routing and live member activity, with expandable responsibilities and latest tasks. Workflow details show recorded node progress, prerequisites and results from that run. Office and workflow settings use the same gear action and reuse their existing forms in conversation-owned dialogs. Saving targets the selected definition, while cancellation, save failures and successful dismissal retain the underlying conversation and sidebar. Workflow edits apply to future runs and preserve recorded runs. The project action opens the current office's project page. Workflow history opens in a read-only modal with paginated runs and expandable inputs and outputs. History is queried by workflow identity independently of the global recent-run limit. Missing definitions never redirect to a different object. Model and tool logs remain in the native Trajectory view.

Topic dispatch records its exact source message and input watermark. Member Inbox acknowledgement follows successful native admission and covers only the submitted snapshot. A topic changed during execution can refuse the reply through the upstream revision checks; the office retains the completed output and reports the separate topic-delivery failure. Legacy messages without a source reference continue using the topic anchor.

Topic bindings and per-scope member Session IDs are stored in SQLite schema version 2. Migration preserves the existing lobby IDs and message JSON, and associates older deliveries with their original lobby. A zero-model initialization turn makes a topic an ordinary retained conversation. Repeated opens resolve the same conversation and render one shared timeline.

An office may select an existing member as its leader, including after the office has opened. Unaddressed messages use that member’s native execution path, while explicit member mentions select their stated recipient. New topics default to notifying the leader and can still be published without notification. Clearing the leader restores explicit-recipient input. Leader configuration is optional in older records and retains member and conversation identities.

The leader can use `office_delegate` to assign concrete work to existing office members and await their recorded results. The tool validates the active leader, conversation and target member, reuses the office delivery ledger, and returns actual output for the leader to summarize. Member replies keep their existing bubbles and native trajectories. Retries of the same tool call retain the same delivery identity.

<a id="model-experience"></a>
## Model Experience

### Expert-team authoring and coordination

#### What the model sees

The bundle contributes `expert_team_list`, `expert_team_save` and the `create-expert-team` skill. Proposals stage a review card; user confirmation saves the team without starting agents. The [upstream coordination plugin](https://github.com/NanmiCoder/dsh-agent-teams) owns runtime collaboration tools, instructions and results.

#### Token effect

Admitted tool definitions, skill instructions and requested expert catalogue results contribute to model requests. The settings pages themselves make no model call.

#### KV Cache effect

Enabling the bundle changes profile-wide tool definitions and system instructions. Member routing follows the captain route unless configured explicitly. Editing saved profiles changes their directory in later model requests.

## Known Limitations and Deferred Work

- Workspace state is serialized within one Host process. Concurrent Hosts need separate state directories. Expert teams use captain-planned tasks; saved workflow graphs and persistent offices have separate adapters. Runtime compatibility checks use deterministic model adapters; model quality depends on the configured provider.

### Dev Note

<details>
<summary>Dev Note</summary>

The dependency retains its MIT license. The bundle reuses existing repository artwork.

</details>
