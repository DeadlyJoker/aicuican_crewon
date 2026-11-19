# Studio 原型图标来源

`icon-artwork.js` 由本地同步脚本从 [DSH 共享图标 artwork](../../packages/client/ui-primitives/src/icons/artwork.ts) 的 regular 权重生成。它保留原始 viewBox 与 SVG 几何，添加装饰性 `aria-hidden` 和来源标记，不引入新的图标字形，也不定义 CrewON Logo。这是独立原型对现有 artwork 的引用快照，不表示已经挂载正式 React 图标组件或主题 sprite。

在仓库根目录使用支持原生 TypeScript 加载的 Node 24 运行 `node dev-notes/studio-design/tools/sync-icon-artwork.mjs` 可刷新。页面在 `app.js` 前加载 `icon-artwork.js`，原型图标函数可直接返回 `studioIconArtwork[name] || studioIconArtwork.grid`。按钮的可访问名称和中文标签仍由调用处提供。

现有共享库没有与图片、影片、音乐、手形、缩小等一一对应的专用图形。本轮分别使用资产交付、播放、麦克风、拖动把手、向下收起等现有图形，具体映射在同步脚本中。此类操作保留中文说明或提示，不用相近图形承担唯一语义；后续需要精确字形时另做设计评审。`logo` 不在映射中，原型使用文字标记。

SVG 带有 `data-dsh-icon`，样式应保留源 artwork 的常规笔画宽度，避免旧的全局 `svg { stroke-width: 1.6 }` 覆盖。尺寸可用 CSS 按控件角色调整，不改 viewBox。`theme`、`sun`、`moon` 复用系统、浅色和深色主题图形。

桌面紧凑版新增 `rotate` 语义别名，复用既有 `refresh-outline` 字形，用于角度与重置；打光使用既有 `sun` 别名。新增别名后页面图标脚本版本标记同步更新，避免旧浏览器缓存回退为默认图标。

## Reference-study override

The standalone rhTV study loads `reference-icon-artwork.js` after the shared snapshot. It uses 22 Lucide aliases, including the screenplay tabs, image parameters and compact canvas navigation, to match the reference's existing icon family. The retained SVG sources and ISC license are in `assets/lucide/`. This override is confined to the design Demo; production plugin icons are unchanged.
