/** Chart theme traversal adapted from lhuans/dsh-genui (MIT); schemas remain read-only. */
import { repairJson } from '@opentiny/genui-sdk-core'

/** Parse partial chart JSON with the upstream SDK repairer. Forms use strict JSON separately. */
export function repairChartJson(content: string): unknown {
  return repairJson(content).value
}

/** Copy validated chart data and apply the host theme without changing persisted source. */
export function themeChart(value: unknown, dark: boolean): unknown {
  if (Array.isArray(value)) return value.map(item => themeChart(item, dark))
  if (value === null || typeof value !== 'object') return value
  const node = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, themeChart(item, dark)]))
  if (typeof node.componentName === 'string' && node.componentName.startsWith('TinyHuicharts')) {
    const props = node.props !== null && typeof node.props === 'object' ? node.props : {}
    const options = 'options' in props && props.options !== null && typeof props.options === 'object' ? props.options : {}
    node.props = { ...props, height: '240px', options: { ...options, theme: dark ? 'cloud-dark' : 'cloud-light' } }
  }
  return node
}
