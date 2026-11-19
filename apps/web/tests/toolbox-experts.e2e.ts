/** Real Web composition: global capability management and expert policy selection without a workspace. */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import type {} from '@deepseek-ai/dsh-skill-explorer-bundle'
import type {} from '@deepseek-ai/dsh-agent-teams-bundle'
import { launchWebScaffold, captureStableAria, compareOrRefreshGolden, webSnapshotMode, watchConsole } from './scaffold.ts'
import { REPO_ROOT, newEnglishPage } from './support.ts'

it('separates global resources and saves selected expert capabilities to its actual native preset', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-toolbox-ui-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const directory = join(root, 'home', 'skills', 'review-checklist')
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'SKILL.md'), '---\nname: review-checklist\ndescription: Review a document against a checklist\n---\nCheck the evidence and deliver a review.\n')
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@test/toolbox-defaults', version: '1.0.0',
    dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  await writeFile(join(root, 'cordis.patch.yml'), JSON.stringify([{ id: 'skill-explorer', config: {
    dshHome: join(root, 'home'), agentsHome: join(root, 'agents'), customSkillDirs: [], bundledSkillDirs: [],
  } }]))
  const scaffold = await launchWebScaffold({
    extraOverlayPath: join(REPO_ROOT, 'apps/web/tests/pin-browse-picker.overlay.yml'),
    profile: { packages: [...['skill-explorer', 'agent-teams'].map(name => ({ dir: join(REPO_ROOT, 'packages/bundle', name), enabled: true })),
      { dir: root, enabled: true }] },
  })
  onTestFinished(() => scaffold.close())
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const page = await newEnglishPage(browser)
  page.setDefaultTimeout(15_000)
  const console = watchConsole(page)
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  const panels = page.getByRole('navigation', { name: 'Global panels' })
  await panels.getByRole('button', { name: 'Toolbox', exact: true }).click()
  const toolbox = page.locator('[data-toolbox-page]')
  await toolbox.getByRole('heading', { name: 'review-checklist', exact: true }).waitFor()
  expect(await toolbox.getByRole('combobox', { name: 'Workspace', exact: true }).inputValue()).toBe('')
  expect(await toolbox.getByRole('button', { name: 'New skill', exact: true }).isEnabled()).toBe(true)
  for (const tab of ['Connectors (MCP)', 'Local tools']) {
    await toolbox.getByRole('tab', { name: tab, exact: true }).click()
    expect(await toolbox.getByRole('combobox', { name: 'Workspace', exact: true }).count()).toBe(0)
  }
  await toolbox.getByRole('tab', { name: 'Skills', exact: true }).click()
  await compareOrRefreshGolden(join(REPO_ROOT, 'apps/web/tests/expected/toolbox-experts/skills.expected.md'),
    await captureStableAria(page, '[data-toolbox-page]', scaffold.workspaceCwd), webSnapshotMode())

  await panels.getByRole('button', { name: 'Teams', exact: true }).click()
  await page.getByRole('button', { name: 'Experts', exact: true }).click()
  await page.getByRole('button', { name: 'New expert', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Expert name', exact: true }).fill('Document reviewer')
  await dialog.getByRole('textbox', { name: 'Responsibilities and working instructions', exact: true }).fill('Review the supplied document using the checklist.')
  const limit = dialog.getByRole('switch', { name: 'Restrict this Agent’s capabilities', exact: true })
  await limit.waitFor()
  await limit.click()
  await dialog.getByRole('checkbox', { name: 'review-checklist', exact: true }).check()
  await compareOrRefreshGolden(join(REPO_ROOT, 'apps/web/tests/expected/toolbox-experts/expert.expected.md'),
    await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd), webSnapshotMode())
  await dialog.getByRole('button', { name: 'Save expert', exact: true }).click()
  try {
    await dialog.waitFor({ state: 'hidden' })
  } catch (error) {
    await writeFile('/tmp/crewon-toolbox-browser-failure.txt', await dialog.innerText())
    await page.screenshot({ path: '/tmp/crewon-toolbox-browser-failure.png', fullPage: true })
    throw error
  }
  let expert = scaffold.ctx.teamExperts.list().experts.find(item => item.name === 'Document reviewer')
  expect(expert).toBeDefined()
  const policy = (await scaffold.ctx.toolboxAuthorization.list()).policies[expert!.preset]
  expect(policy).toMatchObject({ enabled: true, skillNames: ['review-checklist'], mcpServers: [], cliToolIds: [] })
  const card = page.getByRole('heading', { name: 'Document reviewer', exact: true }).locator('xpath=ancestor::article')
  await card.hover()
  await card.getByRole('button', { name: 'Expert settings', exact: true }).click()
  await dialog.getByRole('checkbox', { name: 'review-checklist', exact: true }).waitFor()
  expect(await dialog.getByRole('checkbox', { name: 'review-checklist', exact: true }).isChecked()).toBe(true)
  await dialog.getByRole('textbox', { name: 'Responsibilities and working instructions', exact: true }).fill('Review the document and list supporting evidence.')
  await dialog.getByRole('button', { name: 'Save expert', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  const previous = expert!
  expert = scaffold.ctx.teamExperts.list().experts.find(item => item.name === 'Document reviewer')
  expect(expert!.revision).toBe(previous.revision + 1)
  const policies = (await scaffold.ctx.toolboxAuthorization.list()).policies
  expect(policies[expert!.preset]).toEqual(policy)
  expect(policies[previous.preset]).toEqual(policy)
  await card.hover()
  await card.getByRole('button', { name: 'Use Document reviewer', exact: true }).click()
  await page.locator('[data-composer-input]').first().waitFor()
  expect(scaffold.ctx.agents.list().some(agent => scaffold.ctx.agentPresets.presetForSession(agent.session) === expert!.preset)).toBe(true)
  expect(console.pageErrors).toEqual([])
}, 120_000)
