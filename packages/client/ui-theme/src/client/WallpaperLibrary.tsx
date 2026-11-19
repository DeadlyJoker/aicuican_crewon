/** Shared media picker inside the native appearance settings. */
import { useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { DEFAULT_WALLPAPERS, WALLPAPER_FILE_PATTERN, type AppearanceLibrary, type WallpaperItem } from '../appearance-settings.ts'
import type { AppearanceRowInjected } from './AppearanceRow.tsx'
import css from './AppearanceLibrary.module.css'

type Props = PropsLocale<'settings.theme'> & Pick<AppearanceRowInjected, 'saveAppearance'> & { library: AppearanceLibrary }

/** Render the Host-backed catalog without a second theme or persistence system.
 * @param props Accepted settings and the existing revision-checked write action.
 * @returns Wallpaper cards and playback controls.
 */
export function WallpaperLibrary({ library, t, saveAppearance }: Props) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const wallpapers = library.wallpapers ?? DEFAULT_WALLPAPERS
  const save = async (next: typeof wallpapers, expected = JSON.stringify(library)): Promise<void> => {
    setBusy(true); setNotice('')
    try {
      if (!await saveAppearance({ ...library, wallpapers: next }, expected)) setNotice(t('appearance.failed'))
    } catch (error) { setNotice(t(error instanceof Error && error.message === 'appearance.conflict' ? 'appearance.conflict' : 'appearance.failed')) }
    finally { setBusy(false) }
  }
  const upload = async (file: File): Promise<void> => {
    const expected = JSON.stringify(library)
    setBusy(true); setNotice('')
    try {
      const response = await fetch('/appearance-media', { method: 'POST', headers: { 'content-type': file.type }, body: file })
      if (!response.ok) throw new Error('upload failed')
      const value: unknown = await response.json()
      if (typeof value !== 'object' || value === null || !('file' in value) || typeof value.file !== 'string' || !WALLPAPER_FILE_PATTERN.test(value.file) || !('kind' in value) || (value.kind !== 'image' && value.kind !== 'video')) throw new Error('invalid media receipt')
      const item: WallpaperItem = {
        file: value.file, kind: value.kind, name: file.name.slice(0, 100),
      }
      const items = [...wallpapers.items.filter(entry => entry.file !== item.file), item]
      await save({ ...wallpapers, active: item.file, items }, expected)
    } catch (error) { setNotice(t(error instanceof Error && error.message === 'appearance.conflict' ? 'appearance.conflict' : 'wallpaper.uploadFailed')); setBusy(false) }
  }
  return <section className={css.section}>
    <div className={css.heading}><div>{t('wallpaper.library')}<p>{t('wallpaper.hint')}</p></div><label className={css.button} aria-disabled={busy}>
      {t('wallpaper.import')}<input type="file" className={css.file} accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" disabled={busy || wallpapers.items.length >= 100} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void upload(file) }} />
    </label></div>
    <div className={css.grid}>
      <button className={css.card} type="button" aria-pressed={!wallpapers.active} disabled={busy} onClick={() => { void save({ ...wallpapers, active: '' }) }}><span className={css.wallpaperThumb} style={{ display: 'block', background: 'linear-gradient(135deg,var(--dsw-alias-brand-primary),var(--dsw-alias-bg-base))' }} />{t('wallpaper.preset')}</button>
      {wallpapers.items.map(item => <button className={css.card} type="button" key={item.file} aria-pressed={wallpapers.active === item.file} disabled={busy} onClick={() => { void save({ ...wallpapers, active: item.file }) }}>
        {item.kind === 'video' ? <video className={css.wallpaperThumb} src={`/appearance-media/${item.file}`} muted preload="metadata" /> : <img className={css.wallpaperThumb} src={`/appearance-media/${item.file}`} alt="" />}
        <span className={css.wallpaperName}>{item.name}</span><small>{t(item.kind === 'video' ? 'wallpaper.dynamic' : 'wallpaper.image')}{wallpapers.active === item.file ? ` · ${t('appearance.active')}` : ''}</small>
      </button>)}
    </div>
    {wallpapers.active && <div className={css.wallpaperControls}>
      <label>{t('appearance.opacity')}<input type="range" min={0} max={100} defaultValue={wallpapers.opacity} key={`opacity-${wallpapers.opacity}`} disabled={busy} onPointerUp={(event) => { void save({ ...wallpapers, opacity: Number(event.currentTarget.value) }) }} onKeyUp={(event) => { if (event.key.startsWith('Arrow')) void save({ ...wallpapers, opacity: Number(event.currentTarget.value) }) }} /></label>
      <label>{t('appearance.blur')}<input type="range" min={0} max={24} defaultValue={wallpapers.blur} key={`blur-${wallpapers.blur}`} disabled={busy} onPointerUp={(event) => { void save({ ...wallpapers, blur: Number(event.currentTarget.value) }) }} onKeyUp={(event) => { if (event.key.startsWith('Arrow')) void save({ ...wallpapers, blur: Number(event.currentTarget.value) }) }} /></label>
    </div>}
    {notice && <p role="status" className={css.hint}>{notice}</p>}
  </section>
}
