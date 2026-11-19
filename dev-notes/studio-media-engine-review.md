# Studio 媒体引擎接入复核

本文记录 2026-11-12 的源码与本机依赖检查，补充[媒体能力接入方案](studio-media-integration.md)。这是接入评估，不是 MLT 或 Whisper 已通过产品验收的声明。

## 结论

保留现有 FFmpeg 顺序剪辑和导出。第一批增加不改动已采用内容的素材分析；MLT 多轨引擎在独立验证通过前不进入默认执行路径。Whisper 作为可选 Host 程序提供字幕候选，不能以存在配置或进程退出成功代替实际转写验收。

## 本机与现有实现

`command -v` 检查得到 `/opt/homebrew/bin/ffmpeg` 和 `/opt/homebrew/bin/ffprobe`，未发现 `melt`、`whisper-cli` 或 `whisper`；`pkg-config --modversion mlt-framework-7` 未找到开发包。初次检查未安装外部引擎；随后仅在 `/tmp` 隔离构建官方 whisper.cpp CLI，未修改产品配置。现有 FFmpeg 为 8.0.1，构建参数包含 `--enable-gpl`、`--enable-version3` 和 `--enable-libx264`，不能将该本机二进制直接声明为纯 LGPL 发布包。

现有 [render-episode.ts](../packages/bundle/short-drama/src/render-episode.ts) 只导出有序源片段，配音替代片段原声，按目标帧率裁切并检查导出帧数、音轨和字幕流。它没有表达任意重叠轨道、独立背景音乐或变换。现有 [native-cut.spec.ts](../packages/bundle/short-drama/tests/native-cut.spec.ts) 明确拒绝当前编码器无法保真的编辑决定；接入分析不能取消这些限制。

## MLT 接入条件

[MLT](https://www.mltframework.org/) 具备多轨编排、滤镜和转场能力，但不直接提供当前 WebView 的时间线 UI。[构建配置](https://github.com/mltframework/mlt/blob/master/CMakeLists.txt) 默认开启 GPL、GPL3 及若干 GPL 模块；[核心许可证](https://github.com/mltframework/mlt/blob/master/COPYING) 是 LGPL 2.1。发布评估必须覆盖实际启用模块、链接的 FFmpeg、字体、插件与编解码器，不能只记录仓库顶层许可证。

如采用 MLT，先固定版本、校验和、编译参数和依赖清单，分别构建 macOS arm64/x64、Windows 与 Linux 制品。初始构建只选择所需的 core、XML 和 avformat 等模块，并逐项确认合成、混音与文字能力所需模块及授权。签名、动态库查找和应用资源路径应随桌面包验证；不要求普通用户安装 Homebrew、Qt 或编译工具。

[Melt 命令行](https://www.mltframework.org/docs/melt/) 对参数错误的检查较弱，[MLT XML](https://www.mltframework.org/docs/mltxml/) 使用非验证解析器。因此 Agent 和客户端只能提交经过验证的时间线数据，不能提交原始命令、滤镜串或 XML。Host 编译器从项目内归档媒体生成 XML，转义内容、使用整数帧、检查引用和区间，并明确拒绝不支持的效果。启动通过现有 DSH 子进程管理，采用独立工作目录和受限输出；不新增独立应用启动入口。

最小验证使用两段本地色块视频与不同频率的原声音轨，再加入一条独立声音轨和一条文字叠加轨。验证包含：裁切与空隙、双画面轨叠加、独立静音及音量、字幕时间、保存重开、取消与失败清理；按时间点检查实际帧和音频，检查时长与轨道。相同文档必须在预览和导出中保持一致，旧时间线仍用原编码器得到相同结果。MLT 缺失、版本不符或模块不全时报告不可用，不自动把多轨文档交给顺序编码器。

## Whisper 接入条件

[whisper.cpp](https://github.com/ggml-org/whisper.cpp) 是 MIT 项目，支持 CPU 和 Apple Silicon；模型许可与来源另行记录。最小开发验证可在隔离目录固定版本构建 `whisper-cli`，不安装完整服务，也不需要 Core ML 转换工具。模型明确选择多语言版本；官方列出的 tiny 和 base 文件约为 75 MiB 和 142 MiB，不使用仅英文的 `.en` 模型验证中文。

当前 [Homebrew 配方](https://formulae.brew.sh/formula/whisper.cpp) 除 CLI 外还引入 ggml、llama.cpp 和 SDL，因此它是开发环境的便利安装方式，不直接作为最小产品分发方案。隔离测试使用官方 tiny 多语言模型与真实中英文语音：英文短句识别正确，中文出现「末班车」和「一盏灯」的同音误识别；功能可运行，但结果只作为待复核候选。临时测试工具未配置为产品默认。

Host 从当前项目的归档媒体提取 16 kHz、单声道、16-bit PCM WAV，调用配置的本地模型输出结构化字幕。输入时长、运行时间、输出字节数及片段数均受限；时间戳需非负、有序且在素材时长内。模型或依赖缺失、无音轨、转写为空、进程失败与取消分别表示，不将空字幕展示成识别成功。字幕保存为独立候选，用户或项目 Agent 明确采用后才进入剪辑。

## 首批服务复核项

- 检查媒体身份和项目归属，客户端不能传入任意文件路径。
- 请求身份同时绑定媒体和分析选项；不同输入不能复用同一请求。
- 记录使用的引擎与参数；FFmpeg 场景检测不标成 PySceneDetect。
- 区分进程退出码、超时、取消和输出截断；失败不发布部分分析结果。
- 重启后未完成请求显示中断，成功结果可读取，重试使用新身份。
- 切点只是建议，识别文字只是候选；不自动改剧本、覆盖音轨或移除现有剪辑。
