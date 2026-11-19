/** Reactive catalogue revision shared by team pages and session details. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** The framework binds this store to the useCatalogue selector hook. */
export interface CatalogueFace {
  hooks: { catalogue: SnapshotStore<number> }
}
