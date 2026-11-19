import { defineConfig } from 'tsdown'

/**
 * The dsh CLI ships its command, profile lifecycle, and shared GUI Host entry points.
 * Declarations come from `tsc -b` (dts: false), matching every package.
 */
export default defineConfig({
  entry: {
    bin: 'lib/types/installed-bin.js',
    'profile-boot': 'lib/types/profile-boot.js',
    'gui-runtime': 'lib/types/gui-runtime.js',
    'gui-runtime-client': 'lib/types/gui-runtime-client.js',
    'gui-host-control': 'lib/types/gui-host-control.js',
    'gui-profile-migration': 'lib/types/gui-profile-migration.js',
  },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: ['lib/*.js'],
})
