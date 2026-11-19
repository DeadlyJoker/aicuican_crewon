/** Mount a native skill centre backed by authenticated Host operations. */
import type { Context } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import remote from '@deepseek-ai/dsh-skill-explorer-bundle/remote'
import { SkillPanelIcon } from './SkillPanelIcon.tsx'
import { ExpertCapabilities } from './ExpertCapabilities.tsx'
import type {} from './capability-slot.ts'
import { ToolboxPage } from './ToolboxPage.tsx'
import type { SkillExplorerActions } from './actions.ts'
import type { ToolboxActions } from './toolbox-actions.ts'
import type { McpManagedServerView } from '@deepseek-ai/dsh-mcp-manager/types'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { en, zh } from './locales.ts'

const PANEL_ID = 'crewon-skills' as MainPanelId

/** Native composition services used by the skill centre. */
export const inject = ['slots', 'locale', 'remote']

/**
 * Register the skill-centre page after its authenticated remote service is ready.
 * @param ctx - Browser plugin context with the native slot and remote services.
 * @returns Completion after the remote contribution is mounted.
 */
export async function apply(ctx: Context): Promise<void> {
  await ctx.remote.$mount(remote)
  ctx.effect(() => ctx.locale.register('skillExplorer', { en, zh }), 'skill-centre dictionaries')
  const t = ctx.locale.bind('skillExplorer')
  ctx.inject([
    'remote.skillExplorer', 'remote.toolboxCatalog', 'remote.toolboxMcp', 'remote.toolboxCli',
    'remote.toolboxAuthorization', 'remote.mcpManager', 'remote.credentials',
  ], (ctx) => {
    const api = ctx.remote.skillExplorer
    const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    }
    const skills: SkillExplorerActions = {
      list: async scope => unwrap(await api.list(scope)),
      read: async target => unwrap(await api.read(target)),
      create: async (request) => { unwrap(await api.create(request)) },
      update: async (request) => { unwrap(await api.update(request)) },
      setEnabled: async (request) => { unwrap(await api.setEnabled(request)) },
      trash: async target => unwrap(await api.trash(target)),
      restore: async (entry) => { unwrap(await api.restore(entry)) },
      importSkills: async request => unwrap(await api.importSkills(request)),
    }
    const actions: ToolboxActions = {
      skills,
      catalog: {
        read: async () => unwrap(await ctx.remote.toolboxCatalog.read()),
        save: async (key, value, revision) => unwrap(await ctx.remote.toolboxCatalog.save(key, value, revision)),
      },
      mcp: {
        inventory: async () => unwrap(await ctx.remote.toolboxMcp.inventory()),
        save: async request => unwrap(await ctx.remote.toolboxMcp.save(request)),
        setEnabled: async request => unwrap(await ctx.remote.toolboxMcp.setEnabled(request)),
        remove: async request => unwrap(await ctx.remote.toolboxMcp.removeConnection(request)),
        probe: async (name, signal) => unwrap(await ctx.remote.mcpManager.probe(name, signal)),
        restart: async (name) => { unwrap(await ctx.remote.mcpManager.restart(name)) },
        setCredential: async (ref, value) => { unwrap(await ctx.remote.credentials.set(ref, value)) },
      },
      cli: {
        list: async () => unwrap(await ctx.remote.toolboxCli.list()),
        save: async (request) => {
          unwrap(await ctx.remote.toolboxCli.save(request))
          return unwrap(await ctx.remote.toolboxCli.list())
        },
        remove: async (request) => {
          unwrap(await ctx.remote.toolboxCli.removeTool(request))
          return unwrap(await ctx.remote.toolboxCli.list())
        },
        probe: async (request, signal) => unwrap(await ctx.remote.toolboxCli.probe(request, signal)),
        run: async (request, signal) => unwrap(await ctx.remote.toolboxCli.run(request, signal)),
      },
      authorization: {
        list: async () => unwrap(await ctx.remote.toolboxAuthorization.list()),
        save: async request => unwrap(await ctx.remote.toolboxAuthorization.save(request)),
      },
    }
    ctx.slots.inject('toolbox.expert-capabilities', () => ctx.slots.register({
      name: 'toolbox.expert-capabilities', locale: 'skillExplorer', inject: () => ({ actions }),
    }, ExpertCapabilities))
    const connections = createSnapshotStore<{ items: McpManagedServerView[] }>({ items: [] })
    ctx.effect(() => {
      const stream = ctx.remote.$stream<McpManagedServerView[]>({
        name: 'toolbox connections', open: signal => ctx.remote.mcpManager.watch(signal),
        ended: () => new Error('Toolbox connection stream ended'),
      })
      void (async () => {
        try {
          for await (const frame of stream) { frame.accept(); connections.set({ items: frame.value }) }
        } catch (error) { ctx.logger.warn('Toolbox connection updates stopped', error) }
      })()
      return () => stream.dispose()
    }, 'toolbox connection status')
    ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main', key: PANEL_ID, locale: 'skillExplorer', inject: () => ({ actions, hooks: { connections } }),
    }, ToolboxPage))
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist', id: PANEL_ID, order: 16, label: () => t('title'),
    }, SkillPanelIcon))
  })
}

export type { CapabilityCommit } from './capability-slot.ts'
