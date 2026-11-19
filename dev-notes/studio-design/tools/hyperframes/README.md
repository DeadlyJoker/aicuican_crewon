# Isolated HyperFrames playback validation

English | [中文](README.zh.md)

This directory tests the official player and runtime independently of the main Demo navigation and existing editing drafts. Its evidence covers playback, not a professional multitrack editor or completed export.

## Pinned sources

The official npm packages are `@hyperframes/player@0.9.30` and `@hyperframes/core@0.9.30`. `fetch-runtime.py` downloads these versions, checks npm SHA-512 integrity, and extracts only selected build files and original LICENSE files without running installation scripts. Output lives in `../../vendor/hyperframes/`; its manifest records package sources, integrity values, and copied-file SHA-256 hashes. Both package licenses are retained. Official example photos, fonts, and third-party templates are excluded.

```sh
python3 dev-notes/studio-design/tools/hyperframes/fetch-runtime.py
```

## Owned test project

`composition.html` plays a three-second generated test chart (H.264, 640×360, 24fps, AAC 440Hz audio), followed by an owned calibration image. An independent subtitle layer lasts six seconds. It uses neither GSAP nor generation APIs. Generate the source video with:

```sh
ffmpeg -hide_banner -loglevel error -f lavfi -i 'testsrc2=size=640x360:rate=24:duration=3' -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=3' -shortest -c:v libx264 -preset fast -crf 25 -pix_fmt yuv420p -c:a aac -movflags +faststart -y dev-notes/studio-design/tools/hyperframes/test-pattern.mp4
```

Open the [validation page](http://127.0.0.1:3090/tools/hyperframes/player-check.html) from the existing static server. Controls play, pause, seek to one or four seconds, save and restore playback position, and test a failed load; status and events appear directly. The independent `crewon-hyperframes-probe-v1` key stores playback position only, without demonstrating project editing or restart recovery. Playback is muted by default; source audio and mixing require separate validation. The HTML is fixed, owned test content. This same-origin setup must not execute arbitrary Agent-generated HTML; production integration requires an isolated execution environment.

## Evidence from 2026-11-11

Package integrity and file copying passed. ffprobe confirmed three seconds, H.264/AAC, 640×360, and 24fps. After earlier browser timeout and screen-lock issues were resolved, the page reported ready=true, duration=6, and 640×360. Seeking to one second produced video readyState=4 and currentTime=1.00001, with the real test video and subtitles visible. Playback advanced and emitted ended. Seeking to four seconds displayed the calibration image and subtitles; after saving, refreshing, and restoring, currentTime=4 and paused=true.

The missing-project control loaded an absent HTML file and returned `Composition timeline not found after 8s` with ready=false. Restoring the test project returned ready=true and currentTime=0; seeking to one second displayed video again. This covers project-load failure only, not missing individual media or network recovery. Change the component's `src` attribute: this version has no corresponding JavaScript property accessor, so `player.src=...` does not establish a resource change. Evidence images `hyperframes-video-confirmed.png` and `hyperframes-image-restored-confirmed.png` were saved in that run's visualization directory.

These playback paths passed. Audio quality and synchronization, visual multitrack editing, project-edit persistence, producer execution, and actual MP4 export remain unverified here. Saving playback position does not save an editing project or establish editor capabilities.
