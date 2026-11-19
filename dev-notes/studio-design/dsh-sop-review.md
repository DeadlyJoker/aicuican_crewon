# CrewON Studio 原型与 DSH 规范对照

审查日期：2026-11-11。本文按当前静态源码核对产品设计原型与 DSH 客户端规范，不替代浏览器、桌面、构建或真实媒体服务验收。当前产品主路径与交互评审分别见[产品设计](product-design.md)和[第二版原型评审](demo-v2-review.md)。

## 结论

当前原型已实际引用仓库 `ui-theme` 的 CSS、字体及现有 DSH 图标 artwork，并对齐普通控件和弹窗的主要视觉规则。它仍是 vanilla JavaScript 与原生 HTML 的独立原型，尚未复用正式 React primitives 或接入 Cordis 和共享业务数据。主题资产引用、视觉几何对齐和正式插件交付是分别检查的事项。

产品结构围绕作品项目：首页单一目标输入、已有内容导入、紧凑制作方案审阅，再进入同一个无限画布。媒体类型位于内容和工具层；短片、镜头预演与互动故事作为推荐方案或项目内工具呈现。机位平面草图和互动分支静态试走用于讨论使用方式，不构成 3D 预演、可玩发布或真实生成验收。

## 当前前端对照

| 项目 | 当前原型源码 | 正式交付仍需检查 |
| --- | --- | --- |
| 主题与字体 | `index.html`、`styles.css` 经 `dsh-theme` 相对链接加载仓库 CSS，消费 `--dsw-alias-*`、圆角和 elevation；品牌文字使用现有字体 | 通过正式主题装配接入宿主，跟随用户主题与内容字体偏好；逐状态核对对比度 |
| 控件与表单 | 标准按钮 H36／R12，字段 R12；使用原生 input、textarea、select 和 checkbox | 复用 `ui-primitives` 的 Button、表单与选择控件，不把视觉相似当组件复用 |
| 弹窗与遮罩 | 主弹窗 R28，使用 elevation，半透明遮罩不模糊背景，顶部留出窗口安全间距变量 | 正式 Modal 的 portal、焦点、嵌套、关闭和跨平台安全间距行为 |
| 描边与浮层 | 常用控件使用中性 0.5px 描边，浮层消费主题 elevation | 按[Web 样式规范](../../docs/web-styling.md)逐表面核对，避免重复描边或遗留局部覆盖 |
| 图标 | 现有 regular artwork 的本地生成快照，保留字形和 viewBox；来源及相近映射见[图标说明](icon-artwork-source.md) | 正式图标组件与 sprite；相近图形保留文字解释，新字形另做设计评审 |
| 提示、菜单与反馈 | 仍有 CSS tooltip、DOM 菜单、自制弹窗和 Toast，颜色与几何消费主题 | 复用 Tooltip、Menu／MenuSurface、Modal 与全局 Toast 的完整生命周期和定位行为 |
| 深浅主题 | 页面有主题切换，设置主题属性并消费共享调色 | 实际截图核对所有内容状态；与宿主主题设置同步 |
| 字体与信息密度 | 普通细节使用主题字体，画布缩小按层级减少文字；仍有画布专用字号和布局 | 在实际缩放、长标题、选中与展开状态检查可读性 |
| 触摸与悬停 | hover 能力查询、无悬停补偿、coarse pointer 字段 16px 规则已写入样式 | 按[响应式 SOP](../../.agents/skills/dsh-responsive-ui/SKILL.md)实际验证触摸、键盘、窗口边缘与焦点 |
| Web 与 App | 独立工作区外框及属性区用于原型评审，未挂载宿主布局 slot | 嵌入 CrewON 时复用导航和右侧 sidebar slot，核对桌面 chrome，避免双应用栏 |

[圆角标准](../../docs/ui-radius.md)和[客户端 UI/UX SOP](../../.agents/skills/dsh-client-ui-ux/SKILL.md)仍是普通控件的依据；画布节点、时间线和机位草图等专业内容按其角色评审，不能把某个画布尺寸推广为全局控件规则。

## 静态原型与正式插件

[原型入口](index.html)加载 CSS 和 vanilla JavaScript，[原型逻辑](app.js)使用字符串模板、DOM 事件和 localStorage，图片、视频及音频原文件另存于本机 IndexedDB。主题 CSS 通过相对符号链接读取仓库源文件，因此需要完整仓库内的 HTTP 服务和路径布局；独立复制该目录不能视为正式构建。图标是共享 artwork 快照，不是已挂载的 React primitives。

原型没有 Cordis `apply/inject`、Host／Client 导出、bundle patch、远程服务注册、类型化文案或插件构建。localStorage 只保存当前浏览器的示例状态，不能替代项目、资产、采用版本、任务与交付记录的共享业务持久化，也不能证明 Web 与 App 同步或重启任务恢复。

[当前短剧 bundle](../../packages/bundle/short-drama/README.md)提供宿主接入参照：声明 Host／Client／remote 导出及 bundle patch，以 effect 注册文案和能力，通过现有 `main` 与 `sidebar.panellist` 接入布局。正式实现按[客户端规则](../../packages/client/AGENTS.md)保留数据和视图分工，业务数据由 Host 管理，交互状态使用适当的 store 或局部状态；组件不直接获得 ctx，所有注册纳入 effect 生命周期，产品文案进入类型化字典，特性样式使用 CSS Modules。

## 设计与验证范围

| 项目 | 当前原型的表达 | 仍需独立验证 |
| --- | --- | --- |
| 作品创建 | 目标与已有材料进入紧凑的预设方案，再打开示例画布 | 真实 Agent 对目标的理解、补充问题与方案质量 |
| 内容工具 | 按选中图片、视频、声音或文本展示相关属性与工具 | 实际 API schema、用量、费用和结果质量 |
| 镜头预演 | 人物、机位与路径的平面草图，镜头目标与参考内容 | 真实空间编辑、运动预演、3D 渲染及视频执行 |
| 互动故事 | 选择与结局的结构，静态画面和文本的分支试走 | 可玩作品运行、完整编辑、资源生成与发布 |
| 制作与交付 | 低成本预览、采用候选、局部重做、时间线和交付反馈的示例 | 任务恢复、重复确认幂等、旧成果保留、实际剪辑编码与成片 |
| 生态共享 | 同生态入口与专家／工具用途的设计说明 | 真实身份、权限、专家、项目和记录共享 |

rhTV 的安装与账号核验是参考产品研究，见[rhTV 能力盘点](rhtv-capabilities.md)，不等于 Studio 已接入其执行，也不构成复制未提供开源许可的发行包源码的依据。参考功能是否吸收及其优先级由用户目标、成本和完整交付效果决定。

本次文档核对仅阅读当前源码、相对主题链接和规范；没有由本说明执行浏览器、App、构建或媒体任务检查。后续实际检查覆盖正常宽度与窄屏、深浅主题、长内容、悬停／键盘／无悬停输入，以及弹窗边缘、滚动、Escape 与焦点返回。正式落地另做聚焦行为测试、Session 快照、插件打包与干净安装、本地 Web／App 完整路径及根目录要求的构建检查，不能以原型动画替代。

规范入口：[Web 样式](../../docs/web-styling.md)、[客户端 UI/UX SOP](../../.agents/skills/dsh-client-ui-ux/SKILL.md)、[响应式 SOP](../../.agents/skills/dsh-responsive-ui/SKILL.md)、[插件扩展指南](../../docs/cookbook/extension-cookbook.md)、[测试策略](../../docs/testing.md)。
