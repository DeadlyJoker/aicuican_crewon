/** Rebase independent Studio edits while rejecting concurrent changes to the same content. */
import { z } from 'zod'
import type { StudioDocument } from '../project-types.ts'

const json = z.json()
type Json = z.infer<typeof json>
type Value = Json | undefined
const viewKeys = new Set(['pan', 'zoom', 'selected', 'panel', 'revision', 'projectDrafts', 'canvasUndo', 'canvasRedo',
  'history', 'studioNativeViewport', 'studioNativeCamera', 'referenceMode', 'referenceDrama'])
const editorViewKeys = new Set(['playhead', 'selected', 'zoom', 'snapping', 'collapsed'])
const projectedNodeKeys = new Set(['candidates', 'adoptedCandidateId', 'referenceOnly', 'status', 'frame',
  'nativeRevision', 'scriptVersions'])
const versionedNodeKeys = new Set(['prompt', 'description', 'title', 'dialogue', 'text', 'seconds'])
const initialGeometryKeys = new Set(['x', 'y', 'w', 'h'])
const equal = (left: Value, right: Value) => JSON.stringify(left) === JSON.stringify(right)
const object = (value: Value): value is { [key: string]: Json } => typeof value === 'object' && value !== null && !Array.isArray(value)

function merge(base: Value, local: Value, remote: Value, root = false, path = '$'): Value {
  if (equal(local, base)) return remote
  if (equal(remote, base) || equal(local, remote)) return local
  if (object(local) && object(remote) && (base === undefined || object(base))) {
    const result: { [key: string]: Json } = {}
    const editor = local.version === 1 && Array.isArray(local.clips) && Array.isArray(remote.clips)
    const native = typeof local.id === 'string' && (local.id === 'story' || /^(asset|shot):/u.test(local.id))
    const projection = Number(local.nativeRevision ?? 0) >= Number(remote.nativeRevision ?? 0) ? local : remote
    for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      const value = native && (projectedNodeKeys.has(key)
        || (local.nativeRevision !== remote.nativeRevision && versionedNodeKeys.has(key))) ? projection[key]
        : (root && viewKeys.has(key)) || (editor && editorViewKeys.has(key))
          || (native && base === undefined && initialGeometryKeys.has(key))
          ? local[key] : merge(base?.[key], local[key], remote[key], false, `${path}.${key}`)
      if (value !== undefined) result[key] = value
    }
    return result
  }
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)
    && [...base, ...local, ...remote].every(value => object(value) && typeof value.id === 'string')) {
    const index = (values: Json[]) => {
      const result = new Map<string, Json>()
      for (const value of values) {
        if (!object(value) || typeof value.id !== 'string') throw new Error('Studio node identity is missing')
        result.set(value.id, value)
      }
      return result
    }
    const before = index(base), mine = index(local), theirs = index(remote), result: Json[] = []
    for (const id of new Set([...mine.keys(), ...theirs.keys()])) {
      const value = merge(before.get(id), mine.get(id), theirs.get(id), false, `${path}[${id}]`)
      if (value !== undefined) result.push(value)
    }
    return result
  }
  throw new Error(`Studio content changed in another client at ${path}`)
}

function parse(value: string | undefined): Value {
  if (value === undefined) return undefined
  try { return json.parse(JSON.parse(value)) }
  catch (_error) { return value } // Other Studio storage entries may contain ordinary strings.
}

/**
 * @param initial - Document loaded for this frame.
 * @param write - Revision-checked Host save.
 * @param read - Read the current Host document after a rejected revision.
 * @returns Writer retaining its last acknowledged document; conflicting local edits stay in the frame.
 */
export function createStudioDocumentWriter(initial: StudioDocument,
  write: (document: StudioDocument) => Promise<StudioDocument>, read: () => Promise<StudioDocument>) {
  let base = initial
  let localBase = initial.storage
  return {
    async save(storage: Record<string, string>): Promise<StudioDocument> {
      for (let attempt = 0; attempt < 3; attempt++) {
        const pending: Record<string, string> = {}
        for (const key of new Set([...Object.keys(storage), ...Object.keys(base.storage)])) {
          const document = key === 'crewon-studio-demo-v1'
          const decode = (values: Record<string, string>) => document ? parse(values[key]) : values[key]
          const value = merge(decode(localBase), decode(storage), decode(base.storage), document)
          if (value === undefined) continue
          if (document) pending[key] = JSON.stringify(value)
          else if (typeof value === 'string') pending[key] = value
          else throw new Error('Studio storage value is invalid')
        }
        try {
          const saved = await write({ revision: base.revision, storage: pending })
          base = saved
          localBase = storage
          return saved
        } catch (error) {
          const latest = await read()
          if (latest.revision <= base.revision) throw error
          base = latest
        }
      }
      throw new Error('Studio changed repeatedly while saving')
    },
  }
}
