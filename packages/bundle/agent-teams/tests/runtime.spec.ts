import assert from 'node:assert/strict'
import { afterEach, expect, it } from 'vitest'
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

function expectRestrictedMemberTools(trace: string): void {
  const requests = trace.trim().split('\n').map(line => JSON.parse(line) as { isMember?: boolean; toolNames?: string[] })
  const memberRequests = requests.filter(item => item.isMember && item.toolNames)
  expect(memberRequests.length).toBeGreaterThan(0)
  for (const request of memberRequests) expect(request.toolNames?.slice().sort()).toEqual([
    'agent_teams_claim_task', 'agent_teams_send_message', 'agent_teams_status', 'agent_teams_update_task',
  ])
}

it.each([false, true])('runs expert work and cold restoration with saved profile %s', async (savedProfile) => {
  const cwd = await mkdtemp(join(tmpdir(), 'crewon-experts-'))
  directories.push(cwd)
  const profile = join(cwd, '.dsh/profiles/headless')
  await mkdir(profile, { recursive: true })
  await symlink(join(root, 'apps/cli/node_modules'), join(profile, 'node_modules'), 'dir')
  await writeFile(join(profile, 'package.json'), JSON.stringify({
    name: 'expert-runtime-test', private: true, type: 'module',
    dsh: { profile: { bundles: [
      '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless', '@deepseek-ai/dsh-agent-teams-bundle',
    ], patchReload: 'startup' } },
  }))
  await writeFile(join(profile, 'cordis.yml'), '[]\n')
  await copyFile(new URL('./fixtures/model.mjs', import.meta.url), join(profile, 'model.mjs'))
  await copyFile(new URL('./fixtures/resume.mjs', import.meta.url), join(profile, 'resume.mjs'))
  await copyFile(new URL('./fixtures/role-tools.mjs', import.meta.url), join(profile, 'role-tools.mjs'))
  const patch = `- id: agent-teams
  config:
    profiles:
      demo profile:
        description: Saved specialist profile
        protocol: ''
        goal: ' '
        constraints: ''
        deliverables: ''
        taskPlanning: captain
        members:
          - name: worker
            agentPreset: fixture-expert-v1
            role: MEMBER_FIXTURE
            executionPrompt: MEMBER_FIXTURE complete the assigned task and report.
            reasoning_effort: high
- id: llm-deepseek
  disabled: true
- id: llm-pi-ai
  disabled: true
- id: agent-default-model
  config:
    provider: runtime-lab
    model: fixture-model
- insert:
${savedProfile ? `    - id: authoring-preset-registry
      name: ${JSON.stringify(join(root, 'packages/preset/agent-preset-registry/lib/index.js'))}
      config:
        default: standard
    - id: fixture-expert-preset
      name: ${JSON.stringify(join(root, 'packages/preset/agent-preset/lib/index.js'))}
      config:
        id: fixture-expert-v1
        name: Fixture expert v1
        plugins: []
    - id: strict-expert-capabilities
      name: ./role-tools.mjs
` : ''}    - id: expert-test-model
      name: ./model.mjs
`
  await writeFile(join(profile, 'cordis.patch.yml'), patch)
  const launch = {
    cwd, label: 'built-in expert team', configPath: '',
    binScript: join(root, 'apps/cli/src/bin.ts'),
    libBinScript: join(root, 'apps/cli/lib/bin.js'),
    tsconfigPath: join(root, 'tsconfig.json'),
    sourceImport: 'tsx/esm' as const,
    processTimeoutMs: 45_000,
  }
  const env = {
    DEEPSEEK_API_KEY: '', DSH_PERMISSION_MODE: 'danger-full-access',
    DSH_TELEMETRY_DISABLED: '1', LAB_TEAMS: '1', LAB_SCENARIO: 'lifecycle',
    LAB_TOOLBOX_AUTHORIZATION: join(root, 'packages/bundle/skill-explorer/src/authorization.ts'),
    LAB_TRACE: join(cwd, 'trace.jsonl'), LAB_PROFILE: savedProfile ? 'demo profile' : '',
  }
  const first = await runLoaderSmoke({ ...launch, env,
    binArgs: ['--profile', 'headless', savedProfile
      ? '/agent-teams --profile "demo profile" Run the authorized deterministic expert-team fixture.'
      : 'Run the authorized deterministic expert-team fixture.'],
  })
  expect(first.stderr).not.toContain('did not activate')
  expect(first.stdout).toContain('AGENTTEAMS_PRODUCT_TURN_OK')
  const team: unknown = JSON.parse(await readFile(join(cwd, '.agent-teams/runtime-lab/team.json'), 'utf8'))
  assert(typeof team === 'object' && team !== null)
  assert('tasks' in team && Array.isArray(team.tasks))
  assert('captainSessionId' in team && typeof team.captainSessionId === 'string')
  assert('members' in team && Array.isArray(team.members))
  const member: unknown = team.members[0]
  assert(typeof member === 'object' && member !== null && 'id' in member && typeof member.id === 'string')
  expect(team.tasks).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'completed' })]))
  const trace = await readFile(env.LAB_TRACE, 'utf8')
  expect(trace).toContain('MEMBER_REPORT_OK')
  if (savedProfile) {
    expectRestrictedMemberTools(trace)
    expect(member).toMatchObject({ role: 'MEMBER_FIXTURE', agentPreset: 'fixture-expert-v1' })
    const persisted = await readFile(join(profile, 'cordis.patch.yml'), 'utf8')
    expect(persisted).not.toContain('Authoring fixture')
    const authoring = new DatabaseSync(join(profile, 'team-authoring.sqlite'))
    try {
      const pending = authoring.prepare('SELECT data FROM drafts').get()
      assert(pending, 'The authoring tool must persist its pending review before returning.')
      expect(JSON.parse(String(pending.data))).toMatchObject({ name: 'Authoring fixture', status: 'pending', profile: {
        members: [{ name: 'reviewer', role: 'Reviewer', executionPrompt: 'Review the problem' }],
      } })
    } finally { authoring.close() }
  }
  expect(trace).toContain('SECOND_WAKE_OK')
  expect(trace.indexOf('FIFO_FIRST')).toBeLessThan(trace.indexOf('FIFO_SECOND'))
  await writeFile(join(profile, 'cordis.patch.yml'), patch + `- id: headless-runner
  disabled: true
- insert:
    - id: expert-test-resume
      name: ./resume.mjs
`)
  const restored = await runLoaderSmoke({ ...launch,
    env: { ...env, LAB_COLD: '1', LAB_PARENT_SESSION: team.captainSessionId, LAB_TRACE: join(cwd, 'cold.jsonl') },
    binArgs: ['--profile', 'headless', 'Resume the expert-team fixture.'],
  })
  expect(restored.stderr).not.toContain('did not activate')
  expect(restored.stdout).toContain('COLD_RESTORE_DRIVER_DONE')
  const cold = await readFile(join(cwd, 'cold.jsonl'), 'utf8')
  expect(cold).toContain('cold-member-completed')
  expect(cold).toContain(member.id)
  if (savedProfile) {
    expectRestrictedMemberTools(cold)
  }
}, 100_000)
