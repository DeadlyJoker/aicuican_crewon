/** Shared local Web/Desktop launch entry for the default GUI profile. */
import { getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { openBrowser } from '@deepseek-ai/dsh-web-app'
import { acquireGuiRuntime } from './gui-runtime.ts'
import { migrateGuiProfile } from './gui-profile-migration.ts'
import { installGuiHostControl } from './gui-host-control.ts'
import { readGuiHost } from './gui-runtime-client.ts'
import { runProfile, type RunProfileOptions } from './profile-boot.ts'

/**
 * Start the default GUI Host once or open its existing browser view.
 * @param options - Default Web profile launch options.
 * @returns After attaching or after the owning Host has booted.
 */
export async function runSharedWeb(options: RunProfileOptions): Promise<void> {
  if (options.args.includes('--help') || options.args.includes('-h')) {
    await runProfile(options)
    return
  }
  const home = resolveDshHome()
  const lease = await acquireGuiRuntime(home, getDshRuntimeVersion())
  if (lease.kind === 'follower') {
    if (options.patchFiles.length > 0) {
      throw new Error('A shared GUI Host is already running. Restart it to apply command-line overlays.')
    }
    const ready = await readGuiHost(lease.record)
    console.log(`dsh web: ${ready.url}`)
    if (!options.args.includes('--no-open')) await openBrowser(ready.url)
    return
  }
  let application: Awaited<ReturnType<typeof runProfile>> | undefined
  try {
    await migrateGuiProfile(home)
    application = await runProfile(options)
    const { ctx } = application
    const control = installGuiHostControl(ctx, lease.token)
    await lease.publish(control.ready().url)
  } catch (error) {
    await application?.shutdown.shutdown(1)
    await lease.release()
    throw error
  }
  // Retain ownership through signal-driven teardown. A subsequent launcher
  // replaces the discovery record only after this process has exited.
}
