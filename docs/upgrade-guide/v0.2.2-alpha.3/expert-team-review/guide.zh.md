---
kind: upgrade-guide
description: "专家团创建现在先生成审查卡片，再保存可复用配置。"
---

# 保存前审查可复用专家团

[English](guide.md) | 中文

## 变更

团队插件中的 `expert_team_save` 现在生成持久化方案，不再直接写入团队目录。`/create-expert-panel` 使用同一创建流程。已有团队配置、内联角色、专家不可变版本与运行历史继续可读。通过 `@` 或 `/agent-teams` 调用已有团队时，继续使用执行计划审查。

## 迁移

1. 自定义 headless 配置若要提供创建工具，须添加 `@deepseek-ai/dsh-agent-preset-registry`，Web 和 Desktop 已包含。再修改将 `expert_team_save` 视为已完成保存的自定义指令：须等待用户确认对话中的待审查卡片。
2. 绑定可复用专家时，传入目录返回的 `expertKey`、`expertId` 或 `agentPreset`。已有 `role` 和 `responsibilities` 内联字段继续支持。
3. 确认卡片后，在“团队 → 专家团”查看保存结果。重新打开或重启会保留待确认方案，重复确认不会创建另一支团队，也不会启动成员。
