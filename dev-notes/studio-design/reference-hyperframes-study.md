# HyperFrames 原站入口与复用评估

2026-11-10。当前结论：优先验证 HyperFrames 作为 Agent 合成与输出模块；它同时有可复用的时间线编辑组件，但不能据源码导出列表就认定已经满足 CrewON 的专业多轨剪辑验收。现有剪辑草稿继续保留，不将其静默迁移为 HTML 工程。

## 原站实际入口

在研究画布 `2119975870931091458` 点击顶部 HyperFrames，出现覆盖式窗口，内嵌同站 `/labs/rhhyperframes`。窗口显示 HyperFrames Agent、历史记录、新建对话、素材上传和文本输入，并明确描述生成 HTML 合成页面、预览、编辑和合成视频。没有输入内容、上传文件、发送请求或执行合成；截图 `rhtv-hyperframes-agent-entry.png`。该观察只证明原站提供这条产品链路，不证明其内部版本、渲染部署和代码修改范围。

它与左侧剪辑工作台分开：后者此前实际观察为 `/opencut/index.html`。因此不能把 HyperFrames 当成原站 OpenCut 工作台的新名称，也不应在 CrewON 中直接嵌入 RunningHub 页面。

## 官方代码证据

本次固定源码提交为 `cda84222aa12716f2ceb92b45629487be81a0601`；该提交的 `@hyperframes/studio` 为 0.9.30，npm 查询的发布版本也为 0.9.30。主分支持续更新，后续隔离验证须固定版本和锁文件。

| 部分 | 当前证据 | 对 CrewON 的意义 |
| --- | --- | --- |
| 授权 | [根 LICENSE](https://github.com/heygen-com/hyperframes/blob/cda84222aa12716f2ceb92b45629487be81a0601/LICENSE) 为 Apache-2.0 | 可以评估复用；分发时保留适用声明，依赖、字体、媒体和商标分别核对，不把代码许可扩张为所有附带资产许可 |
| 预览 | [player README](https://github.com/heygen-com/hyperframes/blob/cda84222aa12716f2ceb92b45629487be81a0601/packages/player/README.md) 提供独立 Web Component、播放、暂停、定位、加载及错误事件 | 可先隔离验证，无须先接入整套外部 Studio 账号 |
| 可视编辑 | [Studio 导出](https://github.com/heygen-com/hyperframes/blob/cda84222aa12716f2ceb92b45629487be81a0601/packages/studio/src/index.ts) 包含 EditorShell、Timeline、AudioWaveform、属性面板和编辑历史相关接口 | 有实际组件基础；仍需提供上下文、素材和文件写入适配，不是插入一个 React 标签就完成接入 |
| 宿主职责 | [EditorShellProps](https://github.com/heygen-com/hyperframes/blob/cda84222aa12716f2ceb92b45629487be81a0601/packages/studio/src/components/EditorShell.tsx) 要求宿主提供素材拖入、文件拖入、删除、复制粘贴等回调 | CrewON 应负责自己的素材 ID、项目版本和撤销结果，不让两套存储同时修改同一工程 |
| 持久化 | 导出中有待完成写入排空、文件版本冲突、写入与编辑历史相关接口 | Agent 改工程和用户手动编辑需要版本检查；不能覆盖尚未落盘的用户修改 |
| 渲染 | [producer README](https://github.com/heygen-com/hyperframes/blob/cda84222aa12716f2ceb92b45629487be81a0601/packages/producer/README.md) 提供 createRenderJob / executeRenderJob，依赖 Node 22+、Chrome/Chromium 和 FFmpeg | 可评估本机渲染；接入 DSH 时通过插件服务和任务生命周期调用，不另起一套不可监控的 CLI 应用 |

上述是源码和官方文档证据；本轮没有安装、启动或渲染 HyperFrames，不能宣称实际音画同步、跨平台导出、重启恢复或可用性已经通过。

## 产品与技术衔接

无限画布继续负责剧本、角色、场景、素材及创作关系。手动剪辑负责片段裁切、上下叠层、字幕和音轨。Agent 合成负责把选定素材和文字组织为可编辑的 HTML 合成工程，适合片头片尾、字幕包装、图文混剪、动效和自动出片。三者共享项目与素材版本，但保留不同工程记录；不新增图片、视频、声音三个产品级主入口。

若验证通过，用户从当前项目或选中素材进入合成工作区，继续使用 CrewON 的 Agent 和模型配置；API 执行生图、视频、配音，渲染模块只消费已确定的素材和工程。首次输出前展示明确的工程版本和输出设置，完成后成片作为新版本回到画布，不覆盖原素材。预览失败、执行失败或工程冲突在所属区域展示，保留可编辑工程。

DSH 插件服务持有工程文件、媒体映射、写入版本和渲染任务；前端承载官方预览／编辑能力并复用 CrewON 样式。Agent 通过插件工具提交工程变更，变更与执行都要进入可追溯记录。HTML 合成具有脚本执行需求，必须使用独立的预览执行环境和明确的素材访问规则，不能直接把生成页面放进拥有主应用权限的文档。此处是接入设计，尚未新增正式插件或改变内核。

## 隔离验证顺序

1. 固定 0.9.30，用自有图片、视频、文本和音频制作最小工程，验证官方 player 的播放、定位、画面尺寸和加载失败；不引入外部平台账号。
2. 验证 EditorShell/Timeline 的真实拖拽、裁切、多层文本叠加、音轨、音量和撤销；确认视频原声是否自动识别、如何分离以及是否双重播放。
3. 使用 producer 输出带原声、配音、叠层和字幕的 MP4，实际观看、听取并检查音画同步；预览与成片逐帧抽查。
4. 保存后重启，验证继续手动编辑、Agent 写入冲突处理、待完成写入排空和渲染恢复；用当前桌面 WebView 检查媒体能力。
5. 通过后再替换 Demo 中暂停扩写的剪辑部分；原单轨草稿保留版本，只有明确转换成功时才建立新工程引用。

## 另一个候选

[Omniclip](https://github.com/omni-media/omniclip) 的官方 README 声称提供本机浏览器编辑及可嵌入组件，涵盖视频、图片、文字和音频；当前根 LICENSE 为 MIT，但 package.json 标注 ISC。还包含 WebCodecs、FFmpeg/WASM 和跨源隔离相关依赖。它是后备验证候选，版本授权信息、浏览器支持和实际编码链路都需核对；不能仅按 README 宣称就认定比当前候选更完整。

## 隔离播放器实测（2026-11-11）

已在tools/hyperframes固定0.9.30的官方player／core运行时与自有6秒测试工程，未接入主Demo或替换既有剪辑草稿。复制脚本校验npm完整性，vendor/hyperframes保留两份原LICENSE及包／文件哈希。浏览器访问现已恢复：真实视频帧解码、图片与字幕切换、定位与播放结束、刷新后恢复保存位置均已直接观察；缺失工程8秒报错，再恢复工程可重新就绪。详细参数与截图见[隔离验证说明](tools/hyperframes/README.md)。

以上只支持继续评估播放器，不能证明专业剪辑能力。原声与混音、真正多轨编辑、工程保存恢复、producer导出、原生App及DSH隔离执行仍未验收；保持正式剪辑替换暂停，不将此独立验证页作为已实现剪辑器交付。

## 2026-11-11 官方编辑器与真实导出

已在 tools/hyperframes/editor-check 建立独立锁文件、官方 Studio UI／API／compiler／producer 及 Cordis effect Host，经当前 DSH profile 启动3092，不修改3090剪辑器或正式数据。三条画面轨实际拖动、字幕写入、刷新和Host重启保留均通过；从官方界面导出得到7秒640×360、30fps的H.264＋AAC，抽查1／4.5／6.5秒帧符合编辑后的时间范围，原视频信号0–3秒、之后静音。首次缺少默认Chrome明确失败，指定本机Chrome后重试成功。复现命令、原始产物和未通过项见[编辑器验证](tools/hyperframes/editor-check/README.md)。

目前仅作为可复用路径证明：合成缩略图服务、原声拆分与波形、复杂跨轨编辑、长工程性能、完整导出设置和精确音画同步尚未验收，不宣称专业剪辑器全部达标，也未迁移既有草稿。

2026-11-11追加原声验证：官方Detach audio实际产生独立音轨与波形，原视频静音并保留链接；撤销移除、重做及Host重启恢复通过。拆分前后导出的完整解码PCM哈希、48kHz双声道、7秒时长一致，前3秒平均音量和峰值不变。比较器还拒绝了音量减半的临时结果。此项关闭显式拆分／波形缺口，但不等于默认自动拆轨或听觉同步质量验收；见编辑器验证README。

2026-11-11追加基础剪辑：标题跨轨拖动通过，占用轨道时会避开已有片段并改变开始时间；关联视频／音频移动到同一新时间通过，关联裁切3→2秒通过。裁切后实际导出在2秒停音，1.5／2.5秒帧符合安排；全部测试移动与裁切已用Undo恢复。基础多轨编辑、原声、字幕、持久化和真实编码已有复用证据，后续应做项目／素材桥接与UI适配，不再扩写手工时间线；复杂剪辑和完整接入仍未验收。
