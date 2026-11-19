/** Original starter teams, written for CrewON's reviewed, captain-led execution. */
import type { TeamAuthoringInput } from './team-authoring-types.ts'

/** A compact reusable scene; roles may be replaced by saved experts before use. */
export interface TeamScenario extends TeamAuthoringInput { id: string }

/**
 * Return original, localized starter definitions with testable outputs.
 * @param chinese - Whether to use Chinese names and instructions.
 * @returns Five editable scenes. Each invocation returns independent values.
 */
export function teamScenarios(chinese: boolean): TeamScenario[] {
  const content = chinese ? [
    ['product-review', '产品体验评审', '评审现有页面、流程或需求方案', '找出影响任务完成的关键体验问题', '只依据给定材料；区分观察、推断和待验证假设。', '按影响排序的前三项问题，每项包含证据、改法和验收点。', '评审一个需要先填写 12 项设置才能开始使用的新手流程。',
      ['用户研究员', '用户目标与认知', '从目标用户和使用情境检查理解成本，引用具体材料。'],
      ['交互设计师', '任务路径与反馈', '检查关键路径、错误恢复和状态反馈，给出可验证修改。'],
      ['无障碍审阅员', '可访问性与包容性', '检查键盘、读屏、可读性及低熟练度使用者遇到的障碍。']],
    ['engineering-review', '技术方案评审', '评审架构、接口或实现方案', '在实现前明确主要风险和验证顺序', '区分已知事实和技术假设；不承诺未经验证的性能。', '关键风险、备选设计、兼容影响和最小验证计划。', '评审一个支持断线恢复与幂等写入的多端同步方案。',
      ['架构师', '边界与数据流', '检查职责边界、依赖方向和数据生命周期。'],
      ['可靠性工程师', '失败与恢复', '检查重试、并发、部分失败及重启恢复的具体路径。'],
      ['安全审阅员', '权限与信任边界', '检查输入验证、权限范围、敏感数据和滥用路径。']],
    ['content-review', '内容与事实审校', '审校文章、说明或对外内容', '让内容准确、清楚并适合目标读者', '保留原意；没有证据的事实明确标记，避免补写虚构引用。', '修改建议、事实核查清单和可直接采用的精简版本。', '审校一份面向首次使用者的产品介绍。',
      ['内容编辑', '结构与表达', '检查读者理解顺序、冗余和歧义，提出精简修改。'],
      ['事实核查员', '事实与依据', '逐项区分可核查事实、判断和缺少来源的论断。'],
      ['目标读者代表', '适用性与行动', '检查术语解释、例子和读者完成下一步所需的信息。']],
    ['business-decision', '商业决策研究', '比较业务机会、投入或产品路线', '形成有依据、可验证的决策建议', '列明关键假设和信息缺口；数字必须注明来源或计算方式。', '选项对比、主要风险、推荐理由及下一步验证实验。', '比较先做企业客户还是个人用户的两条产品路线。',
      ['市场分析师', '需求与竞争', '分析目标人群、替代方案和需求证据。'],
      ['商业分析师', '成本与收益', '梳理收入、成本和资源约束，明确计算假设。'],
      ['风险评审员', '反例与验证', '寻找会推翻建议的条件，并设计低成本验证。']],
    ['delivery-plan', '项目交付规划', '将明确目标拆成可执行交付计划', '得到职责清楚、依赖合理的最小交付范围', '不把未知工作写成确定工期；标注依赖和待确认条件。', '里程碑、责任分工、依赖关系、验收标准和风险应对。', '为一个两周内上线的内部工具制定最小交付计划。',
      ['项目规划师', '范围与顺序', '拆分交付成果，识别阻塞依赖和可并行工作。'],
      ['领域实施专家', '实现与资源', '检查步骤可操作性，明确资源、输入和交接内容。'],
      ['质量负责人', '验收与风险', '为成果定义验收证据，检查遗漏与回退方式。']],
  ] as const : [
    ['product-review', 'Product experience review', 'Review pages, journeys and requirements', 'Find the usability issues that block task completion', 'Use supplied evidence and distinguish observations, inferences and assumptions.', 'Three prioritized issues, each with evidence, a proposed change and an acceptance check.', 'Review onboarding that requires 12 settings before the first task.',
      ['User researcher', 'User goals and understanding', 'Assess the target audience, context and understanding cost using concrete evidence.'],
      ['Interaction designer', 'Task paths and feedback', 'Check key journeys, recovery and feedback. Propose verifiable changes.'],
      ['Accessibility reviewer', 'Access and inclusion', 'Check keyboard use, screen readers, readability and barriers for inexperienced users.']],
    ['engineering-review', 'Technical design review', 'Review architecture, interfaces and implementation plans', 'Identify material risks and the order of validation before implementation', 'Separate facts from assumptions. Do not promise unmeasured performance.', 'Key risks, design alternatives, compatibility effects and a minimal validation plan.', 'Review cross-device synchronization with recovery and idempotent writes.',
      ['Architect', 'Boundaries and data flow', 'Review responsibilities, dependency direction and data lifecycle.'],
      ['Reliability engineer', 'Failure and recovery', 'Review retries, concurrency, partial failures and cold recovery.'],
      ['Security reviewer', 'Permissions and trust', 'Review input validation, permissions, sensitive data and misuse paths.']],
    ['content-review', 'Content and fact review', 'Review articles, documentation and external copy', 'Make the material accurate and clear for its intended audience', 'Preserve intent. Mark unsupported claims and never invent sources.', 'Editorial changes, a fact-check list and a concise ready-to-use version.', 'Review a product introduction for first-time users.',
      ['Editor', 'Structure and expression', 'Check reading order, repetition and ambiguity. Suggest concise edits.'],
      ['Fact checker', 'Claims and evidence', 'Distinguish verifiable facts, judgements and unsupported statements.'],
      ['Audience reviewer', 'Relevance and action', 'Check terminology, examples and the information needed for the next action.']],
    ['business-decision', 'Business decision research', 'Compare business opportunities, investments and product directions', 'Produce an evidence-based decision and a way to validate it', 'State assumptions and missing information. Cite data sources or calculations.', 'Options, material risks, recommendation rationale and the next validation experiment.', 'Compare enterprise and individual users as the first target audience.',
      ['Market analyst', 'Demand and alternatives', 'Review audience, substitutes and evidence of demand.'],
      ['Business analyst', 'Cost and return', 'Assess revenue, costs and resource constraints with explicit assumptions.'],
      ['Risk reviewer', 'Counterexamples and validation', 'Identify conditions that would overturn the recommendation and inexpensive tests.']],
    ['delivery-plan', 'Project delivery planning', 'Turn a defined objective into an executable plan', 'Define a minimal delivery scope with clear responsibilities and dependencies', 'Mark unknown effort, external dependencies and conditions requiring confirmation.', 'Milestones, owners, dependencies, acceptance criteria and risk responses.', 'Plan a two-week release of a small internal tool.',
      ['Project planner', 'Scope and sequence', 'Break down deliverables and identify blocking and parallel work.'],
      ['Implementation specialist', 'Execution and resources', 'Check feasible steps, resources, inputs and handoffs.'],
      ['Quality lead', 'Acceptance and risk', 'Define acceptance evidence, find omissions and plan recovery.']],
  ] as const
  return content.map(([id, name, description, goal, constraints, deliverables, example, ...members]) => ({ id, name,
    profile: { description, goal, constraints, deliverables, examples: [example], taskPlanning: 'captain',
      protocol: chinese
        ? '各专家先独立审阅，指出依据与不确定性；团长合并重复项，标出分歧，按用户目标输出结论和下一步。'
        : 'Each expert reviews independently with evidence and uncertainty. The captain merges duplicates, records disagreements and delivers conclusions and next actions.',
      members: members.map(([name, role, executionPrompt]) => ({ name, role, executionPrompt })) } }))
}
