/** Office catalogue and conversation copy. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'
/**
 * English copy for this UI domain.
 */
export const en = {
  chooseExpert: 'Choose expert',
  projects: 'Projects', inbox: 'Inbox', myInbox: 'My inbox', recipient: 'Inbox recipient', back: 'Back',
  createProject: 'Create project', createTopic: 'New topic', titleLabel: 'Title', message: 'Message',
  notifyMember: 'Notify member', publishOnly: 'Post only', publish: 'Post', you: 'You',
  projectEmpty: 'Create a project to organize ongoing discussions.', inboxEmpty: 'No unread topics', topicEmpty: 'Create a topic to start a conversation.',
  projectHint: 'Select a project or topic to continue.', projectFailure: 'Could not complete the action. Your input is retained; try again.',
  readFailure: 'Unread status could not be updated. Retrying.',
  managementMissing: 'This office is no longer available.', projectMissing: 'This project is no longer available.',
  unsavedTitle: 'Keep your changes?', unsavedPrompt: 'Keep editing, or discard these changes to open the requested item.',
  keepEditing: 'Keep editing', discardAndOpen: 'Discard and open',
  projectAction: 'Projects and inbox',
  teamMembers: 'Team members',
  leader: 'Leader', setLeader: 'Set office leader', saveLeader: 'Save settings', noLeader: 'No leader',
  settings: 'Office settings', editMembersHint: 'Switching an expert applies to new messages. Earlier messages retain their original expert version.',
  duplicateNames: 'Use a different name for each member.', presetsFailed: 'Agent presets could not be loaded. Existing member settings are retained.',
  leaderHint: 'Messages without a recipient go to the leader. You can still @ any member.',
  workspace: 'Workspace',
  copy: 'Copy', copied: 'Copied', footnotes: 'Footnotes',
  title: 'Offices', intro: 'Keep the same members across conversations and tasks.',
  create: 'New office', name: 'Office name', description: 'Purpose',
  memberName: 'Member name', role: 'Role', instruction: 'Responsibilities', preset: 'Agent preset',
  inherit: 'Inherit conversation preset', add: 'Add member', remove: 'Remove', save: 'Save office', cancel: 'Cancel',
  chooseMember: 'Choose a member with @, or set an office leader.',
  attachmentsUnsupported: 'Offices do not support attachments yet. Enter your message as text.',
  hall: 'Lobby', scope: 'Current scope', projectScope: 'Project', topicScope: 'Topic',
  hallHint: 'Everyday discussion', enterHall: 'Open lobby',
  delivery_pending: 'Syncing topic', delivery_failed: 'Reply retained; topic delivery failed',
  unread_required: 'Reply retained; new messages need review', stale_revision: 'Reply retained; topic has changed', member_not_following: 'Reply retained; follow the topic to continue',
  sendToMember: 'Send to member',
  open: 'Open office', members: 'members', empty: 'Create an office with your regular collaborators.',
  failure: 'The office could not be updated. Your input is retained.', retry: 'Retry',
  mention: 'Mention a member with @ to continue working with them.',
  invalid: 'Select one office member and enter a message.',
  running: 'Working', completed: 'Completed', failed: 'Failed', interrupted: 'Interrupted',
  waiting: 'Waiting for the member’s response', trace: 'View trajectory',
  unavailable: 'Select an available Agent preset before creating the office.',
  ready: 'Office ready', preparing: 'Opening office', startMember: 'The member will start when first mentioned.',
} as const
/**
 * Chinese copy for this UI domain.
 */
export const zh: Record<keyof typeof en, string> = {
  chooseExpert: '选用专家',
  projects: '项目', inbox: '收件箱', myInbox: '我的收件箱', recipient: '收件人', back: '返回办公室',
  createProject: '创建项目', createTopic: '新建话题', titleLabel: '标题', message: '消息',
  notifyMember: '通知成员', publishOnly: '仅发布消息', publish: '发布', you: '我',
  projectEmpty: '创建项目，将持续讨论整理在一起。', inboxEmpty: '暂无未读话题', topicEmpty: '新建话题，开始讨论。',
  projectHint: '选择项目或话题，继续讨论。', projectFailure: '操作未完成，内容已保留，请重试',
  readFailure: '未读状态更新失败，正在重试',
  managementMissing: '这个办公室已不可用', projectMissing: '这个项目已不可用',
  unsavedTitle: '当前修改尚未保存', unsavedPrompt: '继续编辑，或放弃修改后打开目标。',
  keepEditing: '继续编辑', discardAndOpen: '放弃修改并打开',
  projectAction: '项目与收件箱',
  teamMembers: '团队成员',
  leader: '组长', setLeader: '设置组长', saveLeader: '保存设置', noLeader: '不设组长',
  settings: '办公室设置', editMembersHint: '切换专家后，新消息使用新配置，历史消息保留原专家版本。',
  duplicateNames: '成员名称不能重复', presetsFailed: 'Agent 预设加载失败，已有成员设置已保留',
  leaderHint: '未指定成员的消息交给组长，也可 @ 任意成员。',
  workspace: '工作区',
  copy: '复制', copied: '已复制', footnotes: '脚注',
  title: '办公室', intro: '固定成员，持续讨论、协作和交接。',
  create: '新建办公室', name: '办公室名称', description: '用途',
  memberName: '成员名称', role: '专业角色', instruction: '成员职责', preset: 'Agent 预设',
  inherit: '沿用对话预设', add: '添加成员', remove: '移除', save: '保存办公室', cancel: '取消',
  chooseMember: '请先用 @ 选择成员，或为办公室设置组长',
  attachmentsUnsupported: '办公室暂不支持附件，请直接输入文字',
  hall: '大厅', scope: '当前范围', projectScope: '项目', topicScope: '话题',
  hallHint: '日常讨论', enterHall: '打开大厅',
  delivery_pending: '正在同步话题', delivery_failed: '回复已保留，话题回填失败',
  unread_required: '回复已保留，有新消息需要重看', stale_revision: '回复已保留，话题已有更新', member_not_following: '回复已保留，需先关注话题',
  sendToMember: '发送给成员',
  open: '打开办公室', members: '位成员', empty: '创建办公室，与固定成员持续协作。',
  failure: '办公室操作未完成，输入内容已保留', retry: '重试',
  mention: '输入 @ 选择成员，继续与同一位成员协作。',
  invalid: '请选择一位办公室成员，并输入消息',
  running: '正在处理', completed: '已完成', failed: '执行失败', interrupted: '已中断',
  waiting: '等待成员回复', trace: '查看轨迹',
  unavailable: '请先选择一个可用的 Agent 预设',
  ready: '办公室已就绪', preparing: '正在打开办公室', startMember: '首次 @ 时启动该成员。',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Persistent office membership and addressed discussions. */
    teamOffice: keyof typeof en
  }
}
