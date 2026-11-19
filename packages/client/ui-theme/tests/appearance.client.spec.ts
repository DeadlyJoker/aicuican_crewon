// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { ThemeRuntime } from '../src/client/index.ts'
import { AppearanceRuntime } from '../src/client/appearance-runtime.ts'
import { appearanceSchema, DEFAULT_APPEARANCE, newAppearancePreset, validateAppearance } from '../src/appearance-settings.ts'
import { ThemeSettingsSchema, type ThemeSettings } from '../src/theme-settings.ts'

function bench() {
  const ctx = new Context(), host = stubConfigForm<ThemeSettings>()
  host.publish({ status: 'ready', writable: true, revision: 7, value: ThemeSettingsSchema() })
  const theme = new ThemeRuntime(ctx, host.scope)
  const appearance = new AppearanceRuntime(ctx, host.scope, theme, () => {})
  return { ctx, host, theme, appearance }
}

describe('reusable appearances', () => {
  it('reads old settings without adding a palette override', () => {
    const { appearance, theme, ctx } = bench()
    expect(appearance.library()).toEqual(DEFAULT_APPEARANCE)
    expect(theme.getTheme().active.tokens).toEqual({})
    ctx.fiber.dispose()
  })
  it('rejects duplicate names, missing references, unsafe images and low contrast', () => {
    const preset = newAppearancePreset('A')
    expect(() => validateAppearance({ version: 1, active: '', presets: [preset, preset] })).toThrow('duplicate')
    expect(() => validateAppearance({ version: 1, active: 'B', presets: [preset] })).toThrow('missing')
    expect(() => appearanceSchema({ version: 1, active: '', presets: [{ ...preset, background: { ...preset.background, kind: 'image', image: 'javascript:alert(1)' } }] })).toThrow()
    expect(() => validateAppearance({ version: 1, active: '', presets: [{ ...preset, light: { ...preset.light, foreground: preset.light.background } }] })).toThrow('contrast')
  })
  it('previews both palettes without persistence, then restores the latest shared selection', () => {
    const { appearance, theme, host, ctx } = bench(), preset = newAppearancePreset('A')
    appearance.tryOn(preset)
    expect(theme.getTheme().active.tokens['--dsw-alias-bg-base']).toBe(preset.light.background)
    expect(host.mutate).not.toHaveBeenCalled()
    theme.setTheme('dark')
    expect(theme.getTheme().active.tokens['--dsw-alias-bg-base']).toBe(preset.dark.background)
    appearance.tryOn()
    expect(theme.getTheme().active.tokens).toEqual({})
    ctx.fiber.dispose()
  })
  it('fences stale edits and ignores a repeated in-flight apply; failure retains the accepted palette', async () => {
    const { appearance, theme, host, ctx } = bench(), preset = newAppearancePreset('A')
    let finish: (value: boolean) => void = () => {}
    host.mutate.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const next = { version: 1 as const, active: 'A', presets: [preset] }
    const saving = appearance.save(next, JSON.stringify(DEFAULT_APPEARANCE))
    expect(await appearance.save(next, JSON.stringify(DEFAULT_APPEARANCE))).toBe(false)
    expect(host.mutate).toHaveBeenCalledTimes(1)
    expect(host.mutate.mock.calls[0]?.[1]).toBe(7)
    finish(false)
    expect(await saving).toBe(false)
    expect(theme.getTheme().active.tokens).toEqual({})
    host.publish({ value: { ...ThemeSettingsSchema(), appearance: next }, revision: 8 })
    expect(theme.getTheme().active.tokens['--dsw-alias-bg-base']).toBe(preset.light.background)
    await expect(appearance.save(next, JSON.stringify(DEFAULT_APPEARANCE))).rejects.toThrow('conflict')
    ctx.fiber.dispose()
  })
  it('restores a saved library on a fresh client and clears preview on disposal', async () => {
    const { appearance, theme, host, ctx } = bench(), preset = newAppearancePreset('Restart')
    preset.background.kind = 'gradient'
    host.publish({ value: { ...ThemeSettingsSchema(), appearance: { version: 1, active: preset.name, presets: [preset] } } })
    expect(appearance.library().active).toBe('Restart')
    expect(theme.getTheme().active.tokens).toMatchSnapshot('stored light palette')
    expect(theme.getTheme().active.tokens['--dsw-alias-bg-base']).toBe(preset.light.background)
    expect(document.body.style.getPropertyValue('--dsw-appearance-background')).toContain('radial-gradient')
    await ctx.fiber.dispose()
    expect(document.body.style.getPropertyValue('--dsw-appearance-background')).toBe('')
  })
})
