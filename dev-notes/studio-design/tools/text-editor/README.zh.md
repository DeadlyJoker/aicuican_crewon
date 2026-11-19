# Demo 文本编辑器 bundle

[English](README.md) | 中文

本目录使用 Lexical 0.49.0 构建独立 Studio Demo 编辑器，与 CrewON 对话包已使用的版本一致。不启动应用，也不修改生产包。

从仓库根目录运行：

```sh
pnpm --dir dev-notes/studio-design/tools/text-editor install --ignore-workspace --ignore-scripts --frozen-lockfile
pnpm --dir dev-notes/studio-design/tools/text-editor run build
node --test dev-notes/studio-design/tools/text-editor-smoke.mjs dev-notes/studio-design/tools/text-import-smoke.mjs
```

构建向 `vendor/text-editor/` 写入浏览器 bundle 和依赖许可声明。运行时依赖由本地锁文件固定。Demo 启动先加载 bundle，再加载 `reference-text-editor.js`，不从 CDN 获取编辑器代码。

适配器保存带版本的 Lexical JSON 与纯文本。DOMPurify 以受限标签和属性清理生成的预览 HTML。旧纯文本记录保持可读；新编辑保留生成提示词与已采用候选。可编辑草稿使用 `nodeDrafts[id].textEditor`，刷新后保留，只有提交后才进入画布撤销。引擎键盘撤销作用于当前编辑，画布撤销作用于完成后的操作。剧本所属文本继续由原编辑器管理。

当前 UI 支持粗体、斜体、下划线、标题、段落、2×2 表格、纯文本复制、展开编辑和完成操作。不实现原站尚未验证的自动排版，也不把文本生成连接到外部服务。

文档导入支持观察到的文本扩展名和 DOCX。普通文件以 UTF-8 解码；存在字节序标记时支持 UTF-16。换行统一，HTML/XML 和 Markdown 保留为纯文本。Mammoth 1.13.0 提取 DOCX 段落，不保留文档格式或内嵌图片；仅选择 DOCX 时加载独立浏览器模块。文本文件上限 1 MB，DOCX 上限 8 MB，正文上限 100,000 字符。导入内容先进入可恢复编辑草稿，完成后复用同一提交与撤销流程。原节点提示词和采用媒体保持独立。

生成的 LICENSES.txt 包含提取器与依赖声明。以上命令从仓库根目录运行，确保仓库 pnpm 启动器一致地管理隔离工具依赖安装。
