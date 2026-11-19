/** Committed team catalogue changes shared by every connected client. */
import type { Context } from '@deepseek-ai/cordis'
import { principalOf, Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'team-catalogue/owner-required': {}
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Committed revisions of the owner's team catalogue and run history. */
    teamCatalogue: TeamCatalogue
  }
  interface Events {
    /** A catalogue or execution-history write has committed; readers may reload it.
     * @mode emit
     */
    'team-catalogue/changed'(): void
  }
}

/** Announce a successful catalogue or execution-history write.
 * @param ctx - Host context whose committed data changed.
 */
export function notifyTeamCatalogue(ctx: Context): void {
  ctx.emit('team-catalogue/changed')
}

/** Coalesced revision stream for the current Host's team data. */
export class TeamCatalogue extends TypertRemoteService {
  private revision = 0
  private readonly watchers = new Set<() => void>()
  private readonly lifetime = new AbortController()

  /** @param ctx - Host context owning the catalogue event listener. */
  constructor(ctx: Context) {
    super(ctx, 'teamCatalogue')
    ctx.on('team-catalogue/changed', () => {
      this.revision++
      for (const changed of this.watchers) changed()
    })
    ctx.effect(() => () => { this.lifetime.abort() }, 'team catalogue revisions')
  }

  /** Observe the current revision and subsequent committed changes.
   * @param signal - Remote subscriber cancellation.
   * @returns Revision snapshots until the subscriber or Host stops.
   */
  @Remote({ mode: 'stream' })
  async *watch(signal: AbortSignal): AsyncIterable<number> {
    if (principalOf(this.ctx.invocation) !== undefined) {
      throw new RemoteError('team-catalogue/owner-required', 'The team catalogue belongs to the Host owner.', {})
    }
    const ended = AbortSignal.any([signal, this.lifetime.signal])
    const stopped = (): boolean => ended.aborted
    let wake = Promise.withResolvers<void>()
    let dirty = true
    const changed = (): void => { dirty = true; wake.resolve() }
    this.watchers.add(changed)
    ended.addEventListener('abort', changed, { once: true })
    try {
      while (!stopped()) {
        if (!dirty) await wake.promise
        if (stopped()) break
        dirty = false
        wake = Promise.withResolvers<void>()
        yield this.revision
      }
    } finally {
      this.watchers.delete(changed)
      ended.removeEventListener('abort', changed)
    }
  }
}
