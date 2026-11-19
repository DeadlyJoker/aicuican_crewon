import { describe, expect, it } from 'vitest'
import { appearanceSchema, DEFAULT_APPEARANCE, validateAppearance } from '../src/appearance-settings.ts'
import { wallpaperSignature } from '../src/wallpaper-media.ts'

describe('shared wallpaper catalog', () => {
  const file = `${'a'.repeat(64)}.mp4`
  it('retains old schemes and rejects missing or mismatched media references', () => {
    expect(appearanceSchema(DEFAULT_APPEARANCE).presets).toEqual([])
    const wallpapers = { active: file, items: [{ file, name: 'Drift', kind: 'video' as const }], opacity: 25, blur: 0 }
    expect(wallpapers).toMatchSnapshot()
    expect(validateAppearance(appearanceSchema({ ...DEFAULT_APPEARANCE, wallpapers })).wallpapers).toEqual(wallpapers)
    expect(() => validateAppearance({ ...DEFAULT_APPEARANCE, wallpapers: { ...wallpapers, items: [] } })).toThrow('missing')
    expect(() => validateAppearance({ ...DEFAULT_APPEARANCE, wallpapers: { ...wallpapers, items: [{ file, name: 'Fake image', kind: 'image' }] } })).toThrow('missing')
    expect(() => appearanceSchema({ ...DEFAULT_APPEARANCE, wallpapers: { ...wallpapers, items: [{ file: '../secret.mp4', name: 'Invalid', kind: 'video' }] } })).toThrow()
  })
  it('rejects MIME disguises and recognizes supported container signatures', () => {
    expect(wallpaperSignature(Buffer.from('<script>run()</script>'), 'mp4')).toBe(false)
    expect(wallpaperSignature(Buffer.from([0,0,0,24,102,116,121,112]), 'mp4')).toBe(true)
    expect(wallpaperSignature(Buffer.from([26,69,223,163]), 'webm')).toBe(true)
    expect(wallpaperSignature(Buffer.from('GIF89a'), 'gif')).toBe(true)
    expect(wallpaperSignature(Buffer.from('GIF89a'), 'png')).toBe(false)
  })
})
