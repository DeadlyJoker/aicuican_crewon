import { ReferenceIconRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the official mark with the presentation requested by its host surface.
 * @param props - Host-supplied mark presentation.
 * @returns the neutral conversation navigation icon.
 */
export function OfficialBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <ReferenceIconRegular kind="session" size={size} />
}

/**
 * Render the official name artwork without its independently slotted mark.
 * @returns the official name wordmark.
 */
export function OfficialBrandName() {
  return <span>CrewON</span>
}
