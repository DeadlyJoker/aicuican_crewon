/** Validate model-authored JSON before rendering controls or chart components. */
import { z } from 'zod'

const field = z.object({ name: z.string().min(1).max(100), label: z.string().min(1).max(160),
  type: z.enum(['text', 'number', 'textarea', 'select', 'checkbox']), required: z.boolean().optional(),
  options: z.array(z.string().max(200)).max(50).optional(), default: z.union([z.string(), z.boolean()]).optional(),
  placeholder: z.string().max(200).optional() })
export const formSchema = z.object({ componentName: z.literal('CrewonForm'), title: z.string().min(1).max(160),
  description: z.string().max(500).optional(), submitLabel: z.string().max(60).optional(), fields: z.array(field).min(1).max(30) })
  .refine(value => new Set(value.fields.map(item => item.name)).size === value.fields.length)
export type FormSchema = z.infer<typeof formSchema>

/** Read-only OpenTiny charts accept only data, containers and chart options. */
export function safeChart(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const node = value as Record<string, unknown>
  if (typeof node.componentName !== 'string' || !['Page', 'div', 'TinyHuichartsBar', 'TinyHuichartsLine', 'TinyHuichartsPie'].includes(node.componentName)) return false
  if (Object.keys(node).some(key => !['componentName', 'props', 'children'].includes(key))) return false
  const encoded = JSON.stringify(node.props ?? {})
  if (/JSExpression|JSFunction|https?:|javascript:|onClick|onChange|__proto__/i.test(encoded)) return false
  return node.children === undefined || Array.isArray(node.children) && node.children.every(safeChart)
}
