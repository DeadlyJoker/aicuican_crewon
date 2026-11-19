/** Neutral running indicator beside the elapsed-time label. */
import { ReferenceIconRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './ChatView.module.css'

/** Render a decorative session icon without provider branding. */
export function RunningIndicator() {
  return <span className={css.runningIcon} aria-hidden="true"><ReferenceIconRegular kind="session" size={14} /></span>
}
