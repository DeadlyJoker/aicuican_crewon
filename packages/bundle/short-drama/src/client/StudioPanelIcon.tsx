/** Existing host artwork for the Studio navigation contribution. */
import { IconPlayOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** @param props - Native navigation dimensions. @returns Shared play artwork. */
export function DramaPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <IconPlayOutlineRegular size={size} />
}
