/** Palette derivation adapted from dsh-skins at d55e374897232a6c3a7ee8c595de74e280e0e126.
 * Copyright (c) 2026 zhu1090093659. BSD-3-Clause; see ../third-party/dsh-skins-LICENSE.
 * Only the pure palette generator is reused; no hooks, telemetry or artwork are loaded.
 */
/** Versioned user theme derived from the official stock theme. */


/** Four controls used by the fixed token generator. */
export interface CustomThemeProfile {
  /** Brand accent in hexadecimal sRGB. */
  accent: string
  /** Opaque content floor. */
  background: string
  /** Primary text color. */
  foreground: string
  /** Surface separation from 0 to 100. */
  contrast: number
}

/** Two palettes consumed together by the native theme override layer. */
export interface CustomThemeConfig {
  /** Generator version. */
  version: number
  /** Whether the caller applies the generated palette. */
  applied: boolean
  /** Light scheme palette. */
  light: CustomThemeProfile
  /** Dark scheme palette. */
  dark: CustomThemeProfile
}

/** Neutral paired defaults from the pinned upstream generator. */
export const CUSTOM_THEME_DEFAULTS: Readonly<CustomThemeConfig> = {
  version: 1,
  applied: false,
  light: {
    accent: '#4d6bfe',
    background: '#f7f8fa',
    foreground: '#262626',
    contrast: 50,
  },
  dark: {
    accent: '#7c91ff',
    background: '#171719',
    foreground: '#f3f3f3',
    contrast: 50,
  },
}

/** The complete token surface this feature may emit. */
const CUSTOM_THEME_ALLOWED_TOKENS = [
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-layer-3',
  '--dsw-alias-bg-multi-select',
  '--dsw-alias-bg-overlay',
  '--dsw-alias-bg-skeleton',
  '--dsw-alias-border-l1',
  '--dsw-alias-border-l2',
  '--dsw-alias-border-l3',
  '--dsw-alias-border-l4',
  '--dsw-alias-brand-primary',
  '--dsw-alias-brand-primary-invert',
  '--dsw-alias-brand-text',
  '--dsw-alias-button-primary-dimmed',
  '--dsw-alias-button-primary-fill',
  '--dsw-alias-button-primary-hover',
  '--dsw-alias-interactive-bg-active',
  '--dsw-alias-interactive-bg-hover',
  '--dsw-alias-interactive-bg-hover-accent',
  '--dsw-alias-label-dimmed',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-primary-foreground',
  '--dsw-alias-label-secondary',
  '--dsw-alias-label-tertiary',
  '--dsw-alias-markdown-code-block',
  '--dsw-alias-markdown-code-block-banner',
  '--dsw-alias-markdown-inline-code',
  '--dsw-alias-scrollbar-bg-l1',
  '--dsw-alias-scrollbar-hover-l1',
  '--dsw-alias-toast-bg',
  '--dsw-alias-tooltip-bg',
  '--dsw-specific-bubble',
  '--dsw-specific-bubble-highlight',
  '--dsw-specific-input-major',
  '--dsw-specific-menu',
  '--dsw-specific-selector',
  '--dsw-specific-sidebar-fill',
  '--dsw-specific-sidebar-nav-item-active',
  '--dsw-specific-sidebar-nav-item-active-accent',
] as const

function mix(a: string, aPercent: number, b: string): string {
  return `color-mix(in srgb, ${a} ${aPercent}%, ${b})`
}

function declarations(profile: CustomThemeProfile): Array<[typeof CUSTOM_THEME_ALLOWED_TOKENS[number], string]> {
  const { accent, background, foreground } = profile
  const depth1 = 2 + Math.round(profile.contrast * 0.12)
  const depth2 = depth1 + 4
  const depth3 = depth2 + 4
  const border = 12 + Math.round(profile.contrast * 0.18)
  const mutedText = 60 + Math.round(profile.contrast * 0.2)
  return [
    ['--dsw-alias-bg-base', background],
    ['--dsw-alias-bg-layer-1', mix(background, 100 - depth1, foreground)],
    ['--dsw-alias-bg-layer-2', mix(background, 100 - depth2, foreground)],
    ['--dsw-alias-bg-layer-3', mix(background, 100 - depth3, foreground)],
    ['--dsw-alias-bg-multi-select', mix(background, 84, accent)],
    ['--dsw-alias-bg-overlay', mix(background, 90 - Math.round(profile.contrast * 0.08), foreground)],
    ['--dsw-alias-bg-skeleton', mix(background, 82, foreground)],
    ['--dsw-alias-border-l1', mix(background, 100 - border, foreground)],
    ['--dsw-alias-border-l2', mix(background, 100 - Math.max(8, border - 5), foreground)],
    ['--dsw-alias-border-l3', mix(background, 100 - Math.max(5, border - 9), foreground)],
    ['--dsw-alias-border-l4', mix(background, 96, foreground)],
    ['--dsw-alias-brand-primary', accent],
    ['--dsw-alias-brand-primary-invert', background],
    ['--dsw-alias-brand-text', accent],
    ['--dsw-alias-button-primary-dimmed', mix(accent, 48, background)],
    ['--dsw-alias-button-primary-fill', accent],
    ['--dsw-alias-button-primary-hover', mix(accent, 82, foreground)],
    ['--dsw-alias-interactive-bg-active', mix(background, 78, accent)],
    ['--dsw-alias-interactive-bg-hover', mix(background, 100 - depth2, foreground)],
    ['--dsw-alias-interactive-bg-hover-accent', mix(background, 84, accent)],
    ['--dsw-alias-label-dimmed', mix(foreground, 42, background)],
    ['--dsw-alias-label-primary', foreground],
    ['--dsw-alias-label-primary-foreground', foreground],
    ['--dsw-alias-label-secondary', mix(foreground, mutedText, background)],
    ['--dsw-alias-label-tertiary', mix(foreground, Math.max(45, mutedText - 18), background)],
    ['--dsw-alias-markdown-code-block', mix(background, 100 - depth2, foreground)],
    ['--dsw-alias-markdown-code-block-banner', mix(background, 100 - depth3, foreground)],
    ['--dsw-alias-markdown-inline-code', mix(background, 86, accent)],
    ['--dsw-alias-scrollbar-bg-l1', mix(background, 94, foreground)],
    ['--dsw-alias-scrollbar-hover-l1', mix(background, 76, foreground)],
    ['--dsw-alias-toast-bg', mix(background, 100 - depth3, foreground)],
    ['--dsw-alias-tooltip-bg', mix(background, 28, foreground)],
    ['--dsw-specific-bubble', mix(background, 92, accent)],
    ['--dsw-specific-bubble-highlight', mix(background, 82, accent)],
    ['--dsw-specific-input-major', mix(background, 100 - depth1, foreground)],
    ['--dsw-specific-menu', mix(background, 100 - depth1, foreground)],
    ['--dsw-specific-selector', mix(background, 100 - depth2, foreground)],
    ['--dsw-specific-sidebar-fill', mix(background, 100 - depth1, foreground)],
    ['--dsw-specific-sidebar-nav-item-active', mix(background, 86, accent)],
    ['--dsw-specific-sidebar-nav-item-active-accent', accent],
  ]
}

/** Derive paired alias tokens for the native theme override service.
 * @param value Validated light and dark palette configuration.
 * @returns Fixed token names with one value per color scheme.
 */
export function customThemeTokenOverrides(value: CustomThemeConfig): Record<string, { light: string; dark: string }> {
  const light = Object.fromEntries(declarations(value.light)) as Record<typeof CUSTOM_THEME_ALLOWED_TOKENS[number], string>
  return Object.fromEntries(declarations(value.dark).map(([name, dark]) => [name, { light: light[name], dark }]))
}
