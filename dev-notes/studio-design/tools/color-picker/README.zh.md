# Demo 标签颜色控件

[English](README.md) | 中文

独立 Demo 在本地打包 vanilla-colorful 0.7.2（MIT）及其署名声明，仅使用不透明 HEX 取色器。不涉及 CDN、网络请求、原生颜色弹窗或生产插件注册。

从仓库根目录运行：

```sh
pnpm --dir dev-notes/studio-design/tools/color-picker install --ignore-workspace --ignore-scripts --frozen-lockfile
pnpm --dir dev-notes/studio-design/tools/color-picker run build
```

标签编辑器负责暂存、HEX 校验、预设同步和明确的保存／取消。库负责指针与键盘取色交互。具名 shadow part 提供尺寸与中文无障碍标签。Vendor 文件生成于 `vendor/color-picker/`，不应手工编辑生成 bundle。

上游：https://github.com/web-padawan/vanilla-colorful
