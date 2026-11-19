/** Import only MIT-licensed persona data from the pinned agency-agents snapshot. */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

const revision = '3612123844c66162e81084ec931d357398a79864'
const repository = 'https://github.com/MichengAI/dsh-agency-agents'
const source = resolve(process.argv[2] ?? '')
if (!process.argv[2] || execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== revision) {
  throw new Error(`Provide a dsh-agency-agents checkout at ${revision}.`)
}
const destination = fileURLToPath(new URL('../assets/experts/', import.meta.url))
const categories = [
  ['engineering', '研发工程', 'Engineering'], ['design', '设计体验', 'Design'],
  ['product', '产品', 'Product'], ['project-management', '项目管理', 'Project management'],
  ['marketing', '市场营销', 'Marketing'], ['sales', '销售', 'Sales'],
  ['paid-media', '广告投放', 'Paid media'], ['support', '客户支持', 'Support'],
  ['testing', '测试质量', 'Testing'], ['security', '安全', 'Security'],
  ['research', '研究', 'Research'], ['academic', '学术', 'Academic'],
  ['finance', '财务金融', 'Finance'], ['legal', '法律', 'Legal'],
  ['hr', '人力资源', 'Human resources'], ['healthcare', '医疗健康', 'Healthcare'],
  ['supply-chain', '供应链', 'Supply chain'], ['game-development', '游戏开发', 'Game development'],
  ['spatial-computing', '空间计算', 'Spatial computing'], ['gis', '地理信息', 'GIS'],
  ['company', '公司经营', 'Company'], ['specialized', '行业专家', 'Specialized'],
].map(([id, name, nameEn]) => ({ id, name, nameEn }))

// Short, actionable starter questions are maintained separately from upstream instructions.
const examples = {
  'engineering/engineering-ai-engineer': ['为知识库问答设计一套 RAG 方案，说明数据、检索和评估步骤。'],
  'engineering/engineering-code-reviewer': ['审查这段代码，按严重程度列出问题、证据和最小修改建议。'],
  'engineering/engineering-frontend-developer': ['根据页面需求实现响应式界面，并检查键盘操作与空状态。'],
  'engineering/engineering-backend-architect': ['为这个业务设计服务接口、数据模型和故障恢复方案。'],
  'engineering/engineering-software-architect': ['评估现有架构，说明最重要的技术风险与演进步骤。'],
  'engineering/engineering-data-engineer': ['为这组数据设计可重试的数据处理流程与质量检查。'],
  'engineering/engineering-technical-writer': ['把这份技术说明改写为包含前提、操作步骤和排错指引的文档。'],
  'engineering/engineering-rag-pipeline-engineer': ['分析知识库检索结果不准确的原因，并制定评估和改进方案。'],
  'design/design-ui-designer': ['审查这张界面截图，从层级、间距、控件和状态反馈给出具体修改建议。'],
  'design/design-ux-researcher': ['为这个功能设计用户访谈提纲和可用性测试任务。'],
  'design/design-ux-architect': ['梳理这段用户旅程，减少操作步骤并补齐异常和返回路径。'],
  'design/design-brand-guardian': ['检查这套界面是否符合品牌规范，指出不一致处和修正方式。'],
  'academic/academic-statistician': ['检查这份实验分析的方法、假设和结论是否成立。'],
  'finance/finance-financial-analyst': ['分析这份经营数据中的收入、成本和现金流变化。'],
  'security/security-threat-intelligence-analyst': ['根据这些安全日志梳理威胁线索、可信度和调查优先级。'],
  'security/security-incident-responder': ['为这次安全事件制定隔离、调查、恢复和复盘计划。'],
  'company/chief-of-staff': ['把这些跨团队事项整理成负责人明确、可跟踪的行动计划。'],
  'research/research-synthesist': ['整合这些研究资料，区分共识、分歧和证据缺口。'],
}
const technologyTerms = ['API', 'AI', 'LLM', 'RAG', 'Python', 'TypeScript', 'React', 'Vue', 'SQL', 'Rust', 'SEO', 'UI', 'UX', 'Kubernetes', 'Docker', 'GPU', 'CRM', 'A/B', 'GIS', 'WebAssembly']
const mentionsTechnology = (text, term) => new RegExp(`(^|[^a-z0-9])${term.toLowerCase()}($|[^a-z0-9])`, 'u').test(text.toLowerCase())
const entries = []
for (const category of categories) {
  const directory = join(source, 'assets/agency-agents-zh', category.id)
  for (const filename of readdirSync(directory).filter(name => name.endsWith('.md')).sort()) {
    const slug = `${category.id}/${filename.slice(0, -3)}`
    const chinese = readFileSync(join(directory, filename), 'utf8')
    const english = readFileSync(join(source, 'assets/agency-agents', category.id, filename), 'utf8')
    const parse = (text, englishMetadata = false) => {
      const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u)
      if (!match) throw new Error(`Missing front matter in ${slug}`)
      // The English snapshot contains unquoted colons in its single-line descriptions.
      const metadata = englishMetadata ? Object.fromEntries(['name', 'description', 'descriptionEn'].map(key => {
        const raw = match[1].match(new RegExp(`^${key}: (.*)$`, 'mu'))?.[1]?.trim()
        const value = raw?.startsWith('"') || raw?.startsWith("'") ? load(raw) : raw
        return [key, value]
      })) : load(match[1])
      if (!metadata || typeof metadata.name !== 'string' || typeof metadata.description !== 'string') {
        throw new Error(`Missing persona name or description in ${slug}`)
      }
      return { metadata, prompt: match[2].trim() }
    }
    const zh = parse(chinese)
    const en = parse(english, true)
    const path = join(destination, 'zh', category.id, filename)
    mkdirSync(dirname(path), { recursive: true })
    copyFileSync(join(directory, filename), path)
    entries.push({
      slug, name: zh.metadata.name, nameEn: en.metadata.name,
      description: zh.metadata.description, descriptionEn: en.metadata.descriptionEn ?? en.metadata.description,
      category: category.id,
      tags: [...new Set([en.metadata.name, category.name, category.nameEn,
        ...technologyTerms.filter(term => mentionsTechnology(`${zh.metadata.description}\n${en.metadata.description}`, term))])],
      examples: examples[slug] ?? [], promptLength: zh.prompt.length,
      sha256: createHash('sha256').update(chinese).digest('hex'),
    })
  }
}
if (entries.length !== 331) throw new Error(`Expected 331 personas, received ${entries.length}.`)
writeFileSync(join(destination, 'catalogue.json'), `${JSON.stringify({ repository, revision, categories, entries }, null, 2)}\n`)
copyFileSync(join(source, 'assets/agency-agents-zh/LICENSE'), join(destination, 'LICENSE.zh'))
copyFileSync(join(source, 'assets/agency-agents/LICENSE'), join(destination, 'LICENSE.en'))
console.log(`Imported ${entries.length} personas in ${categories.length} categories. Longest prompt: ${Math.max(...entries.map(entry => entry.promptLength))} characters.`)
