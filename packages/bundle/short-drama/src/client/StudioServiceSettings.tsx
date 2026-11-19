/** Shared native service configuration for the retained Studio canvas and project workbench. */
import { useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DramaProduction, DramaRoute, SharedGenerationSettings } from '../production-types.ts'
import css from './StudioWorkbench.module.css'

type Copy = PropsLocale<'shortDrama'>['t']
/** @param props - Project routes and revision-checked save operation. @returns Native generation-service settings dialog. */
export function StudioServiceSettings({
  production,
  busy,
  t,
  close,
  save,
  shared,
}: {
  production: DramaProduction
  busy: boolean
  t: Copy
  close(this: void): void
  shared?: SharedGenerationSettings
  save(this: void, value: DramaProduction['settings'], scope?: 'project' | 'shared'): Promise<boolean>
}) {
  const [settings, change] = useState(production.settings)
  const [failed, fail] = useState(false)
  const route = (kind: 'image' | 'video' | 'voice'): DramaRoute =>
    settings[kind] ?? { adapter: kind === 'video' ? 'dashscope' : 'openai', endpoint: '', model: '', credentialRef: '', voice: '' }
  return (
    <Modal
      open
      className={css.serviceModal ?? ''}
      contentClassName={css.serviceContent ?? ''}
      title={t('serviceSettings')}
      closeLabel={t('close')}
      onClose={() => {
        if (!busy) close()
      }}
      footer={<>
        {shared && <Button size="sm" disabled={busy} onClick={() => {
          void save(settings, 'shared').then((saved) => { if (saved) close(); else fail(true) })
        }}>{t('saveSharedServices')}</Button>}
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={() => {
            void save(settings).then((saved) => {
              if (saved) close()
              else fail(true)
            })
          }}
        >
          {t('saveChanges')}
        </Button>
      </>}
    >
      {failed && <p role="alert">{t('productionError')}</p>}
      <p className={css.caption}>{t('generationSettingsHint')}</p>
      {shared && <Button size="sm" disabled={busy} onClick={() => { change(shared.settings) }}>{t('useSharedServices')}</Button>}
      <div className={css.route}><div className={css.fields}><label>
        {t('workflowServiceAddress')}
        <Input disabled={busy} placeholder={t('endpointPlaceholder')} value={[settings.image, settings.video, settings.voice].find(item => item?.adapter === 'zealman')?.endpoint ?? ''}
          onChange={(event) => {
            const endpoint = event.currentTarget.value
            const update = (value: DramaRoute | null) => value?.adapter === 'zealman' ? { ...value, endpoint } : value
            change({ image: update(settings.image), video: update(settings.video), voice: update(settings.voice) })
          }} />
      </label></div></div>
      {(['image', 'video', 'voice'] as const).map(kind => (
        <details className={css.route} key={kind}>
          <summary>
            {t(({ image: 'imageService', video: 'videoService', voice: 'voiceService' } as const)[kind])}
          </summary>
          <div className={`${css.fields} ${css.serviceFields}`}>
            {(['endpoint', 'model', ...(kind === 'image' && route(kind).adapter === 'zealman' ? ['referenceModel'] as const : []), 'credentialRef', ...(kind === 'voice' ? ['voice'] as const : [])] as const).filter(field => field !== 'endpoint' || route(kind).adapter !== 'zealman').map(field => (
              <label key={field} className={field === 'model' || field === 'referenceModel' || field === 'endpoint' ? css.serviceWideField : undefined}>
                {t(
                  (
                    {
                      endpoint: 'studioEndpoint',
                      model: 'studioModel',
                      referenceModel: 'referenceWorkflow',
                      credentialRef: 'studioCredential',
                      voice: 'voice',
                    } as const
                  )[field],
                )}
                <Input
                  disabled={busy}
                  value={route(kind)[field] ?? ''}
                  onChange={(event) => {
                    change({ ...settings, [kind]: { ...route(kind), [field]: field === 'referenceModel' && !event.currentTarget.value.trim() ? undefined : event.currentTarget.value } })
                  }}
                />
              </label>
            ))}
            <label>
              {t('studioAdapter')}
              <select
                disabled={busy}
                value={route(kind).adapter}
                onChange={(event) => {
                  const adapter = event.currentTarget.value
                  if (adapter === 'openai' || adapter === 'dashscope' || adapter === 'jobs-v1' || adapter === 'zealman')
                    change({ ...settings, [kind]: { ...route(kind), adapter } })
                }}
              >
                {kind !== 'video' && <option value="openai">{t('openaiFormat')}</option>}
                {kind === 'video' && <option value="dashscope">{t('dashscopeFormat')}</option>}
                <option value="jobs-v1">{t('jobsFormat')}</option>
                <option value="zealman">{t('workflowService')}</option>
              </select>
            </label>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                change({ ...settings, [kind]: null })
              }}
            >
              {t('studioDisconnect')}
            </Button>
          </div>
        </details>
      ))}
    </Modal>
  )
}
