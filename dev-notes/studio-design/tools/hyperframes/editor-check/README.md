# Isolated official editor validation

English | [中文](README.zh.md)

HyperFrames is pinned to 0.9.30 through this directory's `package-lock.json`. The test neither changes root dependencies nor mounts CrewON workspaces or production data. Port 3092 serves an independent editor; the style Demo on 3090 retains its existing editor. The displayed official UI, colors, and English copy are not a CrewON design proposal.

## Reproduction

From the repository root, install locked independent dependencies without installation scripts:

```sh
npm ci --prefix dev-notes/studio-design/tools/hyperframes/editor-check --ignore-scripts --workspaces=false --omit=optional --registry=https://registry.npmjs.org --cache=dev-notes/studio-design/tools/hyperframes/editor-check/.npm-cache
python3 dev-notes/studio-design/tools/hyperframes/editor-check/prepare.py
```

Node must satisfy DSH requirements. The recorded machine used Node 25.5.0; initialization and launch both used a DSH profile. Include `--from-default-profile sdk-minimal` on first initialization and omit it on subsequent launches:

```sh
DSH_HOME="$PWD/dev-notes/studio-design/tools/hyperframes/editor-check/.dsh-home" \
PRODUCER_HEADLESS_SHELL_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
/opt/homebrew/opt/node@25/bin/node --import tsx/esm apps/cli/src/bin.ts \
  --profile crewon-editor-check --from-default-profile sdk-minimal \
  --patch dev-notes/studio-design/tools/hyperframes/editor-check/editor.cordis.patch.yml
```

Open http://127.0.0.1:3092/. Other machines must supply their actual supported Chrome and Node paths. `editor.cordis.patch.yml` configures the listener, port, and test directory; Host access is restricted to this directory's `project`. Cordis effects own the HTTP server, render cancellation, and history shutdown, without adding an application entry point. Stop this independent profile with Ctrl+C.

`prepare.py` creates missing test assets only and preserves edited HTML. The video uses an owned test chart and 440Hz tone; the calibration image is also owned. GSAP is copied from the locked package with its copyright header and declared license link. HyperFrames Apache-2.0 text lives in the parent vendor directory; dependencies such as GSAP retain their own licenses. This isolated test is not a complete distribution-license review.

## Observations from 2026-11-11

- Official Studio UI, `createStudioApi`, compiler, producer, and history used one independent Host, without placeholder callbacks.
- Video/image, subtitle, and title tracks appeared. Native mouse input moved the title from 3–6 to 4–7 seconds; history recorded Move timeline clip.
- The editor's public WebMCP changed subtitles and returned a file-content version. Disk HTML, page refresh, and Host restart retained the edit; undo remained available after restart, with a seven-second duration.
- Export executed compilation, video decoding, audio mixing, Chrome frame capture, and encoding. The initial attempt without Chrome failed explicitly; specifying installed Chrome succeeded.
- FFprobe confirmed seven seconds, 640×360, 30fps, H.264 and AAC. Silence began at three seconds, matching source audio at 0–3 seconds.
- Human inspection at 1, 4.5, and 6.5 seconds showed video/subtitles, image/title/subtitles, and the remaining title respectively. The black background at 6–7 seconds was the test's intentional timeline gap.
- Outputs live in `project/renders/*.mp4`; shared evidence copies were `hyperframes-editor-result.mp4` and `hyperframes-editor-restored.png`.

## Remaining acceptance

The complete thumbnail service is absent: composition thumbnails show Preview unavailable while the main player works. Explicit audio detachment and its waveform passed the tests below. Default automatic detachment, speed/transitions and complex trim combinations, long-project performance, full export-parameter mapping, listening quality, and precise audiovisual synchronization still require acceptance. Existing Studio drafts are not mapped, so this test does not authorize replacing the workbench. It establishes an editable, persistent, encoded reuse path.

Integration references: [official API adapter](https://github.com/heygen-com/hyperframes/blob/cda84222aa12716f2ceb92b45629487be81a0601/packages/studio-server/src/types.ts), [official editor adapter implementation](https://github.com/heygen-com/hyperframes/blob/cda84222aa12716f2ceb92b45629487be81a0601/packages/studio/vite.adapter.ts).

## Audio detachment and restoration on 2026-11-11

Video context menu → Detach audio created `audio#source-video-audio` at 0–3 seconds on track 3, muted the video, and retained matching `data-link`/`data-sync-origin` values. A waveform appeared on the independent audio track. Explicit detachment does not imply automatic detachment at import.

Exports before and after detachment both decoded to 48kHz stereo and identical seven-second PCM SHA256 values. The first three seconds had the same −21.1dB mean and −16.1dB peak, without duplicate audio. This establishes preservation of the test tone, not completed listening review.

Undo removed the audio track; Redo restored it. Host restart and page reload retained the independent 0–3-second track, Detach audio history label, and waveform. Evidence: `hyperframes-audio-restored.png` and `hyperframes-detached-audio-result.mp4`.

Repeat the comparison with:

```sh
python3 dev-notes/studio-design/tools/hyperframes/editor-check/verify-audio.py BEFORE.mp4 AFTER.mp4
```

The comparator checks duration, a single audio stream, sample rate, channels, and decoded PCM. A positive case passed; a temporary half-volume result was rejected and removed while retaining inputs.

## Cross-track moves, linked moves, and linked trimming on 2026-11-11

Dragging the title from track 2 onto occupied subtitle track 1 placed it after the subtitle at 6–9 seconds. Track and time fields were inspected, then undone to track 2 at 4–7 seconds. This is collision handling on an occupied track, not unrestricted overlap at the original time.

With linked selection enabled, dragging video into later empty time moved both linked clips to 6.08–9.08 seconds without changing image or subtitles, then Undo restored them. A drag into nearby occupied time produced no move and was not counted as success.

Trimming the video's right edge from three to two seconds also trimmed audio to 0–2 seconds. An actual export became silent at two seconds; the 1.5-second frame retained video and the 2.5-second frame contained only the remaining subtitle. The image still started at three seconds, so the 2–3-second gap matched the test arrangement and did not demonstrate ripple editing. Undo restored both video and audio to 0–3 seconds.

Evidence: `hyperframes-linked-trim.png` and `hyperframes-linked-trim-result.mp4`. These basic operations do not establish acceptance of complex transitions, speed changes, long projects, or every collision combination.
