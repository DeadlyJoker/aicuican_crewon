# Studio 多轨渲染运行时

Studio 的多轨文档由 Host 编译成 MLT XML。MLT 负责画面叠加、片段时间、视频原声和独立音轨混音，输出无损中间文件；FFmpeg 的 libass 滤镜把已确认字幕烧录到画面，同时交付独立 SRT 文件。新多轨 MP4 不嵌入第二条字幕流，避免播放器重复显示烧录字幕与软字幕；FFmpeg 的 MP4 编码器会自动启用首条字幕流，不能依赖关闭默认标志避免该问题。旧顺序时间线仍走原来的 FFmpeg 导出器，已有导出不重算。

MLT XML 不接收客户端提供的滤镜、命令或路径。Host 先校验项目媒体归属、直接媒体格式和源区间，再传入归档路径；帧数使用整数，源入点与时间线入点分别保存。同一轨道不允许片段重叠，不同轨道允许叠加。画面轨的静音只关闭原声，不隐藏画面；字幕轨的静音隐藏该轨字幕。混音显式使用 `sum=1`，不采用 MLT 默认的平均音量算法，并以限幅器防止多轨相加后削波。

## 本机验收依赖

MLT 7.42.0 使用[官方发行源代码](https://github.com/mltframework/mlt/releases/tag/v7.42.0)，归档 SHA-256 为 `8800e343f43aaa885bd5d9d23553030fa220aa3e2f0c94d9fd6a936d41638cdd`。隔离构建安装于 `~/.dsh/tools/studio/mlt/7.42.0`，启用 core、XML、avformat 和 plus，关闭 MLT 的 GPL/GPL3、Qt 和 SDL 输出模块，不改变系统 FFmpeg。Melt 命令行本身仍链接本机 SDL2；avformat 模块链接本机 FFmpeg 动态库。

字幕运行时使用[FFmpeg 8.0.1 官方发行](https://ffmpeg.org/releases/)，归档 SHA-256 为 `05ee0b03119b45c0bdb4df654b96802e909e0a752f72e4fe3794f487229e5a41`，发行签名由官方发布的公钥 `FCF986EA15E6E293A5644F10B4322F04D67658D8` 验证。隔离构建安装于 `~/.dsh/tools/studio/ffmpeg/8.0.1-libass`，显式启用 libass 0.17.5 和 libx264，不替换系统安装。

这些是开发机验收依赖，不是经过分发审核的桌面运行时包。二进制和数据路径不引用临时构建目录，但仍依赖 `/opt/homebrew` 中的动态库，不可直接拷贝到另一台电脑。MLT 自身所选模块是 LGPL，但所链接的本机 FFmpeg 及字幕 FFmpeg 含 GPL 编码器，不能据此声称整个发行包是 LGPL。发布前须逐平台固定制品、依赖与许可证，保留源代码及告知，并验证签名、动态库搜索路径和中文字体；普通用户不应安装 Homebrew 或自行编译。

## 回归入口

`render-mlt.host.spec.ts` 使用 `DSH_MLT_TEST_EXECUTABLE` 指定 MLT，`DSH_MLT_TEST_FFMPEG` 指定具有 libass 的 FFmpeg。真实素材覆盖不同时间的双画面轨、原声与独立声音频率、静音不隐藏画面、已确认字幕的画面像素和独立 SRT，以及失败后不保留半成品。缺少本地媒体依赖时真实渲染用例跳过，因此只看绿灯数量不能证明已执行渲染；验收记录必须同时保留配置的可执行文件与用例结果。
