/** The complete Studio workspace sits beside its native Agent conversation. */
import { useEffect, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { DramaProject, DramaProjectId } from '../project-types.ts'
import type { createDramaWorkbench } from './workbench.ts'
import { StudioWorkbench } from './StudioWorkbench.tsx'

type Workbench = ReturnType<typeof createDramaWorkbench>
interface Actions {
  read(this: void, sessionId: SessionId): Promise<DramaProject | null>
  open(this: void, projectId: DramaProjectId): Promise<void>
}
type HeaderProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<'shortDrama'>
  & InjectFace<{ actions: Actions }>
type WorkspaceProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'shortDrama'>
  & InjectFace<{ lookup: Actions['read']; actions: Workbench['actions']; hooks: { drama: Workbench['store'] } }>

function StudioHeader({ sessionId, useSession, actions, t }: HeaderProps) {
  const running = useSession(value => value.running)
  const [project, setProject] = useState<DramaProject | null>(null)
  useEffect(() => {
    let alive = true
    void actions.read(sessionId).then((value) => { if (alive) setProject(value) }, () => { if (alive) setProject(null) })
    return () => { alive = false }
  }, [actions, sessionId, running])
  return project ? <Button size="sm" onClick={() => { void actions.open(project.id) }}>{t('viewStudio')}</Button> : null
}

function StudioRightWorkspace({ sessionId, useSession, useTabInfo, lookup, actions, useDrama, t }: WorkspaceProps) {
  const running = useSession(value => value.running)
  const visible = useTabInfo().tab.visible
  const [failed, fail] = useState(false)
  useEffect(() => {
    if (!visible || running) return
    let alive = true
    fail(false)
    void lookup(sessionId).then(async (project) => {
      if (alive && project) await actions.open(project.id)
    }).catch(() => { if (alive) fail(true) })
    return () => { alive = false }
  }, [actions, lookup, sessionId, running, visible])
  return <>
    {failed && <p role="alert">{t('openError')}</p>}
    <StudioWorkbench t={t} actions={actions} useDrama={useDrama} />
  </>
}

/**
 * Register Studio as an ordinary native right-sidebar page with a conversation utility.
 * @param ctx - Native client registration services.
 * @param actions - Authenticated project lookup and guarded navigation.
 * @param workbench - Project workspace state and Host-backed operations.
 */
export function registerStudioSession(ctx: Context, actions: Actions, workbench: Workbench): void {
  const id = '@deepseek-ai/dsh-short-drama-bundle/studio'
  const t = ctx.locale.bind('shortDrama')
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities', id: 'studio', locale: 'shortDrama', inject: () => ({ actions }),
  }, StudioHeader))
  ctx.effect(() => ctx.sidebarRightTabs.register({ id, kind: 'crewon-studio', priority: 'builtin', title: () => t('title') }),
    'studio workspace tab')
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: id, locale: 'shortDrama',
    inject: () => ({ lookup: actions.read, actions: workbench.actions, hooks: { drama: workbench.store } }),
  }, StudioRightWorkspace))
}
