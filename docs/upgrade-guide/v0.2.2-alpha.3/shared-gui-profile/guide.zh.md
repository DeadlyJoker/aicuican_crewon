---
kind: upgrade-guide
description: "默认 Web 与 Desktop 改为共用一个 GUI Host 和 Web profile，统一原先分离的插件选择与 profile 数据。"
---

# Web 与 Desktop 共用 profile

[English](guide.md) | 中文

## 变更

默认 Web 与 Desktop 使用 `$DSH_HOME/profiles/web` 和一个 GUI Host。此前 Desktop 使用 `profiles/desktop`，插件选择与 profile 本地数据各自独立。插件、专家、专家团、办公室、工作流及其已保存历史现统一使用 Web profile。连接要求 `DSH_HOME` 和 dsh 运行时精确版本一致。自定义 profile 保持独立。默认 GUI 端口为 `3080`。

首先启动的入口拥有 Host，后启动的入口连接它。退出连接到已有 Host 的 Desktop 只断开该客户端，退出拥有 Host 的 Desktop 则在任务检查后停止 Host。原生窗口、快捷键与更新偏好仍位于 Electron userData。

## 迁移

1. 首次共享启动前，停止现有 Web 与 Desktop 进程。两端使用相同的 `DSH_HOME` 和匹配版本，通过 `dsh --version` 检查终端运行时。macOS 和 Linux 迁移时若检测到旧 GUI 进程或 profile 文件仍被占用，会停止迁移。Windows 在存在 `profiles/desktop` 时拒绝自动迁移，全新或仅有 Web profile 的 Windows 环境可正常启动。若活动 Host 报告版本不匹配，先停止它，再启动匹配版本。
2. 启动 Desktop 或运行 `dsh web`。启动过程将已有 `profiles/web` 和 `profiles/desktop` 快照保存到 `$DSH_HOME/gui-profile-backups/<id>/`，合并组合包选择与兼容数据，然后发布合并后的 Web profile。`ui-` 偏好冲突时保留已有 Web 值，并在备份的 `migration-policy.json` 中记录保留字段。原生 Desktop patch 条目留在来源备份中。插件依赖、其他设置或业务记录冲突时中止迁移，保留两份来源与备份。解决报错指出的冲突后重试。
3. 通过插件页或 `dsh plugin --profile web` 管理共用插件。将操作当前 Desktop 配置的脚本从 `--profile desktop` 改为 `--profile web`。需要重启的更改或不同的命令行 overlay，需重启拥有 Host 的入口后生效。CLI 拥有 Host 时，Desktop 安装更新会提示先在终端停止 Web 服务，再重启 Desktop。仅重启 Desktop 会保留该 Host 运行。
4. 打开另一端，确认启用插件、专家定义、团队和已保存历史一致。完成记录位于 `$DSH_HOME/gui-profile-migration-v1.json`。检查合并后的数据前保留备份。浏览器本地草稿与布局偏好仍由各客户端分别保存。
