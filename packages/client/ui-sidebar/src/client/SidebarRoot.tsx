/** Fixed plugin navigation and a collapsible workspace pane with shared native slots. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  IconAppsAddOutlineRegular, IconNewChatOutlineMedium,
  IconPanelLeftOutlineRegular, focusWithoutRing, isBehindModal, isDarwinDesktop, Menu, ShortcutKeys, Toast,
  ReferenceIconRegular, Tooltip, useModalLayer, writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRenderFactories, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type { PanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {
  SidebarPanelActionsOwnerProps, SidebarPanelMetadata, SidebarRootComponentProps, SidebarRootInjected, SidebarSectionHookContext,
} from './contract/slots.ts'
import { FIXED_PANEL_ID } from './panel-pins.ts'
import { createScrollHandoff } from './scroll-handoff.ts'
import css from './SidebarRoot.module.css'

/**
 * How long the column's scrollbars stay drawn after the pointer leaves it.
 * The bar is a pointer affordance here, and hiding it on the leave event
 * itself makes it blink out while the pointer is only crossing the column's
 * edge — on the way to the conversation, or around a portalled menu.
 */
const SCROLLBAR_LINGER_MS = 2000

/** Format complete-build metadata for the local brand badge. */
function localBuildVersion(): string | undefined {
  const version = process.env.DSH_CLIENT_VERSION
  if (version === undefined) return undefined
  const commit = process.env.DSH_CLIENT_COMMIT_HASH
  return version
    + (commit === undefined ? '' : `-${commit}`)
    + (process.env.DSH_CLIENT_GIT_DIRTY === 'true' ? '-dirty' : '')
}

type PanelRowProps =
  Pick<SidebarPanelMetadata, 'id' | 'label'>
  & Pick<PropsRuntime<'sidebar'>, 'usePanelInfo'>
  & Pick<InjectFace<SidebarRootInjected>, 'selectPanel' | 'trackEntryClick'>
  & PropsRenderFactories

/** Analytics category of an official panel; other panels are never reported. */
function officialEntry(id: string): 'plugin' | 'cron' | undefined {
  if (id === 'plugins') return 'plugin'
  return id === 'schedules' ? 'cron' : undefined
}

/** Resolve the selected launcher independently of the visible Conversation. */
function navigationPanelId(info: PanelInfo) {
  return info.activePanelId ?? (info.workspaceContext === undefined ? null : info.workspacePanelId ?? null)
}

/** Each panel row subscribes only to its own selection state. */
function PanelRow({
  id, label, usePanelInfo, selectPanel, trackEntryClick, renderFactorySlot,
}: PanelRowProps) {
  const active = usePanelInfo(info => navigationPanelId(info) === id)
  return (
    <div className={clsx(css.panelEntry, active && css.panelEntryActive)}>
      <Tooltip label={label} delayMs={500} portal>
        <button
          type="button"
          className={css.panelRow}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          onClick={() => {
            const entry = officialEntry(id)
            if (entry !== undefined) trackEntryClick({ menu_name: entry, position: 'sidebar' })
            selectPanel(id)
          }}
        >
          <span className={css.panelGlyph} aria-hidden="true">
            {renderFactorySlot('sidebar.panel.icon', { id, size: 18, active })}
          </span>
        </button>
      </Tooltip>
    </div>
  )
}

type PanelMoreMenuProps =
  Omit<SidebarPanelActionsOwnerProps, 'onDismiss'>
  & PropsRenderSlots<'sidebar.panellist.actions'>
  & Pick<InjectFace<SidebarRootInjected>, 'trackEntryClick'>
  & { readonly label: string }

/** The panel list's More launcher: a panel-row button whose menu rows come from `sidebar.panellist.actions`. */
function PanelMoreMenu({ label, entries, onOpen, onPinnedChange, trackEntryClick, renderSlot }: PanelMoreMenuProps) {
  const [open, setOpen] = useState(false)
  const onDismiss = (): void => { setOpen(false) }
  return (
    <Menu open={open} onClose={onDismiss} portal autoFocus className={css.moreAnchor} listClassName={css.moreMenu}
      anchor={(
        <Tooltip label={label} delayMs={500} portal>
          <button type="button" className={css.panelRow} aria-label={label} aria-haspopup="menu" aria-expanded={open}
            onClick={() => {
              trackEntryClick({ menu_name: 'more', position: 'sidebar' })
              setOpen(value => !value)
            }}>
            <span className={css.panelGlyph} aria-hidden="true"><IconAppsAddOutlineRegular size={18} /></span>
          </button>
        </Tooltip>
      )}>
      {renderSlot('sidebar.panellist.actions', { entries, onOpen, onPinnedChange, onDismiss })}
    </Menu>
  )
}

/**
 * Render the sidebar column shell.
 * @param props - composed slot props (runtime share + injected callbacks, contract/slots.ts).
 * @returns the sidebar element tree.
 */
export function SidebarRoot({
  collapsed,
  width,
  drawer,
  startSession,
  toggleSidebar,
  selectPanel,
  setPinned,
  trackEntryClick,
  useRemoteAccess,
  usePanels,
  useEntryPins,
  useEntryActions,
  useShortcuts,
  usePanelInfo,
  t,
  renderSlot,
  renderFactorySlot,
}: SidebarRootComponentProps) {
  const panels = usePanels(snapshot => snapshot)
  const unpinned = useEntryPins(ids => ids)
  const activeNavigationId = usePanelInfo(navigationPanelId)
  const primaryActionLabel = resolveSlotLabel(usePanelInfo(info => info.primaryActionLabel))
  const hasEntryActions = useEntryActions(registered => registered)
  const shortcut = useShortcuts(rows => rows.find(row => row.id === 'sidebar.left.toggle'))
  const newShortcut = useShortcuts(rows => rows.find(row => row.id === 'session.new'))
  // A page whose access snapshot excludes starting a Session offers no New Session affordance.
  const canStartSession = useRemoteAccess('session/create')
  const toggleLabel = collapsed ? t('toggle.open') : t('toggle.collapse')
  const wide = drawer || !collapsed
  const darwinDesktop = isDarwinDesktop()
  const windowActions = darwinDesktop && wide && !drawer
  const windowsTitlebar = document.documentElement.hasAttribute('data-windows-titlebar')
  const [scrollHandoff] = useState(createScrollHandoff)
  const sectionHookContext = useMemo<SidebarSectionHookContext>(
    () => ({ useSectionScroller: scrollHandoff.useSectionScroller }), [scrollHandoff],
  )
  const openNewSession = (): void => {
    trackEntryClick({ menu_name: 'new_session', position: 'sidebar' })
    startSession()
  }
  const lastWideWidth = useRef(width)
  if (wide) lastWideWidth.current = width
  const workspacePane = useRef<HTMLDivElement>(null)

  // Scrollbars in the column follow the pointer (.quietBars rebinds them
  // away): drawn while it is inside, and for SCROLLBAR_LINGER_MS after it
  // leaves. A pointer that returns within that window cancels the pending
  // hide rather than restarting from a hidden bar.
  const column = useRef<HTMLDivElement>(null)
  const sidebarFocus = useRef<Element | null>(null)
  useModalLayer(column, drawer && !collapsed, toggleSidebar)
  useLayoutEffect(() => {
    const previous = sidebarFocus.current
    const movedToggle = previous?.hasAttribute('data-sidebar-toggle') && !previous.isConnected
      && document.activeElement === document.body
    if (movedToggle) {
      const toggle = column.current?.querySelector<HTMLElement>('[data-sidebar-toggle]')
      if (toggle != null && !isBehindModal(toggle)) focusWithoutRing(toggle, { preventScroll: true })
      return
    }
    if (!collapsed) return
    const windowActionWasFocused = previous?.closest('[data-sidebar-window-actions]') != null
    if (!drawer && (previous === null || !workspacePane.current?.contains(previous)) && !windowActionWasFocused) return
    const controlled = previous?.getAttribute('aria-controls')?.split(/\s+/) ?? []
    const ownsMenuFocus = controlled.some(id => document.getElementById(id)?.contains(document.activeElement))
    if (previous !== document.activeElement && !ownsMenuFocus
      && !(windowActionWasFocused && document.activeElement === document.body)) return
    const opener = drawer
      ? column.current?.ownerDocument.querySelector<HTMLElement>('[data-sidebar-opener]')
      : column.current?.querySelector<HTMLElement>('[data-sidebar-toggle]')
    if (opener != null && !isBehindModal(opener)) focusWithoutRing(opener, { preventScroll: true })
  }, [drawer, collapsed, windowActions])
  const [pointerInside, setPointerInside] = useState(false)
  const lingerTimer = useRef<number | undefined>(undefined)
  const armLinger = (): void => {
    if (lingerTimer.current !== undefined) return
    lingerTimer.current = window.setTimeout(() => {
      lingerTimer.current = undefined
      setPointerInside(false)
    }, SCROLLBAR_LINGER_MS)
  }
  const cancelLinger = (): void => {
    window.clearTimeout(lingerTimer.current)
    lingerTimer.current = undefined
  }
  // Leaving is decided by the column's BOX, not by DOM containment, and only
  // while the bars are drawn. ui-settings renders its full-viewport panel as a
  // fixed-position DESCENDANT of this column, so a pointer moved onto that
  // panel — or onto the conversation once it closes — fires no `pointerleave`
  // here, and the bars would stay drawn over a column nobody is pointing at.
  // The element's own leave stays as the one signal geometry cannot give: a
  // pointer that leaves the window emits no further moves.
  useEffect(() => {
    if (!pointerInside) return
    const onMove = (event: PointerEvent): void => {
      const rect = column.current?.getBoundingClientRect()
      /* v8 ignore next -- the listener only exists while the column is mounted and revealed. */
      if (rect === undefined) return
      const inside = event.clientX >= rect.left && event.clientX < rect.right
        && event.clientY >= rect.top && event.clientY < rect.bottom
      if (inside) cancelLinger()
      else armLinger()
    }
    document.addEventListener('pointermove', onMove)
    return () => {
      document.removeEventListener('pointermove', onMove)
      cancelLinger()
    }
  }, [pointerInside])

  const buildVersion = localBuildVersion()
  // Each successful copy bumps the key so a repeated copy replays the toast.
  const [copiedToast, setCopiedToast] = useState<number | null>(null)
  const copyVersion = (version: string) => (): void => {
    void writeClipboard(version).then((ok) => {
      if (ok) setCopiedToast(seq => (seq ?? 0) + 1)
    })
  }

  const brandFallback = buildVersion === undefined
    ? <span className={css.fallbackBrandName}>{t('brand.localBuild')}</span>
    : <button className={css.localBuildBrand} type="button" onClick={copyVersion(buildVersion)}
      aria-label={`${t('brand.localBuild')} ${buildVersion}`}>
      <span className={css.localBuildTitle}>{t('brand.localBuild')}</span>
    </button>

  const toggleControl = (
    <Tooltip label={toggleLabel} shortcutKeys={shortcut?.keys} delayMs={500} side={windowActions ? 'bottom' : 'right'} portal>
      <button data-sidebar-toggle data-modal-autofocus={drawer || undefined} type="button"
        className={clsx(css.iconButton, css.toggle)} aria-label={toggleLabel} aria-keyshortcuts={shortcut?.aria}
        onClick={() => { toggleSidebar() }}>
        <IconPanelLeftOutlineRegular size={windowActions ? 16 : 18} />
        {renderSlot('sidebar.toggle.badge', {})}
      </button>
    </Tooltip>
  )

  const chatActive = activeNavigationId === null
  const visiblePanels = panels.filter(({ id }) => id === FIXED_PANEL_ID || !hasEntryActions || !unpinned.includes(id))

  return (
    <div
      ref={column}
      onFocusCapture={(event) => { sidebarFocus.current = event.target }}
      role={drawer ? 'dialog' : undefined}
      data-shortcut-modal={drawer ? 'sidebar' : undefined}
      aria-modal={drawer && !collapsed ? true : undefined}
      aria-label={drawer ? t('navigation.label') : undefined}
      tabIndex={drawer ? -1 : undefined}
      data-window-controls={windowActions || undefined}
      className={clsx(css.root, !wide && css.collapsed, !pointerInside && css.quietBars)}
      onPointerEnter={() => {
        cancelLinger()
        setPointerInside(true)
      }}
      onPointerLeave={() => { armLinger() }}
    >
      {darwinDesktop && <div className={css.topStrip} data-window-drag>
        <div className={css.windowActions} data-sidebar-window-actions hidden={!windowActions}>
          {windowActions && toggleControl}
          {renderSlot('sidebar.chrome.actions', {})}
        </div>
      </div>}
      <div className={css.rail} data-sidebar-rail="">
        <Tooltip label={t('navigation.chat')} side="right" portal>
          <button type="button" className={clsx(css.chatHome, chatActive && css.chatHomeActive)}
            aria-label={t('navigation.chat')} aria-current={chatActive ? 'page' : undefined}
            onClick={() => {
              selectPanel(null)
              if (collapsed) toggleSidebar()
            }}>
            {renderSlot('sidebar.brand.mark', { size: 24 }, { fallback: <ReferenceIconRegular kind="session" size={20} /> })}
          </button>
        </Tooltip>
        {(visiblePanels.length > 0 || hasEntryActions) && <nav className={css.panelList} aria-label={t('panels.label')}>
          {visiblePanels.map(({ id, label }) => <PanelRow
            key={id} id={id} label={label}
            usePanelInfo={usePanelInfo} selectPanel={selectPanel}
            trackEntryClick={trackEntryClick} renderFactorySlot={renderFactorySlot}
          />)}
          {hasEntryActions && <PanelMoreMenu
            label={t('panels.more')}
            entries={panels.filter(({ id }) => id !== FIXED_PANEL_ID)
              .map(({ id, label }) => ({ id, label, pinned: !unpinned.includes(id), active: id === activeNavigationId }))}
            onOpen={(id) => {
              const entry = officialEntry(id)
              if (entry !== undefined) trackEntryClick({ menu_name: entry, position: 'sidebar_more' })
              const panel = panels.find(candidate => candidate.id === id)
              if (panel !== undefined) selectPanel(panel.id)
            }}
            onPinnedChange={setPinned} trackEntryClick={trackEntryClick} renderSlot={renderSlot}
          />}
        </nav>}
        <div className={css.footArea}>
          {!windowActions && toggleControl}
          <div className={css.footerActions}>{renderSlot('sidebar.footer.action', { wide: false })}</div>
          <div className={css.settingsArea}>{renderSlot('sidebar.settings', { wide: false })}</div>
        </div>
      </div>
      <div ref={workspacePane} className={css.workspacePane} data-sidebar-workspace-pane=""
        aria-hidden={!wide || undefined} {...(!wide ? { inert: '' } : {})}
        style={{ width: Math.max(0, lastWideWidth.current - 56) }}>
        <div className={css.logoRow} data-window-drag>
          <div className={css.brandName}>
            {renderSlot('sidebar.brand.name', {}, {
              fallback: buildVersion !== undefined
                ? <Tooltip label={buildVersion} side="bottom" delayMs={500} portal>{brandFallback}</Tooltip>
                : brandFallback,
            })}
          </div>
        </div>
        {canStartSession && <Tooltip label={primaryActionLabel ?? t('session.new.label')} shortcutKeys={newShortcut?.keys}
          disabled={wide} delayMs={500} side={windowsTitlebar ? 'bottom' : 'right'}>
          <button type="button" className={css.newSession} aria-label={primaryActionLabel ?? t('session.new.label')}
            aria-keyshortcuts={newShortcut?.aria} onClick={openNewSession}>
            <span className={css.newSessionContent}>
              <IconNewChatOutlineMedium size={16} /><span className={css.newSessionLabel}>{primaryActionLabel ?? t('session.new')}</span>
            </span>
            {newShortcut !== undefined && newShortcut.keys.length > 0 && <span className={css.newSessionShortcut} aria-hidden="true">
              <ShortcutKeys keys={newShortcut.keys} />
            </span>}
          </button>
        </Tooltip>}
        <div className={css.scrollRegion}>
          <div ref={scrollHandoff.bindViewportRef} className={css.scrollArea} data-sidebar-scrollport="">
            <div className={css.regionArea}>
              {renderSlot('sidebar.workspaces', {
                wide, expandSidebar: () => { if (collapsed) toggleSidebar() },
              }, { hookContext: sectionHookContext })}
            </div>
          </div>
        </div>
      </div>
      {copiedToast !== null && <Toast key={copiedToast} tone="success" text={t('version.copied')}
        onDone={() => { setCopiedToast(null) }} />}
    </div>
  )
}
