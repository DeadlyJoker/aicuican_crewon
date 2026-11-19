/** Route the Studio navigation entry to the existing right-sidebar workspace. */
import { useEffect } from 'react'

/**
 * Open Studio beside the active conversation without retaining a second main page.
 * @param props - Native navigation operation owned by the plugin registration.
 * @returns No additional application shell.
 */
export function StudioLauncher({ open }: { open(this: void): void }) {
  useEffect(open, [open])
  return null
}
