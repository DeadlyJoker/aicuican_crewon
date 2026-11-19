import { expect, it, vi } from 'vitest'
import type { ISessions, SessionFace, SessionReference, SessionBinding } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { createTeamLauncher } from '../src/client/launch.ts'

const sessionId = 'session-team-test' as SessionId
const workspaceId = 'workspace-team-test' as WorkspaceId

function setup() {
  const command = vi.fn<SessionFace['command']>().mockResolvedValue({ ok: true, value: { matched: true } })
  const create = vi.fn<ISessions['create']>().mockResolvedValue(sessionId)
  const session: Partial<SessionFace> = { command }
  const binding = { sessionId, session: session as SessionFace } as SessionBinding
  const reference: SessionReference = {
    sessionId, binding, ready: Promise.resolve(binding), release: vi.fn(), [Symbol.dispose]: vi.fn(),
  }
  const using: ISessions['using'] = async (_id, _options, operation) => operation(reference)
  const openSession = vi.fn()
  const launcher = createTeamLauncher({ create, using }, { openSession })
  return { launcher, command, create, openSession }
}

it('creates a fresh workspace session, admits the saved profile, and opens its conversation', async () => {
  const { launcher, command, create, openSession } = setup()
  await launcher.launch('Product experts', 'Review onboarding', workspaceId)
  expect(create).toHaveBeenCalledWith({ workspaceId })
  expect(command).toHaveBeenCalledWith('/agent-teams --profile "Product experts" Review onboarding')
  expect(openSession).toHaveBeenCalledWith(sessionId)
  expect(launcher.state.getSnapshot()).toEqual({ pending: false })
})

it('admits only one task while a submission is pending', async () => {
  const { launcher, command, create } = setup()
  let accept: ((value: Awaited<ReturnType<SessionFace['command']>>) => void) | undefined
  command.mockImplementation(() => new Promise((resolve) => { accept = resolve }))
  const first = launcher.launch('Product experts', 'Review onboarding', workspaceId)
  await vi.waitFor(() => { expect(command).toHaveBeenCalledOnce() })
  await launcher.launch('Product experts', 'Review onboarding', workspaceId)
  expect(create).toHaveBeenCalledOnce()
  accept?.({ ok: true, value: { matched: true } })
  await first
})

it('retains the created session after an uncertain admission instead of resubmitting', async () => {
  const { launcher, command, create, openSession } = setup()
  command.mockRejectedValue(new Error('Connection lost'))
  await launcher.launch('Product experts', 'Review onboarding', workspaceId)
  expect(launcher.state.getSnapshot()).toMatchObject({ pending: false, sessionId, failure: 'Connection lost' })
  expect(openSession).not.toHaveBeenCalled()
  await launcher.launch('Product experts', 'Review onboarding', workspaceId)
  expect(create).toHaveBeenCalledOnce()
  launcher.openCreated()
  expect(openSession).toHaveBeenCalledWith(sessionId)
})

it('does not submit or navigate after the plugin is disposed during creation', async () => {
  const { launcher, create, command, openSession } = setup()
  let created: ((id: SessionId) => void) | undefined
  create.mockImplementation(() => new Promise((resolve) => { created = resolve }))
  const pending = launcher.launch('Product experts', 'Review onboarding', workspaceId)
  launcher.dispose()
  created?.(sessionId)
  await pending
  expect(command).not.toHaveBeenCalled()
  expect(openSession).not.toHaveBeenCalled()
})
