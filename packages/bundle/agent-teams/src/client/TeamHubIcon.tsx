/** Navigation glyph for the Teams page. */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { IconUsersOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'

/** @param props - Sidebar icon dimensions. @returns The existing people glyph. */
export function TeamHubIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <IconUsersOutlineRegular size={size} />
}
