/** Studio user bubbles remain compact while traces retain the exact complete task. */
import { expect, it } from 'vitest'
import { studioActionTextRule, studioEntryTextRule } from '../src/client/studio-entry-text.ts'

it('summarizes complete entry metadata without changing the logged source substring', () => {
  const text = '《原稿》\n\n[crewon-studio-input:v1]\n执行目标：制作\n用户确认的完整创作输入：\n'
    + JSON.stringify({ category: 'drama', mode: 'produce', options: { ratio: '9:16' }, productionEpisodes: '1 集' })
    + '\n\n' + JSON.stringify({ originalFiles: [] })
  const rule = studioEntryTextRule(value => `${value.mode} · ${value.options.ratio}`)
  const node = rule.match(text, 0, { read: () => undefined })
  expect(node?.id).toBe('text')
  if (node?.id !== 'text') throw new Error('The complete entry input was not summarized')
  expect(node.data.text).toBe(text.slice(node.start))
  expect(node.data.display).toBe('\n\nproduce · 9:16')
  expect(rule.match(text, node.end, { read: () => undefined })).toBeUndefined()
})

it('keeps ordinary text and incomplete entry JSON visible', () => {
  const rule = studioEntryTextRule(() => 'summary'), context = { read: () => undefined }
  expect(rule.match('讨论执行目标：保留原文', 0, context)).toBeUndefined()
  expect(rule.match('需求\n\n执行目标：制作\n用户确认的完整创作输入：\n{', 0, context)).toBeUndefined()
})

it('shows the canvas action label while retaining complete model instructions for trace and copy', () => {
  const label = 'Generate the opening shot'
  const text = label + '\n\n[crewon-studio-action:v1]\n' + JSON.stringify({ instruction: 'Read the project and compile the exact shot first.' })
  const rule = studioActionTextRule(), context = { read: () => undefined }
  const node = rule.match(text, 0, context)
  if (node?.id !== 'text') throw new Error('The action metadata was not summarized')
  expect(text.slice(0, node.start)).toBe(label)
  expect(node.data.display).toBe('')
  expect(node.data.text).toBe(text.slice(node.start))
  expect(rule.match(text, node.end, context)).toBeUndefined()
  expect(rule.match(label + '\n\n[crewon-studio-action:v1]\n{', 0, context)).toBeUndefined()
  expect(rule.match(label, 0, context)).toBeUndefined()
})
