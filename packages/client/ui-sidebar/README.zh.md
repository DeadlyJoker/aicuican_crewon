---
description: "dsh Web 客户端的侧边栏外壳插件，提供常驻导航图标栏、可折叠的 Workspace 栏，以及插件提供的导航和设置。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar

[English](README.md) | 中文

桌面端产品事件使用可选的[产品埋点服务](../product-analytics/README.zh.md)，不包含普通 Web 交互。

## 概述

侧边栏由常驻的 56px 导航图标栏和可折叠的 Workspace、Session 栏组成。图标栏提供对话导航、插件面板、更多、折叠开关、底部操作和设置。工作区栏包含品牌名称、新建会话及插件提供的 Workspace 浏览器。切换面板或折叠工作区栏时，浏览器保持挂载并保留浏览状态。

工作区组件可以向 `useSectionScroller` 传入上下文键，分别保留列表和外层视口的滚动位置。原生主页操作经过 `sidebar/return-home` 瀑布事件，使当前产品能够恢复保存的主页选择，而不替换导航界面。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

工作区栏展开或收起时，图标栏始终位于主页面旁。顶部的对话按钮返回当前对话，并展开已收起的工作区栏。功能插件沿用现有插槽。ui-workspace 填充 `sidebar.workspaces`，ui-settings 在 `sidebar.settings` 注册触发入口和设置面板。

ui-layout 在窄屏采用抽屉时，侧边栏保留展开内容的挂载。抽屉首先聚焦折叠开关，限制键盘焦点范围，支持 Escape 或点击蒙层关闭，并在没有上层弹窗时将焦点还给打开它的控件。折叠桌面工作区栏时，其中的焦点移至图标栏开关。关闭抽屉时，侧栏焦点移至顶部展开按钮，包括由侧栏控件的 `aria-controls` 标识的全局菜单内焦点。抽屉展开后覆盖主页面。

### 品牌与 New Session

`sidebar.brand.mark` 填充图标栏顶部的对话按钮，`sidebar.brand.name` 填充工作区栏的品牌行，两者保持独立的 single slot。回退内容分别为对话图标和 CrewON 标签。单行品牌与新建会话控件、工作区标题左侧对齐。完整构建在品牌文字的悬停提示中通过 `version[-commit][-dirty]` 显示版本。版本由 `DSH_CLIENT_VERSION`、可选的 `DSH_CLIENT_COMMIT_HASH` 和 `DSH_CLIENT_GIT_DIRTY=true` 组成。回退的版本按钮复制该文本，并在写入成功后显示提示。缺少版本元数据时不显示版本按钮。

工作区栏在品牌行下方提供独立的新建会话按钮。它优先使用作用域操作明确传入的 Workspace，其次是当前 Session 所属的 Workspace，再其次是最近活跃的 Workspace。如果均不存在，则打开空白的新会话页面。有效快捷键在键盘聚焦时显示于按钮尾部，支持悬停的设备也会在悬停时显示。长标签省略，快捷键保留空间。提示使用对应平台的键帽样式，已绑定控件提供 `aria-keyshortcuts`。访问快照不含 `session/create` 时不显示该按钮。每个新建请求均由 Host 判定。

活跃产品可通过 `layout.setWorkspaceContext(context, panelId, options)` 提供 `primaryActionLabel`。侧栏按钮和桌面标题栏操作共用该文案，分别用于可见文字、无障碍名称和悬停提示。随语言切换的 getter 会使用当前语言。清除产品上下文后恢复普通新会话文案，共享操作回调不变。

### 全局面板入口

插件在 root 作用域的 `sidebar.panellist` list 中注册图标组件，提供 `id`、可选 `order`，以及字符串或 locale-aware 的 `label`。同一个 id 对应布局中 root 作用域 `main` keyed slot 的组件。选择不存在的主面板条目会在改变选中态前抛错。标签为 40px 图标按钮提供无障碍名称和悬停提示。入口按 order 升序排列，相同 order 使用注册顺序。每个按钮通过 `usePanelInfo` 读取自己的选中态，不受搜索框或目录选择器焦点影响。产品可通过 `layout.setWorkspaceContext(context, panelId)` 将工作区关联到已注册入口。产品使用会话界面时仍高亮自己的入口，不高亮普通对话；选择其他全局面板时优先高亮该面板，清除工作区上下文后恢复普通导航。

`sidebar.panellist.actions` 有注册项时，图标栏显示更多按钮。其菜单接收 `entries`，包含按注册顺序排列的可自定义面板及其 `id`、`label`、`pinned`、`active`，同时接收 `onOpen(id)`、`onPinnedChange(id, pinned)` 和 `onDismiss()`。插件管理不在该列表中，始终显示在图标栏。

默认更多菜单列出全部可自定义面板。点击行打开对应面板，右侧独立的固定开关控制该入口是否显示在图标栏。固定选择由所有 Session 共用的一份内存列表记录。打开面板保留其固定选择。仅在更多菜单可用时，取消固定才隐藏相应入口。没有菜单注册项时，所有已注册入口均显示。插件重载时选择重置，已注销的 id 在重载前保留于内存。面板注册和当前选中态独立于入口可见性。

### 折叠行为

macOS 侧栏展开时，工作区栏开关位于原生窗口控件旁；侧栏收起、采用抽屉或运行在其他平台时，开关位于图标栏底部、插件底部操作和设置上方。可选的 `sidebar.toggle.badge` 占用方提供不可交互的状态内容。侧栏和顶部开关的提示显示有效命令快捷键，未绑定命令时仅显示操作名称。

框架改变侧栏列宽时，工作区栏保持最后一次展开的宽度。折叠会隐藏并裁切工作区栏，同时保留其 DOM、子插槽和滚动容器绑定。隐藏内容设置 inert，并从无障碍导航中排除。图标栏在两种状态下保持固定尺寸。ui-layout 负责响应式列宽、抽屉过渡和减少动态效果行为。

导航图标栏与工作区栏共用一层侧栏底色。工作区栏不再单独设置背景、边框、外边距和圆角。macOS 整列使用同一主题纯色，包括原生窗口控件的预留区域。

### 桌面集成

桌面布局在工作区栏折叠时保留导航图标栏。macOS 展开侧栏时，开关位于原有 48px 顶部区域的 x88 处；root 作用域的 `sidebar.chrome.actions` list 从 x124 开始放置插件操作，ui-workspace 提供原有会话搜索。侧栏收起或采用抽屉时隐藏这些操作，开关回到图标栏并恢复键盘焦点。macOS 顶部的 48px 留白避开红绿灯，并与品牌行一起标记为窗口拖拽区域。框架为窄屏抽屉入口在 `shell.leading` 挂载本包的 `HeaderLeadingControls`。在桌面宿主中且访问权限允许时，该入口同时提供新建会话按钮。[Desktop 参考](../../../apps/desktop/README.zh.md)负责原生标题栏和窗口集成。

### 滚动条

图标栏的面板列表与工作区浏览器独立滚动。折叠开关、底部操作和设置位于图标栏列表下方，品牌与新建会话位于工作区浏览器上方。指针位于侧栏内时，以及离开后的两秒内，外壳显示栏内滚动条。ui-workspace 预留滚动条空间，使可见性变化不影响行对齐。

### 点击埋点

桌面端的官方导航控件在执行操作前上报 `sidebar_menu_click`。可选的埋点服务接收 `menu_name` 和 `position`。

- 工作区栏的新建会话按钮上报 `menu_name=new_session` 和 `position=sidebar`。`shell.leading` 中的新建会话上报 `position=titlebar`。
- 插件和自动化任务入口分别上报 `menu_name=plugin` 与 `menu_name=cron`，携带 `position=sidebar`。
- 每次点击更多按钮都上报 `menu_name=more` 和 `position=sidebar`。
- 更多菜单通过 `onOpen(id)` 打开插件或自动化任务时，在检查注册前上报 `position=sidebar_more`。固定选择变化不产生导航点击事件。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

`SidebarRootComponentProps` 组合布局 owner share、原生 hooks、子插槽和注入的导航回调。`sidebar.panel.icon` 是 `sidebar.panellist` 的 Component Factory，图标栏按钮和更多菜单通过它复用各个注册图标。列表注册与 locale 变化提供面板元数据，布局持有选中态。

根节点包含固定图标栏与保持挂载的工作区栏，并为子项对齐提供 `--dsh-sidebar-inline-padding: 12px`、`--dsh-sidebar-row-padding: 12px`、`--dsh-sidebar-label-gap: 6px` 和 `--dsh-sidebar-paint-inset: 3px`。图标栏在 56px 宽度内渲染 40px 按钮。底部和设置占用方始终接收 `wide: false`。工作区占用方通过 `wide` 接收栏的可见状态，并接收 `expandSidebar` 回调。折叠裁切时，工作区栏保持最后一次展开的总宽度减去图标栏宽度。

只有工作区栏的浏览区域位于 `data-sidebar-scrollport` 内。它是尺寸容器中的纵向视口，同时也是滚动状态容器。`hookContext.useSectionScroller` 向占用方提供稳定的 `{ bindScrollerRef }` 句柄。滚轮和触控板输入可以在一次手势内从该视口继续进入占用方的滚动容器。双指缩放、以横向为主的手势和已取消的事件保留原生处理。未绑定滚动容器的占用方使用视口原生滚动。全局导航保留在独立的图标栏列表中。

### slot 纪律

声明感知的 `slots.inject()` 支持不依赖激活顺序的占用方替换。现有 `sidebar.brand.mark`、`sidebar.brand.name`、`sidebar.workspaces`、`sidebar.settings`、`sidebar.footer.action` 及面板注册保留其 owner 数据。`/client` 导出插件主体和约定类型，SidebarRoot 与行实现保留在包内。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

以下页面覆盖填充外壳席位的各个界面与组合模型。

- [ui-workspace](../ui-workspace/README.zh.md)——渲染到 `sidebar.workspaces` 的 Workspace 与 Session 浏览器。
- [ui-settings](../ui-settings/README.zh.md)——在 `sidebar.settings` 注册触发行与设置面板的设置领域底座。
- [ui-layout](../ui-layout/README.zh.md)——折叠所使用轨道与栏状态的布局 owner。
- [ui-theme](../ui-theme/README.zh.md)——外壳所重新绑定的滚动条 token 间接层。
- [slot 系统标准](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)——席位背后的组合模型。

-----

<a id="model-experience"></a>
## 模型体验

无。该包是浏览器端 UI 插件层，不注册任何面向模型的内容。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制定义外壳拥有什么、其占位方拥有什么；它们是当前包约束。

- **Session 状态点渲染由 ui-workspace 持有**：本外壳没有可用的 done/error 通知数据源。
- **Workspace 浏览行为由组合持有**：分组、排序、搜索与行状态都属于 ui-workspace，不属于此外壳。
- **「New task completed」未读标记是本地查看状态**：完成时间 > 上次查看时间这一事实永远不会到达宿主。
- **触摸拖动保留原生嵌套滚动**——视口与工作区滚动容器通过浏览器行为交接。JavaScript 滚轮交接在主线程执行。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
