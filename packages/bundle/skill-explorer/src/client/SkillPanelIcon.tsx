/** Current-color toolbox glyph for the sidebar launcher. */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/** @param props - Sidebar icon size. @returns A toolbox with a handle and central latch. */
export function SkillPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true"
    stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6.5 5.5V4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v1.5" />
    <rect x="2.5" y="5.5" width="15" height="11.5" rx="2" />
    <path d="M2.5 10h5.75m3.5 0h5.75M8.25 9h3.5v3h-3.5z" />
  </svg>
}
