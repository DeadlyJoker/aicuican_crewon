# Panorama viewer dependency

English | [中文](README.zh.md)

The design Demo pins Pannellum 2.5.7 from the official npm registry. Its upstream MIT notice is copied with the JavaScript and stylesheet into `../../vendor/panorama/`. No upstream example photograph is copied; the repository separately licenses its example panorama under CC BY-SA 3.0.

Build the local assets with:

```sh
pnpm --dir dev-notes/studio-design/tools/panorama install --ignore-workspace --ignore-scripts --frozen-lockfile --registry=https://registry.npmjs.org
pnpm --dir dev-notes/studio-design/tools/panorama run build
```

The Demo loads these assets for the in-node spherical viewer in `../../reference-panorama.js`. It decodes the source before initializing the viewer, disables idle texture updates after loading, and destroys the renderer on exit or selection changes. It does not implement a panorama generation service. Follow `../../reference-panorama-study.md` for observed controls and remaining acceptance paths.
