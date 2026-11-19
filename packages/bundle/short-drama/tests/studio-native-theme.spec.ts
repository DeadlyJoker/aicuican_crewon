/** Embedded theme changes retain project state and use arbitrary resolved host colors. */
import { readFileSync, readdirSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

const source = readFileSync(new URL('../studio/native-theme.js', import.meta.url), 'utf8')

it('inherits custom tokens, updates live and releases host observers on page exit', () => {
  let dark = false, change: (() => void) | undefined, exit: (() => void) | undefined
  const tokens = new Map([['--dsw-alias-bg-base', '#faf8f0'], ['--dsw-alias-label-primary', '#243021']])
  const copied = new Map<string, string>(), dataset: Record<string, string> = {}
  let scheduled: (() => void) | undefined
  const disconnect = vi.fn(), remove = vi.fn(), toggle = vi.fn()
  const document = { querySelector: () => null, documentElement: { dataset }, body: { toggleAttribute: toggle,
    style: { getPropertyValue: (key: string) => copied.get(key) ?? '', setProperty: (key: string, value: string) => copied.set(key, value) } } }
  const parent = { document: { documentElement: {}, head: {}, body: { hasAttribute: () => dark } },
    getComputedStyle: () => Object.assign([...tokens.keys()], { getPropertyValue: (key: string) => tokens.get(key) }),
    matchMedia: () => ({ addEventListener: vi.fn(), removeEventListener: remove }) }
  const context = { parent, document, window: { addEventListener: (_event: string, callback: () => void) => { exit = callback } },
    MutationObserver: class { constructor(callback: () => void) { change ??= callback } observe() {} disconnect = disconnect },
    requestAnimationFrame: (callback: () => void) => { scheduled = callback; return 1 }, cancelAnimationFrame: vi.fn() }
  runInNewContext(source, context)
  expect(dataset.theme).toBe('light')
  expect(copied.get('--dsw-alias-bg-base')).toBe('#faf8f0')
  dark = true
  tokens.set('--dsw-alias-bg-base', '#102030')
  change!()
  scheduled!()
  expect(dataset.theme).toBe('dark')
  expect(copied.get('--dsw-alias-bg-base')).toBe('#102030')
  runInNewContext('studioNativeApplyTheme()', context)
  expect(dataset.theme).toBe('dark')
  dark = false
  tokens.set('--dsw-alias-bg-base', '#f0f4ff')
  change!()
  scheduled!()
  expect(dataset.theme).toBe('light')
  expect(copied.get('--dsw-alias-bg-base')).toBe('#f0f4ff')
  exit!()
  expect(disconnect).toHaveBeenCalledTimes(2)
  expect(remove).toHaveBeenCalledOnce()
})

it('leaves standalone theme selection untouched', () => {
  const window = {}
  runInNewContext(source, { parent: window, window })
})


it('resolves every shared chrome color while keeping media and subtitle colors independent', () => {
  const directory = new URL('../studio/', import.meta.url)
  const native = readFileSync(new URL('native-theme.css', directory), 'utf8')
  const definitions = new Set([...native.matchAll(/(--studio-chrome-[a-z-]+):/g)].map(match => match[1]))
  const sheets = readdirSync(directory).filter(name => name.endsWith('.css'))
  for (const sheet of sheets) {
    const css = readFileSync(new URL(sheet, directory), 'utf8')
    for (const match of css.matchAll(/var\((--studio-chrome-[a-z-]+)/g)) {
      expect(definitions.has(match[1]), `${sheet}: ${match[1]}`).toBe(true)
    }
  }
  const tracks = readFileSync(new URL('native-multitrack.css', directory), 'utf8')
  expect(tracks.match(/\.native-edit-preview\{([^}]+)\}/)?.[1]).toBe('background:#000')
  const subtitle = tracks.match(/\.native-edit-caption\{([^}]+)\}/)?.[1]
  expect(subtitle).toContain('color:#fff')
  expect(subtitle).not.toContain('--studio-chrome-')
})


it('fits a model menu below the canvas header and within narrow windows', () => {
  const models = readFileSync(new URL('../studio/reference-asset-models.js', import.meta.url), 'utf8')
  const start = models.indexOf('function referenceImageModelMenuLayout(')
  const end = models.indexOf('function referencePositionAssetModels()', start)
  const context = { rect: { top: 360, bottom: 396, left: 240 } }
  const above = runInNewContext(models.slice(start, end) + ';referenceImageModelMenuLayout(rect,320,440,72)',
    context) as { top: number; left: number; width: number; height: number }
  expect(above.top).toBeGreaterThanOrEqual(72)
  expect(above.top + above.height).toBeLessThanOrEqual(360)
  expect(above.left + above.width).toBeLessThanOrEqual(308)
  const below = runInNewContext(models.slice(start, end) + ';referenceImageModelMenuLayout(rect,1280,900,72)',
    context) as { top: number; left: number; width: number; height: number }
  expect(below.top).toBeGreaterThan(context.rect.bottom)
  expect(below.top + below.height).toBeLessThanOrEqual(888)
})
