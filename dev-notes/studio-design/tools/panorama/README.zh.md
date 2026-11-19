# Demo 全景查看器

[English](README.md) | 中文

设计 Demo 固定使用官方 npm registry 的 Pannellum 2.5.7。JavaScript、样式及上游 MIT 许可声明复制到 `../../vendor/panorama/`。未复制上游示例照片；仓库中的示例全景图单独按 CC BY-SA 3.0 授权。

构建本地资源：

```sh
pnpm --dir dev-notes/studio-design/tools/panorama install --ignore-workspace --ignore-scripts --frozen-lockfile --registry=https://registry.npmjs.org
pnpm --dir dev-notes/studio-design/tools/panorama run build
```

Demo 在 `../../reference-panorama.js` 中加载这些资源，用于节点内球面查看器。它在初始化查看器前解码源图，加载后停止闲置纹理更新，并在退出或切换选择时销毁渲染器。它不实现全景生成服务。已观察控件和剩余验收路径见 `../../reference-panorama-study.md`。
