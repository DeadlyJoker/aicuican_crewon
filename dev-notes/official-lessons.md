# 可吸收的官方开发经验

类型：本地调研参考。官方远程入口已于 2026-11-04 检查；以下工程经验主要来自本地同名官方文档及源码，未将社区建议视为官方承诺。

## 官方资料路线

| 目的 | 官方来源 | 用法 |
|---|---|---|
| 项目与发布状态 | [GitHub](https://github.com/deepseek-ai/deepseek-harness)、[贡献说明](../CONTRIBUTING.md) | 目前为 developer preview；跟踪不兼容变化，不假定 API 稳定 |
| 从零开发插件 | [基础教程](../docs/user/develop/basic/index.md)、[扩展手册](../docs/cookbook/extension-cookbook.md) | 先完成插件注册与真实 Loader 加载，再扩展功能 |
| 理解 Cordis | [primer](../docs/cordis-primer.md)、[教程](../docs/cordis-tutorial/index.md)、[上游 Cordis](https://github.com/cordiverse/cordis) | 把服务依赖与副作用释放作为设计基础 |
| 设计与审查 | [防御规则](../docs/defensive-patterns/README.md)、[测试政策](../docs/testing.md) | 为具体修改选择对应规则和验证层 |
| 运行与升级 | [开发指南](../docs/development.md)、[升级指南目录](../docs/upgrade-guide/) | 检查构建产物、Node 与持久化兼容性 |
| 实际经验 | [事故复盘](../docs/postmortem/README.md)、[官方讨论](https://github.com/deepseek-ai/deepseek-harness/discussions) | 复盘用于提炼缺陷模式；讨论帖需另行复现 |

## 四个值得提前采用的教训

### 1. 覆盖率不能证明插件按发布方式工作

[ACP 事故](../docs/postmortem/0001-acp-default-export-drops-inject.md) 中，namespace 插件的 default export 导致 Loader 丢失 inject；手工挂载测试没有覆盖这一途径。二开新增插件应保留真实 Loader / profile 测试，使用同一调用拓扑验证服务访问；optional service 的读取方式需按当前 Cordis 规则确认。

### 2. 快照更新也需要独立断言

[文件系统工具事故](../docs/postmortem/0002-js-expression-disabled-filesystem-tools.md) 显示，错误配置和 UNKNOWN_TOOL 也可能被录成新 expected。二开快照需要检查工具确实存在、实际副作用符合要求，而非机械接受新文本。

该复盘包含历史配置行为，不能直接作为当前语法参考。当前 [primer](../docs/cordis-primer.md#loader-configuration) 与 [web bundle](../packages/bundle/web-app/cordis.patch.yml) 表明 config 和 disabled 支持 `!!js`；其他 metadata 保持字面值。这处历史与现状差异需要在阅读时明确区分。

### 3. GUI 验收必须绑定当前服务和页面

[Web 事故](../docs/postmortem/0003-web-agent-gui-feedback-loop.md) 中，裸 Vite 的 HTTP 200 与另开端口的成功都未证明原页面可用。二开通过 dsh profile 启动，检查同一 URL 的完整渲染、刷新与交互；判断 HMR 时区分 Client 插件 bundle 与外壳更新方式。

### 4. 保留底层结构化失败

[Landlock 事故](../docs/postmortem/0004-landlock-partial-notice-misclassified-child-failures.md) 中，信息提示与子进程非零状态被拼成错误归因。二开执行适配器应保留失败类别、状态码和来源，覆盖前台 / 后台、取消和实际平台组合，不以共有 stderr 前缀判断责任方。

## 可直接采用的工作习惯

先通过配置或注册点扩展；新能力同时设计服务定义、provider 与 consumer。把 teardown、取消、恢复、回放和错误显示列入同一个需求的验收。模型可见内容必须能从日志重建；工具的程序化返回值、模型文本和 UI 卡片分别设计。具体约束保持在各自的官方 owner 文档，不在本地复制整套规则。

## 资料边界

官方站点入口 [文档网站](https://deepseek-harness.github.io/deepseek-harness/) 已可定位，但本次网页文本工具没有返回可读正文，因此细节核对使用仓库文档。GitHub API 本次返回速率限制；基线通过 Git 协议查询，不把 API 失败解释成项目不存在。没有对社区插件进行安装或质量背书。
