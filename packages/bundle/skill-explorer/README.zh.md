---
description: "在原生工具箱管理技能、MCP 连接器、本地工具和专家权限。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-skill-explorer-bundle

[English](README.md) | 中文

## 概述

这个可选内置 bundle 为 Harness Web 和 Desktop 客户端提供工具箱。技能、MCP 连接器和本地命令分为独立分类页，支持用途筛选、原生配置、按资源类型展示状态，以及按 Agent 预设设置能力权限。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

在插件管理器中启用 **工具箱**，然后从侧边栏的工具箱形图标打开。卡片显示易读名称、用途和对应资源的状态。技能状态表示是否允许模型调用，MCP 状态描述连接及已发现的工具，本地工具状态表示是否找到配置的程序。用途筛选包括写作、研究、数据、开发、媒体和通用任务。资源设置保留原生标识，显示名称与用途独立存储。连接和命令的技术字段放在高级设置中。管理操作要求当前身份为 Host 所有者。

### 技能

技能页默认展示全局技能，包括内置、个人、自定义目录和运行时 provider 来源。显式选择工作区后，也展示其中的项目技能。卡片标明来源，支持预览指令和调整显示名称或用途。无需选择工作区即可新建或导入个人技能，选定工作区后也可保存为项目技能。可编辑的个人和项目技能文件提供模型调用开关，内置文件保持只读。

### 服务连接

使用服务地址或本地启动配置添加 MCP 连接。连接编辑器通过原生 Settings 写入，并检查配置版本。原生 MCP manager 负责连接启动、可用状态、重连、检测和重启。工具箱展示其实时状态，并遵循继承条目和插件注册条目的管理权限。访问令牌字段写入原生凭据存储，连接配置保存其引用。编辑时已有私密值保持遮蔽。

### 本地工具

添加命令配方，或从 **文字长度统计** 和 **视频信息** 模板开始，两者分别配置 `node` 与 `ffprobe` 命令。程序检测在 subprocess provider 的执行环境中解析可执行程序。主动检测执行已配置的版本参数。本地工具编辑器标识提供服务的 Host，手动运行在运行对话框中选择执行工作区，默认使用 Host 工作目录。浏览和配置工具不选择工作区。

配方保存程序、固定参数、可选的 `{input}` 替换位置和版本检测参数。每个启用的配方注册带一个 `input` 参数的 `toolbox_cli_<id>`。执行通过原生 subprocess 和 sandbox 服务传递 argv 数组。手动运行和 Agent 运行均受执行时限、输出上限、取消和清理规则约束。配方修改后，进程启动前会拒绝使用旧配置的已准入调用。

### Agent 权限

权限编辑器选择原生 Agent 预设，保留继承行为，或限制为选定的技能、服务连接、命令配方及其他原生工具。缺少策略或策略停用时，沿用预设原本的能力集合。启用策略后，通过原生作用域注册表和工具守卫约束能力展示及实际调用。专家团、工作流和办公室使用该预设时均应用此策略。修改通过工具箱的 Settings 命名空间持久化。启用团队插件后，专家表单通过可选的 `toolbox.expert-capabilities` 插槽展示相同的选择项。保存时先确认能力列表就绪，再保存专家版本，最后将所选策略复制到新预设。策略写入失败会保留表单，再次保存会重试；专家字段未改变时不重复创建版本。若此时关闭表单，已保存的专家版本仍会保留。这些选择限制调用权限，不会预加载技能指令或安装依赖。

运行角色可通过 `toolbox/required-tools` 提供必需的协议工具。AgentTeams 提供方根据可信创建过程和当前团队记录核对确切子会话后，才提供四项成员协作工具。这些工具只在该 Agent 担任有效团队成员期间补充预设权限；普通专家对话和工作流步骤仍沿用原有配置。移除、停止、重分配或提供方释放会撤销角色默认工具。其他作用域限制、沙箱检查、审批及工具执行方自身的授权规则仍然生效。

### 配置

现有包名和 `skill-explorer` profile 条目标识这个 bundle。`dshHome`、`agentsHome`、`customSkillDirs` 和 `bundledSkillDirs` 选择技能目录。`maxSkillBytes`、`maxImportBytes`、`maxImportEntries` 和 `maxImportTotalBytes` 限制技能导入。`mcpSettingsNamespace` 选择原生 MCP manager 的 Settings 条目。`cliTools` 保存命令配方，`cliTimeoutMs`、`cliProbeTimeoutMs`、`cliOutputBytes` 和 `cliGraceMs` 约束执行。`agentPermissions` 与 `catalog` 保存预设权限和资源展示信息。默认值及校验由[配置声明](src/index.ts)定义。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节 — 点击展开</summary>

bundle 复用[上游的技能收集、元数据、导入及筛选逻辑](src/upstream/UPSTREAM.md)。MCP、命令、展示信息和权限适配层接入当前原生服务。配置写入携带 Settings 版本，执行使用原生工具流水线，Client 复用已有页面布局、控件及语言服务。

工具箱复用 Host 技能管理操作和原生技能编辑器，支持个人及项目技能的新建与导入。原有 `SkillsPage` 继续供已有调用方使用。

[bundle 补丁](cordis.patch.yml)插入稳定的 `skill-explorer` profile 条目。原有的 `crewon-skills` Client 面板标识继续保留，显示名称为工具箱。资源展示信息使用 `skill:<name>`、`mcp:<name>` 和 `cli:<id>` 键，与原生资源配置独立存储。

</details>

<a id="further-exploration"></a>
## 进一步探索

[源码归属说明](src/upstream/UPSTREAM.md) · [技能注册表](../../skill/skill/README.zh.md) · [MCP manager](../../mcp/mcp-manager/README.zh.md) · [子进程执行](../../subprocess/subprocess/README.zh.md) · [Agent 预设](../../preset/agent-preset-registry/README.zh.md)

<a id="model-experience"></a>
## 模型体验

### 工具箱能力

#### 模型看到的内容

文件系统 provider 读取 `SKILL.md` 元数据，包括 `name`、`description` 和 `disable-model-invocation`。已连接的 MCP 服务贡献其原生工具描述与参数。每个已配置命令贡献一个 `toolbox_cli_<id>` 工具，描述包含配方的易读名称和描述，并提供 `input` 字段。启用的 Agent 权限限制该预设可发现和调用的能力。

#### Token 影响

管理页面本身没有直接的模型 Token 开销。技能描述、已加载指令，以及准入的 MCP 或命令参数定义，通过已有 provider 进入模型请求。

#### KV Cache 影响

技能元数据、已连接工具、启用配方或预设权限变化后，原生注册表刷新准入的能力集合，后续模型请求可能随之变化。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 允许模型调用某个技能，并不代表该技能能够完成某项具体任务。
- 保留的 Host 技能导入操作复制指令文件，配套脚本及其他资源需要单独放置。目录导入读取一层，ZIP 导入在限制范围内接受嵌套的 `SKILL.md`。恢复回收区中的指令文件要求原目标位置空闲。
- 当前原生 manager 尚未提供交互式 MCP OAuth 登录。连接使用已配置的凭据或凭据引用。
- 命令模板配置已有程序。安装 `node`、`ffprobe` 或其他二进制程序属于独立的设备准备步骤。“已找到程序”仅确认可执行程序能够解析，执行成功还取决于参数、输入、权限和执行环境。
- MCP 连接与工具发现结果描述当前连接情况，具体工具调用仍可能需要授权或返回执行错误。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>源码许可 — 点击展开</summary>

选取的上游文件保留 [BSD-3-Clause](LICENSE)，包含原版权声明及再分发条件。[源码归属说明](src/upstream/UPSTREAM.md)记录准确的来源版本和本地适配。上游仓库根目录与包内徽标使用 Apache-2.0，而选取包的许可证文件、清单和 README 许可章节声明 BSD-3-Clause。

</details>
