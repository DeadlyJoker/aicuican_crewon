import { expect, it } from 'vitest'
import { repairChartJson, themeChart } from '../src/client/chart-theme.ts'
import { safeChart } from '../src/client/schema.ts'

it('repairs streamed chart JSON before validating its read-only schema', () => {
  const chart = repairChartJson('{"componentName":"TinyHuichartsBar","props":{"options":{"data":[{"Month":"Jan","Value":20}')
  expect(safeChart(chart)).toBe(true)
  expect(themeChart(chart, true)).toMatchObject({ props: { options: { theme: 'cloud-dark', data: [{ Month: 'Jan', Value: 20 }] } } })
  expect(safeChart(repairChartJson('{"componentName":"TinyHuichartsBar","props":{"onClick":"bad"}'))).toBe(false)
})

it('updates nested chart themes without changing source data or sibling text', () => {
  const source = { componentName: 'Page', children: [{ componentName: 'TinyHuichartsLine', props: { options: { data: [] } } }] }
  expect(themeChart(source, false)).toMatchObject({ children: [{ props: { height: '240px', options: { theme: 'cloud-light' } } }] })
  expect(source.children[0]?.props.options).not.toHaveProperty('theme')
})
