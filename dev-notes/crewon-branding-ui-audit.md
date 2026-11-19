# CrewON UI branding

The product presentation uses CrewON in the welcome page, startup screen, desktop menus, update notices, PWA manifest and application icons. The temporary icon is a text wordmark approved for use until a graphic mark is selected. Provider model names and DeepSeek sign-in remain provider names. Package names, command names, URL schemes, persistence keys and upstream license notices remain unchanged for compatibility and attribution.

The sidebar brand-mark slot and conversation brand-mark slot remain available. The conversation has no upstream whale fallback; the official sidebar occupant uses the existing neutral conversation icon and CrewON text. Custom brand plugins can still supply an occupant.

Generate Web install icons with `pnpm --filter @deepseek-ai/dsh-web-frontend run render:app-icons`; generate the Windows tray with `pnpm --dir apps/desktop run render:tray-icon`. Both derive from the checked-in text artwork.

The second pass covers interrupted-turn copy, local voice setup and sharing copy, the shared-session brand mark, the running-turn indicator, and installer messages. Release packaging follows the CrewON application filename; retained upstream-release verification keeps its original upstream filename.
