# cuican-aide 功能对照

调研日期为 2026-11-04。来源为同级目录 cuican-aide 的当前 main 工作树，UI package 版本为 0.1.70。本表依据本次读取的源码、类型和项目文档记录功能范围，运行验收状态单独保留。二开优先级与验收要求见 [需求方案](requirements-v1.md)。

## 证据使用方式

“组件与调用接口”表示查到可阅读的页面及调用接口。“项目文档保留缺口”表示原文明确记载了阶段限制，实施前需按当前代码复核。“设计资料”用于还原预期体验。下列链接依赖同级 cuican-aide 目录，仓库单独搬迁后需同步保留参照源码。

## 用户功能与底座差异

| 编号 | cuican-aide 功能及来源 | DSH 当前基础 | 二开工作判断 |
|---|---|---|---|
| F01 | 工作首页、日常办公/代码/创意设计场景、快捷任务。组件与调用接口见 [sceneCatalog](../../cuican-aide/apps/crewon-ui/src/lib/scene/sceneCatalog.ts) | [ui-conversation](../packages/client/ui-conversation/README.md)、[ui-layout](../packages/client/ui-layout/README.md) | 新增场景配置与首页 UI，快捷任务生成可编辑草稿 |
| F02 | CrewON、单 Agent、团队执行目标选择，场景与目标独立。见 [设计规则](../../cuican-aide/.codex/skills/crewon-design-reference/SKILL.md) 与 [目标类型](../../cuican-aide/apps/crewon-ui/src/lib/scene/sceneCatalog.ts) | [agent preset](../packages/preset/README.md)、[agent team](../packages/team/README.md) | 增加统一目标展示与配置映射，检查目标可用性 |
| F03 | 全局导航包含工作、任务、助理、日程安排、团队、资源和动态插件。组件与调用接口见 [导航](../../cuican-aide/apps/crewon-ui/src/components/app/CommandNavigationRail.tsx) | [sidebar](../packages/client/ui-sidebar/README.md) 的 panel list 与 main 插槽 | 通过注册扩展导航与页面，按能力是否启用显示入口 |
| F04 | 工作空间与会话树，独立新任务可选择无工作空间。见 [Chrome](../../cuican-aide/apps/crewon-ui/src/components/app/CommandWorkspaceChrome.tsx) 与 [新任务规则](../../cuican-aide/.codex/skills/crewon-design-reference/SKILL.md) | [workspace](../packages/workspace/workspace/README.md)、[ui-workspace](../packages/client/ui-workspace/README.md) | 复用分组，补充明确的新任务作用域体验 |
| F05 | 任务页按需要关注、运行中、其他近期任务排序，支持个人/团队过滤。组件与调用接口见 [ProjectsView](../../cuican-aide/apps/crewon-ui/src/components/app/CommandWorkspaceViews.tsx) | [Session 查询](../packages/session-query/README.md)、[ui-session](../packages/client/ui-session/README.md) | 新增跨会话任务视图和已读状态，不把每条 todo 显示成独立用户任务 |
| F06 | 居中全局搜索、分组结果、键盘选择和焦点恢复。组件与调用接口见 [搜索弹层](../../cuican-aide/apps/crewon-ui/src/components/app/CommandSidebarSearchView.tsx) 与 [结果构造](../../cuican-aide/apps/crewon-ui/src/components/app/commandSearchResults.ts) | [Session 查询](../packages/session-query/README.md)、[ui-primitives](../packages/client/ui-primitives/README.md) | 新增全局搜索 UI，分来源接入会话、工作空间和文件 |
| F07 | 紧凑输入框、资源菜单、模型、权限和执行目标，Goal/Plan 选择。见 [设计规则](../../cuican-aide/.codex/skills/crewon-design-reference/SKILL.md) 与 [CommandComposer](../../cuican-aide/apps/crewon-ui/src/components/composer/CommandComposer.tsx) | [ui-conversation](../packages/client/ui-conversation/README.md)、[goal](../packages/goal/README.md)、[plan](../packages/plan/README.md) | 复用真实能力入口，设计三态交互与失败保留草稿 |
| F08 | 流式主对话、停止、工具过程、重新查看消息、恢复待提交状态。见 [主会话](../../cuican-aide/apps/crewon-ui/src/components/app/CommandWorkspaceConversation.tsx) | [ui-chat](../packages/client/ui-chat/README.md)、[Session](../packages/core/session/README.md) | 保留现有执行与回放链路，调整布局与呈现 |
| F09 | 当前执行计划、文件变化、进程等任务详情。见 [TaskDetailPopover](../../cuican-aide/apps/crewon-ui/src/components/task-detail/TaskDetailPopover.tsx) 与 [执行计划设计](../../cuican-aide/docs/run-execution-plan.md) | [todo](../packages/todo/README.md)、[deliverables](../packages/deliverables/README.md)、[jobs](../packages/jobs/README.md) | 聚合当前轮次的真实记录，分别呈现目标、计划和执行步骤 |
| F10 | 右侧工作台含文件、终端、网页、任务改动和结果面板。见 [工作台](../../cuican-aide/apps/crewon-ui/src/components/app/CommandWorkspaceCapabilityDrawer.tsx) 与 [tab 类型](../../cuican-aide/apps/crewon-ui/src/components/app/commandWorkbenchTabs.ts) | [右侧栏](../docs/subsystems/sidebar-right.md)、[文件预览](../packages/client/ui-sidebar-documentpreview/README.md)、[终端](../packages/client/ui-sidebar-terminal/README.md) | 复用已有文档和终端 tab，补充统一任务关联与交互 |
| F11 | 浏览器与当前任务并排查看。见 [工作台入口](../../cuican-aide/apps/crewon-ui/src/components/app/CommandWorkspaceCapabilityDrawer.tsx) | [Browser tab](../packages/client/ui-sidebar-browser/README.md) | 按 Web 与 Desktop 能力分别定义体验，处理无法嵌入的网站 |
| F12 | Agent、Skill、MCP、Knowledge 资源目录，下载与配置入口。见 [资源视图](../../cuican-aide/apps/crewon-ui/src/components/app/CommandWorkspaceViews.tsx) 与 [资源类型](../../cuican-aide/apps/crewon-ui/src/lib/agent-platform/agentPlatformClient.ts) | [preset](../packages/preset/README.md)、[skill](../packages/skill/README.md)、[mcp](../packages/mcp/README.md)、[plugin manager](../packages/boot/plugin-manager/README.md) | 统一产品目录，保留各类资源自己的安装与执行规则 |
| F13 | 知识来源、可编辑记忆条目、刷新及重置入口。组件与调用接口见 [KnowledgeView](../../cuican-aide/apps/crewon-ui/src/components/library/KnowledgeView.tsx) | 本次查看的包图中未发现与该产品对象等价的知识库管理模块 | 新增知识对象、来源读取与检索接口，先定义文件知识和记忆条目的关系 |
| F14 | 独立助理会话、清理会话、从对话创建日程。组件与调用接口见 [助理页](../../cuican-aide/apps/crewon-ui/src/components/app/CommandWorkspaceAssistant.tsx) | [Session](../packages/core/session/README.md)、[schedule](../packages/schedule/README.md) | 新增固定入口与会话归属，日程仍进入统一管理 |
| F15 | 日程/自动化列表、日历、创建与运行控制。组件与调用接口见 [AutomationView](../../cuican-aide/apps/crewon-ui/src/components/app/CommandWorkspaceAutomations.tsx) | [schedule](../packages/schedule/README.md)、[ui-schedule](../packages/client/ui-schedule/README.md) | 复用定时执行，补充日历投影与当前工作空间过滤 |
| F16 | 办公室支持持续讨论、@成员、组长协调、成员状态与产物。见 [办公室](../../cuican-aide/apps/crewon-ui/src/components/app/CommandOfficeRoom.tsx) 与 [协作入口](../../cuican-aide/apps/crewon-ui/src/components/app/CommandTeamOverview.tsx) | [subagent](../packages/subagent/README.md)、[team](../packages/team/README.md) | 新增持久团队定义、成员路由及办公室对话投影 |
| F17 | 工作流包含 Agent、人工确认、验证节点及运行记录。见 [工作流类型](../../cuican-aide/apps/crewon-ui/src/lib/workflow/crewonWorkflow.ts) 与 [运行页](../../cuican-aide/apps/crewon-ui/src/components/app/CommandWorkflowPanel.tsx) | [workflow](../packages/workflow/workflow/README.md) 当前使用前台脚本，文档列明缺少检查点和恢复 | 新增保存的流程定义与持久执行协调，作为独立需求评审 |
| F18 | 专家团由团长对外回复，后台专家分别贡献。见 [专家团](../../cuican-aide/apps/crewon-ui/src/components/app/CommandExpertsPanel.tsx) 与 [定义类型](../../cuican-aide/apps/crewon-ui/src/lib/experts/expertTeamRecord.ts) | [preset](../packages/preset/README.md)、[subagent](../packages/subagent/README.md)、[team](../packages/team/README.md) | 新增角色定义与主会话结果汇总策略，保留成员结果可追溯 |
| F19 | 插件配置、安装、升级、页面与原对话关联。见 [插件设置](../../cuican-aide/apps/crewon-ui/src/components/settings/InstalledPluginSettings.tsx)、[插件面板](../../cuican-aide/apps/crewon-ui/src/components/app/CommandWorkspacePluginPanel.tsx) | [plugin manager](../packages/boot/plugin-manager/README.md)、[ui-plugin-manager](../packages/client/ui-plugin-manager/README.md)、[ui-plugin-market](../packages/client/ui-plugin-market/README.md) | 优先保留 DSH 插件格式，迁移用户流程和配置可见性 |
| F20 | 插件任务、项目归属和恢复有较多阶段验证记录。项目文档保留缺口，见 [基础状态](../../cuican-aide/docs/plugin-foundation-status-20261011.md) | [profiles](../packages/boot/app-boot/README.md)、[Session](../packages/core/session/README.md) | 对版本绑定、原任务恢复、卸载后历史逐项设计，不将旧包格式视为兼容输入 |
| F21 | AI 短剧双入口、文字成果、候选采用、媒体输入和阶段计划。见 [产品体验](../../cuican-aide/docs/short-drama-product-experience.md) 与 [插件就绪记录](../../cuican-aide/docs/short-drama-plugin-readiness-20261014.md) | [工具](../packages/core/tools/README.md)、[deliverables](../packages/deliverables/README.md)、[插件扩展](../docs/cookbook/extension-cookbook.md) | 作为后续业务插件样板，先独立定义完整业务对象与真实服务验收 |
| F22 | 账号、模型、权限、插件与设备等设置。见 [设置目录](../../cuican-aide/apps/crewon-ui/src/lib/settings/settingsCatalog.ts) 与 [旧架构](../../cuican-aide/ARCHITECTURE.md) | [settings](../packages/settings/README.md)、[模型页](../packages/client/ui-settings-models/README.md)、[credentials](../packages/credentials/README.md)、[ssh](../packages/ssh/README.md) | 首版聚焦模型与执行权限，团队账号和设备网关需要独立服务范围 |

## 需要保留的差异

旧工程的 `projects` 导航键进入任务列表，真实业务项目另有插件内的数据与页面。需求与界面分别使用“工作空间”“任务”“业务项目”，以各自的持久记录识别它们。

旧工程采用 Control API、Runtime Worker、Device Gateway 和 Web BFF。当前项目通过 DSH profile 组合 Cordis 插件。功能迁移围绕用户操作与结果设计，运行能力继续由 DSH 的现有服务及扩展点承接。旧 UI 使用 React 19、Radix 和 Tailwind，当前 Client 的组件与主题规则需要重新应用。

旧工程的办公室、专家团、工作流分别有不同的消息与执行语义。DSH 的共享任务板为这些产品功能提供部分基础，三种产品模式各自还需要定义持久对象、UI 和恢复行为。

原工程的插件和短剧资料同时包含实现记录与交付缺口。计划中的商业化、多租户、完整知识检索、浏览器录制和媒体生产都需要各自的运行证据，本次调研保留为后续评估项。
