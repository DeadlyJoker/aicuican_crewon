/** Native theme integration for reusable palettes and local background media. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ThemeRuntime } from './index.ts'
import type { ThemeSettings } from '../theme-settings.ts'
import { activeAppearance, appearanceBackground, appearanceSchema, DEFAULT_APPEARANCE, validateAppearance, type AppearanceLibrary, type AppearancePreset } from '../appearance-settings.ts'
import { customThemeTokenOverrides } from '../skin-palette.ts'

/** Lifecycle-owned preview and persistence adapter; failed writes keep the accepted appearance. */
export class AppearanceRuntime {
  private preview: AppearancePreset | undefined
  private layer: (() => void) | undefined
  private signature = ''
  private saving = false
  private video: HTMLVideoElement | undefined
  private observer: MutationObserver | undefined

  /**
   * @param ctx Owning plugin scope.
   * @param host Existing shared Host settings form.
   * @param theme Native theme service.
   * @param changed Publish accepted settings to the settings row.
   */
  constructor(
    ctx: ClientContext,
    private readonly host: ConfigForm<ThemeSettings>,
    private readonly theme: ThemeRuntime,
    private readonly changed: (library: AppearanceLibrary) => void,
  ) {
    ctx.effect(() => () => { this.layer?.(); this.clearBackground() }, 'appearance: token and backdrop cleanup')
    ctx.effect(() => host.subscribe(() => { this.refresh() }), 'appearance: shared settings adoption')
    ctx.on('theme/change', () => { this.renderBackground() })
    if (typeof document !== 'undefined') {
      this.observer = new MutationObserver(() => { this.placeVideo() })
      this.observer.observe(document.body, { childList: true, subtree: true })
      ctx.effect(() => () => { this.observer?.disconnect(); this.video?.pause(); this.video?.remove(); document.body.style.removeProperty('--dsw-wallpaper-video') }, 'appearance: video lifecycle')
    }
    this.refresh()
  }

  /** Read the shared accepted library without browser-local persistence.
   * @returns Current Host value, or the legacy empty library before settings arrive.
   */
  library(): AppearanceLibrary { return appearanceSchema(this.host.getSnapshot().value?.appearance ?? DEFAULT_APPEARANCE) }

  /** Show a temporary draft, or restore the latest shared selection.
   * @param preset Draft to preview; undefined ends the preview.
   */
  tryOn(preset?: AppearancePreset): void { this.preview = preset; this.refresh() }

  /** Persist one complete validated operation; stale editors cannot replace newer settings.
   * @param library Next collection.
   * @param expected Collection serialized when the editor was opened.
   * @returns Whether the settings provider accepted the operation.
   */
  async save(library: AppearanceLibrary, expected: string): Promise<boolean> {
    validateAppearance(appearanceSchema(library))
    if (this.saving) return false
    if (!this.host.getSnapshot().writable) return false
    if (JSON.stringify(this.library()) !== expected) throw new Error('appearance.conflict')
    this.saving = true
    try {
      const accepted = await this.host.mutate([{ op: 'set', path: ['appearance'], value: { version: library.version, active: library.active, ...(library.wallpapers ? { wallpapers: { ...library.wallpapers, items: library.wallpapers.items.map(item => ({ ...item })) } } : {}), presets: library.presets.map(preset => ({ ...preset, light: { ...preset.light }, dark: { ...preset.dark } })) } }], this.host.getSnapshot().revision)
      if (accepted) { this.preview = undefined; this.refresh() }
      return accepted
    } finally { this.saving = false }
  }

  private refresh(): void {
    if (this.host.getSnapshot().value === undefined) return
    const library = this.library()
    this.changed(library)
    const preset = this.preview ?? activeAppearance(library)
    const signature = JSON.stringify(preset)
    if (signature !== this.signature) {
      this.signature = signature
      if (preset) this.layer = this.theme.overrideTokens('crewon-appearance', customThemeTokenOverrides({ version: 1, applied: true, light: preset.light, dark: preset.dark }))
      else { this.layer?.(); this.layer = undefined }
    }
    this.renderBackground()
    if (typeof document !== 'undefined') document.getElementById('crewon-appearance-boot')?.remove()
  }

  private clearBackground(): void {
    if (typeof document === 'undefined') return
    for (const key of ['--dsw-appearance-background', '--dsw-appearance-background-opacity', '--dsw-appearance-background-blur']) document.body.style.removeProperty(key)
  }

  private placeVideo(): void {
    const target = document.querySelector('[data-appearance-canvas]')
    if (this.video && target && this.video.parentElement !== target) target.prepend(this.video)
  }

  private renderBackground(): void {
    if (typeof document === 'undefined') return
    const preset = this.preview ?? activeAppearance(this.library())
    const wallpapers = this.library().wallpapers
    const item = wallpapers?.items.find(item => item.file === wallpapers.active)
    const variables = appearanceBackground(preset, this.theme.getTheme().active.colorScheme, this.preview ? undefined : wallpapers)
    const videoSource = item?.kind === 'video' && !this.preview ? `/appearance-media/${item.file}` : ''
    document.body.style.setProperty('--dsw-wallpaper-video', videoSource)
    if (videoSource) {
      if (!this.video || this.video.getAttribute('src') !== videoSource) {
        this.video?.pause(); this.video?.remove()
        this.video = document.createElement('video'); this.video.className = 'crewon-wallpaper-video'
        this.video.muted = true; this.video.loop = true; this.video.playsInline = true
        this.video.autoplay = true; this.video.src = videoSource
        this.video.setAttribute('aria-hidden', 'true')
      }
      this.placeVideo()
    } else { this.video?.pause(); this.video?.remove(); this.video = undefined }
    for (const [key, value] of Object.entries(variables)) document.body.style.setProperty(key, value)
  }
}
