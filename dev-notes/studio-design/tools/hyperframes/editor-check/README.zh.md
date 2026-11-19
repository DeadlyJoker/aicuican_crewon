# 官方编辑器隔离验证

[English](README.md) | 中文

固定 HyperFrames 0.9.30，依赖由本目录的 `package-lock.json` 锁定；不改变仓库根依赖，也不挂载 CrewON 的工作区或正式数据。3092 是独立测试编辑器，3090 的样式 Demo 未替换剪辑器。当前展示官方原始 UI，其配色和英文文案不是 CrewON 设计方案。

## 复现

从仓库根目录安装已锁定的独立依赖，不执行包安装脚本：

```sh
npm ci --prefix dev-notes/studio-design/tools/hyperframes/editor-check --ignore-scripts --workspaces=false --omit=optional --registry=https://registry.npmjs.org --cache=dev-notes/studio-design/tools/hyperframes/editor-check/.npm-cache
python3 dev-notes/studio-design/tools/hyperframes/editor-check/prepare.py
```

Node 须满足 DSH 的版本要求。本机实际用 Node 25.5.0，项目首次初始化与启动均通过 DSH profile；首次初始化时加 `--from-default-profile sdk-minimal`，以后重启省略该参数：

```sh
DSH_HOME="$PWD/dev-notes/studio-design/tools/hyperframes/editor-check/.dsh-home" \
PRODUCER_HEADLESS_SHELL_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
/opt/homebrew/opt/node@25/bin/node --import tsx/esm apps/cli/src/bin.ts \
  --profile crewon-editor-check --from-default-profile sdk-minimal \
  --patch dev-notes/studio-design/tools/hyperframes/editor-check/editor.cordis.patch.yml
```

打开 http://127.0.0.1:3092/。其他机器应指定实际已安装的受支持 Chrome 和 Node，不能直接照抄本机二进制路径。`editor.cordis.patch.yml` 配置监听地址、端口及测试目录；Host 只允许访问本目录的 `project`。HTTP 服务、渲染取消与历史关闭由 Cordis effect 管理，不新增应用入口。按 Ctrl+C 停止该独立 profile。

`prepare.py` 只补不存在的测试素材，保留已编辑的 HTML。视频是自制测试图与 440Hz 测试音，校准图为自制素材；GSAP 从锁定安装包复制，保留原版权头，并附上包声明的许可证链接。HyperFrames 的 Apache-2.0 文本已保存在上层 vendor 目录；GSAP 等依赖使用各自许可证，这次隔离验证不是完整分发许可审查。

## 2026-11-11 实测

- 官方 Studio UI、`createStudioApi`、compiler、producer、history 接入同一个独立 Host；不以空回调模拟编辑器。
- 显示视频／图片、字幕、标题三条画面轨；原生鼠标把标题从 3–6 秒拖到 4–7 秒，撤销记录为 Move timeline clip。
- 通过编辑器自身公开 WebMCP 修改字幕，收到文件内容版本，磁盘 HTML、刷新和 Host 停止重启后均保留修改；重启后仍能撤销，时长为 7 秒。
- 从编辑器点击 Export 实际执行编译、视频解码、音频混合、Chrome 逐帧采集和编码。第一次未指定 Chrome 时明确失败；指定本机 Chrome 后成功，未把失败当成功。
- FFprobe 确认输出 7 秒、640×360、30fps、H.264 与 AAC；静音检测从第 3 秒开始，与原视频 0–3 秒一致。
- 人工查看导出 1、4.5、6.5 秒帧：分别为视频与字幕、图片与标题及字幕、仅仍在时间范围内的标题。6–7 秒黑底是本次拖动测试留下的画面空隙，不是导出丢图。
- 实际产物 `project/renders/*.mp4`；对外证据副本 `hyperframes-editor-result.mp4`，截图 `hyperframes-editor-restored.png`。

## 尚未通过

完整缩略图服务尚未接入，左侧合成缩略图仍显示 Preview unavailable，主播放器实际可用。原声拆分与独立波形现已通过下述验证；默认自动拆轨、速度／转场与复杂裁切组合、长工程性能、完整导出参数映射、听觉质量与精确音画同步验收。尚未映射 Studio 的既有剪辑草稿，不能直接替换原有工作台。此次成功只说明存在可实际编辑、持久化与编码的复用路径。

接入依据：[官方 API adapter](https://github.com/heygen-com/hyperframes/blob/cda84222aa12716f2ceb92b45629487be81a0601/packages/studio-server/src/types.ts)、[官方编辑器适配实现](https://github.com/heygen-com/hyperframes/blob/cda84222aa12716f2ceb92b45629487be81a0601/packages/studio/vite.adapter.ts)。

## 2026-11-11 原声拆分与恢复

右键视频片段 → Detach audio：官方实现新增 `audio#source-video-audio`（0–3秒、轨道3），原视频设置 `muted`，两者保留同一个 `data-link`／`data-sync-origin`。实际波形出现在独立音轨中；这证明可以显式拆分，不代表导入视频时默认自动拆轨。

再次从界面导出并比较拆分前后的解码音频：均为48kHz双声道，完整7秒PCM SHA256相同；前3秒平均音量−21.1dB、峰值−16.1dB相同，未出现重复叠音。此比较验证导出未改变测试音，不代表已经完成听觉质量评审。

Undo 后音轨查询为0条，Redo 后恢复1条；Host停止重启及页面重载后仍为0–3秒独立音轨，撤销标签为Detach audio，波形重新显示。截图 `hyperframes-audio-restored.png`，导出副本 `hyperframes-detached-audio-result.mp4`。

可复查比较：

```sh
python3 dev-notes/studio-design/tools/hyperframes/editor-check/verify-audio.py BEFORE.mp4 AFTER.mp4
```

比较器校验时长、单音流、采样率、声道和实际解码PCM。已运行正例，并额外生成音量减半的临时结果确认拒绝；临时文件随后清理，输入文件保留。

## 2026-11-11 跨轨、关联移动与关联裁切

鼠标把标题从轨道2拖至已有字幕的轨道1，官方编辑器将其放到字幕之后（6–9秒）以避免同轨重叠；实际轨道字段和时间均已读取，随后撤销回轨道2的4–7秒。这是占用轨道的碰撞处理，不应在接入时解释为保持原时间的自由叠加。

关联选择开启时，把视频拖到后方空白时间，两份片段同时变为6.08–9.08秒；未改变图片与字幕，随后撤销。拖回紧邻其他片段的占用时间没有产生移动，未把这次无效果操作算作成功。

视频右边缘从3秒裁到2秒，独立音频也变为0–2秒，随后实际导出：静音检测从第2秒开始；查看1.5秒帧仍为源视频，2.5秒只剩仍在时间范围内的字幕。图片仍从3秒开始，因此2–3秒留白符合测试安排，不冒充自动波纹消隙。最后一次Undo恢复视频与音频同为0–3秒。

截图 `hyperframes-linked-trim.png`、输出 `hyperframes-linked-trim-result.mp4`。这些是基础操作的实际证据，不能代替复杂转场／变速／长工程或全部碰撞组合验收。
