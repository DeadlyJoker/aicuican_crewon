# 二开环境与源码基线

类型：2026-11-04 本地检查记录，后续更新需重新验证。知识准备与可运行环境分别记录，不相互代替。

## 源码基线

本地包版本为 `0.2.2-alpha.3`。通过官方 Git 远程查询并建立独立参照 checkout，将本次上游提交固定为本地标签 `crewon-baseline-2026-11-04`，该标签是本地基线标记，不是官方发布标签。

最初目录不含 `.git`，相对该上游的 20,531 个受管理文件缺少 4,142 个；所有已存在文件内容与上游一致。已只补入缺失文件，并恢复该上游的 Git 元数据，没有覆盖现有源码。补齐内容包括 `.agents` 的开发知识与工作流、`.github` 和各类隐藏配置。逐文件清单见 [核对记录](generated/upstream-audit.json)。

当前在本地分支 `codex/crewon-preparation`。恢复完成时受管理文件 diff 为空；随后仅在根 AGENTS.md 增加准备索引入口，准备材料单独位于 `dev-notes/`。没有创建提交或推送。

## 工具链

| 项目 | 实测 |
|---|---|
| 默认 shell Node | v22.22.0，低于项目 Node >=24.9.0 要求 |
| 已有可用 Node | `/Users/cheneywang/.nvm/versions/node/v24.18.1/bin/node`，输出 v24.18.1 |
| pnpm | 11.28.5，与 packageManager 声明一致 |
| 依赖安装 | Node 24 下安装成功；保留 frozen lockfile，单次切换 npm 官方源 |

本次命令通过进程内 PATH 选择 Node 24，没有修改用户全局 Node、shell 配置或其他项目。后续新终端必须再次选择兼容 Node，不能因本次安装成功就假定默认 Node 已变更。

```sh
export PATH=/Users/cheneywang/.nvm/versions/node/v24.18.1/bin:$PATH
node -v
```

## 验证记录

- 官方参照与本地源码逐文件比较：已完成，原有文件差异为零。
- Git 基线恢复后受管理文件检查：已完成，无源码变更。
- 包索引生成：已完成，覆盖 394 个 workspace manifest。
- 准备文档：使用仓库链接校验函数检查全部 7 篇 Markdown，文件链接与章节锚点无错误；包索引重复生成结果一致，394 个包名无重复。
- 依赖安装：`pnpm install --frozen-lockfile --registry=https://registry.npmjs.org` 通过；初次使用现有镜像的安装因大包下载慢和连接重置被中止，随后复用缓存完成。未改全局 registry 或锁文件。
- 完整构建：`pnpm run build` 通过，10 项检查全部成功，用时约 105 秒，包含 artifacts 和 Host / Client aggregate check。
- CLI：`pnpm dsh --help` 正常退出，启动入口可用；这不代表带模型的会话已验证。
- 文档：初次 `pnpm run test:docs` 发现新增记录中的提交标识和 README 配对问题，已改为本地基线标签并补齐中英入口与同语种链接；完整 `pnpm run doc-sync` 通过，43 项检查全部成功。
- 真实模型调用：本轮未执行，不宣称 API 或模型链路已通过。
- CrewON 界面验收：尚未实施产品改动，不宣称设计或体验已验收。

## 环境准备后的下一步

按 [UI 优先路线](ui-first-roadmap.md)建立官方原版页面基线，再设计 CrewON 品牌、导航和输入交互。先确认产品设计，再按最小影响范围实现；当前研究不要求批量更改上游产品代码。
