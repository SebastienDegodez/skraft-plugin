import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryCodeHost, InMemoryGit, ScriptedMachine } from '../support/in-memory-host.mjs'
import { agent, API, scripted, SLUG } from '../support/pipeline-host.mjs'
import { eventsOf } from '../support/decisions.mjs'

/** A React front end in web/, whose e2e command runs Playwright. */
const WEB = Object.freeze({
  name: 'web', root: 'web', stack: 'react', mocking: { strategy: 'inprocess' },
  paths: { src: ['src'], tests: ['tests'] },
  commands: { build: 'npm run build', e2e: 'npx playwright test' },
})
const STORY = { story: { issue: 42, title: 'Pay by card' } }
const E2E = 'web $ npx playwright test'
const EVIDENCE = `.copilot-tracking/skraft-plans/${SLUG}/evidence/${SLUG}`
const RAW = 'https://raw.githubusercontent.com/acme/shop/root-1'

const WORKFLOW = `digraph visuals {
  start    [shape=Mdiamond]
  research [shape=box, agent="solution-researcher", phase="RESEARCH"]
  visuals  [shape=parallelogram, publish="playwright-visuals", when="frontend"]
  publish  [shape=parallelogram, publish="pull-request"]
  exit     [shape=Msquare]
  start -> research -> visuals -> publish -> exit
}`

/** What Playwright leaves in web/ once its light and dark projects ran: each screenshot, then the manifest. */
const playwrightWrites = (workspace, screenshots) => {
  for (const { path, bytes } of screenshots) workspace.files.set(`web/${path}`, bytes)
  workspace.files.set('web/skraft-visuals/manifest.json', JSON.stringify({ screenshots: screenshots.map(({ title, theme, path }) => ({ title, theme, path })) }))
}

const CHECKOUT = Object.freeze([
  { title: 'Checkout form, card filled in', theme: 'light', path: 'skraft-visuals/checkout-light.png', bytes: 'PNG light checkout' },
  { title: 'Payment accepted', theme: 'light', path: 'skraft-visuals/accepted-light.png', bytes: 'PNG light accepted' },
  { title: 'Checkout form, card filled in', theme: 'dark', path: 'skraft-visuals/checkout-dark.png', bytes: 'PNG dark checkout' },
  { title: 'Payment accepted', theme: 'dark', path: 'skraft-visuals/accepted-dark.png', bytes: 'PNG dark accepted' },
])

/** A run of WORKFLOW on API and WEB, Playwright writing what `screenshots` says when the e2e command runs. */
const visualsRun = ({ config = {}, exits = {}, screenshots = CHECKOUT, codeHost, components = [API, WEB] } = {}) => {
  let host
  const machine = new ScriptedMachine({ exits, meanwhile: { [E2E]: () => playwrightWrites(host.workspace, screenshots) } })
  host = scripted({
    workflow: WORKFLOW, machine, components, codeHost, git: new InMemoryGit(),
    config: { publish: { pullRequest: true, visuals: true }, ...config },
  }, (it) => [agent()(it)])
  return host
}

/** The text of a section of a description, between its heading and the next one. */
const section = (text, heading) => {
  const from = text.indexOf(`\n## ${heading}\n`)
  assert.ok(from >= 0, `no section ${heading} in\n${text}`)
  const rest = text.slice(from + heading.length + 5)
  return rest.slice(0, rest.indexOf('\n## ') < 0 ? rest.length : rest.indexOf('\n## ')).trim()
}

test('the e2e run of a front end leaves its light and dark screenshots on the working branch, and the pull request shows them at that commit', async () => {
  const host = visualsRun()

  const outcome = await host.start(STORY)

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.ok(host.machine.lines().includes(E2E), host.machine.lines().join('\n'))
  assert.deepEqual(host.git.engineCommits, [{
    dir: '.',
    paths: [`${EVIDENCE}/web/light-1.png`, `${EVIDENCE}/web/light-2.png`, `${EVIDENCE}/web/dark-1.png`, `${EVIDENCE}/web/dark-2.png`],
    message: 'docs(evidence): screenshots of web\n\nRefs: #42',
  }])
  assert.deepEqual(host.git.copies, [
    { from: 'web/skraft-visuals/checkout-light.png', to: `${EVIDENCE}/web/light-1.png` },
    { from: 'web/skraft-visuals/accepted-light.png', to: `${EVIDENCE}/web/light-2.png` },
    { from: 'web/skraft-visuals/checkout-dark.png', to: `${EVIDENCE}/web/dark-1.png` },
    { from: 'web/skraft-visuals/accepted-dark.png', to: `${EVIDENCE}/web/dark-2.png` },
  ])
  const visuals = eventsOf(host, 'step.recorded').find(({ step }) => step === 'visuals')
  assert.deepEqual({ outcome: visuals.outcome, next: visuals.next, reason: visuals.reason }, { outcome: 'recorded', next: 'publish', reason: '4 screenshots committed in root-1' })
  assert.equal(section(await host.tracking.read(SLUG, 'pull-request-body.md'), 'Screenshots'), [
    '- web: e2e run passed (`npx playwright test`, evidence `visuals/web/e2e-1.log`); 4 screenshots committed',
    '',
    `![Checkout form, card filled in](${RAW}/${EVIDENCE}/web/light-1.png)`,
    '',
    `![Payment accepted](${RAW}/${EVIDENCE}/web/light-2.png)`,
    '',
    '<details><summary>Dark theme</summary>',
    '',
    `![Checkout form, card filled in](${RAW}/${EVIDENCE}/web/dark-1.png)`,
    '',
    `![Payment accepted](${RAW}/${EVIDENCE}/web/dark-2.png)`,
    '',
    '</details>',
  ].join('\n'))
})
