# CrewON 二开准备索引

[English](README.md) | 中文

这是本地二开调研工作区，不替代上游文档、类型声明和测试。调研日期：2026-11-04。未确认的 CrewON 产品需求不作为既定设计。

## 本轮需求方案

[二开需求方案](requirements-v1.md)将 Agent Team 设为高优先级，独立任务中心后置，并定义团队配置、专家团、办公室、恢复及验收场景。[cuican-aide 功能对照](aide-feature-map.md)记录 22 项功能及其 DSH 实现影响。

[协作模式设计](team-modes-design.md)区分工作流、专家团和长期办公室，对照两套参考实现并确定内置接入批次。

内置专家团 bundle 已将固定版本上游插件适配到当前 Host。模式设计同时记录实现、验证结果与初次兼容问题。

[短剧制作方案](short-drama-production-plan.md)定义 CrewON、Agent 和媒体 API 的分工，验收覆盖可继续编辑的项目和可播放的单集成片。

## 阅读顺序

1. [环境与源码基线](readiness.md)：先确认源码完整性、Node 版本和验证状态。
2. [架构阅读地图](architecture.md)：理解启动、对话、模型调用和持久化的关系。
3. [需求到代码的定位表](extension-map.md)：按准备修改的功能查入口和验证要求。
4. [官方开发经验](official-lessons.md)：吸收实际事故教训，区分历史描述与当前规则。
5. [CrewON 界面与交互路线](ui-first-roadmap.md)：查看 UI 扩展入口及排在 Agent Team 之后的通用界面工作。
6. [生成的包索引](generated/packages.json)：查包名、目录、依赖、导出和插件声明；不要手工维护包清单。

## 使用方式

开始一个需求时，先写清用户操作、预期可观察结果、修改范围和失败行为；通过定位表读相应 README 与子目录 AGENTS.md，再查源码。已确认优先做界面与交互；具体产品设计尚未确定，当前不预设多租户、账号计费、部署拓扑或品牌替换方案。

上游权威入口是 [架构](../docs/architecture.zh.md)、[开发指南](../docs/development.zh.md)、[测试政策](../docs/testing.zh.md)、[扩展手册](../docs/cookbook/extension-cookbook.zh.md) 和 [防御规则](../docs/defensive-patterns/README.zh.md)。遇到冲突以当前源码、当前规则及验证结果为准。

## 保鲜

`python3 dev-notes/tools/inventory.py` 只读取包清单并刷新生成索引。上游更新后重新生成，并复查发生变化的包 README、类型和测试；本目录的解释性笔记不会自动跟随上游更新。

每个二开需求记录所用上游基线、修改包、影响的 Session/Remote/UI 类型、实际运行的检查和未验证项。不要把“命令存在”写成“检查通过”，也不要用模型自述代替外部文件或界面证据。
