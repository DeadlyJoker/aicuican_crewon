/** Own the durable submit and observe sequence for short-drama media. */
import { isDeepStrictEqual } from 'node:util'
import type { Branded } from '@deepseek-ai/dsh-brand'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type { DramaProjectId } from './project-types.ts'
import type {
  MediaLookup, MediaOutput, MediaProvider, MediaRequestId, MediaRoute, MediaSubmission, MediaTaskId, MediaUncertainty,
} from './media-provider.ts'

/** Project-owned asset or shot identity targeted by generation. */
export type MediaTargetId = Branded<'MediaTargetId'>

/** A job freezes the source revision, route and workflow inputs selected at submission. */
export interface MediaJobRequest {
  id: MediaRequestId
  projectId: DramaProjectId
  targetId: MediaTargetId
  sourceRevision: number
  workflowRevision: string
  route: MediaRoute
  submission: MediaSubmission
}

/** Persisted result of a single attempt. Available outputs still require project archival. */
export type MediaJobStatus =
  | { state: 'submitting' }
  | { state: 'unknown'; reason: MediaUncertainty | 'interrupted' }
  | { state: 'accepted'; taskId: MediaTaskId }
  | { state: 'rejected'; code: string }
  | { state: 'failed'; taskId: MediaTaskId; code: string }
  | { state: 'available'; taskId: MediaTaskId; outputs: readonly MediaOutput[] }

/** The business request and latest known attempt state stored together. */
export type MediaJob = MediaJobRequest & { status: MediaJobStatus }

/** One Host-owned table, with writes resolving only after persistence. */
export interface MediaJobTable {
  get(id: MediaRequestId): MediaJob | undefined
  put(id: MediaRequestId, value: MediaJob): Promise<void>
}

type ResolveProvider = (route: MediaRoute) => Promise<MediaProvider>

/** Serialize operations for each request key within the owning Host. */
export class MediaJobs {
  private readonly operations = new Map<MediaRequestId, Promise<MediaJob>>()

  /**
   * @param table - Durable job table.
   * @param resolve - Builds the client for the saved route and resolves its current credential.
   */
  constructor(private readonly table: MediaJobTable, private readonly resolve: ResolveProvider) {}

  private run(id: MediaRequestId, action: () => Promise<MediaJob>): Promise<MediaJob> {
    const previous = this.operations.get(id)
    const operation = previous ? previous.then(action, action) : action()
    this.operations.set(id, operation)
    return operation.finally(() => {
      if (this.operations.get(id) === operation) this.operations.delete(id)
    })
  }

  private async save(request: MediaJobRequest, status: MediaJobStatus): Promise<MediaJob> {
    const job = { ...request, status }
    await this.table.put(job.id, job)
    return job
  }

  /**
   * Submit once for a new key. Repeat calls return the persisted attempt.
   * @param request - Validated inputs and owner-selected route.
   * @param signal - Host lifetime or user cancellation.
   * @returns The persisted receipt, including known and unknown failures.
   */
  submit(request: MediaJobRequest, signal: AbortSignal): Promise<MediaJob> {
    const captured = structuredClone(request)
    return this.run(captured.id, async () => {
      const existing = this.table.get(captured.id)
      if (existing) {
        const { status: _status, ...original } = existing
        if (!isDeepStrictEqual(original, captured)) throw new Error('Generation request key already belongs to different inputs.')
        return this.recover(existing)
      }
      signal.throwIfAborted()
      const provider = await this.resolve(captured.route)
      signal.throwIfAborted()
      await this.save(captured, { state: 'submitting' })
      return this.save(captured, await provider.submit(captured.id, captured.submission, signal))
    })
  }

  private async recover(job: MediaJob): Promise<MediaJob> {
    return job.status.state === 'submitting' ? this.save(job, { state: 'unknown', reason: 'interrupted' }) : job
  }

  /**
   * Observe the original provider without starting another attempt.
   * @param id - Persisted request key.
   * @param signal - Host lifetime or user cancellation.
   * @returns Latest durable job state. An inconclusive observation preserves the record.
   */
  observe(id: MediaRequestId, signal: AbortSignal): Promise<MediaJob> {
    return this.run(id, async () => {
      const stored = this.table.get(id)
      if (!stored) throw new Error('Generation job was not found.')
      const job = await this.recover(stored)
      const { status, ...request } = job
      let lookup: MediaLookup
      switch (status.state) {
        case 'accepted':
          lookup = { requestId: id, taskId: status.taskId }
          break
        case 'unknown':
          lookup = { requestId: id }
          break
        case 'submitting':
        case 'rejected':
        case 'failed':
        case 'available':
          return job
        default:
          return assertNever(status)
      }
      const provider = await this.resolve(job.route)
      const result = await provider.observe(lookup, signal)
      switch (result.state) {
        case 'pending':
          return status.state === 'accepted' ? job : this.save(request, { state: 'accepted', taskId: result.taskId })
        case 'unknown':
          return job
        case 'failed':
          return this.save(request, result)
        case 'succeeded':
          return this.save(request, { state: 'available', taskId: result.taskId, outputs: result.outputs })
        default:
          return assertNever(result)
      }
    })
  }
}
