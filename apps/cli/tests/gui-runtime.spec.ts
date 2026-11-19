/** One owner and private discovery across simultaneous GUI launches. */
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { acquireGuiRuntime, withGuiProfilePreparation } from '../src/gui-runtime.ts'

const homes: string[] = []
async function home(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'dsh-gui-owner-'))
  homes.push(path)
  return path
}
afterEach(async () => { await Promise.all(homes.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

it('shares one owner across simultaneous launches and protects its discovery credentials', async () => {
  const directory = await home()
  const first = acquireGuiRuntime(directory, '1.0.0')
  const second = acquireGuiRuntime(directory, '1.0.0')
  const owner = await Promise.race([first, second])
  expect(owner.kind).toBe('owner')
  if (owner.kind !== 'owner') throw new Error('No owner was selected')
  await owner.publish('http://127.0.0.1:3080/?token=browser')
  const results = await Promise.all([first, second])
  expect(results.map(item => item.kind).sort()).toEqual(['follower', 'owner'])
  const follower = results.find(item => item.kind === 'follower')
  expect(follower?.record.token).toBe(owner.token)
  expect((await stat(join(directory, 'gui-runtime', 'owner.json'))).mode & 0o777).toBe(0o600)
  await owner.release()
})

it('rejects a different runtime version before attaching', async () => {
  const directory = await home()
  const owner = await acquireGuiRuntime(directory, '1.0.0')
  if (owner.kind !== 'owner') throw new Error('Expected owner')
  await owner.publish('http://127.0.0.1:3080')
  await expect(acquireGuiRuntime(directory, '2.0.0')).rejects.toThrow('requires 2.0.0')
  await owner.release()
})

it('keeps a successor when the former owner releases twice', async () => {
  const directory = await home()
  const owner = await acquireGuiRuntime(directory, '1.0.0')
  if (owner.kind !== 'owner') throw new Error('Expected owner')
  await owner.release()
  const next = await acquireGuiRuntime(directory, '1.0.0')
  if (next.kind !== 'owner') throw new Error('Expected successor')
  await owner.release()
  await next.publish('http://127.0.0.1:3080')
  expect((await acquireGuiRuntime(directory, '1.0.0')).kind).toBe('follower')
  await next.release()
})

it('rejects remote discovery addresses and leaves the startup owner recoverable', async () => {
  const directory = await home()
  const owner = await acquireGuiRuntime(directory, '1.0.0')
  if (owner.kind !== 'owner') throw new Error('Expected owner')
  await expect(owner.publish('http://example.com')).rejects.toThrow('local HTTP')
  await owner.publish('http://127.0.0.1:3080')
  await owner.release()
})

it('cancels a follower waiting for an owner that has not announced readiness', async () => {
  const directory = await home()
  const owner = await acquireGuiRuntime(directory, '1.0.0')
  if (owner.kind !== 'owner') throw new Error('Expected owner')
  const abort = new AbortController()
  const follower = acquireGuiRuntime(directory, '1.0.0', abort.signal)
  abort.abort()
  await expect(follower).rejects.toThrow()
  await owner.release()
})

it('takes over only an exited owner and replaces its prior ready address', async () => {
  const directory = await home()
  const location = join(directory, 'gui-runtime')
  await mkdir(location)
  await writeFile(join(location, 'owner.json'), JSON.stringify({
    id: randomUUID(), pid: 2147483647, version: '1.0.0', token: 'a'.repeat(64), url: 'http://127.0.0.1:3081',
  }))
  const owner = await acquireGuiRuntime(directory, '1.0.0')
  if (owner.kind !== 'owner') throw new Error('Expected owner')
  await owner.publish('http://127.0.0.1:3080')
  expect(JSON.parse(await readFile(join(location, 'owner.json'), 'utf8'))).toMatchObject({ url: 'http://127.0.0.1:3080' })
  await owner.release()
})

it('skips all profile writes while an existing Host owns the home', async () => {
  const directory = await home()
  const owner = await acquireGuiRuntime(directory, '1.0.0')
  if (owner.kind !== 'owner') throw new Error('Expected owner')
  let prepared = false
  expect(await withGuiProfilePreparation(directory, async () => { prepared = true })).toBe(false)
  expect(prepared).toBe(false)
  await owner.release()
})

it('keeps ownership acquisition behind complete offline profile preparation', async () => {
  const directory = await home()
  const entered = Promise.withResolvers<undefined>()
  const drained = Promise.withResolvers<undefined>()
  const preparing = withGuiProfilePreparation(directory, async () => {
    entered.resolve(undefined)
    await drained.promise
  })
  await entered.promise
  let acquired = false
  const acquisition = acquireGuiRuntime(directory, '1.0.0').then((owner) => { acquired = true; return owner })
  await new Promise(resolve => setTimeout(resolve, 30))
  expect(acquired).toBe(false)
  drained.resolve(undefined)
  expect(await preparing).toBe(true)
  const owner = await acquisition
  expect(owner.kind).toBe('owner')
  if (owner.kind === 'owner') await owner.release()
})
