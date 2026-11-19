/**
 * Enforce MIT for DSH packages and the retained BSD notice for the adapted skill explorer.
 * @module scripts/verify-dsh-package-licenses
 */

import { existsSync, globSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'

const ROOT = resolve(import.meta.dirname, '..')
const DSH_PACKAGE_NAME = /^@deepseek-ai\/dsh(?:-|$)/
const SKILL_EXPLORER_MANIFEST = 'packages/bundle/skill-explorer/package.json'
const SKILL_EXPLORER_NAME = '@deepseek-ai/dsh-skill-explorer-bundle'
/** SHA-256 of the complete upstream BSD notice, normalized to LF with one final newline. */
const SKILL_EXPLORER_LICENSE_SHA256 = '02e1e3ebf73df5c1840c842a8e93b40942bf6e53a66acbe6c5643fc8664ff97d'
const SKILL_EXPLORER_NOTICES = ['LICENSE', 'src/upstream/LICENSE', 'src/upstream/UPSTREAM.md'] as const

/** Result of checking every DSH package reachable through the root workspace list. */
export interface DshPackageLicenseReport {
  /** Number of DSH package manifests checked. */
  packageCount: number
  /** Repository-relative diagnostics for license declarations and retained notices. */
  failures: string[]
}

function readManifest(root: string, file: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(resolve(root, file), 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`verify-dsh-package-licenses: ${file} must contain a JSON object.`)
  }
  return parsed as Record<string, unknown>
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry: unknown) => typeof entry === 'string')
}

function workspaceManifestPaths(root: string): string[] {
  const rootManifest = readManifest(root, 'package.json')
  const workspaces = rootManifest.workspaces
  if (!isStringArray(workspaces)) {
    throw new Error('verify-dsh-package-licenses: package.json workspaces must be a string array.')
  }

  const files = new Set(['package.json'])
  for (const pattern of workspaces) {
    for (const file of globSync(`${pattern}/package.json`, { cwd: root })) {
      files.add(file)
    }
  }
  return [...files].sort()
}

function printable(value: unknown): string {
  return value === undefined ? 'undefined' : JSON.stringify(value)
}

function skillExplorerLicenseFailures(root: string, manifest: Record<string, unknown>): string[] {
  const failures: string[] = []
  if (manifest.license !== 'BSD-3-Clause') {
    failures.push(`${SKILL_EXPLORER_MANIFEST}: ${SKILL_EXPLORER_NAME} must retain "license": "BSD-3-Clause"; found ${printable(manifest.license)}.`)
  }
  const publicationFiles = isStringArray(manifest.files) ? manifest.files : []
  for (const notice of SKILL_EXPLORER_NOTICES) {
    const file = `packages/bundle/skill-explorer/${notice}`
    if (!publicationFiles.includes(notice)) {
      failures.push(`${SKILL_EXPLORER_MANIFEST}: files must include ${notice} for redistribution.`)
    }
    if (!existsSync(resolve(root, file))) {
      failures.push(`${file}: retained third-party notice is missing.`)
      continue
    }
    const source = readFileSync(resolve(root, file), 'utf8')
    if (notice.endsWith('LICENSE')) {
      const normalized = `${source.replaceAll('\r\n', '\n').trimEnd()}\n`
      const digest = createHash('sha256').update(normalized).digest('hex')
      if (digest !== SKILL_EXPLORER_LICENSE_SHA256) {
        failures.push(`${file}: retain the complete upstream BSD copyright notice, conditions and disclaimer.`)
      }
    } else if (source.trim() === '') {
      failures.push(`${file}: source attribution must be nonempty.`)
    }
  }
  return failures
}

/**
 * Check every DSH npm package declared by the repository workspace.
 * @param root - absolute repository root containing the workspace package.json.
 * @returns the checked package count and every license or retained-notice violation.
 */
export function inspectDshPackageLicenses(root: string): DshPackageLicenseReport {
  let packageCount = 0
  const failures: string[] = []

  for (const file of workspaceManifestPaths(root)) {
    const manifest = readManifest(root, file)
    const name = manifest.name
    if (typeof name !== 'string' || !DSH_PACKAGE_NAME.test(name)) continue

    packageCount++
    const normalizedFile = file.split(sep).join('/')
    if (normalizedFile === SKILL_EXPLORER_MANIFEST && name === SKILL_EXPLORER_NAME) {
      failures.push(...skillExplorerLicenseFailures(root, manifest))
      continue
    }
    if (manifest.license !== 'MIT') {
      failures.push(
        `${normalizedFile}: ${name} must declare "license": "MIT"; found ${printable(manifest.license)}.`,
      )
    }
  }

  return { packageCount, failures }
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const report = inspectDshPackageLicenses(ROOT)
  if (report.failures.length > 0) {
    process.stderr.write('verify-dsh-package-licenses: license or retained-notice violations found:\n')
    for (const failure of report.failures) process.stderr.write(`  ${failure}\n`)
    process.exitCode = 1
  } else {
    process.stdout.write(
      `verify-dsh-package-licenses: ${String(report.packageCount)} DSH package(s) checked; declarations and retained notices conform.\n`,
    )
  }
}
