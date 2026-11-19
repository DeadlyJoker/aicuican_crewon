/** Optional expert-form integration for the toolbox's existing preset policies. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Validate the staged choices before saving an expert, then return its policy commit operation. */
export type CapabilityCommit = () => Promise<(agentPreset: string) => Promise<void>>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Optional policy editor; the parent saves the expert before committing its policy. */
    'toolbox.expert-capabilities': {
      kind: 'single'
      scope: 'root'
      owner: {
        agentPreset: string
        busy: boolean
        registerCommit(this: void, commit: CapabilityCommit): () => void
      }
    }
  }
}
