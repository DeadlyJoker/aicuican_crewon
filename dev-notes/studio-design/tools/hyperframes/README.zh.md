# HyperFrames 隔离验证

[English](README.md) | 中文

本目录仅验证官方播放器与运行时，不接入主Demo导航，不改既有剪辑草稿，不作为专业多轨剪辑器或导出完成的证据。

## 固定来源

使用官方npm的`@hyperframes/player@0.9.30`与`@hyperframes/core@0.9.30`。`fetch-runtime.py`下载固定版本，核对npm SHA-512后只读取指定构建文件与原LICENSE，不执行安装脚本。产物在`../../vendor/hyperframes/`，manifest记录包来源、完整性值和复制文件SHA-256。包内player／core许可文件均保留；没有复制官方示例照片、字体或第三方模板。

```sh
python3 dev-notes/studio-design/tools/hyperframes/fetch-runtime.py
```

## 自有测试工程

`composition.html`包含3秒自制色卡视频（H.264、640×360、24fps，AAC440Hz原声），后接自制校准图片场景，字幕在独立层持续6秒。不使用GSAP、不调用生成API。源测试视频使用以下FFmpeg命令生成：

```sh
ffmpeg -hide_banner -loglevel error -f lavfi -i 'testsrc2=size=640x360:rate=24:duration=3' -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=3' -shortest -c:v libx264 -preset fast -crf 25 -pix_fmt yuv420p -c:a aac -movflags +faststart -y dev-notes/studio-design/tools/hyperframes/test-pattern.mp4
```

从既有静态服务打开[验证页](http://127.0.0.1:3090/tools/hyperframes/player-check.html)。页面提供播放／暂停、定位1秒／4秒、保存／恢复播放位置及失败加载检查，状态与事件直接展示。保存键仅使用独立的`crewon-hyperframes-probe-v1`播放位置，不是工程编辑或重启恢复证明。默认静音；需要单独验证原声播放与混音。测试HTML为自有固定内容，不能把此同源测试方式用于运行任意Agent生成HTML，正式接入仍需隔离执行环境。

## 2026-11-11证据

npm完整性与文件复制通过；ffprobe确认测试视频3秒、H.264／AAC、640×360、24fps。先前浏览器超时与锁屏问题已解除，本轮已实际打开验证页：播放器ready=true、duration=6、640×360；定位1秒，视频readyState=4、currentTime=1.00001，截图出现真实测试视频与字幕；播放后currentTime推进并发出ended事件。定位4秒显示校准图片与字幕，保存位置后刷新，再点恢复保存位置，currentTime=4、paused=true。

“检查缺失工程”切换到不存在的HTML，8秒后返回`Composition timeline not found after 8s`、ready=false；点击恢复测试工程后重新ready=true、currentTime=0，定位1秒再次出画。该项仅覆盖工程加载失败，不是单个媒体缺失或网络中断恢复。切换地址使用组件的`src`属性；此版本未提供同名JavaScript属性访问器，不能用`player.src=...`推断已切换资源。截图hyperframes-video-confirmed.png与hyperframes-image-restored-confirmed.png保存在本轮可视化目录。

播放器资格验证通过以上路径；仍未验证音轨听感与同步、可视化多轨编辑、工程编辑持久化、producer和实际MP4导出。保存播放位置不是保存剪辑工程，不把播放器当作专业剪辑器。
