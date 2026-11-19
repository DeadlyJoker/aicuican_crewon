# CrewON bundle 服务

[English](crewon.md) | 中文

本参考页记录 CrewON 产品 bundle 提供的 Host API 与事件。用户流程、配置、持久化和模型行为由各包参考文档维护：[团队](../../packages/bundle/agent-teams/README.zh.md)、[Studio](../../packages/bundle/short-drama/README.zh.md)、[交互界面](../../packages/bundle/interactive-ui/README.zh.md)和[工具箱](../../packages/bundle/skill-explorer/README.zh.md)。

## Cordis 接口

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxinteractivecards--interactivecards"></a>

### `ctx.interactiveCards` — `InteractiveCards`

Persist before dispatch; retries reuse the native request identity and frozen payload.

```ts cordis-catalog
/** Read the current form draft or submission status.
 * @param request - Conversation and stable message/card identity.
 * @returns Saved draft or submission status.
 */
@Remote('read') async read(request: { sessionId: string; key: string }): Promise<CardState>

/** Save edited form values, rejecting stale draft revisions.
 * @param request - Edited values and the last observed revision.
 * @returns Current saved state; stale writes fail.
 */
@Remote('save') async save(request: { sessionId: string; key: string; values: FormValues; revision: number }): Promise<CardState>

/** Submit a form to its original conversation or office recipient.
 * @param request - Frozen form payload and its original reply destination.
 * @returns Persisted admission status.
 */
@Remote('submit') async submit(request: { sessionId: string; key: string; values: FormValues; revision: number; title: string; labels?: Record<string, string>; recipient?: { namespace: 'office'; id: string } }): Promise<CardState>
```

Source: [`packages/bundle/interactive-ui/src/cards.ts`](../../packages/bundle/interactive-ui/src/cards.ts)

<a id="ctxshortdrama--shortdramaprojects"></a>

### `ctx.shortDrama` — `ShortDramaProjects`

Native Remote service shared by the workbench and the Agent tool executor.

```ts cordis-catalog
/**
 * Read the project associated with a native conversation.
 * @param sessionId - Conversation identity.
 * @returns Its project, or null for a conversation outside Studio.
 */
@Remote conversationProject(sessionId: SessionId): DramaProject | null

/**
 * Read the saved layout without creating or modifying project content.
 * @param projectId - Existing project identity.
 * @returns Saved positions and viewport, or an empty initial layout.
 */
@Remote readCanvas(projectId: DramaProjectId): DramaCanvasLayout

/**
 * Commit layout with optimistic concurrency; a stale client cannot overwrite another editor.
 * @param projectId - Existing project identity.
 * @param layout - Layout and expected revision.
 * @returns Committed layout at its next revision.
 */
@Remote async saveCanvas(projectId: DramaProjectId, layout: DramaCanvasLayout): Promise<DramaCanvasLayout>

/**
 * List projects owned by this Host profile.
 * @returns Projects in title order.
 */
@Remote list(): DramaProjectSummary[]

/**
 * Create an empty project with durable identity.
 * @param title - Project title.
 * @returns Newly saved empty project.
 */
@Remote async create(title: string): Promise<DramaProject>

/**
 * Read the editable project and retained script candidates.
 * @param projectId - Project to open.
 * @returns The project and its candidate history.
 */
@Remote read(projectId: DramaProjectId): DramaProject

/**
 * Update the synopsis and append a script candidate if supplied.
 * @param projectId - Project to edit.
 * @param expectedRevision - Revision the editor read.
 * @param synopsis - Project synopsis.
 * @param script - Candidate text, or empty to change only the synopsis.
 * @returns The committed project.
 */
@Remote async saveDraft(projectId: DramaProjectId, expectedRevision: number, synopsis: string, script: string): Promise<DramaProject>

/**
 * Adopt one saved candidate while retaining the rest of the history.
 * @param projectId - Project containing the candidate.
 * @param expectedRevision - Revision shown at selection time.
 * @param scriptId - Candidate to adopt.
 * @returns The committed project.
 */
@Remote async adoptScript(projectId: DramaProjectId, expectedRevision: number, scriptId: DramaScriptId): Promise<DramaProject>

/**
 * Open the same native Session on subsequent calls and after Host restart.
 * @param projectId - Project whose conversation should open.
 * @returns The project Session identity.
 */
@Remote async openConversation(projectId: DramaProjectId): Promise<SessionId>

/**
 * Create a new native conversation in the existing project workspace using the configured director preset.
 * Concurrent requests for one project share a single creation; completed conversations remain unchanged.
 * @param projectId - Project whose workspace receives the conversation.
 * @returns The created Session identity, independent from the project's initial conversation.
 */
@Remote async createConversation(projectId: DramaProjectId): Promise<SessionId>

/**
 * Find the project explicitly associated with one Agent Session.
 * @param sessionId - Current Agent Session.
 * @returns Its bound project, or undefined for an ordinary Session.
 */
projectForSession(sessionId: SessionId): DramaProject | undefined

/** Ensure every existing project has a separate native workspace without rewriting old conversations. */
async initializeStudioWorkspaces(): Promise<void>

/** Open the private Studio entry conversation.
 * @returns The entry conversation; it never belongs to the home workspace.
 */
@Remote async openStudioEntry(): Promise<SessionId>

/** Read the shared Studio creation draft.
 * @returns The creation draft, including all mode-specific settings.
 */
@Remote readEntryDocument(): StudioDocument

/** Save the shared creation draft, rejecting stale revisions.
 * @param document - Creation draft and last observed revision.
 * @returns The committed shared draft.
 */
@Remote async saveEntryDocument(document: StudioDocument): Promise<StudioDocument>

/** Copy imported entry sources into an allocated project.
 * @param projectId - Allocated project.
 * @param ids - Imported source identities.
 * @returns Project-relative original-file references.
 */
@Remote async copyEntrySources(projectId: DramaProjectId, ids: EntrySourceId[]): Promise<{ id: EntrySourceId; name: string; path: string }[]>

/** List Studio projects and their native conversation associations.
 * @returns Projects with their native workspace and retained historical conversations.
 */
@Remote async studioCatalogue(): Promise<{ id: DramaProjectId title: string workspaceId: WorkspaceId sessionIds: readonly SessionId[] historySessionIds: readonly SessionId[] }[]>

/** Read the shared Studio view state for a project.
 * @param projectId - Owning project.
 * @returns Its complete shared Studio view document.
 */
@Remote readStudio(projectId: DramaProjectId): StudioDocument

/** Save a project’s shared Studio view state, rejecting stale revisions.
 * @param projectId - Owning project.
 * @param document - Expected revision and replacement view state.
 * @returns Committed view document.
 */
@Remote async saveStudio(projectId: DramaProjectId, document: StudioDocument): Promise<StudioDocument>

/**
 * Save a candidate from the bound Session without changing the adopted version.
 * @param sessionId - Current Agent Session.
 * @param expectedRevision - Project revision observed by the Agent.
 * @param script - Proposed script.
 * @returns The committed project.
 */
async saveFromSession(sessionId: SessionId, expectedRevision: number, script: string): Promise<DramaProject>
```

Types: [SessionId](core.zh.md) · [WorkspaceId](workspace.zh.md)

Source: [`packages/bundle/short-drama/src/projects.ts`](../../packages/bundle/short-drama/src/projects.ts)

<a id="ctxshortdramaproduction--shortdramaproduction"></a>

### `ctx.shortDramaProduction` — `ShortDramaProduction`

Authoritative service shared by native forms and project-scoped Agent tools.

```ts cordis-catalog
/** Read generation defaults managed by the Host owner.
 * @returns Generation defaults shared by Web and Desktop.
 */
@Remote readSharedSettings(): SharedGenerationSettings

/**
 * Save defaults without rewriting existing projects or attempts.
 * @param expectedRevision - Last read shared revision.
 * @param settings - Secret-free execution routes.
 * @returns Saved shared settings.
 */
@Remote async saveSharedSettings(expectedRevision: number, settings: DramaProductionSettings): Promise<SharedGenerationSettings>

/** Observe committed project changes, including media submission and completion within an Agent turn.
 * @param projectId - Owner's project to observe.
 * @param signal - Remote subscriber cancellation.
 * @returns Current production and subsequent coalesced snapshots until cancellation.
 */
@Remote({ mode: 'stream' }) async *watch(projectId: DramaProjectId, signal: AbortSignal): AsyncIterable<DramaProduction>

/**
 * Append a validated source-linked creative decision without overwriting prior decisions.
 * @param projectId - Owning project.
 * @param expectedRevision - Last read production revision.
 * @param kind - Diagnosis, asset brief, director plan or media review.
 * @param document - JSON parsed and validated against the selected record schema.
 * @returns Updated project production and retained decision history.
 */
@Remote async saveCreative(projectId: DramaProjectId, expectedRevision: number, kind: CreativeKind, document: string): Promise<DramaProduction>

/**
 * Compile the current director plan without submitting or changing generation inputs.
 * @param projectId - Owner.
 * @param shotId - Existing structured shot.
 * @returns H3 prompt, ordered reference identities and blocking findings.
 */
@Remote compileShot(projectId: DramaProjectId, shotId: DramaShotId): ShotCompilation

/**
 * Read current state and retained media history.
 * @param projectId - Owning project.
 * @returns Production state.
 */
@Remote read(projectId: DramaProjectId): DramaProduction

/**
 * Configure execution only for future attempts.
 * @param projectId - Owner.
 * @param expectedRevision - Read revision.
 * @param settings - Secret-free routes.
 * @returns Saved state.
 */
@Remote async saveSettings(projectId: DramaProjectId, expectedRevision: number, settings: DramaProductionSettings): Promise<DramaProduction>

/**
 * Append an asset revision without changing media from older versions.
 * @param projectId - Owner.
 * @param expectedRevision - Read revision.
 * @param draft - Character, scene, prop or voice.
 * @returns Saved state.
 */
@Remote async saveAsset(projectId: DramaProjectId, expectedRevision: number, draft: DramaAssetDraft): Promise<DramaProduction>

/**
 * Remove an unused asset from the active catalogue; retain historical versions.
 * @param projectId - Owner.
 * @param expectedRevision - Read revision.
 * @param assetId - Asset to remove.
 * @returns Saved state.
 */
@Remote async removeAsset(projectId: DramaProjectId, expectedRevision: number, assetId: DramaAssetId): Promise<DramaProduction>

/**
 * Append a shot revision freezing current adopted script and asset versions.
 * @param projectId - Owner.
 * @param expectedRevision - Read revision.
 * @param draft - Shot and reusable references.
 * @returns Saved state.
 */
@Remote async saveShot(projectId: DramaProjectId, expectedRevision: number, draft: DramaShotDraft): Promise<DramaProduction>

/**
 * Remove an untimed shot while preserving historical runs.
 * @param projectId - Owner.
 * @param expectedRevision - Read revision.
 * @param shotId - Shot to remove.
 * @returns Saved state.
 */
@Remote async removeShot(projectId: DramaProjectId, expectedRevision: number, shotId: DramaShotId): Promise<DramaProduction>

/**
 * Reserve an attempt durably before contacting its execution API. Repeated keys never resubmit.
 * @param projectId - Owner.
 * @param expectedRevision - Read revision.
 * @param jobId - Caller-owned UUID reused for double clicks.
 * @param targetType - Asset or shot.
 * @param targetId - Target identity.
 * @param kind - Requested output.
 * @param referenceMediaIds - Archived project images used to edit an asset; omitted for other execution paths.
 * @returns Current state and API receipt.
 */
@Remote async generate( projectId: DramaProjectId, expectedRevision: number, jobId: DramaJobId, targetType: 'asset' | 'shot', targetId: string, kind: DramaMediaKind, referenceMediaIds?: DramaMediaId[], ): Promise<DramaProduction>

/**
 * Reconcile an existing attempt with its original API; never submit a replacement.
 * @param projectId - Owner.
 * @param jobId - Durable request key.
 * @returns Latest receipt and archived results.
 */
@Remote async observe(projectId: DramaProjectId, jobId: DramaJobId): Promise<DramaProduction>

/**
 * Adopt one successful candidate only while its target revision remains current.
 * @param projectId - Owner.
 * @param expectedRevision - Read revision.
 * @param jobId - Successful attempt.
 * @param mediaId - Candidate file.
 * @returns Saved adoption.
 */
@Remote async adoptMedia( projectId: DramaProjectId, expectedRevision: number, jobId: DramaJobId, mediaId: DramaMediaId, ): Promise<DramaProduction>

/**
 * Save exact adopted files and frame-accurate edit decisions.
 * @param projectId - Owner.
 * @param expectedRevision - Read revision.
 * @param clips - Ordered input snapshots.
 * @returns Saved timeline.
 */
@Remote async saveTimeline(projectId: DramaProjectId, expectedRevision: number, clips: DramaTimelineClip[]): Promise<DramaProduction>

/**
 * Save multitrack decisions without rewriting sequential history or source media.
 * @param projectId - Owning project.
 * @param expectedRevision - Last read production revision.
 * @param edit - Validated tracks; media must already be archived in this project.
 * @returns Updated production with the preserved legacy timeline.
 */
@Remote async saveEdit(projectId: DramaProjectId, expectedRevision: number, edit: DramaEditTimeline): Promise<DramaProduction>

/**
 * Resolve an archived audio/video source for Host-local analysis without exposing paths remotely.
 * @param projectId - Owning project.
 * @param mediaId - Immutable archived source.
 * @returns Private source path and work directory.
 */
analysisSource(projectId: DramaProjectId, mediaId: DramaMediaId): { path: string; directory: string }

/**
 * Render a frozen timeline once per export key; retain every older export.
 * @param projectId - Owner.
 * @param expectedRevision - Read revision.
 * @param exportId - Idempotent caller-owned key.
 * @returns Verified export and history.
 */
@Remote async exportEpisode(projectId: DramaProjectId, expectedRevision: number, exportId: DramaExportId): Promise<DramaProduction>
```

Source: [`packages/bundle/short-drama/src/production.ts`](../../packages/bundle/short-drama/src/production.ts)

<a id="ctxstudiodirector--studiodirector"></a>

### `ctx.studioDirector` — `StudioDirector`

Native director operations shared by both GUI clients and project tools.

```ts cordis-catalog
/** Read the direction and review state of a Studio conversation.
 * @param sessionId - Bound project conversation.
 * @returns Current brief, derived stage and exact review candidates, or null outside Studio.
 */
@Remote read(sessionId: SessionId): DirectorView | null

/** Save a new creative direction revision for the bound project.
 * @param sessionId - Bound conversation.
 * @param expectedRevision - Latest direction revision.
 * @param brief - Complete creative brief.
 * @returns Saved direction revision with prior versions retained.
 */
async save(sessionId: SessionId, expectedRevision: number, brief: CreativeDirection): Promise<{ revision: number }>

/** Confirm the exact project revisions currently shown for review.
 * @param sessionId - Project conversation.
 * @param token - Exact visible project revisions and handoff.
 * @returns Refreshed stage after review; execution remains an ordinary conversation submission.
 */
@Remote async confirm(sessionId: SessionId, token: string): Promise<DirectorView | null>
```

Types: [SessionId](core.zh.md)

Source: [`packages/bundle/short-drama/src/director.ts`](../../packages/bundle/short-drama/src/director.ts)

<a id="ctxteamauthoring--teamauthoring"></a>

### `ctx.teamAuthoring` — `TeamAuthoring`

Profile-local drafts survive Host restarts and never dispatch agent work.

```ts cordis-catalog
/** Read a conversation's latest draft, including its confirmed outcome.
 * @param sessionId - Conversation that proposed the team.
 * @returns The durable draft, or null when no team was proposed.
 */
@Remote('read') read(sessionId: SessionId): TeamAuthoringDraft | null

/** Resolve catalogue references and reject fabricated or unavailable presets.
 * @param input - Definition using saved expert identities or registered preset IDs.
 * @returns A normalized definition with immutable expert revisions.
 */
async resolve(input: TeamAuthoringInput): Promise<TeamAuthoringInput>

/** Stage one proposal; replaying the same tool call returns the same draft.
 * @param sessionId - Conversation requesting creation.
 * @param callId - Durable tool call identity for safe retries.
 * @param input - Proposed reusable team.
 * @returns A pending card, without saving the team directory.
 */
stage(sessionId: SessionId, callId: string, input: TeamAuthoringInput): Promise<TeamAuthoringDraft>

/** Edit a pending proposal without publishing it as a reusable team.
 * @param sessionId - Draft's conversation.
 * @param id - Draft identity.
 * @param revision - Revision the user reviewed.
 * @param input - Updated fields.
 * @returns The next pending revision.
 */
@Remote('update') update(sessionId: SessionId, id: string, revision: number, input: TeamAuthoringInput): Promise<TeamAuthoringDraft>

/** Save the reviewed definition once. A restart during save reconciles the committed value.
 * @param sessionId - Draft's conversation.
 * @param id - Draft identity.
 * @param revision - Revision the user approved.
 * @returns The saved outcome; repeated confirmation returns the same outcome.
 */
@Remote('confirm') confirm(sessionId: SessionId, id: string, revision: number): Promise<TeamAuthoringDraft>

/** Close the pending card without saving the definition.
 * @param sessionId - Draft's conversation.
 * @param id - Draft identity.
 * @param revision - Revision the user dismissed.
 * @returns The discarded draft.
 */
@Remote('discard') discard(sessionId: SessionId, id: string, revision: number): Promise<TeamAuthoringDraft>
```

Types: [SessionId](core.zh.md)

Source: [`packages/bundle/agent-teams/src/team-authoring.ts`](../../packages/bundle/agent-teams/src/team-authoring.ts)

<a id="ctxteamcatalogue--teamcatalogue"></a>

### `ctx.teamCatalogue` — `TeamCatalogue`

Coalesced revision stream for the current Host's team data.

```ts cordis-catalog
/** Observe the current revision and subsequent committed changes.
 * @param signal - Remote subscriber cancellation.
 * @returns Revision snapshots until the subscriber or Host stops.
 */
@Remote({ mode: 'stream' }) async *watch(signal: AbortSignal): AsyncIterable<number>
```

Source: [`packages/bundle/agent-teams/src/catalogue.ts`](../../packages/bundle/agent-teams/src/catalogue.ts)

<a id="team-catalogue-events"></a>

### `team-catalogue/*` events

<a id="team-cataloguechanged--emit"></a>

#### `team-catalogue/changed` — emit

A catalogue or execution-history write has committed; readers may reload it.

```ts cordis-catalog
/** A catalogue or execution-history write has committed; readers may reload it.
 * @mode emit
 */
'team-catalogue/changed'(): void
```

Source: [`packages/bundle/agent-teams/src/catalogue.ts`](../../packages/bundle/agent-teams/src/catalogue.ts)

<a id="toolbox-events"></a>

### `toolbox/*` events

<a id="toolboxrequired-tools--waterfall"></a>

#### `toolbox/required-tools` — waterfall

Supply protocol tools required by an authenticated runtime role. Providers must validate the exact Agent's role and delegate unrelated Agents. These defaults supplement only toolbox policies, never other tool masks, sandbox checks, approvals or the tool's own authorization.

```ts cordis-catalog
/**
 * Supply protocol tools required by an authenticated runtime role. Providers
 * must validate the exact Agent's role and delegate unrelated Agents.
 * These defaults supplement only toolbox policies, never other tool masks,
 * sandbox checks, approvals or the tool's own authorization.
 * @param agent - Agent whose current runtime role is being queried.
 * @mode waterfall
 */
'toolbox/required-tools'(agent: Agent, next: () => readonly string[]): readonly string[]
```

Types: [Agent](core.zh.md)

Source: [`packages/bundle/skill-explorer/src/authorization.ts`](../../packages/bundle/skill-explorer/src/authorization.ts)
<!-- END GENERATED cordis-surface -->
