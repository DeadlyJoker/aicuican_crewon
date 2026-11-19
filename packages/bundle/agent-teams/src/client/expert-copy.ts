/** Locale-owned expert catalogue copy. */
export const en = {
  modelSettings: 'Default model (optional)', provider: 'Provider ID', model: 'Model ID', create: 'New expert', edit: 'Expert settings',
  empty: 'Your saved experts will appear here.', name: 'Expert name', scope: 'Specialty', base: 'Base capabilities', prompt: 'Responsibilities and working instructions',
  cancel: 'Cancel', close: 'Close', save: 'Save expert', saving: 'Saving…', version: 'Version {version}',
  capabilitiesDisabled: 'Enable the Toolbox plugin to choose skills, connectors and tools here. This expert otherwise inherits its base capabilities.',
  capabilitiesPending: 'The expert version was saved, but capability setup has not completed. Retry Save to finish; closing leaves the saved version in the library.',
  snapshot: 'Saving creates a new version. Existing tasks and history retain their original version. Configure skills, connectors and tools below.',
  source: 'Expert source', builtin: 'Built-in', mine: 'My experts', search: 'Search specialties or use cases', category: 'Category', allCategories: 'All categories', otherCategory: 'General',
  details: 'View responsibilities', copy: 'Customize a copy', copyName: '{name} copy', use: 'Use', openNamed: 'Use {name}', openHint: 'Open expert conversation',
  copyText: 'Copy', copied: 'Copied', footnotes: 'Footnotes',
  examples: 'Try asking', noResults: 'No matching experts.', loading: 'Loading experts', loadFailed: 'Could not load experts. Retry to continue.', retry: 'Retry',
  operationFailed: 'Could not complete the operation. Try again.', unavailable: 'This expert is unavailable. Refresh the library and try again.',
  mentionGroup: 'Experts', mentionHint: 'Opens a new conversation · Type to find more experts',
  pickerNative: 'Base modes', pickerHint: 'Type a specialty or name to find more experts',
  pickerPending: 'Preparing expert…', pickerFailed: 'Could not prepare this expert. Try again.',
} as const
/**
 * Chinese copy for this UI domain.
 */
export const zh: { [K in keyof typeof en]: string } = {
  modelSettings: '默认模型（选填）', provider: '提供商 ID', model: '模型 ID', create: '新建专家', edit: '专家设置',
  empty: '保存后的专家会显示在这里', name: '专家名称', scope: '擅长领域', base: '基础能力', prompt: '职责与工作要求',
  cancel: '取消', close: '关闭', save: '保存专家', saving: '保存中…', version: '第 {version} 版',
  capabilitiesDisabled: '启用工具箱插件后，可在这里选择技能、连接器和工具。当前专家沿用基础能力。',
  capabilitiesPending: '专家版本已保存，能力配置尚未完成。再次保存可重试；关闭后已保存版本仍会保留在专家库。',
  snapshot: '保存会生成新版本，已有任务和历史保留原版本。可在下方配置技能、连接器和工具。',
  source: '专家来源', builtin: '内置专家', mine: '我的专家', search: '搜索专业或使用场景', category: '用途分类', allCategories: '全部分类', otherCategory: '通用',
  details: '查看职责', copy: '复制为自定义专家', copyName: '{name}副本', use: '使用', openNamed: '使用{name}', openHint: '打开专家对话',
  copyText: '复制', copied: '已复制', footnotes: '脚注',
  examples: '试着这样问', noResults: '没有找到匹配的专家', loading: '正在加载专家', loadFailed: '专家加载失败，请重试', retry: '重试',
  operationFailed: '操作未完成，请重试', unavailable: '这位专家暂不可用，请刷新专家库后重试',
  mentionGroup: '专家', mentionHint: '打开新对话 · 输入名称搜索更多',
  pickerNative: '基础模式', pickerHint: '输入专业或名称，查找更多专家',
  pickerPending: '正在准备专家…', pickerFailed: '专家准备失败，请重试',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { teamExperts: keyof typeof en }
}
