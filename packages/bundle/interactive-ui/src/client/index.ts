/** Install interactive bodies without replacing native assistant or office message chrome. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import remote from '@deepseek-ai/dsh-interactive-ui-bundle/remote'
import type { FormValues } from '../types.ts'
import { Cards } from './Cards.tsx'
import { en, zh } from './copy.ts'

/** Required browser services. */
export const inject = ['slots', 'locale', 'remote', 'commandUi']

/** @param ctx - Browser plugin scope. */
export async function apply(ctx: Context): Promise<void> {
  await ctx.remote.$mount(remote)
  ctx.effect(() => ctx.locale.register('interactiveUi', { en, zh }), 'interactive interface vocabulary')
  const t = ctx.locale.bind('interactiveUi')
  ctx.effect(() => ctx.commandUi.present({ name: 'interactive-ui', token: () => t('command'), label: () => t('title'),
    description: () => t('description'), inputHint: () => t('hint') }), 'interactive interface command')
  ctx.inject(['remote.interactiveCards'], (ctx) => {
    ctx.slots.inject('conversation.chat.message.body', () => ctx.slots.register({
      name: 'conversation.chat.message.body', locale: 'interactiveUi',
      select: owner => /```schemaJson|<schemaJson>/.test(owner.text) ? owner : null,
      inject: sessionId => ({
        read: async (key: string) => unwrap(await ctx.remote.interactiveCards.read({ sessionId, key })),
        save: async (key: string, values: FormValues, revision: number) =>
          unwrap(await ctx.remote.interactiveCards.save({ sessionId, key, values, revision })),
        submit: async (key: string, values: FormValues, revision: number, title: string,
          recipient?: { namespace: 'office'; id: string }, labels?: Record<string, string>) =>
          unwrap(await ctx.remote.interactiveCards.submit({
            sessionId, key, values, revision, title, ...(labels ? { labels } : {}), ...(recipient ? { recipient } : {}),
          })),
      }),
    }, Cards))
  })
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}
