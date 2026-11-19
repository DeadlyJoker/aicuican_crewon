---
description: "Sidebar shell plugin for the dsh web client with a permanent navigation rail, collapsible Workspace pane, and plugin-provided navigation and settings."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar

English | [中文](README.zh.md)

Desktop product events use the optional [product analytics service](../product-analytics/README.md); ordinary Web interactions are excluded.

## Summary

The sidebar combines a permanent 56px navigation rail with a collapsible Workspace and Session pane. The rail provides conversation navigation, plugin panels, More, the pane toggle, footer actions, and Settings. The pane contains the brand name, New Session, and the plugin-provided Workspace browser. Switching panels or folding the pane retains the mounted browser and its viewing state.

Workspace occupants may pass a context key to `useSectionScroller` to retain independent section and outer viewport scroll positions. The native home action uses the `sidebar/return-home` waterfall so an active product can restore its saved home selection without replacing the navigation UI.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The rail remains available beside the main page while the Workspace pane is expanded or collapsed. Its conversation button returns to the current conversation and expands a collapsed pane. Feature plugins supply the existing seats. ui-workspace fills `sidebar.workspaces`, and ui-settings registers the trigger and settings panel at `sidebar.settings`.

When ui-layout uses a narrow-screen drawer, the sidebar keeps its expanded content mounted. The drawer initially focuses its toggle, traps keyboard focus, closes with Escape or a mask press, and restores the invoking control unless a foreground dialog remains open. Folding a desktop pane moves its focused control to the rail toggle. Closing a drawer moves sidebar focus to the header opener, including focus in a global menu identified by a sidebar control's `aria-controls`. Opening a drawer overlays the main page.

### Brand and New Session

`sidebar.brand.mark` fills the conversation button at the top of the rail. `sidebar.brand.name` fills the Workspace pane's brand row. Both remain independent single slots. Their fallbacks are the conversation icon and the CrewON label. The single-line brand aligns with the New Session control and Workspace heading. A complete build exposes `version[-commit][-dirty]` in a hover tooltip, using `DSH_CLIENT_VERSION`, optional `DSH_CLIENT_COMMIT_HASH`, and `DSH_CLIENT_GIT_DIRTY=true`. The fallback version button copies that text and shows a toast after a successful write. Missing version metadata omits the version button.

New Session has a dedicated button below the pane's brand row. It uses the explicit Workspace supplied by a scoped action, then the current Session's Workspace, then the most recently active Workspace. If none exists, it opens the blank New Session page. Its effective shortcut appears as trailing text on keyboard focus and, for devices with hover, on hover. Long labels truncate while the shortcut retains its space. Tooltips use platform-formatted keycaps, and bound controls expose `aria-keyshortcuts`. The button is absent while the access snapshot excludes `session/create`. The Host decides each create request.

An active product may supply `primaryActionLabel` through `layout.setWorkspaceContext(context, panelId, options)`. The sidebar button and Desktop titlebar action use that same label for visible text, accessible names, and tooltips. Locale-aware getters update with the active language. Clearing the product context restores the ordinary New Session label without changing the shared action callback.

### Global panel entries

Plugins register an icon component in the root-scoped `sidebar.panellist` list with an `id`, optional `order`, and a string or locale-aware `label`. The same id addresses the component in the layout's root-scoped `main` keyed slot. Selecting a missing main entry throws before selection changes. Labels supply accessible names and tooltips for the 40px icon buttons. Registered entries follow ascending order, with registration order breaking ties. Each button reads its selected state through `usePanelInfo`, independently of focus in search or a directory picker. A product may associate its workspace context with its registered launcher through `layout.setWorkspaceContext(context, panelId)`. While that product displays a Conversation, its launcher remains selected instead of the ordinary Conversation button. A selected global panel takes precedence; clearing the context restores ordinary navigation.

The rail shows More while `sidebar.panellist.actions` has registrations. Its menu receives `entries` containing customizable panels in registration order with `id`, `label`, `pinned`, and `active`, plus `onOpen(id)`, `onPinnedChange(id, pinned)`, and `onDismiss()`. Plugins is excluded from that list and always appears in the rail.

The default More menu lists all customizable panels. Each row opens its panel, and its separate pin toggle shows or hides that launcher in the rail. Pin choices are one in-memory list shared across Sessions. Opening a panel preserves its pin choice. Unpinning hides its launcher only while More is available. Without menu registrations, all registered launchers appear. Choices reset when this plugin reloads, and unregistered ids remain in memory until then. Panel registrations and current selection remain available independently of launcher visibility.

### Collapse behavior

On expanded macOS sidebars, the pane toggle sits beside the native window controls; folded sidebars, drawers, and other platforms keep it at the rail's foot above plugin footer actions and Settings. Its optional `sidebar.toggle.badge` occupant provides non-interactive status content. The sidebar and header toggle tooltips use the effective command shortcut. An unbound command shows the action label alone.

The Workspace pane keeps its last expanded width while the frame animates the containing column. Folding hides and clips the pane while retaining its DOM, child slots, and scroller bindings. Hidden content is inert and excluded from accessibility navigation. The rail's geometry stays fixed in both states. ui-layout owns responsive column sizing, drawer transitions, and reduced-motion behavior.

The rail and Workspace pane share one sidebar surface. The pane has no separate background, border, outer margin, or corner radius. macOS uses the same opaque theme color across the column, including the native window-control clearance.

### Desktop integration

Desktop layouts retain the navigation rail when the Workspace pane is folded. An expanded macOS sidebar places the toggle at x88 in its existing 48px native strip. The root-scoped `sidebar.chrome.actions` list seats plugin actions from x124; ui-workspace contributes the existing Session search. These actions are hidden while folded or displayed as a drawer. The toggle returns to the rail with keyboard focus restored. On macOS, a 48px top strip clears the traffic lights and is marked as a window drag region together with the brand row. The frame mounts this package's `HeaderLeadingControls` in `shell.leading` for its narrow-screen drawer opener. That control includes New Session when running in a Desktop host and access permits it. The [Desktop reference](../../../apps/desktop/README.md) owns native caption and window integration.

### Scrollbars

The rail's panel list and the pane's Workspace browser scroll independently. Toggle, footer actions, and Settings stay below the rail list. Brand and New Session stay above the Workspace browser. The shell draws column scrollbars while the pointer is inside and for two seconds after it leaves. ui-workspace reserves scrollbar space so this visibility change preserves row alignment.

### Click analytics

On Desktop, official navigation controls report `sidebar_menu_click` before acting. The optional analytics service receives `menu_name` and `position`.

- The pane's New Session button reports `menu_name=new_session` and `position=sidebar`. New Session in `shell.leading` reports `position=titlebar`.
- Plugins and Automation tasks report `menu_name=plugin` and `menu_name=cron` with `position=sidebar`.
- Every More button click reports `menu_name=more` and `position=sidebar`.
- More menu calls to `onOpen(id)` for Plugins or Automation tasks report `position=sidebar_more` before checking the registration. Pin changes emit no navigation click.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`SidebarRootComponentProps` composes the layout owner share, native hooks, child slots, and injected navigation callbacks. `sidebar.panel.icon` is the Component Factory for `sidebar.panellist`. Rail buttons and More menus reuse each registered icon through that factory. List registrations and locale changes supply panel metadata. The layout owns selection.

The root contains a fixed rail and one retained Workspace pane. It supplies `--dsh-sidebar-inline-padding: 12px`, `--dsh-sidebar-row-padding: 12px`, `--dsh-sidebar-label-gap: 6px`, and `--dsh-sidebar-paint-inset: 3px` for child alignment. The rail renders 40px buttons within its 56px width. Footer and Settings occupants always receive `wide: false`. The Workspace occupant receives the pane visibility as `wide` and an `expandSidebar` callback. The pane keeps its last expanded width, less the rail width, when clipped during collapse.

Only the Workspace pane's browsing area is inside `data-sidebar-scrollport`. It is a vertical viewport within a size container, and is itself a scroll-state container. `hookContext.useSectionScroller` supplies a stable `{ bindScrollerRef }` handle to the occupant. Wheel and trackpad input can cross from this viewport to the occupant's scroller in one gesture. Pinch zoom, predominantly horizontal gestures, and previously canceled events retain native handling. An occupant that binds no scroller uses native viewport scrolling. Global navigation remains in its separate rail list.

### Slot discipline

Declaration-aware `slots.inject()` supports replacing occupants regardless of activation order. Existing `sidebar.brand.mark`, `sidebar.brand.name`, `sidebar.workspaces`, `sidebar.settings`, `sidebar.footer.action`, and panel registrations retain their owner data. The `/client` entrypoint exposes the plugin body and contract types. SidebarRoot and row implementations remain package-internal.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

These pages cover the surfaces that fill the shell's seats and the composition model.

- [ui-workspace](../ui-workspace/README.md) — the Workspace and Session browser rendered into `sidebar.workspaces`.
- [ui-settings](../ui-settings/README.md) — the settings domain base registering the trigger row at `sidebar.settings`.
- [ui-layout](../ui-layout/README.md) — the layout owner whose rail and column state the collapse uses.
- [ui-theme](../ui-theme/README.md) — the scrollbar token indirection the shell rebinds.
- [Slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md) — the composition model behind the seats.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side UI plugin layer that registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define what the shell owns versus what its occupants own; they are current package constraints.

- **Session state-dot rendering is owned by ui-workspace** — no done/error notification sources are available to this shell.
- **Workspace browser behavior is composition-owned** — grouping, ordering, search, and row state belong to ui-workspace, not this shell.
- **"New task completed" unread marking is local viewing state** — completion-time > last-seen never reaches the host.
- **Touch drags retain native nested scrolling** — the viewport and Workspace scroller hand off through browser behavior. The JavaScript wheel hand-off runs on the main thread.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
