/** Host-persisted appearance collections. Existing built-in preferences remain independent. */
import z from '@deepseek-ai/schemastery'
import { CUSTOM_THEME_DEFAULTS, type CustomThemeProfile } from './skin-palette.ts'

/** A reusable palette and background; its user-visible name is the collection key. */
export interface AppearancePreset {
  /** Unique display name, not a generated opaque identifier. */
  name: string
  /** Palette used in light mode. */
  light: CustomThemeProfile
  /** Palette used in dark mode. */
  dark: CustomThemeProfile
  /** Background rendering parameters. */
  background: {
    /** Background media type. */
    kind: 'none' | 'gradient' | 'image'
    /** CSS background color or gradient. */
    color: string
    /** Background image reference. */
    image: string
    /** Background opacity percentage. */
    opacity: number
    /** Background blur in CSS pixels. */
    blur: number
  }
}

/** Durable appearance library; an empty active name means the unmodified host appearance. */
export interface AppearanceLibrary {
  /** Supported document generation. */
  version: 1
  /** Applied preset name, or empty for the host default. */
  active: string
  /** User-owned reusable presets. */
  presets: AppearancePreset[]
  /** Shared wallpaper selection and media catalog, independent of palette presets. */
  wallpapers?: WallpaperLibrary
}

/** Immutable Host media reference; bytes live outside the settings document. */
export interface WallpaperItem {
  /** SHA-256 content address followed by its validated extension. */
  file: string
  /** User-visible title. */
  name: string
  /** Browser-native image or silent video playback. */
  kind: 'image' | 'video'
}
/** Shared catalog and playback settings. */
export interface WallpaperLibrary {
  /** Active file reference, or empty to show the preset background. */
  active: string
  /** User-imported media. */
  items: WallpaperItem[]
  /** Wallpaper opacity from zero to one hundred. */
  opacity: number
  /** Background blur in CSS pixels. */
  blur: number
}
/** No wallpaper overrides existing presets until the user chooses one. */
export const DEFAULT_WALLPAPERS: WallpaperLibrary = { active: '', items: [], opacity: 25, blur: 0 }
/** A media name cannot address arbitrary Host files. */
export const WALLPAPER_FILE_PATTERN = /^[a-f0-9]{64}\.(?:png|jpg|webp|gif|mp4|webm)$/u
const wallpaperSchema = z.object({
  active: z.string().max(70),
  items: z.array(z.object({ file: z.string().pattern(WALLPAPER_FILE_PATTERN), name: z.string().min(1).max(100), kind: z.union(['image', 'video']) })).max(100),
  opacity: z.number().min(0).max(100).step(1), blur: z.number().min(0).max(24).step(1),
})

const color = z.string().pattern(/^#[0-9a-f]{6}$/iu)
const palette = z.object({ accent: color, background: color, foreground: color, contrast: z.number().min(0).max(100).step(1) })
/** Accepted raster data URLs; remote fetches, SVG and executable URLs are excluded. */
export const IMAGE_PATTERN = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/u
/** Maximum encoded wallpaper size per preset (roughly 1 MiB decoded). */
export const MAX_IMAGE_LENGTH = 1_400_000
/** Empty library used only for existing profiles without appearance settings. */
export const DEFAULT_APPEARANCE: AppearanceLibrary = { version: 1, active: '', presets: [], wallpapers: DEFAULT_WALLPAPERS }
/** Validate persisted and imported libraries at the settings boundary. */
export const appearanceSchema: z<AppearanceLibrary> = z.object({
  version: z.const(1), active: z.string().max(60),
  presets: z.array(z.object({
    name: z.string().min(1).max(60), light: palette, dark: palette,
    background: z.object({ kind: z.union(['none', 'gradient', 'image']), color, image: z.string().max(MAX_IMAGE_LENGTH).pattern(/^(?:|data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*)$/u), opacity: z.number().min(0).max(40).step(1), blur: z.number().min(0).max(24).step(1) }),
  })).max(24),
  wallpapers: wallpaperSchema.default(DEFAULT_WALLPAPERS),
})

/** Validate names and active references after schema parsing.
 * @param library Parsed settings value.
 * @returns The same value, or a descriptive error before any rendering or write.
 */
export function validateAppearance(library: AppearanceLibrary): AppearanceLibrary {
  const wallpapers = library.wallpapers
  if (wallpapers) {
    const files = new Set(wallpapers.items.map(item => item.file))
    if (files.size !== wallpapers.items.length || (wallpapers.active && !files.has(wallpapers.active))) throw new Error('appearance.missing')
    for (const item of wallpapers.items) {
      if (item.kind !== (/\.(?:mp4|webm)$/u.test(item.file) ? 'video' : 'image')) throw new Error('appearance.missing')
    }
  }
  const names = new Set<string>()
  for (const preset of library.presets) {
    if (!preset.name.trim() || names.has(preset.name)) throw new Error('appearance.duplicate')
    names.add(preset.name)
    if (preset.background.kind === 'image' && !IMAGE_PATTERN.test(preset.background.image)) throw new Error('appearance.imageRequired')
    for (const palette of [preset.light, preset.dark]) {
      if (contrastRatio(palette.background, palette.foreground) < 4.5) throw new Error('appearance.contrast')
    }
  }
  if (library.active && !names.has(library.active)) throw new Error('appearance.missing')
  return library
}

/** Calculate WCAG contrast for two validated opaque sRGB colors.
 * @param a First hexadecimal color.
 * @param b Second hexadecimal color.
 * @returns Contrast ratio from 1 to 21.
 */
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string): number => {
    const channel = (index: number): number => {
      const v = Number.parseInt(hex.slice(index, index + 2), 16) / 255
      return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4
    }
    return channel(1) * .2126 + channel(3) * .7152 + channel(5) * .0722
  }
  const first = luminance(a), second = luminance(b)
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05)
}

/** Create an independent editable preset without mutating shared defaults.
 * @param name Unique display name.
 * @returns A complete pair of palettes with background disabled.
 */
export function newAppearancePreset(name: string): AppearancePreset {
  return { name, light: { ...CUSTOM_THEME_DEFAULTS.light }, dark: { ...CUSTOM_THEME_DEFAULTS.dark }, background: { kind: 'none', color: '#7588b5', image: '', opacity: 15, blur: 12 } }
}

/** Resolve only an existing active preset.
 * @param library Validated durable library.
 * @returns Applied preset, or undefined for host default.
 */
export function activeAppearance(library: AppearanceLibrary): AppearancePreset | undefined {
  return library.presets.find(preset => preset.name === library.active)
}

/** Resolve the background variables shared by Host first paint, native content and Studio.
 * @param preset Accepted preset, or undefined for the Host default.
 * @param scheme Resolved light or dark scheme.
 * @param wallpapers Accepted media selection; absent during a palette preview.
 * @returns Background-only CSS variables; no selectors or authored media styles.
 */
export function appearanceBackground(preset: AppearancePreset | undefined, scheme: 'light' | 'dark', wallpapers?: WallpaperLibrary): Record<string, string> {
  const background = preset?.background
  const image = background?.kind === 'image' ? `url("${background.image}")`
    : background?.kind === 'gradient' ? `radial-gradient(ellipse at 15% 10%, ${background.color}, transparent 70%), radial-gradient(ellipse at 90% 90%, ${preset?.[scheme].accent}, transparent 65%)` : 'none'
  const item = wallpapers?.items.find(item => item.file === wallpapers.active)
  if (item && wallpapers) return { '--dsw-appearance-background': item.kind === 'image' ? `url("/appearance-media/${item.file}")` : 'none', '--dsw-appearance-background-opacity': String(wallpapers.opacity / 100), '--dsw-appearance-background-blur': `${wallpapers.blur}px` }
  return { '--dsw-appearance-background': image, '--dsw-appearance-background-opacity': String((background?.opacity ?? 0) / 100), '--dsw-appearance-background-blur': `${background?.blur ?? 0}px` }
}
