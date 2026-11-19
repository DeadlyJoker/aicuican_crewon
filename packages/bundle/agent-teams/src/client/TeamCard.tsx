/** Compact catalogue cards shared by the Teams modes. */
import type { ReactNode } from 'react'
import {
  Button, Tooltip, IconBranchOutlineRegular, IconUsersOutlineRegular,
  IconUserOutlineRegular, IconPlayOutlineRegular, IconEditOutlineRegular,
  IconTrashOutlineRegular, IconClockOutlineRegular, IconFolderOpenOutlineRegular, IconSettingsOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import css from './TeamCard.module.css'

interface CardAction {
  kind: 'run' | 'edit' | 'settings' | 'delete' | 'history' | 'projects' | 'office'
  label: string
  disabled?: boolean
  expanded?: boolean
  onClick(this: void): void
}
const icons = {
  office: IconUsersOutlineRegular, projects: IconFolderOpenOutlineRegular, run: IconPlayOutlineRegular, edit: IconEditOutlineRegular,
  delete: IconTrashOutlineRegular, history: IconClockOutlineRegular,
  settings: IconSettingsOutlineRegular,
}

/** Render a small identity glyph with a stable palette position and an accessible label. */
export function AgentAvatar({ label, index }: { label: string; index: number }) {
  return <Tooltip label={label} side="top" portal>
    <span className={css.avatar} data-color={index % 5} aria-label={label}>
      <IconUserOutlineRegular size={16} />
    </span>
  </Tooltip>
}

/** Keep secondary operations quiet until hover or keyboard focus; touch always exposes them. */
export function TeamCard({ title, description, mode, actions, footer, children }: {
  title: string
  description?: string | undefined
  mode: 'experts' | 'workflows' | 'offices' | 'specialists'
  actions?: readonly CardAction[]
  footer?: ReactNode
  children?: ReactNode
}) {
  const Icon = mode === 'specialists' ? IconUserOutlineRegular : mode === 'workflows' ? IconBranchOutlineRegular : IconUsersOutlineRegular
  return <article className={css.card} data-team-card={mode}>
    <div className={css.heading}>
      <span className={css.mark} data-mode={mode}><Icon size={21} /></span>
      <div className={css.title}><h4>{title}</h4></div>
      <div className={css.actions}>
        {actions?.map((action) => {
          const ActionIcon = icons[action.kind]
          return <Tooltip key={action.kind} label={action.label} side="top" portal>
            <Button size="sm" aria-label={action.label} disabled={action.disabled}
              aria-expanded={action.expanded} onClick={action.onClick} className={css.action}>
              <ActionIcon size={16} />
            </Button>
          </Tooltip>
        })}
      </div>
    </div>
    {description && <p className={css.description}>{description}</p>}
    {footer && <div className={css.footer}>{footer}</div>}
    {children}
  </article>
}
