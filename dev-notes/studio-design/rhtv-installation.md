# rhTV 本机安装核验

核验日期：2026-11-09。用户指定官方 HTTPS 发行包已下载，四个内包 SHA-256 与包内清单一致；独立 bootstrap 验证 Ed25519 签名与完整文件清单后安装 Codex 组件。本轮没有提交远程编辑、运行或付费生成。

| 检查 | 结果 |
| --- | --- |
| 下载文件 | `rhtv-canvas-clients-0.7.1-build-11.zip`；外层 README 标为 build 15，具体内容以组件版本和 releaseId 标识 |
| 下载 SHA-256 | `9caad4367d05dcd4ce3ea071ea552be1a8e846323fe594bbdfa972bf5188f98a` |
| Codex Plugin | `runninghub-canvas@runninghub-canvas-local`，显示名 rhTV，0.7.1 |
| Codex CLI | 0.144.6 |
| Codex 状态 | `codex plugin list` 显示 installed=true、enabled=true |
| 组件 releaseId | `fce1cc5489fc2d84f4d0` |
| 本机运行时 | 独立 Node.js 24.22.1，darwin/arm64；官方归档经固定摘要校验，不替换项目 Node |
| 当前环境 | ai，`https://www.runninghub.ai`，沿用参考产品的海外站 |
| MCP 检查 | 安装生成的绝对 Node 和启动入口成功 initialize，serverInfo 为 rhTV 0.7.1，tools/list 注册 68 个工具 |
| 账号授权 | 用户已在浏览器确认；CLI login 返回 authorized；CLI account 与 MCP canvas_account 均成功，账号 Cheney，ai，账号模式及五项能力匹配 |
| 在线只读检查 | 参考画布 capabilities 返回 alignmentVersion=1；图片快捷操作 45 项、视频 HD 1 项；图片／视频／音频目录分别返回 105／154／39 项，三类 hasMore=false |

本机组件位于 `~/.runninghub-canvas/`，Codex 缓存位于 `~/.codex/plugins/cache/runninghub-canvas-local/runninghub-canvas/0.7.1/`。安装只注册 Codex Plugin，没有重复添加独立 MCP。当前聊天不能据安装结果认定已经热加载新工具；Codex 新会话或重启插件 MCP 后使用新配置。本轮通过相同安装入口直接核验本机 MCP。

公开环境由共享 rhtvcli 管理，授权按 site 与 Origin 存于系统凭据存储。CLI、插件和 MCP 共享该组合的授权；未读取浏览器 Cookie/JWT，未把凭据放进项目。授权页由用户确认全部画布范围和五项 API 能力，后续具体付费或破坏性操作仍需单独确认范围。

能力清单见[rhTV 能力盘点](rhtv-capabilities.md)，正式 Studio 接入要求见[DSH SOP 对照](dsh-sop-review.md)。安装核验不表示允许把未提供开源许可证的发行包源码复制进 CrewON。
