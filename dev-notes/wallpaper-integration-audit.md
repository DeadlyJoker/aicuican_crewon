# Current replacement status — 2026-11-13

The user selected the upstream plugin after reviewing the native implementation. The earlier recommendation below is superseded: use the published `dsh-plugin-wallpaper-engine@1.4.2` and its glass and media-bridge components, not a new native glass implementation. A separate preflight profile successfully loaded its settings page on CrewON 0.2.2-alpha.3; the missing optional client-runtime peer did not prevent that observed load. This is not a claim of all Scene/Web capabilities passing.

The active local Web/App profile uses this package through `dsh plugin`. Keep native appearance presets and immutable media; deactivate the native background selection to prevent competing renderers. Existing PNG/MP4 files are copied into the upstream upload library. The profile patches retained in `upstream-patches/` add the current kernel version to the declared range, use the current slots injection, authenticate the main and media-bridge HTTP routes through the Host connection, and default the upstream data directory beneath DSH_HOME. The original upstream rendering and glass code is unchanged. A client adapter adopts shared Host settings on focus and while visible, skips pending local writes, and disposes its polling and listeners with the plugin. Optional avatar, pet, effects, parallax, fonts and notices remain disabled for the first replacement.

The original profile manifest and overlay were backed up outside the repository in `/tmp/crewon-wallpaper-replacement-backup/`. Upstream settings are separate under DSH_HOME/wallpaper-engine; the project, session and native preset files are not migrated or deleted.

## Earlier audit

Source: https://github.com/elysia395/dsh-wallpaper-engine (downloaded main archive, package 1.4.2). Root LICENSE and package metadata both MIT, Copyright 2026 elysia395. Its nine-row bundle includes fonts, glass, avatar, pet and system audio components. Those overlap CrewON's existing appearance owner. Do not install that entire bundle as an appearance upgrade.

Declared engines.dsh is ^0.2.0-rc.1, whereas CrewON is 0.2.2-alpha.3. Semver declarations alone do not establish prerelease compatibility. The upstream recorded live harness baseline is 0.1.7-rc.2 on Windows; it does not establish CrewON macOS acceptance. The Host uses webServer.register and connection-dependent routes; the browser runtime relies on its own panel, style and layer registries plus a client-runtime package peer absent from the current source tree. Current CrewON uses face-specific runtime/slot services. Full bundle compatibility remains unverified.

The portable approach is a single native Appearance settings owner, shared Host catalog, immutable media files, image/video rendering, and a separate Scene adapter. Upstream's library/import/rotation interaction and first-frame readiness principles are useful. No upstream source or artwork was copied by the native-media implementation. Wallpaper files have their own copyrights; the plugin's MIT license does not license Steam Workshop media.

RNlao/dsh-wallpaper 0.1.0 provides static uploads/folder import/cropping, not Wallpaper Engine scenes; root LICENSE and package metadata both say MIT (Copyright 2026 RNlao). Ayase34/wallpaper-plugin 1.0.0 has matching MIT root license and package metadata, a material library/cropping/composition model, but no declared DSH version and no demonstrated CrewON runtime compatibility.

Browser-native GIF/MP4/WebM can cover dynamic wallpapers without a separate engine. Wallpaper Engine Scene/PKG/TEX requires WebWallGL plus a resource resolver, sandbox/asset admission and GPU lifecycle verification. No Scene compatibility claim should be made from MP4 playback.

The downloaded source archive SHA-256 is `4e78bff3c14a00fad7a54039cfb25e85b6d86741f99ce16920927f51132cfc38`. Native semver evaluation rejects `0.2.2-alpha.3` against upstream `^0.2.0-rc.1`; this is a real installation-range mismatch, not proof that every renderer API is unusable.

The native-media integration passed 26 focused tests, artifact and aggregate builds, UI locale checks, export JSDoc checks, and the scoped bilingual README check. Live checks covered native MP4 import, Web PNG import, authenticated byte-range playback, Host restart, Web-to-App light/dark switching, App-to-Web palette switching, and Studio video playback (`readyState=4`, advancing `currentTime`). Scene/WebWallGL playback remains unverified.

### Replacement verification (2026-11-13)

The shared Web/App profile runs upstream 1.4.2 with the compatibility patches stored in `upstream-patches/`. Restart restored the selected MP4 and glass setting. A Web selection of the imported PNG appeared in App; an App selection of the MP4 refreshed the Web media element (`readyState: 4`, playing). Authenticated settings and inventory requests succeeded. Existing native appearance presets and project data were retained, with native background selection inactive. Studio's embedded page retains its own theme styling; this replacement does not yet apply upstream glass styling inside that document.

### Studio entry cleanup (2026-11-13)

The embedded creation entry hides the underlying native hero headline structurally, so transparent wallpaper surfaces cannot reveal duplicate text. The entry uses a 780px maximum card width, a smaller input area and host-derived opaque text surfaces. Upstream `ropeShown` defaults to false in both client and Host schema, and the existing shared selection was updated without changing wallpaper media or project records. The operating-system screen capture indicator is not a plugin entry and remains untouched.

Validation: `build:artifacts` (8 gates), `build:check` (2 gates), and the native-theme / entry-plan tests (7 tests) passed. Web and App were opened in light and dark themes; the ratio dropdown and navigation away from and back to Studio were exercised. Captures: `/tmp/crewon-studio-light-web.png`, `/tmp/crewon-studio-dark-web.png`, `/tmp/crewon-studio-light-app.png`, `/tmp/crewon-studio-dark-app.png`.

### Creation card refinement

The new-project card now uses one borderless editing area, compact rectangular mode selection, smaller attachment and style controls, and aligned footer parameters with bounded long labels. Web light/dark screenshots and App dark screenshots were inspected; changing script mode and opening the ratio selector remained functional. Both build stages passed. Existing project and media data were not migrated by this styling change.

### Opaque operational overlays

Wallpaper glass is retained on workspace surfaces. Host menus and dialogs use the upstream readability base without backdrop filtering; the settings window uses upstream's native surface policy. Embedded Studio menus and dialogs keep their resolved host hue with an opaque alpha so choices cannot overlap visible background text.

### Script import contrast

Import buttons now use the same paired primary fill and foreground tokens as the host Button primitive. The empty script/video upload area no longer adds a second large border. This applies to native Studio entry and its script import dialog, without changing import actions or retained sources.

### Dark composer readability

The compatibility stylesheet removes the upstream specular gradient and inset highlight from the dark-mode composer only. Its translucent base and blur remain, with a subdued border and outer shadow. Light mode and other glass surfaces retain their existing treatment.

## Simplified settings

The native General section no longer mounts its legacy wallpaper library; the upstream settings section is the sole wallpaper entry. Existing native collections and presets remain stored. Apply `upstream-patches/dsh-plugin-wallpaper-engine-simple-settings@1.4.2.patch` after the compatibility patch to expose only library, appearance and playback tabs initially. Advanced settings reveals the remaining tabs; library rotation/transitions and appearance detail controls remain available in collapsed sections. No stored settings or imported media are removed.
