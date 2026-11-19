# 架构阅读地图

类型：本地调研参考。范围：从配置启动到一次用户对话的组件定位；具体 API 以链接目标为准。

## 先建立四个概念

| 概念 | 在二开中的作用 | 权威说明 |
|---|---|---|
| Cordis plugin | 注册服务、事件和可释放副作用；功能可替换 | [入门](../docs/cordis-primer.md) |
| Profile / bundle / patch | 选择应用组合、分发插件配置、覆盖部署配置 | [启动与组合](../packages/boot/app-boot/README.md) |
| Session | 持久化事实及模型上下文的来源 | [Session](../packages/core/session/README.md) |
| Agent | 活跃执行实例；生命周期与持久化会话不是同一个概念 | [Agent loop](../packages/core/agent-loop/README.md) |

## 启动路径

`apps/cli` 的 dsh 入口选择 profile，`boot/app-boot` 解析 bundle 与 patch，`bundle/base` 提供公共能力，`bundle/web-app` 等加入应用能力，然后由 Cordis 激活服务。配置修改前同时阅读 [组合源码](../packages/bundle/web-app/cordis.patch.yml) 和 [配置参考](../docs/config-catalog.md)。

patch 层按 bundle → profile → home → 命令行覆盖，目标行的 config 是整体替换。局部修改时先检查原行全部字段，避免丢掉保留项；完整细节在 [架构的 Profiles and bundles](../docs/architecture.md#profiles-and-bundles)。

Desktop 是 Electron 容器与桌面 Host，复用 Web 应用和协议。改变聊天逻辑优先查共享 Client / API；只在窗口、系统集成或打包需求中进入 [Desktop](../apps/desktop/README.md)。

## 对话路径

```text
浏览器 Client 的输入与会话操作
  → Client connection / 生成的 Remote 调用
  → API session-controller 与 Agent
  → agent-loop 领取输入、组装上下文
  → LLM adapter 准备请求并流式输出
  → tools 执行策略、工具调用与结果
  → Session 记录已提交事实
  → API 推送、Client conversation 投影和渲染
```

这是组件阅读顺序，不是每个请求的完整调用栈。定位一次具体操作还需从对应 Client 方法追到 Host 方法，不能由包名推断 RPC 参数。

| 阶段 | 优先查看 |
|---|---|
| 客户端传输 | [connection](../packages/client/connection/README.md)、[API gateway](../docs/api-gateway.md) |
| 创建、恢复和路由会话 | [session-controller](../packages/api/session-controller/README.md)、[agent.ts](../packages/api/session-controller/src/agent.ts) |
| 执行一次请求 | [agent.ts](../packages/core/agent-loop/src/agent.ts)、[生命周期图](../docs/agent-lifecycle.md) |
| 模型与工具 | [LLM](../packages/llm/llm/README.md)、[tools](../packages/core/tools/README.md)、[执行流水线](../docs/tool-execution-pipeline.md) |
| 持久化与恢复 | [Session](../packages/core/session/README.md)、[持久化格式状态](../docs/session-format-status.md) |
| 聊天呈现 | [conversation](../docs/subsystems/conversation.md)、[ui-chat](../packages/client/ui-chat/README.md)、[ui-conversation](../packages/client/ui-conversation/README.md) |

## 修改前必须分清的边界

实时 assistant-stream 提供当前增量，Session 中提交的 message / attempt 支撑恢复与回放。只在实时事件上补 UI 信息，会留下刷新后消失的问题；持久化协议说明见 [架构 Session log](../docs/architecture.md#session-log)。

Host 与 Client 使用不同 TypeScript 编译集合，Remote 声明由 Typert 生成。不要把 Node 模块拖进浏览器，也不要手改生成声明；编译顺序与共享包例外见 [开发指南](../docs/development.md#typescript-project-layout)。

执行文件系统、进程、Shell 和 sandbox 的能力需要成套组合。替换执行环境时检查这几组 provider 的一致性，而不是只替换 bash 命令；参见 [能力关系](../docs/capability-seams.md)。
