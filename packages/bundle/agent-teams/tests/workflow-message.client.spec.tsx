// @vitest-environment jsdom
import type { ComponentProps } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkflowCommand } from '../src/client/WorkflowPage.tsx'

afterEach(cleanup)

it('renders one workflow result through its visible message while suppressing the native command receipt', async () => {
  const read = vi.fn().mockResolvedValue({ sessionId: 'run-1', input: '17 + 25', status: 'delivered', delivery: '42 · V1' })
  // Unused framework seats are omitted from this focused renderer fixture.
  const props = {
    sessionId: 'run-1', read, t: (key: string) => key,
    node: { kind: 'command', commandId: 'command-1', name: 'team-workflow-run', seq: 4, time: 1, args: '', outcome: null },
  } as ComponentProps<typeof WorkflowCommand>
  const view = render(<WorkflowCommand {...props} />)
  expect(read).not.toHaveBeenCalled()
  expect(screen.queryByText('42 · V1')).toBeNull()
  await act(async () => { view.rerender(<WorkflowCommand {...props} renderCard />) })
  expect(screen.getAllByText('42 · V1')).toHaveLength(1)
})
