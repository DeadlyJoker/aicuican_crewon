---
kind: upgrade-guide
description: "Default Web and Desktop now share one GUI Host and the Web profile instead of separate plugin selections and profile data."
---

# Shared Web and Desktop profile

English | [中文](guide.zh.md)

## Change

Default Web and Desktop use `$DSH_HOME/profiles/web` and one GUI Host. Previously, Desktop used `profiles/desktop` with separate plugin selection and profile-local data. Plugins, experts, expert panels, offices, workflows, and their saved history now share the Web profile. Attachment requires the same `DSH_HOME` and exact dsh runtime version. Custom profiles remain independent. The default GUI port is `3080`.

The first launcher owns the Host. A later launcher connects to it. Quitting an attached Desktop disconnects that client, while quitting the owning Desktop stops the Host after task checks. Native window, shortcut, and update preferences remain in Electron userData.

## Migration

1. Stop existing Web and Desktop processes before the first shared startup. Use the same `DSH_HOME` and matching releases, checking the terminal runtime with `dsh --version`. On macOS and Linux, migration refuses to proceed while an older GUI process or open profile file is detected. Windows refuses automatic migration when `profiles/desktop` exists. Fresh and Web-only Windows profiles can start normally. If an active Host reports a version mismatch, stop it before launching the matching version.
2. Launch Desktop or run `dsh web`. Startup snapshots existing `profiles/web` and `profiles/desktop` under `$DSH_HOME/gui-profile-backups/<id>/`, merges their bundle selections and compatible data, and publishes the merged Web profile. Existing Web values win conflicting `ui-` preferences, with retained fields recorded in the backup's `migration-policy.json`. Native Desktop patch entries stay in the source backup. Conflicting plugin dependencies, other settings, or business records stop migration with both sources and backups retained. Resolve the named conflict before retrying.
3. Manage shared plugins through the Plugins page or `dsh plugin --profile web`. Update scripts that used `--profile desktop` for the active Desktop configuration. Restart the owning Host to apply changes that require a restart or different command-line overlays. When a CLI owns the Host, Desktop update installation asks you to stop the Web service in its terminal, then restart Desktop. Restarting Desktop alone leaves that Host running.
4. Open the other entry and confirm both show the same enabled plugins, expert definitions, teams, and saved histories. The completion record is `$DSH_HOME/gui-profile-migration-v1.json`. Retain the backup until the merged data has been checked. Browser-local drafts and layout preferences remain local to each client.
