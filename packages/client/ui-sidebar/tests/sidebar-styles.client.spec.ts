/** Sidebar shell style contracts shared with its slot-owned controls. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const layoutCss = readFileSync(fileURLToPath(new URL('../../ui-layout/src/client/AppFrame.module.css', import.meta.url)), 'utf8')
const css = readFileSync(fileURLToPath(new URL('../src/client/SidebarRoot.module.css', import.meta.url)), 'utf8')

/**
 * Declarations of one exact selector, keyed by property.
 * @param selector - exact selector text.
 * @returns the normalized declarations, or undefined when absent.
 */
function declarations(selector: string): Map<string, string> | undefined {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const found = new Map<string, string>()
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
  }
  return found.size === 0 ? undefined : found
}

describe('SidebarRoot.module.css', () => {
  it('places native toolbar actions beyond traffic lights without shrinking their targets', () => {
    const toggle = declarations('.windowActions .toggle')
    expect(declarations('.windowActions')?.get('top')).toBe('10px')
    expect(toggle?.get('width')).toBe('28px')
    expect(toggle?.get('height')).toBe('28px')
    expect(toggle?.get('-webkit-app-region')).toBe('no-drag')
    expect(declarations('.windowActions')?.get('left')).toBe('88px')
    expect(declarations('.windowActions[hidden]')?.get('display')).toBe('none')
  })

  it('uses one opaque theme surface for the macOS sidebar', () => {
    const rule = layoutCss.split(":global([data-platform='darwin']) .frame:not([data-sidebar-drawer]) .sidebarCol {")[1]?.split('}')[0]
    expect(rule).toContain('background: var(--dsw-specific-sidebar-fill);')
    expect(rule).not.toContain('gradient')
    expect(layoutCss).not.toContain('prefers-reduced-transparency')
  })

  it('keeps the workspace pane on the shared navigation surface without an inset card', () => {
    const pane = declarations('.workspacePane')
    expect(pane?.get('background')).toBe('transparent')
    expect(pane?.has('border')).toBe(false)
    expect(pane?.has('border-radius')).toBe(false)
    expect(pane?.has('margin-block')).toBe(false)
  })

  it('keeps the navigation rail fixed while the workspace pane consumes its saved width', () => {
    expect(declarations('.root')?.get('display')).toBe('flex')
    expect(declarations('.root')?.get('overflow')).toBe('hidden')
    expect(declarations('.rail')?.get('flex')).toBe('0 0 56px')
    expect(declarations('.rail')?.get('width')).toBe('56px')
    expect(declarations('.workspacePane')?.get('flex')).toBe('none')
    expect(declarations('.workspacePane')?.get('min-width')).toBe('0')
  })

  it('uses uniform icon targets for conversation, plugin entries, and rail actions', () => {
    for (const selector of ['.chatHome', '.iconButton', '.panelRow']) {
      const row = declarations(selector)
      expect(row?.get('width')).toBe('40px')
      expect(row?.get('height')).toBe('40px')
      expect(row?.get('flex')).toBe('none')
      expect(row?.get('padding')).toBe('0')
    }
    expect(declarations('.panelList')?.get('gap')).toBe('6px')
    expect(declarations('.panelList')?.get('overflow-y')).toBe('auto')
    expect(declarations('.footArea')?.get('flex')).toBe('none')
    expect(declarations('.footArea')?.get('margin-top')).toBe('auto')
  })

  it('retains the hidden workspace pane without accepting pointer interaction', () => {
    const hidden = declarations('.collapsed .workspacePane')
    expect(hidden?.get('visibility')).toBe('hidden')
    expect(hidden?.get('pointer-events')).toBe('none')
    expect(hidden?.get('display')).toBeUndefined()
    expect(hidden?.get('width')).toBeUndefined()
  })

  it('gives workspaces a bounded scrollport separate from rail navigation', () => {
    expect(declarations('.root')?.get('--dsh-sidebar-row-padding')).toBe('12px')
    expect(declarations('.root')?.get('--dsh-sidebar-label-gap')).toBe('6px')
    expect(declarations('.root')?.get('--dsh-sidebar-paint-inset')).toBe('3px')
    for (const selector of ['.workspacePane', '.scrollRegion', '.scrollArea', '.regionArea']) {
      expect(declarations(selector)?.get('min-height')).toBe('0')
    }
    expect(declarations('.scrollRegion')?.get('container-type')).toBe('size')
    expect(declarations('.scrollArea')?.get('overflow-y')).toBe('auto')
    expect(declarations('.scrollArea')?.get('overflow-x')).toBe('hidden')
    expect(declarations('.scrollArea')?.get('container-type')).toBe('scroll-state')
    expect(declarations('.scrollArea')?.get('scrollbar-width')).toBe('none')
    expect(declarations('.scrollArea::-webkit-scrollbar')?.get('display')).toBe('none')
  })

  it('truncates pane labels while preserving fixed shortcut and icon space', () => {
    for (const selector of ['.fallbackBrandName', '.localBuildTitle', '.newSessionLabel']) {
      expect(declarations(selector)?.get('overflow')).toBe('hidden')
      expect(declarations(selector)?.get('text-overflow')).toBe('ellipsis')
      expect(declarations(selector)?.get('white-space')).toBe('nowrap')
    }
    expect(declarations('.newSessionShortcut')?.get('flex')).toBe('none')
    expect(declarations('.newSessionContent svg')?.get('flex')).toBe('none')
    expect(declarations('.newSession')?.get('min-width')).toBe('0')
    expect(declarations('.newSession')?.get('min-height')).toBe('40px')
  })

  it('reserves the macOS window drag strip without moving permanent controls into it', () => {
    expect(declarations('.topStrip')?.get('position')).toBe('absolute')
    expect(declarations('.topStrip')?.get('height')).toBe('48px')
    expect(declarations(":global([data-platform='darwin']) .root")?.get('padding-top')).toBe('48px')
    expect(declarations('.rail')?.get('padding')).toBe('12px 8px 10px')
    expect(declarations('.workspacePane')?.get('padding')).toBe('12px 12px 8px')
  })

  it('aligns the compact brand and new-session row across desktop and Web', () => {
    expect(declarations('.logoRow')?.get('padding-inline')).toBe('12px')
    expect(declarations('.logoRow')?.get('min-height')).toBe('40px')
    expect(declarations('.logoRow')?.get('margin-bottom')).toBe('8px')
    expect(declarations('.brandName')?.get('font-size')).toBe('18px')
    expect(declarations('.newSession')?.get('margin-bottom')).toBe('12px')
  })
})
