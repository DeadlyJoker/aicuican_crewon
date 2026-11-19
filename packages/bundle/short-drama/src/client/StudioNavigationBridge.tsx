/** Open Studio only after the native Session sidebar has committed its surface. */
import { useEffect } from 'react'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { createStudioContext } from './studio-context.ts'

type Props = InjectFace<{
  show(this: void, sessionId: SessionId): void
  changed(this: void, sessionId: SessionId): Promise<void>
  hooks: {
    mounted: ObservableSnapshot<SessionId | undefined>
    studio: ReturnType<typeof createStudioContext>
  }
}>
/** @param props - Native mounted Session and product navigation request. @returns No additional visual chrome. */
export function StudioNavigationBridge({ useMounted, useStudio, show, changed }: Props) {
  const mounted = useMounted(value => value)
  const pending = useStudio(value => value.pendingSessionId)
  useEffect(() => { if (mounted && mounted === pending) show(mounted) }, [mounted, pending, show])
  useEffect(() => { if (mounted) void changed(mounted) }, [mounted, changed])
  return null
}
