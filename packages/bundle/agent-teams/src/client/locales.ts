import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Copy for user-authored expert-team templates. */
export const en = {
  memberCount: '{count} specialists',
  guidance: 'Goals and deliverables', teamGoal: 'Team goal', constraints: 'Constraints', deliverables: 'Deliverables', examples: 'Example requests (one per line)',
  starterTeams: 'Suggested teams', useTemplate: 'Customize team',
  reviewTitle: 'Review expert team', pendingReview: 'Pending review', saved: 'Saved', discarded: 'Discarded',
  updateDraft: 'Update proposal', saveWithoutRunning: 'Save for reuse. Start a task when needed.', confirmSave: 'Confirm and save', discardDraft: 'Discard',
  createCommandHint: 'Describe the team purpose', taskCommandHint: 'Describe the problem for the experts',
  createCommand: 'create-expert-panel', createCommandDescription: 'Design a reusable team and review it before saving',
  taskCommand: 'agent-teams', taskCommandDescription: 'Ask experts to solve a problem',
  chooseExpert: 'Choose expert', customRole: 'Custom role', specialists: 'Experts', teamsPage: 'Teams', experts: 'Expert teams', offices: 'Offices', workflows: 'Workflows',
  officesDescription: 'Persistent members for ongoing collaboration and handoffs.',
  workflowsDescription: 'Reusable steps, inputs, outputs and human review gates. Workflow integration has not been enabled.',
  integrationPending: 'Integration pending',
  mentionInvalid: 'Mention one available team and enter a problem to solve.',
  title: 'Saved expert teams',
  description: 'Define specialists once, then reuse the team for different questions.',
  create: 'New expert team', edit: 'Edit', remove: 'Delete team', cancel: 'Cancel', save: 'Save team', saving: 'Saving…',
  empty: 'Create your first team with a professional focus and clear responsibilities.',
  name: 'Team name', specialty: 'Specialty and suitable problems', protocol: 'Collaboration and output requirements',
  members: 'Specialists', add: 'Add specialist', memberName: 'Member name', role: 'Professional role',
  duties: 'Responsibilities and working instructions', removeMember: 'Remove specialist',
  invalid: 'Enter a team name, specialty, and at least one specialist with a unique name, role, and responsibilities. Names cannot contain quotes or line breaks. The name captain is reserved.',
  duplicate: 'A team with this name already exists.', failure: 'Saving failed or the configuration changed. Your draft is retained. Reopen the team after checking other edits.',
  loading: 'Loading saved teams…', unavailable: 'Enable Expert teams to edit saved teams.',
  readonly: 'This profile is read-only.', limit: 'The maximum is 16 saved teams and {count} specialists per team.',
  use: 'Use this team', goal: 'Problem to solve', launch: 'Start task', launching: 'Starting…',
  commandUnavailable: 'Enable Expert teams and try again.', workspace: 'Workspace', workspaceRequired: 'Add a workspace before starting a task.',
  launchFailed: 'The task could not be confirmed. ', openCreated: 'Open created task',
  instruction: 'Creates a new conversation using the configured model and this team. Review the proposed work before approving.',
  deleteConfirm: 'Delete this saved definition? Existing team runs keep their own members and results.',
  confirmDelete: 'Confirm deletion', cancelDelete: 'Keep team',
} as const

/** Localized keys shared by the editor and its registration. */
export type LocaleKey = keyof typeof en

/** Chinese copy. */
export const zh: Record<LocaleKey, string> = {
  memberCount: '{count} 位专家',
  guidance: '目标与交付', teamGoal: '团队目标', constraints: '工作边界', deliverables: '交付要求', examples: '示例问题（每行一条）',
  starterTeams: '推荐团队', useTemplate: '使用模板',
  reviewTitle: '审查专家团', pendingReview: '待确认', saved: '已保存', discarded: '已放弃',
  updateDraft: '更新方案', saveWithoutRunning: '保存后可复用，需要时再发起任务。', confirmSave: '确认保存', discardDraft: '放弃',
  createCommandHint: '描述希望专家团解决的问题', taskCommandHint: '描述希望专家团解决的问题',
  createCommand: '创建专家团', createCommandDescription: '设计可复用的专家团，确认后保存',
  taskCommand: '专家团任务', taskCommandDescription: '由专家分工协作解决当前问题',
  chooseExpert: '选用专家', customRole: '自定义角色', specialists: '专家', teamsPage: '团队', experts: '专家团', offices: '办公室', workflows: '工作流',
  officesDescription: '固定成员，围绕项目持续协作与交接。',
  workflowsDescription: '定义可重复使用的步骤、输入输出和人工确认关卡。工作流接入尚未启用。',
  integrationPending: '尚未接入',
  mentionInvalid: '请选择一个可用的专家团，并输入要解决的问题',
  title: '已保存的专家团', description: '提前定义专家角色与职责，针对不同问题反复调用同一个团队。',
  create: '新建专家团', edit: '编辑', remove: '删除团队', cancel: '取消', save: '保存团队', saving: '正在保存…',
  empty: '创建第一个团队，设置专业方向和成员分工。', name: '团队名称', specialty: '专业方向与适用问题',
  protocol: '协作方式与交付要求', members: '专家成员', add: '添加专家', memberName: '成员名称', role: '专业角色',
  duties: '职责与工作指令', removeMember: '移除专家',
  invalid: '请填写团队名称、专业方向，以及至少一位专家的名称、角色和职责。成员名称不能重复，名称不能含引号或换行，captain 是保留名称。',
  duplicate: '已存在同名团队。', failure: '保存失败或配置已被修改，草稿已保留。请检查其他修改后重新打开团队。',
  loading: '正在加载已保存的团队…', unavailable: '启用专家团后即可编辑已保存的团队。', readonly: '当前配置为只读。',
  limit: '最多保存 16 个团队，每个团队最多 {count} 位专家。', use: '使用这个团队', goal: '要解决的具体问题',
  commandUnavailable: '请启用专家团后重试。', launch: '发起任务', launching: '正在发起…', workspace: '工作区', workspaceRequired: '请先添加一个工作区。',
  launchFailed: '未能确认任务是否发起成功。', openCreated: '打开已创建的任务',
  instruction: '使用当前配置的模型和所选专家团创建新对话。审阅分工计划后再批准执行。',
  deleteConfirm: '删除此团队定义？已有团队运行会保留各自的成员和结果。', confirmDelete: '确认删除', cancelDelete: '保留团队',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Saved team definitions and their specialist editor. */
    expertTeamTemplates: LocaleKey
  }
}
