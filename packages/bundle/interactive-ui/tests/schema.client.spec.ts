import { expect, it } from 'vitest'
import { formSchema, safeChart } from '../src/client/schema.ts'
import { splitAssistantText } from '../src/client/split-assistant-text.ts'

it('retains prose around streaming and completed schemas', () => {
  expect(splitAssistantText('Before\n```schemaJson\n{}\n```\nAfter', false).map(part => part.kind)).toEqual(['markdown', 'schema', 'markdown'])
  expect(splitAssistantText('```schemaJson\n{', true)).toEqual([{ kind: 'schema', text: '{', complete: false }])
})
it('rejects duplicate field names and executable chart nodes', () => {
  expect(formSchema.safeParse({ componentName: 'CrewonForm', title: 'Plan', fields: [{ name: 'a', label: 'A', type: 'text' }, { name: 'a', label: 'A', type: 'text' }] }).success).toBe(false)
  expect(safeChart({ componentName: 'Page', children: [{ componentName: 'TinyHuichartsBar', props: { options: { data: [{ x: 1 }] } } }] })).toBe(true)
  expect(safeChart({ componentName: 'Page', events: { click: 'alert(1)' } })).toBe(false)
  expect(safeChart({ componentName: 'TinyHuichartsBar', props: { options: { type: 'JSExpression', value: 'fetch()' } } })).toBe(false)
})
