/** Hosts the native Trajectory for a conversation or its selected subagent. */
import { useEffect, useState } from 'react'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import css from './views.module.css'

/** Retain a direct child for the lifetime of its selected Trajectory. */
export interface TrajectoryPaneInjected {
  retainAgent(this: void, address: {
    parentSessionId: SessionId
    childSessionId: SessionId
    mode: 'one-shot' | 'continuable' | 'unknown'
  }): SessionReference
}

type PaneProps = ConvViewProps & PropsRenderFactories & PropsLocale<'trajectory'>
  & PropsRenderSlots<'conversation.trajectory.execution'> & InjectFace<TrajectoryPaneInjected>

const ignoreFocus = () => {}

/** Keep execution selection in the parent tab and bind the ledger to the selected Session. */
export function TrajectoryPane({
  sessionId, useProjection, viewRequest, completeViewRequest, renderSlot, renderFactorySlot,
  SessionProvider, retainAgent, t,
}: PaneProps) {
  const [selectedAgent, selectAgent] = useState<SessionId>()
  const [opening, setOpening] = useState<{ id: SessionId; reference: SessionReference | null }>()
  const mode = useProjection('subagentCatalog', catalog => catalog?.find(entry => entry.id === selectedAgent)?.mode)

  useEffect(() => {
    if (selectedAgent === undefined) return
    let reference: SessionReference
    try {
      reference = retainAgent({
        parentSessionId: sessionId, childSessionId: selectedAgent,
        mode: mode === 'one-shot' || mode === 'continuable' ? mode : 'unknown',
      })
    } catch {
      setOpening({ id: selectedAgent, reference: null })
      return
    }
    setOpening({ id: selectedAgent, reference })
    return () => { reference.release() }
  }, [mode, retainAgent, selectedAgent, sessionId])

  const agent = opening?.id === selectedAgent ? opening?.reference : undefined
  return (
    <div className={css.pane}>
      {renderSlot('conversation.trajectory.execution', { selectedAgent, selectAgent })}
      <div className={css.paneLedger}>
        {selectedAgent === undefined
          ? renderFactorySlot('conversation.trajectory.ledger', { viewRequest, completeViewRequest })
          : agent === null
            ? <p role="status">{t('history.loadError')}</p>
            : agent !== undefined && (
              <SessionProvider key={selectedAgent} session={agent}>
                {renderFactorySlot('conversation.trajectory.ledger', { viewRequest: null, completeViewRequest: ignoreFocus })}
              </SessionProvider>
            )}
      </div>
    </div>
  )
}
