/**
 * LayoutController: the cross-plugin panel-action face behind ctx.layout.
 * Panel geometry and main-panel selection live in the root layout store;
 * the current-session selection lives with the runtime sessions service, and
 * the per-session active view dissolved into ui-conversation's session store
 * (its only consumer). What remains here is the contract other plugins'
 * apply worlds reach for panel transitions (main-panel selection and sidebar toggle,
 * right-panel show/hide from ui-sidebar-right) — writes stay inside the
 * store's declared action set, shared with the root registration.
 */
import type { BoundActions, HostObservable, SlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { createLayoutStore } from './stores.ts'

/** Identity shared by a sidebar panel entry and its main-slot occupant. */
export type MainPanelId = Branded<'MainPanelId'>

/** Product-owned presentation for the shared workspace action. */
export interface WorkspaceContextOptions {
  /** Localized primary action text, accessible name and tooltip. */
  readonly primaryActionLabel?: SlotLabel | undefined
  /** Workspace identities displayed by this product; omitted shows all matching workspaces. */
  readonly visibleWorkspaceIds?: readonly string[] | undefined
}

/** Root-scoped navigation state exposed to panel-aware components. */
export interface PanelInfo {
  /** Product whose workspace navigation currently owns the sidebar. */
  readonly workspaceContext?: string | undefined
  /** Registered launcher which owns the current product workspace, while Conversation remains visible. */
  readonly workspacePanelId?: MainPanelId | undefined
  /** Product-owned label shared by the workspace and titlebar primary action. */
  readonly primaryActionLabel?: SlotLabel | undefined
  /** Workspace identities displayed by this product; omitted shows all matching workspaces. */
  readonly visibleWorkspaceIds?: readonly string[] | undefined
  /** Selected global panel; null displays the current Conversation. */
  readonly activePanelId: MainPanelId | null
}

/** The layout store's bound action set (framework-baked, draft params peeled). */
export type PanelActions = BoundActions<ReturnType<typeof createLayoutStore>>

/** Panel navigation and geometry actions exposed through ctx.layout. */
export interface ILayout {
  /**
   * Select a product workspace context without changing the visible main panel.
   * @param context - Product identity; undefined restores ordinary navigation.
   * @param panelId - Optional registered launcher which owns this workspace.
   * @param options - Product-owned presentation; omitted properties restore the ordinary action label.
   */
  setWorkspaceContext(context: string | undefined, panelId?: MainPanelId, options?: WorkspaceContextOptions): void
  /** Selected central panel from the same root store used by `usePanelInfo`. */
  readonly panelInfo: HostObservable<PanelInfo>
  /**
   * Select a global central panel without changing the current Session.
   * @param panelId - registered main key, or null to show the Conversation.
   * @throws if the selected main key is not registered; preserves the current selection.
   */
  selectPanel(panelId: MainPanelId | null): void
  /**
   * Start an asynchronous navigation, superseding any earlier pending navigation.
   * @returns a signal aborted by the next navigation or layout disposal; check it before committing UI state.
   */
  beginNavigation(): AbortSignal
  /** Toggle the workspace pane while retaining its expanded width. */
  toggleSidebar(): void
  /**
   * Report the right panel's presentation without changing its expanded state.
   * @param track - whether the normal panel width reserves a grid track,
   *   including beneath a fullscreen overlay.
   * @param fullscreen - whether the panel covers the frame and hides its outer
   *   resize handle; independent of the underlying grid track.
   */
  openRightbar(track: boolean, fullscreen: boolean): void
  /** Report the right panel as hidden: no track, no handle. */
  closeRightbar(): void
}

/** Cross-plugin panel-action face (ctx.layout). */
export class LayoutController implements ILayout {
  private navigation = new AbortController()

  /**
   * @param panels - actions of the instance shared with the root entry.
   * @param hasMainPanel - checks the live main-slot registry for a panel id.
   * @param panelInfo - root store's shared central-panel selection source.
   */
  constructor(
    private readonly panels: PanelActions,
    private readonly hasMainPanel: (id: MainPanelId) => boolean,
    readonly panelInfo: HostObservable<PanelInfo>,
  ) {}

  /**
   * @param context - Product workspace context, or undefined for home.
   * @param panelId - Registered product launcher; omitted contexts ignore it.
   * @param options - Product-owned primary action presentation.
   */
  setWorkspaceContext(context: string | undefined, panelId?: MainPanelId, options?: WorkspaceContextOptions): void {
    if (context !== undefined && panelId !== undefined && !this.hasMainPanel(panelId)) {
      throw new Error(`layout.setWorkspaceContext: main panel "${panelId}" is not registered`)
    }
    this.panels.setWorkspaceContext(context, panelId, options)
  }

  /** Select a global panel or return to the Conversation. */
  selectPanel(panelId: MainPanelId | null): void {
    if (panelId !== null && !this.hasMainPanel(panelId)) {
      throw new Error(`layout.selectPanel: main panel "${panelId}" is not registered`)
    }
    this.navigation.abort()
    this.panels.selectPanel(panelId)
  }

  /** @returns the new pending navigation's cancellation signal. */
  beginNavigation(): AbortSignal {
    this.navigation.abort()
    this.navigation = new AbortController()
    return this.navigation.signal
  }

  /** Invalidate pending navigations when the layout owner is unloaded. */
  dispose(): void {
    this.navigation.abort()
  }

  /** Toggle the workspace pane while retaining its expanded width. */
  toggleSidebar(): void {
    this.panels.toggleSidebar()
  }

  /** Report the right panel's track and fullscreen presentation. */
  openRightbar(track: boolean, fullscreen: boolean): void {
    this.panels.openRightbar(track, fullscreen)
  }

  /** Report the right panel as hidden: no track, no handle. */
  closeRightbar(): void {
    this.panels.closeRightbar()
  }
}
