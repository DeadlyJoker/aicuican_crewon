---
description: "Add interactive charts and persistent forms to native conversation messages."
kind: "package-bundle"
---

# Interactive UI

English | [中文](README.zh.md)

## Summary

Enable this optional bundle to show charts and fillable forms inside conversation messages. The assistant chooses cards when useful, and `/interactive-ui` explicitly requests one. Form drafts and submitted results survive reopening. Native approvals continue to control consequential tool calls.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Enable **Interactive UI** in Plugins. The localized `/interactive-ui` command is available in the composer menu. Submit a form to send its frozen values to the conversation or office member that originally requested them. Existing unsent composer text is retained.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The bundle contributes a chat message-body renderer. `CrewonForm` accepts text, number, textarea, select and checkbox fields. Read-only bar, line and pie charts use the pinned GenUI runtime through a same-origin route. Unsupported schemas display a regeneration message. Forms execute no model-authored JavaScript.

The active profile's `interactive-ui.sqlite` retains form edits. Submission freezes values and the original destination before native session admission; concurrent clicks share one operation and retries retain its request identity. Completed forms stay read-only after reopening or restarting. Native approvals remain responsible for consequential tools.

The Host requires systemPrompt, webServer, profileContext, sessionController, commands and typert. Exact APIs are recorded in the [CrewON service reference](../../../docs/subsystems/crewon.md).

</details>

<a id="model-experience"></a>
## Model Experience

### Card authoring

#### What the model sees

The authoring section describes `schemaJson` blocks and when to use cards. The assistant receives submitted form values through ordinary native conversation admission. Charts display supplied data; example measurements must be labeled explicitly. Ordinary Markdown and native tool traces retain their existing renderers.

#### Token effect

Authoring instructions and submitted values contribute to model requests. Rendering cards itself makes no model call.

#### KV Cache effect

Enabling the bundle adds its authoring instructions to subsequent requests. Submitted form values enter ordinary conversation history.

## Known Limitations and Deferred Work

- Unsupported schemas require regeneration. Charts are read-only, and forms support only the listed field types. The bundle does not grant new tool permissions or execute arbitrary model-authored JavaScript.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The pinned chart runtime and its upstream attribution remain owned by the package dependency and source metadata.

</details>

Forms retain an opaque theme foundation beneath wallpaper-adjusted surface colors. Inputs use the same theme palette without inheriting wallpaper transparency; draft persistence and submission are unchanged.

Charts use the upstream OpenTiny JSON repairer for partial streaming data, then pass the same read-only schema checks. Host dark-mode changes update chart options without modifying persisted content. Forms remain strict and noninteractive until their complete schema validates.

Inline charts use a 240px plot and cards cap their width at 640px. Compact form controls keep the same saved values and submission state.

Submitted forms render as compact read-only label/value results; drafts retain editable controls and autosave.
