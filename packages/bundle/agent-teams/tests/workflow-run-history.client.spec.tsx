// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { WorkflowRunHistory } from '../src/client/WorkflowRunHistory.tsx'
import { zh } from '../src/client/team-details-copy.ts'
import type { WorkflowHistoryCursor, WorkflowHistoryPage } from '../src/workflow-types.ts'

afterEach(cleanup)
const current = SessionId('current-run')
const older = SessionId('older-run')
const next: WorkflowHistoryCursor = { createdAt: 20, sessionId: current }
const copy: Record<string, string> = zh
const t = (key: string) => copy[key] ?? key

it('expands recorded inputs and results in place and pages through only the requested workflow', async () => {
  const read = vi.fn<(_: string, before?: WorkflowHistoryCursor) => Promise<WorkflowHistoryPage>>()
    .mockResolvedValueOnce({ runs: [{ workflowId: 'flow', sessionId: current, name: '已保存流程', createdAt: 20,
      input: '当前输入', status: 'delivered', delivery: '**真实结果**' }], next })
    .mockResolvedValueOnce({ runs: [{ workflowId: 'flow', sessionId: older, name: '旧名称', createdAt: 10,
      input: '历史输入', status: 'pending', draft: '等待审批的草稿' }] })
  const close = vi.fn()
  await act(async () => { render(<WorkflowRunHistory workflowId="flow" name="已保存流程" currentSessionId={current}
    read={read} close={close} t={t} />) })
  expect(read).toHaveBeenCalledWith('flow', undefined)
  expect(screen.getByRole('dialog', { name: '运行历史' })).toBeTruthy()
  expect(screen.getByText('当前运行')).toBeTruthy()
  expect(screen.getByText('真实结果').tagName).toBe('STRONG')
  expect(close).not.toHaveBeenCalled()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '加载更早记录' })) })
  expect(read).toHaveBeenLastCalledWith('flow', next)
  expect(screen.getByText('等待审批的草稿')).toBeTruthy()
  expect(screen.getAllByText('当前运行')).toHaveLength(1)
  expect(screen.queryByRole('button', { name: '加载更早记录' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '关闭' }))
  expect(close).toHaveBeenCalledTimes(1)
})

it('keeps loaded history visible when the next page fails and retries the same cursor', async () => {
  const read = vi.fn<(_: string, before?: WorkflowHistoryCursor) => Promise<WorkflowHistoryPage>>()
    .mockResolvedValueOnce({ runs: [{ workflowId: 'flow', sessionId: current, name: '流程', createdAt: 20,
      input: '保留此记录', status: 'failed', stepOutputs: { draft: '已生成的部分内容' } }], next })
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ runs: [] })
  await act(async () => { render(<WorkflowRunHistory workflowId="flow" name="流程" currentSessionId={current}
    read={read} close={vi.fn()} t={t} />) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '加载更早记录' })) })
  expect(screen.getByRole('alert').textContent).toContain('运行历史加载失败')
  expect(screen.getByText('已生成的部分内容')).toBeTruthy()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '重试' })) })
  expect(read).toHaveBeenLastCalledWith('flow', next)
  expect(screen.queryByRole('alert')).toBeNull()
})


it('refreshes the latest history after another client changes a run without dropping loaded pages', async () => {
  const pending = { workflowId: 'flow', sessionId: current, name: '流程', createdAt: 20,
    input: '原有输入', status: 'pending' as const, draft: '待审批内容' }
  const historical = { workflowId: 'flow', sessionId: older, name: '流程', createdAt: 10,
    input: '更早输入', status: 'delivered' as const, delivery: '保留的历史内容' }
  const read = vi.fn<(_: string, before?: WorkflowHistoryCursor) => Promise<WorkflowHistoryPage>>()
    .mockResolvedValueOnce({ runs: [pending], next })
    .mockResolvedValueOnce({ runs: [historical] })
  const props = { workflowId: 'flow', name: '流程', currentSessionId: current, read, close: vi.fn(), t }
  const view = await act(async () => render(<WorkflowRunHistory {...props} revision={0} />))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '加载更早记录' })) })
  const oldDetails = screen.getByText('保留的历史内容').closest('details')!
  oldDetails.open = true
  read.mockImplementation(async (_, before) => before ? { runs: [historical] }
    : { runs: [{ ...pending, status: 'delivered', delivery: '另一端审批后的交付' }], next })
  await act(async () => { view.rerender(<WorkflowRunHistory {...props} revision={1} />) })
  expect(screen.getByText('另一端审批后的交付')).toBeTruthy()
  expect(screen.getByText('保留的历史内容').closest('details')).toBe(oldDetails)
  expect(oldDetails.open).toBe(true)
  expect(screen.getAllByText('原有输入')).toHaveLength(2)
})
