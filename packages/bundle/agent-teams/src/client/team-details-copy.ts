/** Copy for compact session context in the native right sidebar. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'
/**
 * English copy for this UI domain.
 */
export const en = {
  viewOffice: 'View office', viewWorkflow: 'View workflow', office: 'Office', workflow: 'Workflow',
  lobby: 'Lobby · Everyday discussion', topic: 'Current topic', thisRun: 'This run', members: 'Members', steps: 'Steps', input: 'Run input',
  humanApproval: 'Human approval', inheritPreset: 'Conversation preset', manageOffice: 'Manage office', manageWorkflow: 'Manage workflow',
  working: 'Working', pending: 'Awaiting approval', delivering: 'Delivering', delivered: 'Delivered', completed: 'Completed',
  rejected: 'Rejected', failed: 'Failed', interrupted: 'Interrupted', cancelled: 'Cancelled', queued: 'Waiting',
  loading: 'Loading', unavailable: 'Details unavailable', loadFailed: 'Could not load details. Reopen the panel to retry.',
  traceHint: 'Open Trajectory above the conversation for Agent model and tool logs.',
  leader: 'Leader',
  setLeader: 'Office settings', editWorkflow: 'Workflow settings', openProjects: 'Projects and inbox', runHistory: 'This workflow’s history',
  coordinatedBy: 'Unaddressed messages go to', directRouting: 'Address a member with @', memberCount: 'members', activeCount: 'in progress', allIdle: 'No tasks in progress',
  idle: 'Idle', notRun: 'Not run', agentPreset: 'Agent preset', responsibility: 'Responsibilities', latestTask: 'Latest task', assignedBy: 'Assigned by',
  deliveryPending: 'The result has not been added to this topic. Check the member’s execution record.',
  progress: 'Completed nodes', workContent: 'Instructions', dependencies: 'Prerequisites', noDependencies: 'No prerequisites', result: 'Result',
  retry: 'Retry', copy: 'Copy', copied: 'Copied', footnotes: 'Footnotes',
  draftStep: 'Draft', reviewOne: 'Reviewer 1', reviewTwo: 'Reviewer 2', deliveryStep: 'Delivery',
  presetNotRecorded: 'Preset not recorded', dependenciesNotRecorded: 'Not recorded in this legacy run',
  agentExecutions: 'Agent executions', completedAgents: 'Completed Agent executions',
  historyTitle: 'Run history', close: 'Close', currentRun: 'Current run', emptyHistory: 'No runs yet.',
  historyDelivery: 'Delivery', historyOutput: 'Recorded output', noHistoryOutput: 'No output recorded yet.',
  historyLoadFailed: 'Could not load run history.', loadMoreHistory: 'Load earlier runs',
} as const
/**
 * Chinese copy for this UI domain.
 */
export const zh: Record<keyof typeof en, string> = {
  viewOffice: '查看办公室', viewWorkflow: '查看工作流', office: '办公室', workflow: '工作流',
  lobby: '大厅 · 日常讨论', topic: '当前话题', thisRun: '本次运行', members: '成员', steps: '步骤', input: '本次输入',
  humanApproval: '人工审批', inheritPreset: '沿用对话预设', manageOffice: '管理办公室', manageWorkflow: '管理工作流',
  working: '处理中', pending: '待审批', delivering: '交付中', delivered: '已交付', completed: '已完成',
  rejected: '已拒绝', failed: '失败', interrupted: '已中断', cancelled: '已取消', queued: '待开始',
  loading: '加载中', unavailable: '暂无详情', loadFailed: '详情加载失败，请重新打开面板重试',
  traceHint: 'Agent 的模型与工具日志可在对话顶部的「轨迹」中查看。',
  leader: '组长',
  setLeader: '办公室设置', editWorkflow: '工作流设置', openProjects: '项目与收件箱', runHistory: '此工作流的运行历史',
  coordinatedBy: '未指定成员时交给', directRouting: '通过 @ 指定成员', memberCount: '位成员', activeCount: '项处理中', allIdle: '当前无执行任务',
  idle: '空闲', notRun: '未执行', agentPreset: 'Agent 预设', responsibility: '职责', latestTask: '最近任务', assignedBy: '派发人',
  deliveryPending: '结果尚未写入话题，请查看成员执行记录',
  progress: '已完成节点', workContent: '工作内容', dependencies: '前置步骤', noDependencies: '无前置步骤', result: '执行结果',
  retry: '重试', copy: '复制', copied: '已复制', footnotes: '脚注',
  draftStep: '起草', reviewOne: '独立审阅 1', reviewTwo: '独立审阅 2', deliveryStep: '交付',
  presetNotRecorded: '预设未记录', dependenciesNotRecorded: '旧版运行未记录',
  agentExecutions: 'Agent 执行记录', completedAgents: '已完成 Agent 执行',
  historyTitle: '运行历史', close: '关闭', currentRun: '当前运行', emptyHistory: '暂无运行记录',
  historyDelivery: '交付结果', historyOutput: '已记录输出', noHistoryOutput: '暂未记录输出',
  historyLoadFailed: '运行历史加载失败', loadMoreHistory: '加载更早记录',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { /** Session-bound team details. */ teamDetails: keyof typeof en }
}
