# Demo tag color control

English | [中文](README.zh.md)

The standalone Demo bundles vanilla-colorful 0.7.2 (MIT) and its attribution notices locally. It uses the opaque HEX picker only. No CDN, network requests, native color dialog or production plugin registration is involved.

Run from the repository root:

```sh
pnpm --dir dev-notes/studio-design/tools/color-picker install --ignore-workspace --ignore-scripts --frozen-lockfile
pnpm --dir dev-notes/studio-design/tools/color-picker run build
```

The tag editor owns staging, HEX validation, preset synchronization and explicit save/cancel. The library owns pointer and keyboard color interaction. Named shadow parts supply sizing and Chinese accessible labels. Vendor files are generated in `vendor/color-picker/`; do not edit the generated bundle.

Upstream: https://github.com/web-padawan/vanilla-colorful
