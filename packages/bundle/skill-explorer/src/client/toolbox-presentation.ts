/** Purpose-based presentation shared by toolbox filters and resource cards. */
import type { ToolPresentation, ToolPurpose } from '../types.ts'

/** Stable purpose choices, ordered consistently in filters and editors. */
export const TOOL_PURPOSES: readonly ToolPurpose[] = ['writing', 'research', 'data', 'development', 'media', 'general']

/**
 * Suggest an initial purpose for resources without a saved classification.
 * @param text - Existing resource name and description.
 * @returns A purpose that the user can override in the resource settings.
 */
export function suggestedPurpose(text: string): ToolPurpose {
  if (/视频|图像|图片|音频|绘图|image|video|audio|ffmpeg|design|drawio/iu.test(text)) return 'media'
  if (/数据库|表格|数据分析|数据查询|sql|database|spreadsheet|analytics/iu.test(text)) return 'data'
  if (/代码|测试|部署|开发|git|code|test|deploy|debug/iu.test(text)) return 'development'
  if (/搜索|检索|知识库|研究|search|research|knowledge/iu.test(text)) return 'research'
  if (/写作|文档|文案|文章|报告|write|writing|document|report/iu.test(text)) return 'writing'
  return 'general'
}

/**
 * Read an explicit display override or suggest one from the native metadata.
 * @param key - Resource kind and native identifier.
 * @param name - Native resource name.
 * @param description - Native description.
 * @param overrides - Saved user-facing metadata.
 * @param purpose - Explicit purpose supplied by the underlying resource.
 * @returns Display fields without modifying the native resource.
 */
export function toolPresentation(
  key: string, name: string, description: string, overrides: Record<string, ToolPresentation>, purpose?: ToolPurpose,
): ToolPresentation {
  return overrides[key] ?? { title: name, description, purpose: purpose ?? suggestedPurpose(`${name} ${description}`) }
}
