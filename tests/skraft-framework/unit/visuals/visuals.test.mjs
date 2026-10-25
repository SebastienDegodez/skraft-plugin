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
const RAW = 'https://github.com/acme/shop/raw/root-1'

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
const visualsRun = ({ config = {}, exits = {}, screenshots = CHECKOUT, codeHost, components = [API, WEB], answers } = {}) => {
  let host
  const machine = new ScriptedMachine({ exits, meanwhile: { [E2E]: () => playwrightWrites(host.workspace, screenshots) } })
  host = scripted({
    workflow: WORKFLOW, machine, components, codeHost, git: new InMemoryGit(), answers,
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
  assert.deepEqual(host.machine.runs.filter(({ argv }) => argv.includes('playwright')), [{ argv: ['npx', 'playwright', 'test'], cwd: 'web', timeoutMs: 600_000 }])
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

/** The Screenshots section of the body the run wrote. */
const screenshots = async (host) => section(await host.tracking.read(SLUG, 'pull-request-body.md'), 'Screenshots')
/** The visuals step's outcome, next node and reason. */
const visualsStep = (host) => {
  const { outcome, next, reason } = eventsOf(host, 'step.recorded').find(({ step }) => step === 'visuals')
  return { outcome, next, reason }
}

test('without the developer\'s consent the e2e run still runs, but no screenshot is copied or committed, and the pull request says why', async () => {
  for (const [visuals, why] of [[false, 'skraft-config.json sets publish.visuals to false']]) {
    const kiosk = { ...WEB, name: 'kiosk', root: 'kiosk', commands: { build: 'npm run build' } }
    const host = visualsRun({ components: [API, WEB, kiosk], config: { publish: { pullRequest: true, ...(visuals === null ? {} : { visuals }) } } })

    assert.equal((await host.start(STORY)).status, 'done')

    assert.ok(host.machine.lines().includes(E2E))
    assert.deepEqual([host.git.engineCommits, host.git.copies], [[], []])
    const told = `4 screenshots not published (consent): ${why}`
    assert.deepEqual(visualsStep(host), { outcome: 'not-recorded', next: 'publish', reason: `no screenshot committed: web: ${told}; kiosk: no e2e command; give it commands.e2e in skraft-config.json` })
    assert.deepEqual(eventsOf(host, 'visuals.recorded')[0].components[1].screenshots, [])
    assert.equal((await screenshots(host)).split('\n')[0], `- web: e2e run passed (\`npx playwright test\`, evidence \`visuals/web/e2e-1.log\`); ${told}`)

    const nowhere = visualsRun({ codeHost: new InMemoryCodeHost({ repository: null }), config: { publish: { pullRequest: true, visuals: false } } })
    await nowhere.start(STORY)
    assert.ok(!(await screenshots(nowhere)).includes('The remote names no repository'), await screenshots(nowhere))
  }
})

test('screenshots nobody consented to yet are asked about at the visuals node, before the e2e run; the answer is kept and acted on', async () => {
  const host = visualsRun({ config: { publish: { pullRequest: true } } })

  const waiting = await host.start(STORY)

  assert.deepEqual({ status: waiting.status, code: waiting.code, phase: waiting.phase }, { status: 'waiting', code: 'reporting-consent', phase: 'RESEARCH' })
  assert.deepEqual(host.human.questions.map(({ key, kind, options }) => [key, kind, options]), [['visuals-1', 'reporting-consent', ['ACCEPTED', 'DECLINED']]])
  assert.ok(!host.machine.lines().includes(E2E))
  assert.equal((await host.decide({ answer: 'ACCEPTED' })).ok, true)
  assert.equal((await host.run()).status, 'done')
  assert.deepEqual(host.workspace.config().publish, { pullRequest: true, visuals: true })
  assert.equal(host.machine.lines().filter((line) => line === E2E).length, 1)
  assert.deepEqual(visualsStep(host), { outcome: 'recorded', next: 'publish', reason: '4 screenshots committed in root-1' })

  const declined = visualsRun({ config: { publish: { pullRequest: true } }, answers: [{ answer: 'DECLINED' }] })
  assert.equal((await declined.start(STORY)).status, 'done')
  assert.deepEqual(declined.workspace.config().publish, { pullRequest: true, visuals: false })
  assert.ok(declined.machine.lines().includes(E2E))
  assert.deepEqual(declined.git.engineCommits, [])
  assert.equal(visualsStep(declined).reason, 'no screenshot committed: web: 4 screenshots not published (consent): skraft-config.json sets publish.visuals to false')
})

test('a failing e2e run is told in the pull request with its log, and the run still opens it', async () => {
  const kiosk = { ...WEB, name: 'kiosk', root: 'kiosk', commands: { build: 'npm run build', e2e: 'npx playwright test | tee e2e.log' } }
  const host = visualsRun({ exits: { [E2E]: 1 }, components: [API, WEB, kiosk] })

  const outcome = await host.start(STORY)

  assert.equal(outcome.status, 'done')
  assert.deepEqual(host.git.engineCommits, [])
  assert.deepEqual(visualsStep(host), { outcome: 'e2e-failed', next: 'publish', reason: 'the e2e run of web, kiosk failed' })
  assert.equal((await screenshots(host)).split('\n')[0], '- web: e2e run failed (`npx playwright test`, evidence `visuals/web/e2e-1.log`); no screenshots: exited 1')
  assert.match((await screenshots(host)).split('\n')[1], /^- kiosk: e2e run failed \(`npx playwright test \| tee e2e.log`, evidence `visuals\/kiosk\/e2e-1.log`\); no screenshots: command "npx playwright test \| tee e2e.log" /)
  const [recorded] = eventsOf(host, 'visuals.recorded')
  assert.deepEqual(recorded.components[0], { component: 'web', command: 'npx playwright test', evidence: 'visuals/web/e2e-1.log', screenshots: [], e2e: 'failed', detail: 'no screenshots: exited 1' })
  assert.equal(recorded.commit, null)
  assert.match(await host.tracking.read(SLUG, 'visuals/kiosk/e2e-1.log'), /\nresult: fail \(environment\): command /)
  assert.match(await host.tracking.read(SLUG, 'visuals/web/e2e-1.log'), /^\$ npx playwright test\ncwd: web\nresult: fail \(deterministic\): exited 1\n/)
  assert.equal(host.codeHost.calls.at(-1), 'create main <- checkout (draft): Pay by card')

  const stopped = visualsRun({ exits: { [E2E]: null } })
  await stopped.start(STORY)
  assert.equal(await screenshots(stopped), '- web: e2e run failed (`npx playwright test`, evidence `visuals/web/e2e-1.log`); no screenshots: npx was stopped by SIGKILL; run it again')
})

test('screenshots a manifest does not list as the engine reads it are not recorded, and the run goes on', async () => {
  const listing = (wrong) => (workspace) => {
    workspace.files.set('web/skraft-visuals/a.png', 'PNG')
    workspace.files.set('web/skraft-visuals/manifest.json', JSON.stringify({ screenshots: [{ title: 'Fine', theme: 'light', path: 'skraft-visuals/a.png' }, wrong] }))
  }
  const unreadable = 'skraft-visuals/manifest.json is missing or is not an object with a screenshots list'
  const cases = [
    { name: 'no manifest', write: () => {}, why: unreadable },
    { name: 'never written', write: () => {}, why: unreadable, stale: false },
    {
      name: 'first one wrong',
      write: (workspace) => workspace.files.set('web/skraft-visuals/manifest.json', JSON.stringify({ screenshots: [{ title: 'A', theme: 'dusk', path: 'skraft-visuals/a.png' }] })),
      why: 'screenshot 1 of skraft-visuals/manifest.json needs a title, a theme light or dark, and the path of a .png under the component',
    },
    { name: 'not JSON', write: (workspace) => workspace.files.set('web/skraft-visuals/manifest.json', '{ screenshots'), why: unreadable },
    { name: 'no list', write: (workspace) => workspace.files.set('web/skraft-visuals/manifest.json', '{"screenshots":{}}'), why: unreadable },
    ...[
      { title: '', theme: 'light', path: 'skraft-visuals/a.png' },
      { title: '###', theme: 'light', path: 'skraft-visuals/a.png' },
      { title: 'A', theme: 'sepia', path: 'skraft-visuals/a.png' },
      { title: 'A', theme: 'dark', path: 'skraft-visuals/a.jpg' },
      { title: 'A', theme: 'dark', path: 'skraft-visuals/a.png.txt' },
      { title: 'A', theme: 'dark', path: ['skraft-visuals/a.png'] },
      { title: 'A', theme: 'dark', path: '../secrets/a.png' },
      { title: 'A', theme: 'dark', path: 'skraft-visuals/../../a.png' },
      { title: 'A', theme: 'dark', path: '/etc/a.png' },
      { title: 'A', theme: 'dark', path: 'C:\\shots\\a.png' },
      { title: 'A', theme: 'dark' },
      { theme: 'dark', path: 'skraft-visuals/a.png' },
      null,
    ].map((wrong) => ({ name: JSON.stringify(wrong), write: listing(wrong), why: 'screenshot 2 of skraft-visuals/manifest.json needs a title, a theme light or dark, and the path of a .png under the component' })),
    {
      name: 'files missing',
      write: (workspace) => {
        workspace.files.set('web/skraft-visuals/b.png', 'PNG')
        workspace.files.set('web/skraft-visuals/manifest.json', JSON.stringify({ screenshots: ['a', 'b', 'c'].map((name) => ({ title: name, theme: 'light', path: `skraft-visuals/${name}.png` })) }))
      },
      why: 'the file of screenshot 1, 3 of skraft-visuals/manifest.json is missing',
    },
    { name: 'none listed', write: (workspace) => workspace.files.set('web/skraft-visuals/manifest.json', '{"screenshots":[]}'), why: null },
  ]
  for (const { name, write, why, stale = true } of cases) {
    let host
    const machine = new ScriptedMachine({ meanwhile: { [E2E]: () => write(host.workspace) } })
    host = scripted({ workflow: WORKFLOW, machine, components: [WEB], config: { publish: { pullRequest: true, visuals: true } } }, (it) => [agent()(it)])
    if (stale) host.workspace.files.set('web/skraft-visuals/manifest.json', JSON.stringify({ screenshots: [{ title: 'Stale', theme: 'light', path: 'skraft-visuals/stale.png' }] }))
    host.workspace.files.set('web/skraft-visuals/stale.png', 'PNG from an earlier run')

    assert.equal((await host.start(STORY)).status, 'done', name)
    if (name === 'no manifest') assert.equal(host.workspace.files.get('web/skraft-visuals/manifest.json'), '')
    if (name === 'never written') assert.equal(host.workspace.files.has('web/skraft-visuals/manifest.json'), false)

    assert.deepEqual(host.git.engineCommits, [], name)
    const detail = why === null ? 'its manifest lists no screenshot' : `screenshots not recorded: ${why}`
    assert.deepEqual(visualsStep(host), { outcome: 'not-recorded', next: 'publish', reason: `no screenshot committed: web: ${detail}` }, name)
    assert.equal(await screenshots(host), `- web: e2e run passed (\`npx playwright test\`, evidence \`visuals/web/e2e-1.log\`); ${detail}`, name)
  }
})

test('a React component with no e2e command is told to declare one; a component with an e2e command is a front end whatever its stack', async () => {
  const admin = { ...API, name: 'admin-ui', root: 'admin', stack: 'typescript', commands: { build: 'npm run build', e2e: 'npm run e2e' } }
  let host
  const writes = () => {
    host.workspace.files.set('admin/skraft-visuals/home.png', 'PNG')
    host.workspace.files.set('admin/skraft-visuals/manifest.json', JSON.stringify({ screenshots: [{ title: 'Home', theme: 'dark', path: 'skraft-visuals/home.png' }] }))
  }
  const kiosk = { ...admin, name: 'kiosk', root: 'kiosk', commands: { build: 'npm run build', e2e: 'npm run e2e' } }
  const kioskWrites = () => {
    host.workspace.files.set('kiosk/shot.png', 'PNG')
    host.workspace.files.set('kiosk/skraft-visuals/manifest.json', JSON.stringify({ screenshots: [{ title: 'Kiosk', theme: 'light', path: 'shot.png' }] }))
  }
  const machine = new ScriptedMachine({ meanwhile: { 'admin $ npm run e2e': writes, 'kiosk $ npm run e2e': kioskWrites } })
  host = scripted({ workflow: WORKFLOW, machine, components: [API, { ...WEB, commands: { build: 'npm run build' } }, admin, kiosk], config: { publish: { pullRequest: true, visuals: true } } }, (it) => [agent()(it)])

  await host.start(STORY)

  assert.deepEqual(host.machine.lines().filter((line) => line.includes('e2e') || line.includes('playwright')), ['admin $ npm run e2e', 'kiosk $ npm run e2e'])
  assert.deepEqual(visualsStep(host), { outcome: 'recorded', next: 'publish', reason: '2 screenshots committed in root-1' })
  assert.deepEqual(host.git.engineCommits.map(({ message }) => message), ['docs(evidence): screenshots of admin-ui, kiosk\n\nRefs: #42'])
  assert.deepEqual(eventsOf(host, 'visuals.recorded')[0].components[0], { component: 'web', command: null, e2e: 'not-run', detail: 'no e2e command; give it commands.e2e in skraft-config.json', evidence: null, screenshots: [] })
  assert.equal(await screenshots(host), [
    '- web: no e2e command; give it commands.e2e in skraft-config.json',
    '- admin-ui: e2e run passed (`npm run e2e`, evidence `visuals/admin-ui/e2e-1.log`); 1 screenshot committed',
    '- kiosk: e2e run passed (`npm run e2e`, evidence `visuals/kiosk/e2e-1.log`); 1 screenshot committed',
    '',
    `![Kiosk](${RAW}/${EVIDENCE}/kiosk/light-1.png)`,
    '',
    '<details><summary>Dark theme</summary>',
    '',
    `![Home](${RAW}/${EVIDENCE}/admin-ui/dark-1.png)`,
    '',
    '</details>',
  ].join('\n'))
})

test('with no front end, the visuals node is skipped and runs nothing; without when, it says there is none', async () => {
  const host = visualsRun({ components: [API] })

  assert.equal((await host.start(STORY)).status, 'done')

  assert.deepEqual(visualsStep(host), { outcome: 'skipped', next: 'publish', reason: 'no component of skraft-config.json is a front end (stack react, or an e2e command)' })
  assert.deepEqual(host.git.engineCommits, [])
  assert.equal(await screenshots(host), 'None recorded: this run took no screenshots (no visuals step, or no front end in skraft-config.json).')

  const always = scripted({ workflow: WORKFLOW.replace(', when="frontend"', ''), components: [API], config: { publish: { pullRequest: true, visuals: true } } }, (it) => [agent()(it)])
  await always.start(STORY)
  assert.deepEqual(visualsStep(always), { outcome: 'not-recorded', next: 'publish', reason: 'no screenshot committed: ' })
  assert.equal(await screenshots(always), 'None recorded: no component of skraft-config.json is a front end (stack react, or an e2e command).')
})

test('screenshots are shown from the forge the remote names: its own raw route off github.com, their paths when it names none', async () => {
  const enterprise = visualsRun({ codeHost: new InMemoryCodeHost({ repository: { host: 'ghe.acme.io', repository: 'payments/shop' } }) })
  await enterprise.start(STORY)
  assert.ok((await screenshots(enterprise)).includes(`![Payment accepted](https://ghe.acme.io/payments/shop/raw/root-1/${EVIDENCE}/web/light-2.png)`), await screenshots(enterprise))

  const nowhere = visualsRun({ codeHost: new InMemoryCodeHost({ repository: null }) })
  await nowhere.start(STORY)
  assert.deepEqual((await screenshots(nowhere)).split('\n').slice(1, 5), [
    '',
    'The remote names no repository on a forge: each image links its path at commit `root-1`, which the forge does not show.',
    '',
    `![Checkout form, card filled in](${EVIDENCE}/web/light-1.png)`,
  ])
})

test('a title is kept as plain alt text: no markup, mention, issue reference or line break reaches the pull request', async () => {
  const host = visualsRun({
    screenshots: [{ title: 'Paid <img src=x> by @octocat, fixes #12\n![x](y) [link](z) `code` café — 100%', theme: 'light', path: 'skraft-visuals/a b.png', bytes: 'PNG' }],
  })

  await host.start(STORY)

  assert.equal((await screenshots(host)).split('\n').at(-1), `![Paid img src x by octocat, fixes 12 x (y) link (z) code café 100](${RAW}/${EVIDENCE}/web/light-1.png)`)
  assert.deepEqual(host.git.copies, [{ from: 'web/skraft-visuals/a b.png', to: `${EVIDENCE}/web/light-1.png` }])

  const long = visualsRun({ screenshots: [{ title: `${'Checkout '.repeat(15)}end`, theme: 'light', path: 'skraft-visuals/a.png', bytes: 'PNG' }] })
  await long.start(STORY)
  assert.equal((await screenshots(long)).split('\n').at(-1), `![${'Checkout '.repeat(15).slice(0, 120)}](${RAW}/${EVIDENCE}/web/light-1.png)`)
})

test('a screenshot that is a symbolic link, lies outside its component or is no PNG is refused: nothing is committed, and the pull request says which', async () => {
  const host = visualsRun()
  host.git.refuses = ['web/skraft-visuals/accepted-light.png', 'web/skraft-visuals/accepted-dark.png']

  assert.equal((await host.start(STORY)).status, 'done')

  assert.deepEqual(host.git.engineCommits, [])
  const told = 'web: 4 screenshots not recorded: refused web/skraft-visuals/accepted-light.png, web/skraft-visuals/accepted-dark.png (a symbolic link, a file outside its component, or not a PNG)'
  assert.deepEqual(visualsStep(host), { outcome: 'not-recorded', next: 'publish', reason: `no screenshot committed: ${told}` })
})

test('the pull request shows six screenshots of each theme of a component, and says where the others are', async () => {
  const shot = (theme, n) => ({ title: `Step ${n}`, theme, path: `skraft-visuals/${theme}-${n}.png`, bytes: 'PNG' })
  const host = visualsRun({ screenshots: [...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => shot('light', n)), ...[1, 2, 3, 4, 5, 6, 7].map((n) => shot('dark', n))] })

  await host.start(STORY)

  const lines = (await screenshots(host)).split('\n')
  assert.equal(lines.filter((line) => line.startsWith('![')).length, 12)
  assert.ok(lines.includes(`![Step 6](${RAW}/${EVIDENCE}/web/light-6.png)`) && !lines.some((line) => line.includes('light-7.png')))
  assert.ok(lines.includes(`2 more light screenshots of web in \`${EVIDENCE}/web\``), lines.join('\n'))
  assert.ok(lines.includes(`1 more dark screenshot of web in \`${EVIDENCE}/web\``), lines.join('\n'))
  assert.ok(lines.indexOf(`1 more dark screenshot of web in \`${EVIDENCE}/web\``) < lines.indexOf('</details>'))
  assert.equal(host.git.copies.length, 15)
})

test('screenshots Git cannot commit are not recorded, and the run goes on', async () => {
  const host = visualsRun()
  host.git.commitFails = 'git commit failed: SECRET-STDERR'

  assert.equal((await host.start(STORY)).status, 'done')

  assert.deepEqual(visualsStep(host), { outcome: 'not-recorded', next: 'publish', reason: 'no screenshot committed: web: 4 screenshots not recorded: Git could not commit them' })
  assert.ok(!(await host.tracking.read(SLUG, 'pull-request-body.md')).includes('SECRET'))
})

test('a second visit runs the e2e command again with a log of its own, and shows the screenshots of its last run', async () => {
  const loop = WORKFLOW
    .replace('start -> research -> visuals -> publish -> exit', 'start -> research -> visuals -> gates\n  gates -> research [label="FAIL", max_visits=1]\n  gates -> publish [label="PASS"]\n  publish -> exit')
    .replace('  exit     [shape=Msquare]', '  gates    [shape=parallelogram, gate="build", goal_gate=true]\n  exit     [shape=Msquare]')
  let host
  let runs = 0
  const machine = new ScriptedMachine({
    exits: { 'web $ npm run build': 1 },
    meanwhile: {
      [E2E]: () => playwrightWrites(host.workspace, CHECKOUT.slice(0, ++runs)),
      'web $ npm run build': () => { if (runs === 2) delete machine.exits['web $ npm run build'] },
    },
  })
  host = scripted({ workflow: loop, machine, components: [WEB], config: { publish: { pullRequest: true, visuals: true } } }, (it) => [agent()(it), agent()(it)])

  await host.start(STORY)

  assert.deepEqual(eventsOf(host, 'visuals.recorded').map(({ visit, commit, components }) => [visit, commit, components[0].evidence, components[0].screenshots.length]), [[1, 'root-1', 'visuals/web/e2e-1.log', 1], [2, 'root-2', 'visuals/web/e2e-2.log', 2]])
  assert.ok((await screenshots(host)).includes(`/root-2/${EVIDENCE}/web/light-2.png`))
})
