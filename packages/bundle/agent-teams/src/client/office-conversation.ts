/** Project addressed office commands outside the model's collapsible work details. */
import type { CommandNode, ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-commands/types'

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    /** User-addressed message and its command lifecycle. */
    'office-message': CommandNode
    /** Workflow command retained as visible conversation activity after reopening. */
    'workflow-message': CommandNode
  }
}

/** Retain the original command identity and chronological position for live and restored history. */
function commandDefinition(kind: 'office-message' | 'workflow-message', names: readonly string[]): ConversationNodeDefinition<CommandNode> {
  return {
    kind, target: 'chat',
    match: (event) => {
      if (event.type === 'command/run' && names.includes(event.data.name)) {
        return { id: String(event.data.commandId), role: 'start' }
      }
      if (event.type === 'command/done') return { id: String(event.data.commandId), role: 'update' }
      return null
    },
    start: (_context, match) => {
      if (match.event.type !== 'command/run') throw new Error('Team messages require a command start.')
      return { kind: 'command', seq: match.event.seq, time: match.event.time,
        commandId: match.event.data.commandId, name: match.event.data.name,
        args: match.event.data.args ?? null, outcome: null }
    },
    update: (context, match) => match.event.type === 'command/done'
      ? { ...context.state, outcome: { kind: match.event.data.kind,
        ...(match.event.data.text === undefined ? {} : { text: match.event.data.text }) } }
      : context.state,
    buildViewNode: (context) => {
      if (!context.state) return null
      const node: ChatNode<'office-message' | 'workflow-message'> = { key: context.key, id: context.id, target: 'chat',
        kind, anchorSeq: context.state.seq, location: { kind: 'session' },
        groupTree: 'input', visibility: 'visible', data: context.state }
      return node
    },
  }
}

/** Keep addressed office messages visible during cold replay. */
export const officeMessageDefinition = commandDefinition('office-message', ['team-office-send'])

/** Keep workflow execution visible even when the parent has no model turn. */
export const workflowMessageDefinition = commandDefinition('workflow-message', ['team-workflow-run'])
