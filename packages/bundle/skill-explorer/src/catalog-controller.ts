/** Human-readable toolbox presentation stored through native Settings. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import { principalOf, Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type { ToolPresentation, ToolboxCatalogSnapshot } from './types.ts'

const presentationSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000),
  purpose: z.enum(['writing', 'research', 'data', 'development', 'media', 'general']),
})
const catalogSchema = z.record(z.string(), presentationSchema)

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Human-readable metadata for toolbox entries. */
    toolboxCatalog: ToolboxCatalog
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The caller cannot manage this Host's toolbox. */
    'toolbox/owner-required': {}
    /** The native settings namespace is unavailable. */
    'toolbox/settings-unavailable': {}
    /** The requested resource identity is unsupported. */
    'toolbox/invalid-resource': {}
  }
}

/** Owner-only presentation edits with native Settings revision checks. */
export class ToolboxCatalog extends TypertRemoteService {
  /**
   * Register metadata operations over the owning Settings entry.
   * @param ctx - Host context with native Settings and Remote services.
   * @param namespace - Config entry that owns the catalogue metadata.
   */
  constructor(ctx: Context, private readonly namespace: string) {
    super(ctx, 'toolboxCatalog')
  }

  private descriptor() {
    if (principalOf(this.ctx.invocation) !== undefined) {
      throw new RemoteError('toolbox/owner-required', 'Toolbox settings belong to the Host owner.', {})
    }
    const descriptor = this.ctx.settings.describe().find(item => item.ns === this.namespace)
    if (!descriptor) throw new RemoteError('toolbox/settings-unavailable', 'Toolbox settings are unavailable.', {})
    return descriptor
  }

  /**
   * Read display metadata without changing native resource identities.
   * @returns Current values and their revision.
   */
  @Remote
  read(): ToolboxCatalogSnapshot {
    const descriptor = this.descriptor()
    const value = z.object({ catalog: catalogSchema.default({}) }).parse(descriptor.value)
    return { revision: descriptor.revision, writable: this.ctx.settings.writable, items: value.catalog }
  }

  /**
   * Save a resource's title, purpose and summary.
   * @param key - Resource kind and stable native identity.
   * @param presentation - Human-readable fields.
   * @param expectedRevision - Revision shown when editing began.
   * @returns Updated presentation snapshot.
   */
  @Remote
  async save(key: string, presentation: ToolPresentation, expectedRevision: number): Promise<ToolboxCatalogSnapshot> {
    this.descriptor()
    if (!/^(skill|mcp|cli):.{1,200}$/u.test(key)) {
      throw new RemoteError('toolbox/invalid-resource', 'Unknown toolbox resource.', {})
    }
    const value = presentationSchema.parse(presentation)
    await this.ctx.settings.mutate(this.namespace, [{ op: 'set', path: ['catalog', key], value }], expectedRevision)
    return this.read()
  }
}
