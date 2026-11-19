# 需求到代码的定位表

类型：本地调研参考。下表给出候选入口，不代表已经确定 CrewON 的产品设计。

| 需求 | 先读与候选代码 | 需要验证的可观察结果 |
|---|---|---|
| 品牌、布局、主题 | [ui-brand-official](../packages/client/ui-brand-official/README.md)、[ui-layout](../packages/client/ui-layout/README.md)、[ui-theme](../packages/client/ui-theme/README.md)、[客户端规则](../packages/client/AGENTS.md) | 正确 URL 上渲染、窄屏、刷新、本地化；静态构建不等于界面验收 |
| 聊天消息与业务节点 | [conversation](../docs/subsystems/conversation.md)、[ui-conversation](../packages/client/ui-conversation/README.md)、[会话渲染规则](../docs/defensive-patterns/conversation-and-session.md) | 实时增量、完成态、重开历史会话一致 |
| 新模型或兼容 API | [适配器手册](../docs/cookbook/adding-an-llm-adapter.md)、[llm-pi-ai](../packages/llm/llm-pi-ai/README.md)、[llm-deepseek](../packages/llm/llm-deepseek/README.md) | 文本流、工具、取消、失败与重试、上下文和真实 API |
| 新业务工具 / MCP | [工具教程](../docs/user/develop/basic/tool.md)、[工具参考](../docs/cookbook/adding-a-tool.md)、[MCP](../packages/mcp/README.md) | 参数与返回值、取消、权限、Native/PTC 两种调用、卡片与回放 |
| 默认提示词、工具集、Agent 角色 | [system-prompt](../packages/core/system-prompt/README.md)、[preset](../packages/preset/README.md)、[配置教程](../docs/user/develop/basic/config.md) | 实际发给模型的提示词与工具集合；不同会话隔离 |
| 子 Agent、团队、工作流 | [subagent](../packages/subagent/README.md)、[team](../packages/team/README.md)、[workflow](../packages/workflow/README.md) | 父子身份、消息归属、停止、完成和资源释放 |
| 新设置或持久化偏好 | [设置卡片](../docs/cookbook/adding-a-settings-card.md)、[settings](../packages/settings/README.md) | 校验、保存、重启读取、Client 同步与本地化 |
| 新 Remote API | [Remote 手册](../docs/cookbook/adding-a-remote-api.md)、[API 规则](../docs/defensive-patterns/remote-and-api.md) | 生成类型、权限、失败码、Host/Client 集成 |
| Session 新状态或存储 | [Session 状态](../docs/session-format-status.md)、[类型变更审查](../docs/cookbook/reviewing-persistence-type-changes.md)、[持久化](../packages/session/README.md) | 旧数据读取、只读行为、迁移、恢复、两种 SDK 投影 |
| 远程执行 | [ssh](../packages/ssh/README.md)、[subprocess](../packages/subprocess/README.md)、[sandbox](../packages/sandbox/README.md) | cwd、路径、权限、错误归因、取消和进程树清理 |

## 每个任务的最小准备单

1. 用一句话描述用户操作和验收结果，明确已有数据及兼容性要求。
2. 从表中进入 owner README，读取作用范围内 AGENTS.md 和相关防御规则。
3. 找一个同类现有实现，追踪配置、注册、调用、持久化、呈现、释放。
4. 列出受影响消费者、生成文件和快照；只改真实需求所需的包。
5. 先决定失败、取消、卸载和刷新后的行为，再写实现。
6. 运行相关行为检查与真实组合验证，记录命令、结果及未覆盖项。

## 检查选择

检查命令与前提以 [测试政策](../docs/testing.md) 和 [开发指南](../docs/development.md) 为准。单测针对业务行为；非平凡用户或模型可见变更同时更新 keyless Session 快照；模型适配器增加真实 API 证据；发布入口使用 built artifact smoke。源码变更完成前需要最新 artifacts 对应的 build:check。不要默认运行完整测试矩阵。

Web 自动化使用 root AGENTS.md 指定的目录选择器 overlay。验收记录保留实际 URL、启动进程、构建来源、浏览器结果与测试数据；不使用临时另起的服务替代用户正在使用的实例。

涉及 Session 类型、错误处理、新 PR 或预推送时，需要对应 `.agents/skills/` 工作流；先确认上游隐藏目录完整，不能凭本地缺失推定规则不存在。
