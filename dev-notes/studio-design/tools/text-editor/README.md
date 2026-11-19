# Demo text editor bundle

English | [中文](README.zh.md)

This directory builds the standalone Studio Demo editor with Lexical 0.49.0, matching the version already used by the CrewON conversation package. It does not launch an application or change production packages.

From the repository root:

```sh
pnpm --dir dev-notes/studio-design/tools/text-editor install --ignore-workspace --ignore-scripts --frozen-lockfile
pnpm --dir dev-notes/studio-design/tools/text-editor run build
node --test dev-notes/studio-design/tools/text-editor-smoke.mjs dev-notes/studio-design/tools/text-import-smoke.mjs
```

The build writes the browser bundle and dependency license notices to `vendor/text-editor/`. Runtime dependencies are pinned by the local lockfile. The Demo bootstrap loads the bundle before `reference-text-editor.js`; it does not fetch editor code from a CDN.

The adapter stores versioned Lexical JSON and plain text. DOMPurify sanitizes generated preview HTML with a restricted set of tags and attributes. Existing plain text records remain readable; new edits preserve generation prompts and adopted candidates. Editable drafts use `nodeDrafts[id].textEditor`, remain available after reload, and enter canvas undo only when committed. Engine keyboard undo applies to the active edit; canvas undo applies after completion. Script-owned text remains with its existing editor.

The current UI supports bold, italic, underline, headings, paragraphs, a 2-by-2 table, plain text copy, expanded editing and completion. It does not implement the reference site's unverified automatic layout action or connect text generation to an external service.

Document import supports the observed text extensions and DOCX. Plain files are decoded as UTF-8, or UTF-16 when a byte-order mark identifies it; line endings are normalized, while HTML/XML and Markdown remain literal text. Mammoth 1.13.0 extracts DOCX paragraphs without document formatting or embedded images; the separate browser module is loaded only when a DOCX is selected. File limits are 1 MB for text and 8 MB for DOCX, with a 100,000-character body limit. Imported content first enters the recoverable edit draft, and completion reuses the same commit and undo path. Original node prompts and accepted media remain independent.

The generated LICENSES.txt includes the extractor and dependency notices. Run the commands above from the repository root so the repository pnpm launcher manages the isolated tool installation consistently.
