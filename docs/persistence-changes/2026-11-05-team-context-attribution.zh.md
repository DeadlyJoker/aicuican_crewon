---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-05-team-context-attribution

[English](2026-11-05-team-context-attribution.md) | 中文

## 概述

在团队内置插件中声明办公室、话题初始化和工作流上下文的来源标记。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-05-team-context-attribution
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-27-subagent-settlement-attribution"
    after: "4c991086406d91fb3e674b440984a45f5cbe753eb7015fbeeb526b1d80ab570d"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-27-subagent-settlement-attribution"
    after: "969f439fbad0d9cd7763dd7b11d47eee6c90392881adc5ea7537c6ec2fbfadb8"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-27-subagent-settlement-attribution"
    after: "d76708ba819a5df9a90cf2417462835d866c5e5493686b14664afec2c8cc0328"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-27-subagent-settlement-attribution"
    after: "e651c2e677b63c61aacb1e882357318caa54d0ec1a136c3bc5cdb056ffcfefb7"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

既有来源类型和 Session 事件字段含义保持一致。新增来源携带插件自有 JSON 元数据和既有消息正文，旧读取器在未安装生产插件时保留未知来源，新读取器继续读取历史来源。话题初始化仅通过自身来源标记避免打开时调用模型。

<a id="verification"></a>
## 验证

32 项原生来源读取测试通过，包含未安装生产插件时保留外部来源。办公室 Host 测试覆盖话题绑定恢复、来源身份及初始化过滤。

<a id="dev-note"></a>
## 开发备注

无。
