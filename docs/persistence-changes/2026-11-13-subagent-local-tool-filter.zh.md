---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-13-subagent-local-tool-filter

[English](2026-11-13-subagent-local-tool-filter.md) | 中文

## 概述

在持久化的子代理描述中保留可选的本地工具包含标志。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-13-subagent-local-tool-filter
baseline: false
changes:
  - root: "event:subagent/descriptor"
    previous: "2026-09-11-initial"
    after: "233d9c8fb2b63c888b27d81060fe98a6abef00964fb9a03ddd9ae616b32b739c"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有描述省略 includeLocal，继续继承过滤规则。当前读取方保留显式 true 和 false，拒绝非布尔值。旧读取方拒绝未知的 includeLocal 字段，不会静默扩大权限。旧读取方可安全拒绝此类描述，因此保持 Session 版本不变。

<a id="verification"></a>
## 验证

子代理服务和工具作用域的定向测试共 85 项通过，覆盖描述往返、非法布尔值拒绝以及本地工具可见性。

<a id="dev-note"></a>
## 开发备注

无。
