/** Locale-owned interactive card controls. */
export const en = { title: 'Interactive UI', description: 'Ask for a chart or form', command: 'Interactive UI', hint: 'Describe a chart or form',
  loading: 'Loading interface…', failed: 'Could not load this interface.', invalid: 'This interface could not be rendered. Ask the agent to regenerate it.',
  submit: 'Submit', submitting: 'Submitting…', submitted: 'Submitted', draft: 'Draft saved', saving: 'Saving…', retry: 'Retry submission',
  yes: 'Yes', no: 'No', notProvided: 'Not provided', reload: 'Reload', error: 'Could not save or submit. Your input is retained. Try again.', required: 'Required', empty: 'Select an option' }
export const zh: typeof en = { title: '交互界面', description: '生成图表或表单', command: '交互界面', hint: '描述需要的图表或表单',
  loading: '正在加载界面…', failed: '界面加载失败。', invalid: '此界面暂时无法显示，请让助手重新生成。',
  submit: '提交', submitting: '正在提交…', submitted: '已提交', draft: '草稿已保存', saving: '正在保存…', retry: '重试提交',
  yes: '是', no: '否', notProvided: '未填写', reload: '重新加载', error: '保存或提交失败，输入已保留，请重试。', required: '必填', empty: '请选择' }
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { interactiveUi: keyof typeof en } }
