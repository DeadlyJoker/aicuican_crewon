---
description: "在原生对话消息中加入交互图表与可持久保存的表单。"
kind: "package-bundle"
---

# 交互界面

[English](README.md) | 中文

## 概述

启用这个可选 bundle 后，可在对话消息中展示图表和可填写的表单。助手按需选择卡片，`/interactive-ui` 可明确请求卡片。重新打开后保留表单草稿和提交结果。涉及重要操作的工具调用继续由原生审批控制。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

在插件页面启用**交互界面**。本地化的 `/interactive-ui` 指令可从输入区菜单调用。提交表单后，冻结的字段值发送给最初请求它的对话或办公室成员。已有未发送草稿会保留。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节 — 点击展开</summary>

bundle 提供 Chat 消息正文渲染器。`CrewonForm` 支持文本、数字、多行文本、选择和复选框字段。只读柱状图、折线图和饼图通过同源路由使用固定版本 GenUI 运行时。不支持的 schema 显示重新生成提示。表单不会执行模型编写的 JavaScript。

当前 profile 的 `interactive-ui.sqlite` 保存表单编辑。提交先冻结字段和原始目标，再进入原生会话受理流程；并发点击共享一次操作，重试保留同一请求标识。完成后的表单在重新打开或重启后仍为只读。涉及重要操作的工具继续由原生审批负责。

Host 依赖 systemPrompt、webServer、profileContext、sessionController、commands 和 typert。准确的 API 见 [CrewON 服务参考](../../../docs/subsystems/crewon.zh.md)。

</details>

<a id="model-experience"></a>
## 模型体验

### 卡片编写

#### 模型可见内容

编写说明描述 `schemaJson` 块及适用场景。助手通过普通原生会话受理收到提交的字段值。图表展示提供的数据；示例测量值必须明确标注。普通 Markdown 和原生工具轨迹保留原有渲染器。

#### Token 影响

编写说明和提交的字段值进入模型请求。卡片渲染本身不调用模型。

#### KV Cache 影响

启用 bundle 后，后续请求包含其编写说明。提交的表单字段值进入普通对话历史。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 不支持的 schema 需要重新生成。图表为只读，表单仅支持上文列出的字段类型。bundle 不授予新的工具权限，也不执行任意模型生成的 JavaScript。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

固定版本图表运行时及其上游署名由包依赖和源码元信息维护。

</details>

表单在壁纸调整后的表面色下保留宿主主题实色底层。输入控件使用同一主题色系，不继承壁纸透明度；草稿保存与提交流程保持不变。

图表通过上游 OpenTiny JSON 修复器处理流式片段，然后执行相同的只读校验。宿主深浅主题切换只更新图表选项，不修改持久化内容。表单继续要求完整 JSON 校验通过后才可交互。

对话内图表使用 240px 绘图区，卡片最大宽度为 640px。紧凑表单控件保持原有保存值和提交状态。

已提交表单以紧凑的标签和值展示；草稿保留编辑控件与自动保存。
