/** Studio entry and project workbench use the approved canvas-first interaction, backed by native Host operations. */
import { useEffect, useState } from 'react'
import {
  Button,
  Input,
  Modal,
  IconPlusOutlineRegular,
  IconChevronLeftOutlineRegular,
  IconPlayOutlineRegular,
  IconRefreshOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DramaAssetDraft, DramaProduction, DramaShotDraft } from '../production-types.ts'
import type { createDramaWorkbench, DramaStage } from './workbench.ts'
import { StudioServiceSettings as ServiceSettings } from './StudioServiceSettings.tsx'
import { StudioCanvas } from './StudioCanvas.tsx'
import css from './StudioWorkbench.module.css'

type Workbench = ReturnType<typeof createDramaWorkbench>
type Props = PropsLocale<'shortDrama'> &
  InjectFace<{ actions: Workbench['actions']; hooks: { drama: Workbench['store'] } }>
type Copy = PropsLocale<'shortDrama'>['t']
type Editor = { kind: 'asset'; draft: DramaAssetDraft } | { kind: 'shot'; draft: DramaShotDraft }

function Media({ production, id, label }: { production: DramaProduction; id: string | null; label: string }) {
  const media = production.jobs.flatMap(job => job.outputs).find(item => item.id === id)
  return media?.kind === 'image' ? (
    <img src={media.url} alt={label} />
  ) : media?.kind === 'video' ? (
    <video src={media.url} controls />
  ) : media?.kind === 'voice' ? (
    <audio src={media.url} controls />
  ) : (
    <span className={css.pending}>{label}</span>
  )
}

/**
 * Render the native Studio entry, script workbench, asset gallery and infinite canvas.
 * @param props - Slot-bound state, localized copy and shared Host actions.
 * @returns Studio content within the existing CrewON application shell.
 */
export function StudioWorkbench({ t, actions, useDrama }: Props) {
  const state = useDrama(value => value)
  const { projects, project, production, canvas, feedback, operation, viewed, drafts, timelineDraft } = state
  const busy = operation !== null
  const [title, name] = useState('')
  const [idea, describe] = useState('')
  const screen = state.screen
  const show = (next: 'workbench' | 'canvas') => { actions.screen(next) }
  const stage = state.stage
  const choose = (next: DramaStage) => { actions.stage(next) }
  const [editor, edit] = useState<Editor | null>(null)
  const [settings, configure] = useState(false)
  const draft = project && (drafts[project.id] ?? { revision: project.revision, script: '' })
  const selectedScript = project?.scripts.find(item => item.id === viewed) ?? project?.scripts.at(-1)
  const notice = feedback && (
    <p className={css.notice} role={feedback.kind === 'error' ? 'alert' : 'status'}>
      {t(feedback.key)}
    </p>
  )
  useEffect(() => {
    if (projects === null && !busy && !feedback) void actions.load()
  }, [projects, busy, feedback, actions])
  function navigate(next: DramaStage) {
    choose(next)
    show('workbench')
  }
  function addAsset() {
    edit({ kind: 'asset', draft: { id: null, kind: 'character', name: '', prompt: '' } })
  }
  function addShot() {
    if (!production) return
    edit({
      kind: 'shot',
      draft: {
        id: null,
        title: '',
        scene: '',
        prompt: '',
        dialogue: '',
        frames: production.fps * 4,
        assetIds: [],
      },
    })
  }
  const content = project && production && canvas && draft
  return (
    <main className={css.page} data-studio-native="">
      {content ? (
        <>
          <header className={css.header}>
            <div className={css.identity}>
              <Button
                size="sm"
                aria-label={t('back')}
                title={t('back')}
                icon={<IconChevronLeftOutlineRegular size={16} />}
                onClick={() => {
                  void actions.back()
                }}
              />
              <h1>{project.title}</h1>
            </div>
            <nav className={css.views} aria-label={t('studioViews')}>
              <Button
                size="sm"
                aria-pressed={screen === 'workbench'}
                onClick={() => {
                  show('workbench')
                }}
              >
                {t('studioWorkbench')}
              </Button>
              <Button
                size="sm"
                aria-pressed={screen === 'canvas'}
                onClick={() => {
                  show('canvas')
                }}
              >
                {t('canvas')}
              </Button>
            </nav>
            <div className={css.headerActions}>
              <Button
                size="sm"
                aria-label={t('refresh')}
                title={t('refresh')}
                icon={<IconRefreshOutlineRegular size={16} />}
                disabled={busy}
                onClick={() => {
                  void actions.refresh(project, viewed)
                }}
              />
            </div>
          </header>
          {notice}
          {screen === 'canvas' ? (
            <StudioCanvas
              key={project.id}
              project={project}
              production={production}
              layout={canvas}
              actions={actions}
              busy={busy}
              t={t}
              details={navigate}
              addAsset={addAsset}
              addShot={addShot}
            />
          ) : (
            <>
              <nav className={css.stagebar} aria-label={t('production')}>
                <div role="tablist" aria-label={t('production')}>
                  {(['script', 'assets', 'shots', 'edit'] as const).map(item => (
                    <Button
                      key={item}
                      size="sm"
                      role="tab"
                      aria-selected={stage === item}
                      onClick={() => {
                        choose(item)
                      }}
                    >
                      {t(
                        (
                          {
                            script: 'tabScript',
                            assets: 'tabAssets',
                            shots: 'tabShots',
                            edit: 'tabEdit',
                          } as const
                        )[item],
                      )}
                    </Button>
                  ))}
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    configure(true)
                  }}
                >
                  {t('serviceSettings')}
                </Button>
              </nav>
              <div className={css.body}>
                {stage === 'script' && (
                  <div className={css.scriptLayout}>
                    <aside className={css.scriptOutline}>
                      <span>{t('studioEpisode')}</span>
                      <h2>{project.title}</h2>
                      <p>{project.synopsis || t('canvasStart')}</p>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => { void actions.requestScript() }}>
                        {t('studioDraftScript')}
                      </Button>
                      <span className={css.caption}>{t('versions')}</span>
                      {project.scripts.map((script, index) => (
                        <Button
                          key={script.id}
                          size="sm"
                          aria-pressed={script.id === selectedScript?.id}
                          onClick={() => {
                            actions.view(script.id)
                          }}
                        >
                          {t('version', { number: index + 1 })} ·{' '}
                          {t(script.id === project.adoptedScriptId ? 'adopted' : 'candidate')}
                        </Button>
                      ))}
                    </aside>
                    <section className={css.scriptDocument}>
                      <header>
                        <h2>{t('script')}</h2>
                        <span>
                          {selectedScript
                            ? t(selectedScript.id === project.adoptedScriptId ? 'adopted' : 'candidate')
                            : t('noVersions')}
                        </span>
                      </header>
                      <textarea
                        className={css.scriptText}
                        aria-label={t('script')}
                        value={drafts[project.id] ? draft.script : (selectedScript?.body ?? '')}
                        placeholder={t('studioScriptPlaceholder')}
                        maxLength={16000}
                        onChange={(event) => {
                          actions.edit(project, { script: event.currentTarget.value })
                        }}
                      />
                      <footer>
                        <span>{t('canvasCandidateHint')}</span>
                        <div className={css.inline}>
                          {selectedScript && selectedScript.id !== project.adoptedScriptId && (
                            <Button
                              size="sm"
                              disabled={busy || Boolean(draft.script)}
                              onClick={() => {
                                void actions.adopt(project, selectedScript.id)
                              }}
                            >
                              {t('adopt')}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={busy || !draft.script.trim()}
                            onClick={() => {
                              void actions.save(project, draft, viewed)
                            }}
                          >
                            {t('save')}
                          </Button>
                        </div>
                      </footer>
                    </section>
                  </div>
                )}
                {stage === 'assets' && (
                  <section aria-label={t('tabAssets')}>
                    <div className={css.sectionBar}>
                      <div className={css.inline}>
                        {(['character', 'scene', 'prop', 'voice'] as const).map(kind => (
                          <span key={kind}>
                            {t(kind)}{' '}
                            <small>{production.assets.filter(item => item.kind === kind).length}</small>
                          </span>
                        ))}
                      </div>
                      <Button size="sm" icon={<IconPlusOutlineRegular size={14} />} onClick={addAsset}>
                        {t('addAsset')}
                      </Button>
                    </div>
                    <div className={css.gallery}>
                      {production.assets.map(asset => (
                        <article className={css.assetCard} key={asset.id}>
                          <button
                            className={css.cover}
                            onClick={() => {
                              edit({ kind: 'asset', draft: asset })
                            }}
                            aria-label={t('studioEditNamed', { name: asset.name })}
                          >
                            <Media production={production} id={asset.adoptedMediaId} label={t(asset.kind)} />
                            <span className={css.badge}>{t(asset.kind)}</span>
                          </button>
                          <div className={css.cardTools}>
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => {
                                void actions.generate(
                                  'asset',
                                  asset.id,
                                  asset.kind === 'voice' ? 'voice' : 'image',
                                )
                              }}
                            >
                              {t(asset.kind === 'voice' ? 'generateVoice' : 'generateImage')}
                            </Button>
                            <span>{t('version', { number: asset.version })}</span>
                          </div>
                          <footer>
                            <span>{asset.name}</span>
                            <Button
                              size="sm"
                              onClick={() => {
                                edit({ kind: 'asset', draft: asset })
                              }}
                            >
                              {t('editAsset')}
                            </Button>
                          </footer>
                        </article>
                      ))}
                      <button className={css.addCard} onClick={addAsset} aria-label={t('addAsset')}>
                        <IconPlusOutlineRegular size={24} />
                      </button>
                    </div>
                  </section>
                )}
                {stage === 'shots' && (
                  <section aria-label={t('tabShots')}>
                    <div className={css.sectionBar}>
                      <span>{t('shotCount', { count: production.shots.length })}</span>
                      <Button
                        size="sm"
                        disabled={!project.adoptedScriptId}
                        icon={<IconPlusOutlineRegular size={14} />}
                        onClick={addShot}
                      >
                        {t('addShot')}
                      </Button>
                    </div>
                    {!project.adoptedScriptId && <p className={css.caption}>{t('adoptScriptFirst')}</p>}
                    <div className={css.gallery}>
                      {production.shots.map((shot, index) => (
                        <article className={css.assetCard} key={shot.id}>
                          <button
                            className={css.cover}
                            onClick={() => {
                              edit({ kind: 'shot', draft: shot })
                            }}
                            aria-label={t('studioEditNamed', { name: shot.title })}
                          >
                            <Media
                              production={production}
                              id={shot.adoptedVideoId ?? shot.adoptedImageId}
                              label={t('tabShots')}
                            />
                            <span className={css.badge}>
                              {String(index + 1).padStart(2, '0')} ·{' '}
                              {t('durationValue', { seconds: shot.frames / production.fps })}
                            </span>
                          </button>
                          <div className={css.cardTools}>
                            {(['image', 'video', 'voice'] as const).map(kind => (
                              <Button
                                key={kind}
                                size="sm"
                                disabled={busy || shot.needsReview}
                                onClick={() => {
                                  void actions.generate('shot', shot.id, kind)
                                }}
                              >
                                {t(
                                  (
                                    {
                                      image: 'generateImage',
                                      video: 'generateVideo',
                                      voice: 'generateVoice',
                                    } as const
                                  )[kind],
                                )}
                              </Button>
                            ))}
                          </div>
                          <footer>
                            <span>{shot.title}</span>
                            <Button
                              size="sm"
                              onClick={() => {
                                edit({ kind: 'shot', draft: shot })
                              }}
                            >
                              {t('editShot')}
                            </Button>
                          </footer>
                        </article>
                      ))}
                    </div>
                  </section>
                )}
                {stage === 'edit' && (
                  <section className={css.delivery}>
                    <header>
                      <h2>{t('tabEdit')}</h2>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={busy || Boolean(timelineDraft) || !production.timeline.length}
                        icon={<IconPlayOutlineRegular size={14} />}
                        onClick={() => {
                          void actions.exportEpisode()
                        }}
                      >
                        {t('studioExport')}
                      </Button>
                    </header>
                    <div className={css.inline}>
                      {production.shots
                        .filter(shot => shot.adoptedVideoId)
                        .map(shot => (
                          <Button
                            key={shot.id}
                            size="sm"
                            onClick={() => {
                              if (shot.adoptedVideoId)
                                actions.editTimeline([
                                  ...(timelineDraft ?? production.timeline),
                                  {
                                    shotId: shot.id,
                                    videoId: shot.adoptedVideoId,
                                    voiceId: shot.adoptedVoiceId,
                                    startFrame: 0,
                                    frames: shot.frames,
                                    subtitle: shot.dialogue,
                                  },
                                ])
                            }}
                          >
                            {t('studioAddClip', { name: shot.title })}
                          </Button>
                        ))}
                    </div>
                    {(timelineDraft ?? production.timeline).map((clip, index, clips) => (
                      <div className={css.clip} key={`${index}:${clip.shotId}`}>
                        <span>{index + 1}</span>
                        <span>{production.shots.find(shot => shot.id === clip.shotId)?.title}</span>
                        <Input
                          aria-label={t('studioSubtitle')}
                          value={clip.subtitle}
                          onChange={(event) => {
                            actions.editTimeline(
                              clips.map((item, cursor) =>
                                cursor === index ? { ...item, subtitle: event.currentTarget.value } : item,
                              ),
                            )
                          }}
                        />
                        <Button
                          size="sm"
                          disabled={!index}
                          onClick={() => {
                            const next = [...clips]
                            const previous = next[index - 1]
                            if (!previous) return
                            next.splice(index - 1, 2, clip, previous)
                            actions.editTimeline(next)
                          }}
                        >
                          {t('studioMoveEarlier')}
                        </Button>
                      </div>
                    ))}
                    {!production.timeline.length && !timelineDraft?.length && (
                      <div className={css.empty}>
                        <h2>{t('studioNoClips')}</h2>
                        <p>{t('studioClipHint')}</p>
                      </div>
                    )}
                    {timelineDraft && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          void actions.saveTimeline()
                        }}
                      >
                        {t('saveChanges')}
                      </Button>
                    )}
                    {production.exports.map(item => (
                      <article className={css.export} key={item.id}>
                        <video src={item.video.url} controls />
                        <a href={item.video.url} download>
                          {t('studioDownload')}
                        </a>
                      </article>
                    ))}
                  </section>
                )}
                {production.jobs.length > 0 && (
                  <details className={css.jobs}>
                    <summary>
                      {t('studioTasks')} · {production.jobs.length}
                    </summary>
                    {[...production.jobs].reverse().map(job => (
                      <section key={job.id}>
                        <header>
                          <span>
                            {production.assets.find(item => item.id === job.targetId)?.name ??
                              production.shots.find(item => item.id === job.targetId)?.title}
                          </span>
                          <span>
                            {t(
                              (
                                {
                                  ready: 'succeeded',
                                  failed: 'failed',
                                  running: 'running',
                                  unknown: 'unknown',
                                  submitting: 'queued',
                                } as const
                              )[job.state],
                            )}
                          </span>
                        </header>
                        {['running', 'submitting', 'unknown'].includes(job.state) && (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              void actions.observe(job.id)
                            }}
                          >
                            {t('refreshTask')}
                          </Button>
                        )}
                        {job.outputs.map(media => (
                          <div key={media.id}>
                            <Media production={production} id={media.id} label={t('preview')} />
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => {
                                void actions.adoptMedia(job.id, media.id)
                              }}
                            >
                              {t('useCandidate')}
                            </Button>
                          </div>
                        ))}
                      </section>
                    ))}
                  </details>
                )}
              </div>
            </>
          )}
          {editor && (
            <ContentEditor
              key={`${editor.kind}:${editor.draft.id ?? 'new'}`}
              editor={editor}
              busy={busy}
              production={production}
              t={t}
              close={() => {
                edit(null)
              }}
              save={async (next) => {
                const saved =
                  next.kind === 'asset'
                    ? await actions.saveAsset(next.draft)
                    : await actions.saveShot(next.draft)
                if (saved) edit(null)
                return saved
              }}
            />
          )}
          {settings && (
            <ServiceSettings
              production={production}
              busy={busy}
              t={t}
              close={() => {
                configure(false)
              }}
              save={value => actions.saveSettings(value)}
            />
          )}
        </>
      ) : (
        <div className={css.home}>
          <header>
            <h1>{t('title')}</h1>
            <span>{t('studioTagline')}</span>
          </header>
          <section className={css.intake}>
            <h2>{t('studioWelcome')}</h2>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void actions
                  .create(title.trim() || idea.trim().slice(0, 32), idea)
                  .then((created) => {
                    if (!created) return
                    describe('')
                    name('')
                    choose('script')
                    void actions.requestScript(created)
                  })
              }}
            >
              <details className={css.optionalName}>
                <summary>{title || t('titleField')}</summary>
                <Input
                  aria-label={t('titleField')}
                  placeholder={t('titleField')}
                  value={title}
                  maxLength={120}
                  onChange={(event) => {
                    name(event.currentTarget.value)
                  }}
                />
              </details>
              <textarea
                aria-label={t('synopsis')}
                placeholder={t('studioIdeaPlaceholder')}
                value={idea}
                maxLength={4000}
                onChange={(event) => {
                  describe(event.currentTarget.value)
                }}
              />
              <footer>
                <span>{t('studioAgentHint')}</span>
                <Button
                  size="sm"
                  variant="primary"
                  type="submit"
                  disabled={busy || (!title.trim() && !idea.trim())}
                >
                  {t('create')}
                </Button>
              </footer>
            </form>
          </section>
          {notice}
          <section className={css.projects}>
            <header>
              <h2>{t('projects')}</h2>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  void actions.load()
                }}
              >
                {t('refresh')}
              </Button>
            </header>
            <div className={css.projectGrid}>
              {projects?.map(item => (
                <button
                  className={css.projectCard}
                  key={item.id}
                  onClick={() => {
                    void actions.open(item.id).then((opened) => {
                      if (opened) void actions.openConversation(item.id)
                    })
                  }}
                >
                  <span className={css.projectArt}>{item.title.slice(0, 1)}</span>
                  <strong>{item.title}</strong>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

function ContentEditor({
  editor: initial,
  production,
  busy,
  t,
  close,
  save,
}: {
  editor: Editor
  production: DramaProduction
  busy: boolean
  t: Copy
  close(this: void): void
  save(this: void, value: Editor): Promise<boolean>
}) {
  const [editor, edit] = useState(initial)
  const [failed, fail] = useState(false)
  return (
    <Modal
      open
      title={t(editor.kind === 'asset' ? 'editAsset' : 'editShot')}
      closeLabel={t('close')}
      onClose={() => {
        if (!busy) close()
      }}
      className={css.editor ?? ''}
      footer={
        <Button
          size="sm"
          variant="primary"
          disabled={
            busy ||
            !editor.draft.prompt.trim() ||
            !(editor.kind === 'asset' ? editor.draft.name.trim() : editor.draft.title.trim())
          }
          onClick={() => {
            void save(editor).then((saved) => {
              fail(!saved)
            })
          }}
        >
          {t('saveChanges')}
        </Button>
      }
    >
      {failed && <p role="alert">{t('productionError')}</p>}
      <div className={css.editorGrid}>
        <div className={css.editorPreview}>
          <Media
            production={production}
            id={
              editor.kind === 'asset'
                ? (production.assets.find(item => item.id === editor.draft.id)?.adoptedMediaId ?? null)
                : (production.shots.find(item => item.id === editor.draft.id)?.adoptedImageId ?? null)
            }
            label={t(editor.kind === 'asset' ? 'tabAssets' : 'tabShots')}
          />
        </div>
        <div className={css.fields}>
          {editor.kind === 'asset' ? (
            <>
              <label>
                {t('name')}
                <Input
                  value={editor.draft.name}
                  onChange={(event) => {
                    edit({ ...editor, draft: { ...editor.draft, name: event.currentTarget.value } })
                  }}
                />
              </label>
              <label>
                {t('assetKind')}
                <select
                  value={editor.draft.kind}
                  onChange={(event) => {
                    const kind = event.currentTarget.value
                    if (kind === 'character' || kind === 'scene' || kind === 'prop' || kind === 'voice')
                      edit({ ...editor, draft: { ...editor.draft, kind } })
                  }}
                >
                  {(['character', 'scene', 'prop', 'voice'] as const).map(kind => (
                    <option key={kind} value={kind}>
                      {t(kind)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <>
              <label>
                {t('shotTitle')}
                <Input
                  value={editor.draft.title}
                  onChange={(event) => {
                    edit({ ...editor, draft: { ...editor.draft, title: event.currentTarget.value } })
                  }}
                />
              </label>
              <label>
                {t('scene')}
                <Input
                  value={editor.draft.scene}
                  onChange={(event) => {
                    edit({ ...editor, draft: { ...editor.draft, scene: event.currentTarget.value } })
                  }}
                />
              </label>
              <label>
                {t('studioSeconds')}
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={editor.draft.frames / production.fps}
                  onChange={(event) => {
                    edit({
                      ...editor,
                      draft: {
                        ...editor.draft,
                        frames: Math.round(Number(event.currentTarget.value) * production.fps),
                      },
                    })
                  }}
                />
              </label>
              <label>
                {t('studioDialogue')}
                <Input
                  value={editor.draft.dialogue}
                  onChange={(event) => {
                    edit({ ...editor, draft: { ...editor.draft, dialogue: event.currentTarget.value } })
                  }}
                />
              </label>
            </>
          )}
          <label>
            {t('descriptionField')}
            <textarea
              rows={5}
              maxLength={8000}
              value={editor.draft.prompt}
              onChange={(event) => {
                edit(
                  editor.kind === 'asset'
                    ? { kind: 'asset', draft: { ...editor.draft, prompt: event.currentTarget.value } }
                    : { kind: 'shot', draft: { ...editor.draft, prompt: event.currentTarget.value } },
                )
              }}
            />
          </label>
          {editor.kind === 'shot' && (
            <fieldset>
              <legend>{t('tabAssets')}</legend>
              {production.assets.map(asset => (
                <label className={css.check} key={asset.id}>
                  <input
                    type="checkbox"
                    checked={editor.draft.assetIds.includes(asset.id)}
                    onChange={(event) => {
                      edit({
                        ...editor,
                        draft: {
                          ...editor.draft,
                          assetIds: event.currentTarget.checked
                            ? [...editor.draft.assetIds, asset.id]
                            : editor.draft.assetIds.filter(id => id !== asset.id),
                        },
                      })
                    }}
                  />
                  {asset.name}
                </label>
              ))}
            </fieldset>
          )}
        </div>
      </div>
    </Modal>
  )
}
