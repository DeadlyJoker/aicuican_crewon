/** Interactive cards augment native conversation bodies and retain native approval ownership. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { InteractiveCards } from './cards.ts'
import { GENUI_RUNTIME_URL } from './runtime-url.ts'
export { InteractiveCards } from './cards.ts'

/** Host services needed for authoring, persisted cards and native submissions. */
export const inject = ['systemPrompt', 'webServer', 'profileContext', 'sessionController', 'commands', 'typert']

/** @param ctx - Enabled profile scope. */
export function apply(ctx: Context): void {
  new InteractiveCards(ctx)
  ctx.effect(() => ctx.systemPrompt.section({ name: 'interactive-ui', order: 85, text: `Interactive UI is available in this conversation, including office member replies. Decide automatically whether a card helps. Use normal Markdown for explanations. Use a form to collect structured user choices, or a chart to compare actual data. Do not invent measurements. Label example data explicitly. Keep prose short around a card.
Emit a fenced schemaJson JSON object. For forms use {"componentName":"CrewonForm","title":"Short title","description":"Optional short description","submitLabel":"Continue","fields":[{"name":"goal","label":"Goal","type":"text","required":true},{"name":"scope","label":"Scope","type":"select","options":["Small","Large"]},{"name":"notes","label":"Notes","type":"textarea"},{"name":"include","label":"Include details","type":"checkbox"}]}. Field types are text, number, select, textarea, checkbox. Optional default is string or boolean. Use unique field names. Form submissions return to you as user input without replacing their composer draft. Never use a form as an approval bypass; request existing native approvals when needed.
For charts use OpenTiny GenUI schema, for example {"componentName":"Page","children":[{"componentName":"TinyHuichartsBar","props":{"options":{"data":[{"Month":"Jan","Value":20},{"Month":"Feb","Value":35}],"xAxis":"Month","yAxis":"Value"}}}]}. Supported charts: TinyHuichartsBar, TinyHuichartsLine, TinyHuichartsPie. Charts must be read-only, use JSON literals only, without expressions, events, scripts, network URLs or custom actions. A user explicitly asking for an interactive interface should receive a schemaJson card when feasible.` }), 'interactive authoring guidance')
  ctx.effect(() => ctx.commands.register({ name: 'interactive-ui', description: 'Generate an interactive chart or form.', input: { hint: '<request>', attachments: true },
    handler: ({ agent, rawInput, attachments }) => {
      agent.followup(createUserMessage({ content: [{ type: 'text', text: `Please use an interactive schemaJson chart or form for this request: ${rawInput}` }, ...attachments], source: { kind: 'user' } }))
      return { kind: 'success', text: 'Interactive interface requested.' }
    },
  }), 'explicit interactive interface command')
  const runtime = join(dirname(createRequire(import.meta.url).resolve('dsh-genui/package.json')), 'lib/genui-runtime.js')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: GENUI_RUNTIME_URL, handler: async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return }
    const body = await readFile(runtime)
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' })
    response.end(request.method === 'HEAD' ? undefined : body)
  } }), 'OpenTiny interactive renderer')
}
