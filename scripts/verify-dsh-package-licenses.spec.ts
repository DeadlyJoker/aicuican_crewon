import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { inspectDshPackageLicenses } from './verify-dsh-package-licenses.ts'

const roots: string[] = []
const SKILL_EXPLORER_DIRECTORY = 'packages/bundle/skill-explorer'
const SKILL_EXPLORER_NAME = '@deepseek-ai/dsh-skill-explorer-bundle'
const BSD_NOTICE = readFileSync(new URL('../packages/bundle/skill-explorer/src/upstream/LICENSE', import.meta.url), 'utf8')

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function writeManifest(root: string, file: string, manifest: Record<string, unknown>): void {
  const path = join(root, file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
}

function createWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-package-licenses-'))
  roots.push(root)
  writeManifest(root, 'package.json', {
    name: '@deepseek-ai/dsh-root',
    license: 'MIT',
    workspaces: ['apps/*', 'packages/*/*', 'vendor/*'],
  })
  return root
}

function writeSkillExplorer(root: string, license = 'BSD-3-Clause'): void {
  writeManifest(root, `${SKILL_EXPLORER_DIRECTORY}/package.json`, {
    name: SKILL_EXPLORER_NAME,
    license,
    files: ['LICENSE', 'src/upstream/LICENSE', 'src/upstream/UPSTREAM.md'],
  })
  mkdirSync(join(root, SKILL_EXPLORER_DIRECTORY, 'src/upstream'), { recursive: true })
  writeFileSync(join(root, SKILL_EXPLORER_DIRECTORY, 'LICENSE'), BSD_NOTICE)
  writeFileSync(join(root, SKILL_EXPLORER_DIRECTORY, 'src/upstream/LICENSE'), BSD_NOTICE)
  writeFileSync(join(root, SKILL_EXPLORER_DIRECTORY, 'src/upstream/UPSTREAM.md'), 'Adapted dsh-skill-explorer source under BSD-3-Clause.\n')
}

describe('DSH package license gate', () => {
  it('checks root, unhyphenated CLI, and dsh-prefixed package names while ignoring other families', () => {
    const root = createWorkspace()
    writeManifest(root, 'apps/cli/package.json', { name: '@deepseek-ai/dsh', license: 'MIT' })
    writeManifest(root, 'packages/core/agent/package.json', {
      name: '@deepseek-ai/dsh-agent',
      license: 'BSD-3-Clause',
    })
    writeManifest(root, 'vendor/cordis/package.json', {
      name: '@deepseek-ai/cordis',
      license: 'BSD-3-Clause',
    })

    expect(inspectDshPackageLicenses(root)).toEqual({
      packageCount: 3,
      failures: [
        'packages/core/agent/package.json: @deepseek-ai/dsh-agent must declare "license": "MIT"; found "BSD-3-Clause".',
      ],
    })
  })

  it('rejects a missing license declaration', () => {
    const root = createWorkspace()
    writeManifest(root, 'packages/core/agent/package.json', { name: '@deepseek-ai/dsh-agent' })

    expect(inspectDshPackageLicenses(root).failures).toEqual([
      'packages/core/agent/package.json: @deepseek-ai/dsh-agent must declare "license": "MIT"; found undefined.',
    ])
  })

  it('accepts the exact skill explorer package with its retained BSD notices', () => {
    const root = createWorkspace()
    writeSkillExplorer(root)
    expect(inspectDshPackageLicenses(root)).toEqual({ packageCount: 2, failures: [] })
  })

  it('requires the skill explorer to retain its BSD declaration', () => {
    const root = createWorkspace()
    writeSkillExplorer(root, 'MIT')
    expect(inspectDshPackageLicenses(root).failures).toEqual([
      `${SKILL_EXPLORER_DIRECTORY}/package.json: ${SKILL_EXPLORER_NAME} must retain "license": "BSD-3-Clause"; found "MIT".`,
    ])
  })

  it('rejects the same package name at a different path', () => {
    const root = createWorkspace()
    writeManifest(root, 'packages/bundle/other/package.json', { name: SKILL_EXPLORER_NAME, license: 'BSD-3-Clause' })
    expect(inspectDshPackageLicenses(root).failures).toEqual([
      `packages/bundle/other/package.json: ${SKILL_EXPLORER_NAME} must declare "license": "MIT"; found "BSD-3-Clause".`,
    ])
  })

  it('rejects a different package name at the approved source path', () => {
    const root = createWorkspace()
    writeManifest(root, `${SKILL_EXPLORER_DIRECTORY}/package.json`, { name: '@deepseek-ai/dsh-other', license: 'BSD-3-Clause' })
    expect(inspectDshPackageLicenses(root).failures).toEqual([
      `${SKILL_EXPLORER_DIRECTORY}/package.json: @deepseek-ai/dsh-other must declare "license": "MIT"; found "BSD-3-Clause".`,
    ])
  })

  it('rejects a missing upstream license notice', () => {
    const root = createWorkspace()
    writeSkillExplorer(root)
    rmSync(join(root, SKILL_EXPLORER_DIRECTORY, 'src/upstream/LICENSE'))
    expect(inspectDshPackageLicenses(root).failures).toEqual([
      `${SKILL_EXPLORER_DIRECTORY}/src/upstream/LICENSE: retained third-party notice is missing.`,
    ])
  })

  it('rejects a changed upstream copyright notice', () => {
    const root = createWorkspace()
    writeSkillExplorer(root)
    writeFileSync(join(root, SKILL_EXPLORER_DIRECTORY, 'src/upstream/LICENSE'), BSD_NOTICE.replace('zhu1090093659', 'Someone else'))
    expect(inspectDshPackageLicenses(root).failures).toEqual([
      `${SKILL_EXPLORER_DIRECTORY}/src/upstream/LICENSE: retain the complete upstream BSD copyright notice, conditions and disclaimer.`,
    ])
  })

  it('requires the source attribution to exist and be included in the distribution', () => {
    const root = createWorkspace()
    writeSkillExplorer(root)
    rmSync(join(root, SKILL_EXPLORER_DIRECTORY, 'src/upstream/UPSTREAM.md'))
    writeManifest(root, `${SKILL_EXPLORER_DIRECTORY}/package.json`, {
      name: SKILL_EXPLORER_NAME, license: 'BSD-3-Clause', files: ['LICENSE', 'src/upstream/LICENSE'],
    })
    expect(inspectDshPackageLicenses(root).failures).toEqual([
      `${SKILL_EXPLORER_DIRECTORY}/package.json: files must include src/upstream/UPSTREAM.md for redistribution.`,
      `${SKILL_EXPLORER_DIRECTORY}/src/upstream/UPSTREAM.md: retained third-party notice is missing.`,
    ])
  })
})
