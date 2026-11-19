import { expect, it } from 'vitest'
import assert from 'node:assert/strict'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { createTeamReferenceSource, routeTeamReference, teamMentionDisplayRule } from '../src/client/team-reference.ts'

const profiles = { '产品 专家团': { description: '产品体验评审', members: [] }, 技术团: { members: [] } }

it('offers saved teams in the @ menu and serializes removable references', async () => {
  const source = createTeamReferenceSource(() => profiles, () => '专家团', () => '不可用')
  const signal = new AbortController().signal
  const rows = await source.candidates({ sessionId: SessionId('demo') }, {
    query: '体验', position: 'leading', drilled: false, signal,
  })
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ name: '产品 专家团', section: '专家团' })
  const row = rows[0]!
  expect(await source.codec!.serialize(row.value!, signal)).toBe('@team:%E4%BA%A7%E5%93%81%20%E4%B8%93%E5%AE%B6%E5%9B%A2')
  expect(routeTeamReference(`${row.value} 审查注册流程 @src/app.ts`, profiles, '不可用'))
    .toBe('/agent-teams --profile "产品 专家团" 审查注册流程 @src/app.ts')
})

it('leaves ordinary messages alone and refuses ambiguous or removed team requests', () => {
  expect(routeTeamReference('普通问题 @src/app.ts', profiles, '不可用')).toBe('普通问题 @src/app.ts')
  expect(() => routeTeamReference('@team:%ZZ 问题', profiles, '不可用')).toThrow('不可用')
  expect(() => routeTeamReference('@team:missing 审查注册', profiles, '不可用')).toThrow('不可用')
  expect(() => routeTeamReference('@team:技术团', profiles, '不可用')).toThrow('不可用')
  expect(() => routeTeamReference('@team:技术团 @team:产品%20专家团 审查注册', profiles, '不可用')).toThrow('不可用')
})

it('displays existing-team commands as mentions without changing the logged activation or question', () => {
  const command = '/agent-teams --profile "CrewON 产品专家团" 设计一个产品 @src/app.ts'
  const context = { read: () => undefined }
  const prefix = teamMentionDisplayRule.match(command, 0, context)
  expect(prefix).toEqual({ id: 'text', start: 0, end: command.indexOf(' 设计'),
    data: { text: '/agent-teams --profile "CrewON 产品专家团"', display: '@CrewON 产品专家团' } })
  assert(prefix?.id === 'text' && typeof prefix.data.display === 'string')
  expect(prefix.data.display + command.slice(prefix.end)).toBe('@CrewON 产品专家团 设计一个产品 @src/app.ts')
  expect(command).toBe('/agent-teams --profile "CrewON 产品专家团" 设计一个产品 @src/app.ts')
  expect(teamMentionDisplayRule.match(command, 1, context)).toBeUndefined()
  expect(teamMentionDisplayRule.match('普通问题 /agent-teams --profile "技术团" 示例', 0, context)).toBeUndefined()
  expect(teamMentionDisplayRule.match('/create-expert-panel 新建专家团', 0, context)).toBeUndefined()
  expect(teamMentionDisplayRule.match('/agent-teams 设计一个产品', 0, context)).toBeUndefined()
})

it('shows the team name in an unacknowledged submission echo and keeps malformed references readable', () => {
  const context = { read: () => undefined }
  const text = '@team:CrewON%20产品专家团 设计一个产品'
  const reference = teamMentionDisplayRule.match(text, 0, context)
  expect(reference).toMatchObject({ id: 'text', data: { text: '@team:CrewON%20产品专家团', display: '@CrewON 产品专家团' } })
  expect(teamMentionDisplayRule.match('@team:%ZZ 设计一个产品', 0, context)).toBeUndefined()
})
