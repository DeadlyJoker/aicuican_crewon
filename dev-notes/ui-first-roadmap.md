# CrewON 界面与交互二开路线

用户已确认优先方向为 Agent Team，独立任务功能低优先级。团队入口、成员状态和成果面板随 Agent Team 实施，本文的通用首页与导航调整后置。

参照 cuican-aide 制定的详细范围、分批交付和验收场景见 [二开需求方案](requirements-v1.md)。本页保留界面扩展入口的阅读路线。

## 先建立原版体验基线

跑通官方 Web 组合后，记录左侧导航、会话列表、空会话、输入框、运行中、工具结果、停止、错误、历史恢复和设置页。基线使用独立 Harness home，避免二开实验写入已有用户会话。启动参数从当前 CLI help 确认，不复用其他项目的 profile。

每组截图注明 URL、视口、主题和状态。第一版验收至少覆盖宽屏与窄屏、鼠标与键盘焦点、空数据与已有会话，以及刷新后的恢复。

## 通用界面后置路线

| 顺序 | 可独立评审的交付 | 实施入口 | 验收重点 |
|---|---|---|---|
| 1 | CrewON 品牌与统一视觉变量 | 独立品牌插件、[ui-theme](../packages/client/ui-theme/README.md)、[样式规范](../docs/web-styling.md) | 标识、名称、深浅主题、静态资源、页面标题、空会话 hero 一致 |
| 2 | 工作区导航和会话操作 | [ui-sidebar](../packages/client/ui-sidebar/README.md)、[ui-workspace](../packages/client/ui-workspace/README.md)、[ui-session](../packages/client/ui-session/README.md) | 当前选择、创建/切换/重命名、窄屏抽屉、无障碍名称与键盘行为 |
| 3 | 输入和执行反馈 | [ui-conversation](../packages/client/ui-conversation/README.md)、[ui-chat](../packages/client/ui-chat/README.md)、[ui-tool](../packages/client/ui-tool/README.md) | 草稿、附件、发送/停止、流式输出、工具进度、错误和恢复 |

Agent Team 的专用界面先按需求方案推进。上述通用界面分批确定视觉方向与交互，Session、模型适配器和执行策略的变更由对应功能设计评审。

## 官方现有的定制入口

[ui-brand-official](../packages/client/ui-brand-official/README.md) 明确支持其他部署提供独立品牌插件。侧栏的 `sidebar.brand.mark` 等插槽与会话 hero 是不同位置，替换侧栏标识不会自动替换 hero。官方品牌插件的 [注册源码](../packages/client/ui-brand-official/src/client/index.ts) 是可参考的小实现；具体 slot 名称与类型以当前源码为准。

已核对的三个品牌位置为 `sidebar.brand.mark`、`sidebar.brand.name` 和 `conversation.hero.brand.mark`；前两个由 [sidebar](../packages/client/ui-sidebar/src/client/index.ts) 声明，后一个由 [conversation](../packages/client/ui-conversation/src/client/apply.ts) 声明。

[ui-layout](../packages/client/ui-layout/src/client/index.ts) 声明 `sidebar`、`main`、`rightbar`、`shell.bottom`、`shell.overlay` 等位置。`sidebar` 是整列替换，不是添加一个导航按钮；添加入口应进入 sidebar 的子插槽。采用 [Slots](../docs/subsystems/slots.md) 注册和生命周期，避免跨插件直接 import 组件。

[ui-entry-customization](../packages/client/ui-entry-customization/README.md) 是三个区域的 More 菜单与插件创建草稿功能，不是统一品牌配置中心。不要因为包名包含 customization 就把所有品牌修改放在这里。

共享控件先查 [ui-primitives](../packages/client/ui-primitives/README.md)，样式使用 CSS Modules、clsx 与现有语义 token；产品文案走 typed locale 字典。新界面插件的编译、bundle 依赖和浏览器 roster 必须一起注册，具体清单见 [Client AGENTS](../packages/client/AGENTS.md)。

## 设计前仍需确定

CrewON 的标识资源、主色与字体、核心用户角色、默认首页和左侧一级导航尚未确认。实现前先提供可评审的布局与交互状态，不把这些假设写死到模型或持久化层。

## 后续验证入口

Client 规则要求 GUI 修改运行 `pnpm run test:gui`，影响组装后的可见输出还要做 Web replay 验证；必要构建前提见 [Client 测试阶梯](../packages/client/AGENTS.md#before-you-push-the-local-check-ladder)。此处只记录后续验收要求，不表示这些 UI 修改或验收已经完成。

已有案例可作为编写回归的起点：[侧栏抽屉](../apps/web/tests/sidebar-drawer.e2e.ts)、[键盘焦点](../apps/web/tests/focus-rings.e2e.ts)、[外观设置](../apps/web/tests/settings-appearance.e2e.ts)、[输入框几何](../apps/web/tests/composer-tab-geometry.e2e.ts)、[草稿恢复](../apps/web/tests/draft-initialization.e2e.ts)。选择与改动行为相关的用例，不把这些文件存在当成该改动已受覆盖。
