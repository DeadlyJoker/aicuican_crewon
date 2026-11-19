---
description: "Produce short dramas with native projects, Agent-authored assets and storyboards, media APIs and editable episode exports."
kind: "package-bundle"
---

# @deepseek-ai/dsh-short-drama-bundle

English | [中文](README.zh.md)

Studio creates browser-side identifiers with cryptographic random bytes on both HTTP preview and HTTPS deployments. Pointer-added and split timeline clips use UUIDs accepted by the persisted edit API. The embedded script workbench shares the Host wallpaper and glass treatment across story settings, episode outlines, asset cards, storyboards, navigation and action bars. Section tabs use filled selections without divider underlines. The Host sidebar owns the shared wallpaper and glass background; individual workbench pages do not add another tint or blur. Studio downloads scripts concurrently with project initialization, executes them in dependency order, and uses the Host theme during startup. A failed script download reports the affected file even when Host initialization is pending. Restart the shared local Host after adding Studio assets so its resource registrations include the new files.

The script workbench opens existing native storyboard shots independently of the legacy demo asset-confirmation marker. The storyboard reader and canvas use the same persisted shots and director plans.

Fullscreen Studio hides the underlying navigation and conversation while retaining their mounted state; restoring the panel reveals them again without changing the wallpaper or glass settings.

## Summary

This optional bundle adds **Short dramas** to the native workbench: script revisions, reusable assets, storyboard shots, media candidates, an editable timeline and episode exports. CrewON owns project data and archived media. Agents write creative inputs in project conversations; replaceable APIs execute them.

The creation card retains the Demo’s image-based genre and style libraries, four script modes, aspect ratios and episode settings. Genre selection supports a primary and optional blend; styles support filtering, search, favorites, recent selections and editable custom descriptions with reference images. Model routing and selection remain owned by the native composer.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

Archived audio and video can be inspected from the selected clip's **Media analysis** panel or the project Agent. FFprobe reports actual streams and duration; FFmpeg supplies candidate cut ranges. Optional `whisperExecutable` and absolute `whisperModel` settings enable local transcript candidates without downloading a model. Analysis has its own bounded, immutable request history shared by Web and Desktop; repeated identities read the same result, while interrupted requests require an explicit new attempt. Analysis never adopts media, changes approved dialogue or rewrites the timeline. Recognized text requires review, especially with small speech models. MLT, PySceneDetect and external timeline interchange are not integrated.

-----

<a id="use-this-package"></a>
## Use this package

Studio reuses the native sidebar workspace browser and main Agent conversation. Each project has a separate native workspace; linked legacy conversations keep their original identities and directories. Entering Studio filters the existing browser to its projects, and leaving restores the home selection, composer draft and search. The native right sidebar presents the packaged Demo interface and canvas; its editable document uses Host-owned, revision-checked storage. Creative execution goes through the project Agent, with native execution and approval. Web and Desktop connected to the same GUI Host share project records and Studio documents. The standalone 3090 prototype and its browser media remain untouched and are not automatically imported.

In Studio, the global **New project** action opens the Demo creation interface inside the native conversation; it does not add a conversation to the current project. The project row's plus button creates a conversation in that project's workspace using the configured `directorPreset`. Repeated clicks while conversation creation is pending share one request. Ordinary Conversation navigation exits Studio. Each project remembers its last conversation, including linked history; the current native selection takes precedence when restoring after restart. Switching or leaving retains the native per-session right-sidebar layout; the creation entry closes only its own obsolete Studio canvas tab. Failed draft saves keep the current page, while superseded or disposed navigation cannot reopen a stale target. `openConversation` continues to return the project's primary Session; `createConversation` adds a Session without replacing that primary identity or existing records.

New projects use the complete Demo creation interface inside the blank native conversation. Creation, adaptation, production and redraw keep separate inputs; adaptation supports rewrite, continuation and target-language settings. TXT, MD, DOC and DOCX originals are parsed and archived by the Host before project allocation; MP4 and MOV imports require a video stream and a duration of at most five minutes. Confirmed inputs, selected settings and original files are copied into the allocated project and submitted to its native Agent. Failed admission retains the draft and reuses that project on retry. Entry settings and originals use shared, revision-checked Host storage; paid generation still requires native approval and configured media services. The project library and canvas do not introduce a second creative conversation.

The script workbench edits, saves and adopts text through the native project service; edits append a candidate before adoption, retaining prior versions. Shot planning remains blocked until adoption. User bubbles summarize creation settings and canvas actions while traces retain the complete original input. Canvas tasks enter the native project Session queue, including while another task is running. The canvas settings action opens the shared native generation-service form in place, supporting standard image/speech and DashScope video APIs or a unified jobs API; it does not imply that an unconfigured service can generate media. A new project starts without the prototype’s sample characters or shots. The embedded canvas uses the Demo’s group layout. Older adapter layouts are repaired once without changing creative content; subsequent moves and prompt drafts remain editable. Fit-to-content measures cards and group headings against the actual sidebar viewport. Native candidate projections merge by source version, while user prompt drafts keep conflict protection. Independent Web/Desktop document edits rebase on the Host revision; conflicting edits to the same content remain unsaved in the originating frame instead of replacing the other edit.

The package stays private and ships as a built-in optional bundle. Its exports, file list, client entry and patch remain available for a future release process; no standalone publication is performed.


From a built source checkout, launch `pnpm dsh web --patch packages/bundle/short-drama/cordis.patch.yml`. Open **CrewON Studio** from the sidebar. Create a project, save a synopsis and script candidate, then adopt the script to begin planning its shots.

Add character, scene, prop or voice definitions under **Assets**. Plan shots under **Storyboard**, referencing reusable assets. Generate and adopt asset images before generating a shot image; adopt that image before requesting video. Generate speech from the shot's dialogue, preview the candidates and choose which media to adopt. Changing a referenced script or asset marks affected shots for review.

The canvas **Assets** entry opens the project's asset cards. Character, scene and prop lists share their live members with the corresponding canvas groups, including definitions awaiting generation. Saved layouts retain node positions and unrelated groups while new, removed or reclassified assets update both views. Asset creation, edits and deletion use revision-checked native production operations; generation goes through the project Agent. Model settings and shot references reflect the native records. Project asset image import and per-character voice selection are unavailable until their native candidate operations are connected; the prototype controls cannot report a successful adoption.

Configure execution services separately for each project. An OpenAI-compatible base URL includes its API prefix, such as `/v1/`; it serves image generation/editing or speech. The DashScope video adapter uses the service root and its asynchronous task API. Enter an explicit model and, for speech, a voice. The credential reference names a secret stored through DSH credentials; project settings never contain its value. A `jobs-v1` adapter supports a separately deployed execution service implementing the protocol below.

The service dialog scrolls inside the available window height and keeps its save actions visible. Protocol labels and asset version labels follow the client language.

Shared service settings are stored once in the Host and applied by the Studio creation entry to new projects; existing projects keep their settings until the user loads the shared configuration and saves it to that project. Every attempt retains its resolved route. The Zealman workflow adapter uses one panel address, selects saved generation and reference-image workflows, uploads reviewed references in order, and immediately archives completed outputs. A missing remote history is unknown, never permission to resubmit. Voice-cloning workflows require explicit reference audio; they are not a general text-to-speech service. U22 can generate dialogue within the video.

Generation activity appears as an in-place loading animation on the target media placeholder, without waiting text. Committed task changes stream into open Web and Desktop workbenches during the Agent turn. Reduced-motion preferences disable rotation; interrupted and failed tasks show actionable status instead of an indefinite spinner. Native nodes display archived candidates before adoption. Opening a candidate shows the actual image, video or audio; adopting it calls the revision-checked Host operation. Candidates from older asset or shot versions remain viewable but cannot replace the current version. Project history shows archived generation attempts and playable exports. Timeline array order sets playback order; each start frame trims that clip’s source video independently. The project Agent can save ordered adopted clips with `short_drama_save_timeline` and render them with `short_drama_export_episode`; repeating an export identity returns the original delivery.

Studio creative work uses native project-scoped skills for screenplay diagnosis, asset briefs, director plans, H3 compilation and media reviews. Diagnoses cite the adopted script; briefs separate explicit facts, inference and new design. Saving assets and shots updates their canvas nodes and source connections. The production check panel shows those records, compiles actual model input, and sends creative actions to the project Agent. The skill policies adapt the user-maintained AI short-drama production workshop; third-party signature templates and external style snapshots are not bundled.

Structured shots select keyframe, full-reference or text mode. The Host validates duration, contiguous beats, verbatim dialogue, reference purpose and adopted asset versions before submitting. Full-reference input retains each image by its declared purpose instead of carrying its original image-generation instructions into the scene. Full-reference mode needs no extra first-frame image; legacy shots retain their existing first-frame behavior. A changed plan or reference set prevents adopting an older result. Reviews retain observations per attempt; failed asset and shot reviews block adoption, while unknown findings remain visibly unchecked. Asset image edits accept archived project references through the configured reference-image model. Repair instructions preserve existing candidates and link the replacement review to its original attempt. Existing projects resolve missing creative records to empty lists without rewriting scripts, media or exports.

Under **Edit and export**, add adopted shots, adjust their order, source start frame, length and subtitle, then save the timeline. Export produces an MP4 with audio and an SRT sidecar when subtitles are present. Export history keeps its exact input clips. Reopening the project restores its saved timeline and archived candidates.

Open the project conversation for Agent-assisted writing and orchestration, then return to the workbench to review its drafts. Concurrent edits reject a stale revision; reload before saving. An unresolved generation is queried with its original task identity instead of automatically submitting another request. Synchronous image or speech APIs cannot recover a response that was lost after acceptance.

-----

The project director saves versioned creative briefs (background, characters, conflict, outline and visible assumptions) separately from existing project records. It contributes logged native context and derives the next action from current adopted work, so older projects resume without rebuilding a brief.

The newest completed chat reply carries a compact review card for direction, screenplay and media adoption; confirmation checks the displayed revisions before committing. Continuing submits an ordinary project conversation turn using the existing skills, production tools and canvas archive. Blocking screenplay findings return to revision before generation. Service failures expose the existing generation settings dialog and retain the failed attempt for explicit retry. Generation completion does not imply artistic acceptance.

New Studio conversations select the native `studio-director` preset through configurable `directorPreset`; existing conversations retain their recorded preset and history. The director has a filmmaking persona, native questions, skills, media reads and inspection tools. Stage-relevant specialist instructions are included in each logged request, including image prompt composition, structured storyboards and U22 compilation; additional skills remain available on demand. This does not create a separate model service or bypass media approval.

Creation choices are restored from the shared project document, including older `referenceOptions` records. The director treats selected genre, style, aspect ratio and episode count as user decisions. New brief writes require separate positioning, logline, causal synopsis, character biographies and one sequential outline per selected episode. Older briefs remain readable; the workbench uses their actual background, characters and outline, and offers completion instead of repeating the screenplay title.

The global new-conversation and add-workspace actions leave Studio after saving its draft, then use the native home action. Creating a Studio project stays inside the Studio entry; returning to Studio retains the selected project.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The bundle patch mounts Host storage, project-scoped tools and native client contributions. Existing project/script records remain in their original domain; production records use a separate domain. Script, asset and shot definitions retain revisions, media attempts retain their selected route and inputs, and exports freeze timeline decisions. The Host enforces revision checks and project ownership for both forms and tools.

Media requests are persisted before submission. The OpenAI-compatible adapter uses `images/generations`, multipart `images/edits` with resolved image references, and binary `audio/speech`. DashScope uses `api/v1/services/aigc/video-generation/video-synthesis` followed by `api/v1/tasks/:taskId`; video uses an adopted first frame, and prompt rewriting is disabled. Completed media is copied into the configured private media directory, independent of expiring provider URLs.

The optional `jobs-v1` execution service accepts `POST v1/jobs` with `{requestId,kind,input}` and returns an accepted task or rejection. `GET v1/jobs/:taskId` or `GET v1/jobs/by-request/:requestId` returns its state; successful output identifies an artifact served by `GET v1/artifacts/:artifactId`. The adapter matches receipt identities, bounds responses and disables redirects. Provider-specific task acceptance remains uncertain when its receipt is lost; a configured credential or reachable endpoint does not establish generation success.

Archived files are served through the native authenticated connection with `GET`, `HEAD` and byte ranges for playback and seeking. Clients receive media identities and preview URLs, never filesystem paths. The configured FFmpeg/FFprobe executables render a frozen timeline and verify its frame count before an export enters history. The [bundle patch](cordis.patch.yml) owns encoder, output-format and I/O limits.

</details>

-----

<a id="further-exploration"></a>
## Further exploration

[Production plan and acceptance criteria](../../../dev-notes/short-drama-production-plan.md) · [OpenAI images](https://developers.openai.com/api/reference/resources/images/methods/generate) · [OpenAI speech](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create) · [DashScope video](https://www.alibabacloud.com/help/en/model-studio/text-to-video-api-reference)

-----

<a id="model-experience"></a>
## Model Experience

### Project writing and execution

#### What the model sees

Only the project's bound Session admits its short-drama tools, including `short_drama_read_script`. The Agent can read script and compact production context, write script/asset/shot candidates, submit configured execution and query existing attempts. Results contain revisions, catalogue identities and task states. Human adoption remains in the workbench; generation receives the saved creative inputs without creating a replacement story or plan.

#### Token effect

Admitted tool definitions and requested project context contribute to model requests. Production summaries omit media bytes, provider URLs and credential settings; binary media remains in the execution and archive path.

#### KV Cache effect

Tool availability follows the project Session association. Creative edits and execution observations produce ordinary logged tool calls and results. Media polling and encoding do not add model requests by themselves.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Voice assets store creative definitions; they do not train or clone a person's voice. Speech uses the voice selected in the project's API configuration.
- Multi-track export requires a configured `melt` executable and an FFmpeg build with libass. These native components are deployment dependencies; transitions and waveform editing are not implemented.
- APIs differ in model availability, regional access and allowed durations. Task queries and output URLs may expire; archived outputs remain available, but a lost synchronous response cannot be reconstructed automatically.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Protocol fixtures validate execution and recovery separately from real encoder output. The production plan records live-service acceptance independently; successful fixture playback does not establish AI-generated image, video or speech quality.

</details>

The embedded editor shares authenticated project media and saved editing decisions across Web and Desktop. New multitrack edits store versioned video, audio and subtitle tracks separately from the legacy sequential timeline. Track placement uses project frames; source trimming uses a separate offset. Video original audio remains audible by default and can be muted, adjusted or detached into an independent audio track. Transcribed subtitles remain candidates until the user edits and confirms them; confirmation maps source times through the selected clip and retains a stable application identity across clients. Saving checks the production revision. Export freezes the complete edit under its delivery identity and uses MLT for picture composition and mixing, then FFmpeg/libass for final encoding and visible subtitles, with a separate SRT file. Legacy frozen exports still use their original sequential renderer. Failed saves retain the draft; failed renders do not publish partial media or overwrite earlier exports.

Preview keeps media elements alive across clip boundaries, preloads the next clip and holds the last decoded picture until the next picture is ready. Caption changes do not reload video; an intentional gap still stays empty.

Legacy node edits and retained drafts are upgraded without replacing clip identities, source snapshots, selection or undo history. Existing image drafts retain their static preview and are not treated as exportable video.

The node manager and resource list share one preview renderer: adopted images and videos use archived media, scripts show existing text, and unfinished, failed or unavailable media remain explicitly identified. Preview rendering does not generate images or change adoption.

The private creation entry is excluded from the sidebar workspace catalogue; only actual project workspaces and their conversations appear.

The creation surface follows native main-panel selection: opening another navigation page hides it while retaining its draft and mounted document. Its background is opaque and confined to the conversation content area.

Embedded Studio inherits resolved Host theme tokens and observes theme changes without replacing its project document or camera state. Home, canvas, screenplay workbench tabs, document controls and contextual panels share Host surface and text colors; the standalone preview retains its own theme control. Dialogs, menus, image controls and editing chrome use shared semantic colors with standalone fallbacks; video pixels, subtitle rendering and media overlays retain their content colors. The project header uses compact view tabs with an underline and pressed state to identify the active view. Node management, canvas controls and media captions share a compact desktop scale and Host-derived hover, selection and keyboard-focus colors; touch controls retain larger targets. Node-bound prompt editing uses a bounded, internally scrolling text area and a compact horizontally scrolling toolbar; expanding the prompt retains a viewport-relative height limit. The node toolbar keeps direct actions visible and wraps in narrow canvases. Prompt placement tries above, below and beside the node and reduces its height when space is limited. Canvas layers use a quiet floor, translucent groups, content cards and elevated floating controls. Unselected nodes have no visible outline; selection uses one neutral ring, while keyboard focus retains the Host focus color. Media pixels remain unchanged.

The node directory separates screenplay, native asset categories and shots, including legacy mixed category memberships. Empty previews retain the same card geometry as media, with centered state feedback. First-time native layouts place the script, grouped assets and shots in separate lanes; added nodes follow that layout until a user moves nodes. Existing layouts change only through the undoable arrange action.

Studio's new-project entry suppresses the underlying conversation headline rather than covering it with a background. Its compact creation card uses one editing surface, aligned parameter controls, and host theme text and panel colors; the wallpaper remains a separate host-owned layer.
