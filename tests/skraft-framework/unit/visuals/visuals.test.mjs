import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryCodeHost, InMemoryGit, ScriptedMachine } from '../support/in-memory-host.mjs'
import { agent, API, scripted, SLUG } from '../support/pipeline-host.mjs'
import { writeE2eTrace } from '../support/delivery-trace.mjs'
import { eventsOf } from '../support/decisions.mjs'
import { opening, section } from '../support/description.mjs'

/** A React front end in web/, whose e2e command runs Playwright. */
const WEB = Object.freeze({
  name: 'web', root: 'web', stack: 'react', bdd: false, mocking: { strategy: 'inprocess' },
  paths: { src: ['src'], tests: ['tests'] },
  commands: { build: 'npm run build', e2e: 'npx playwright test' },
})
const STORY = { story: { issue: 42, title: 'Pay by card' } }
const E2E = 'web $ npx playwright test'
const TRACED = 'logs/runs/deliver-1-1/1.log'
const EVIDENCE = `.copilot-tracking/skraft-plans/${SLUG}/evidence/${SLUG}`
const RAW = 'https://github.com/acme/shop/raw/root-1'
const SHOTS = 'web/skraft-visuals'
/** How the body refers to a screenshot gh attaches: from the folder of the body file, the run's tracking folder. */
const FROM_BODY = '../../..'
/** Azure Repos' Items route of a file of the repository at a commit. */
const ITEMS = (commit, path) => `https://dev.azure.com/acme/shop/_apis/git/repositories/shop/items?path=${encodeURIComponent(`/${path}`)}&versionDescriptor.version=${commit}&versionDescriptor.versionType=commit&api-version=7.1`
/** A forge whose client attaches no file, Azure DevOps': the screenshots are committed and linked at their commit. */
const azure = (options = {}) => new InMemoryCodeHost({ attachesFiles: false, fileUrl: ITEMS, ...options })

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

/** A run of WORKFLOW on API and `web` (WEB): the REPL traced the e2e run of `web`, which left what `screenshots` says in its folder. */
const visualsRun = ({ config = {}, exits = {}, screenshots = CHECKOUT, codeHost, web = WEB, components = [API, web], answers, traced = true } = {}) => {
  const host = scripted({
    workflow: WORKFLOW, components, codeHost, git: new InMemoryGit(), answers,
    config: { publish: { pullRequest: true, questionVersions: { pullRequest: 2, visuals: 2 }, visuals: true }, ...config },
  }, (it) => [agent({ trace: false, work: async () => { if (traced) { playwrightWrites(it.workspace, screenshots); await writeE2eTrace(it, { cwd: 'web', command: web.commands.e2e ?? 'npx playwright test', exitCode: exits[`web $ ${web.commands.e2e}`] ?? 0 }) } } })(it)])
  return host
}

test('on GitHub the screenshots stay where Playwright wrote them: gh attaches them to the pull request, which shows them light first and dark folded, and nothing is committed', async () => {
  const host = visualsRun()

  const outcome = await host.start(STORY)

  assert.equal(outcome.status, 'done', outcome.reason)
  assert.deepEqual([host.git.engineCommits, host.git.copies], [[], []])
  const visuals = eventsOf(host, 'step.recorded').find(({ step }) => step === 'visuals')
  assert.deepEqual({ outcome: visuals.outcome, next: visuals.next, reason: visuals.reason }, { outcome: 'recorded', next: 'publish', reason: '4 screenshots to attach to the pull request' })
  assert.equal(section(await host.tracking.read(SLUG, 'pull-request-body.md'), 'Screenshots'), [
    '- web: e2e run passed (`npx playwright test`, evidence `logs/runs/deliver-1-1/1.log`); 4 screenshots attached to the pull request',
    '',
    `![Checkout form, card filled in](${FROM_BODY}/${SHOTS}/checkout-light.png)`,
    '',
    `![Payment accepted](${FROM_BODY}/${SHOTS}/accepted-light.png)`,
    '',
    '<details><summary>Dark theme</summary>',
    '',
    `![Checkout form, card filled in](${FROM_BODY}/${SHOTS}/checkout-dark.png)`,
    '',
    `![Payment accepted](${FROM_BODY}/${SHOTS}/accepted-dark.png)`,
    '',
    '</details>',
  ].join('\n'))
  assert.deepEqual(host.codeHost.attached, [[
    { path: `${SHOTS}/checkout-light.png`, alt: 'Checkout form, card filled in', reference: `${FROM_BODY}/${SHOTS}/checkout-light.png` },
    { path: `${SHOTS}/accepted-light.png`, alt: 'Payment accepted', reference: `${FROM_BODY}/${SHOTS}/accepted-light.png` },
    { path: `${SHOTS}/checkout-dark.png`, alt: 'Checkout form, card filled in', reference: `${FROM_BODY}/${SHOTS}/checkout-dark.png` },
    { path: `${SHOTS}/accepted-dark.png`, alt: 'Payment accepted', reference: `${FROM_BODY}/${SHOTS}/accepted-dark.png` },
  ]])
  assert.ok(host.codeHost.pullRequests[0].body.includes('![Payment accepted](https://github.com/user-attachments/assets/1-2)'), host.codeHost.pullRequests[0].body)
  assert.match(eventsOf(host, 'step.recorded').find(({ step }) => step === 'publish').reason, /^pull request #42 opened as a draft: \S+$/)
})

test('a screenshot gh did not attach is told by reading the body back, and the pull request is still opened; an update attaches them again, and the body gh rewrote counts as the one skraft wrote', async () => {
  const host = visualsRun({ codeHost: new InMemoryCodeHost({ unattached: [`${SHOTS}/accepted-light.png`, `${SHOTS}/accepted-dark.png`] }) })

  assert.equal((await host.start(STORY)).status, 'done')

  assert.equal(eventsOf(host, 'step.recorded').find(({ step }) => step === 'publish').reason, `pull request #42 opened as a draft: https://github.example.com/acme/shop/pull/42; 2 screenshots did not attach: ${SHOTS}/accepted-light.png, ${SHOTS}/accepted-dark.png`)
  assert.ok(host.codeHost.pullRequests[0].body.includes(`![Payment accepted](${FROM_BODY}/${SHOTS}/accepted-light.png)`))

  host.codeHost.unattached.clear()
  assert.equal((await host.publish()).reason, 'pull request #42 updated: https://github.example.com/acme/shop/pull/42')
  assert.equal(host.codeHost.attached.at(-1).length, 4)
  assert.ok(!host.codeHost.pullRequests[0].body.includes(`](${FROM_BODY}/`), host.codeHost.pullRequests[0].body)
  assert.match((await host.publish()).reason, /pull request #42 is up to date/)
  host.codeHost.pullRequests[0].body += '\nA reviewer\'s note.'
  assert.match((await host.publish()).reason, /was edited since skraft last wrote its body/)
})

test('on a forge whose client attaches no file, the screenshots are committed on the working branch and the pull request shows each at its commit, from the address the forge gives', async () => {
  const host = visualsRun({ codeHost: azure() })

  assert.equal((await host.start(STORY)).status, 'done')

  assert.deepEqual(host.git.engineCommits, [{
    dir: '.',
    paths: [`${EVIDENCE}/web/light-1.png`, `${EVIDENCE}/web/light-2.png`, `${EVIDENCE}/web/dark-1.png`, `${EVIDENCE}/web/dark-2.png`],
    message: 'docs(evidence): screenshots of web\n\nRefs: #42',
  }])
  assert.deepEqual(host.git.copies, [
    { from: `${SHOTS}/checkout-light.png`, to: `${EVIDENCE}/web/light-1.png` },
    { from: `${SHOTS}/accepted-light.png`, to: `${EVIDENCE}/web/light-2.png` },
    { from: `${SHOTS}/checkout-dark.png`, to: `${EVIDENCE}/web/dark-1.png` },
    { from: `${SHOTS}/accepted-dark.png`, to: `${EVIDENCE}/web/dark-2.png` },
  ])
  assert.deepEqual(visualsStep(host), { outcome: 'recorded', next: 'publish', reason: '4 screenshots committed in root-1' })
  assert.equal(section(await host.tracking.read(SLUG, 'pull-request-body.md'), 'Screenshots'), [
    '- web: e2e run passed (`npx playwright test`, evidence `logs/runs/deliver-1-1/1.log`); 4 screenshots committed',
    '',
    `![Checkout form, card filled in](${ITEMS('root-1', `${EVIDENCE}/web/light-1.png`)})`,
    '',
    `![Payment accepted](${ITEMS('root-1', `${EVIDENCE}/web/light-2.png`)})`,
    '',
    '<details><summary>Dark theme</summary>',
    '',
    `![Checkout form, card filled in](${ITEMS('root-1', `${EVIDENCE}/web/dark-1.png`)})`,
    '',
    `![Payment accepted](${ITEMS('root-1', `${EVIDENCE}/web/dark-2.png`)})`,
    '',
    '</details>',
  ].join('\n'))
  assert.deepEqual(host.codeHost.attached, [[]])
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
    const host = visualsRun({ components: [API, WEB, kiosk], config: { publish: { pullRequest: true, questionVersions: { pullRequest: 2, visuals: 2 }, ...(visuals === null ? {} : { visuals }) } } })

    assert.equal((await host.start(STORY)).status, 'done')

    assert.deepEqual([host.git.engineCommits, host.git.copies], [[], []])
    const told = `4 screenshots not published (consent): ${why}`
    assert.deepEqual(visualsStep(host), { outcome: 'not-recorded', next: 'publish', reason: `no screenshot recorded: web: ${told}; kiosk: no traced e2e run: run the front end\'s e2e command through skraft_repl with gate(\'e2e\', <command>, { cwd: <its root> })` })
    assert.deepEqual(eventsOf(host, 'visuals.recorded')[0].components[1].screenshots, [])
    assert.equal((await screenshots(host)).split('\n')[0], `- web: e2e run passed (\`npx playwright test\`, evidence \`logs/runs/deliver-1-1/1.log\`); ${told}`)

    const nowhere = visualsRun({ codeHost: new InMemoryCodeHost({ repository: null }), config: { publish: { pullRequest: true, questionVersions: { pullRequest: 2 }, visuals: false } } })
    await nowhere.start(STORY)
    assert.ok(!(await screenshots(nowhere)).includes('The remote names no repository'), await screenshots(nowhere))
  }
})
test('with no front end, the visuals node is skipped and runs nothing; without when, it says there is none', async () => {
  const host = visualsRun({ components: [API] })

  assert.equal((await host.start(STORY)).status, 'done')

  assert.deepEqual(visualsStep(host), { outcome: 'skipped', next: 'publish', reason: 'no component of skraft-config.json is a front end (stack react, or an e2e command)' })
  assert.deepEqual(host.git.engineCommits, [])
  assert.equal(await screenshots(host), 'None recorded: this run took no screenshots (no visuals step, or no front end in skraft-config.json).')

  const always = scripted({ workflow: WORKFLOW.replace(', when="frontend"', ''), components: [API], config: { publish: { pullRequest: true, questionVersions: { pullRequest: 2, visuals: 2 }, visuals: true } } }, (it) => [agent()(it)])
  await always.start(STORY)
  assert.deepEqual(visualsStep(always), { outcome: 'not-recorded', next: 'publish', reason: 'no screenshot recorded: ' })
  assert.equal(await screenshots(always), 'None recorded: no component of skraft-config.json is a front end (stack react, or an e2e command).')
})

test('committed screenshots are shown from the address the forge gives at their commit, their paths when it gives none', async () => {
  const enterprise = visualsRun({ codeHost: azure({ fileUrl: (commit, path) => `https://ghe.acme.io/payments/shop/raw/${commit}/${path}` }) })
  await enterprise.start(STORY)
  assert.ok((await screenshots(enterprise)).includes(`![Payment accepted](https://ghe.acme.io/payments/shop/raw/root-1/${EVIDENCE}/web/light-2.png)`), await screenshots(enterprise))

  const nowhere = visualsRun({ codeHost: azure({ fileUrl: () => null }) })
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

  const alt = 'Paid img src x by octocat, fixes 12 x (y) link (z) code café 100'
  assert.equal((await screenshots(host)).split('\n').at(-1), `![${alt}](${FROM_BODY}/${SHOTS}/a b.png)`)
  assert.deepEqual(host.codeHost.attached, [[{ path: `${SHOTS}/a b.png`, alt, reference: `${FROM_BODY}/${SHOTS}/a b.png` }]])

  const long = visualsRun({ codeHost: azure(), screenshots: [{ title: `${'Checkout '.repeat(15)}end`, theme: 'light', path: 'skraft-visuals/a.png', bytes: 'PNG' }] })
  await long.start(STORY)
  assert.equal((await screenshots(long)).split('\n').at(-1), `![${'Checkout '.repeat(15).slice(0, 120)}](${ITEMS('root-1', `${EVIDENCE}/web/light-1.png`)})`)
})

test('a screenshot whose path holds a # is refused when the manifest is read, gh reading what follows it as the alt text: nothing is attached nor committed', async () => {
  for (const codeHost of [new InMemoryCodeHost(), azure()]) {
    const host = visualsRun({ codeHost, screenshots: [CHECKOUT[0], { ...CHECKOUT[1], path: 'skraft-visuals/order #12.png' }] })

    assert.equal((await host.start(STORY)).status, 'done')

    assert.deepEqual([host.git.engineCommits, host.codeHost.attached], [[], [[]]])
    assert.deepEqual(visualsStep(host), { outcome: 'not-recorded', next: 'publish', reason: 'no screenshot recorded: web: screenshots not recorded: the path of screenshot 2 of skraft-visuals/manifest.json holds a #, which gh reads as the start of its alt text: name the file without one' })
  }
})

test('a screenshot that is a symbolic link, lies outside its component or is no PNG is refused: nothing is attached nor committed, and the pull request says which', async () => {
  for (const codeHost of [new InMemoryCodeHost(), azure()]) {
    const host = visualsRun({ codeHost })
    host.git.refuses = ['web/skraft-visuals/accepted-light.png', 'web/skraft-visuals/accepted-dark.png']

    assert.equal((await host.start(STORY)).status, 'done')

    assert.deepEqual([host.git.engineCommits, host.codeHost.attached], [[], [[]]])
    const told = 'web: 4 screenshots not recorded: refused web/skraft-visuals/accepted-light.png, web/skraft-visuals/accepted-dark.png (a symbolic link, a file outside its component, or not a PNG)'
    assert.deepEqual(visualsStep(host), { outcome: 'not-recorded', next: 'publish', reason: `no screenshot recorded: ${told}` })
  }
})
/**
 * A run on a forge whose body takes 1,000 characters, so that the folded sections go to the
 * comments of the run details, each at most `commentLimit` characters.
 */
const detailsRun = async (commentLimit) => {
  const host = visualsRun({ codeHost: azure({ bodyLimit: 1_000, commentLimit, fileUrl: (commit, path) => `${RAW.slice(0, -'/root-1'.length)}/${commit}/${path}` }), screenshots: CHECKOUT.filter(({ title, theme }) => theme === 'dark' || title === 'Payment accepted') })
  assert.equal((await host.start(STORY)).status, 'done')
  return host
}

/** The comment of the run details that holds the Screenshots section. @param {Awaited<ReturnType<typeof detailsRun>>} host */
const screenshotsComment = (host) => host.codeHost.pullRequestComments.find(({ body }) => body.includes('<summary>Screenshots')).body

/** What a comment keeps for its marker and heading, out of the room its blocks have: the heading of a comment of one part, then « n/n » for the run's `n` folded blocks. @param {string} comment @param {number} blocks */
const headerOf = (comment, blocks) => comment.indexOf('\n\n') + '\n\n'.length + ` ${blocks}/${blocks}`.length

/** The limit of a comment that takes the Screenshots block whole, less `short` characters. @param {string} description @param {number} short @param {number} reserve */
const limitShortBy = (description, short, reserve) => {
  const block = section(description, 'Screenshots').length + opening(description, 'Screenshots').length + '\n\n'.length + '\n\n</details>\n'.length
  return block - short + reserve
}

test('screenshots cut to fit a comment of the run details drop their dark theme block whole, never leaving it open', async () => {
  const whole = await detailsRun(140_000)
  const description = await whole.tracking.read(SLUG, 'pull-request.md')
  assert.ok(section(description, 'Screenshots').endsWith(`/dark-2.png)\n\n</details>`), section(description, 'Screenshots'))
  assert.ok(screenshotsComment(whole).includes('/dark-2.png)'))
  const body = await whole.tracking.read(SLUG, 'pull-request-body.md')
  assert.ok(!body.includes('<summary>Screenshots'), body)

  const reserve = headerOf(screenshotsComment(whole), screenshotsComment(whole).split('<details').length - 1)
  const cut = screenshotsComment(await detailsRun(limitShortBy(description, 10, reserve)))
  assert.ok(section(cut, 'Screenshots').endsWith([
    `![Payment accepted](${RAW}/${EVIDENCE}/web/light-1.png)`,
    '',
    CUT,
  ].join('\n')), section(cut, 'Screenshots').slice(-600))
  assert.equal(cut.split('<details').length, cut.split('</details>').length, cut.slice(-1500))

  const shots = section(description, 'Screenshots')
  const intoTag = screenshotsComment(await detailsRun(limitShortBy(description, shots.length - shots.indexOf('<details>') - '<deta'.length - CUT.length - 2, reserve)))
  assert.ok(section(intoTag, 'Screenshots').endsWith(`/web/light-1.png)\n\n${CUT}`), section(intoTag, 'Screenshots').slice(-300))
})

test('on GitHub, screenshots a comment of the run details shows are attached to that comment by gh, those missing when read back are told, and the next publication posts it again and empties the one before', async () => {
  const host = visualsRun({ codeHost: new InMemoryCodeHost({ bodyLimit: 1_000, commentLimit: 140_000, unattached: [`${SHOTS}/accepted-dark.png`] }) })

  assert.equal((await host.start(STORY)).status, 'done')

  const reason = eventsOf(host, 'step.recorded').find(({ step }) => step === 'publish').reason
  assert.match(reason, new RegExp(`; 1 screenshot did not attach: ${SHOTS}/accepted-dark\\.png$`))
  assert.deepEqual(host.codeHost.attached, [[]], 'the body shows no screenshot, so it attaches none')
  const shown = host.codeHost.pullRequestComments.find(({ body }) => body.includes('<summary>Screenshots'))
  assert.deepEqual(shown.attached.map(({ path, reference }) => [path, reference]), ['checkout-light', 'accepted-light', 'checkout-dark', 'accepted-dark'].map((name) => [`${SHOTS}/${name}.png`, `${FROM_BODY}/${SHOTS}/${name}.png`]))
  assert.ok(shown.body.includes(`![Payment accepted](${FROM_BODY}/${SHOTS}/accepted-dark.png)`), shown.body)
  assert.ok(!shown.body.includes(`](${FROM_BODY}/${SHOTS}/checkout-light.png)`), shown.body)

  host.codeHost.unattached.clear()
  const again = await host.publish()

  assert.doesNotMatch(again.reason, /did not attach/)
  const after = host.codeHost.pullRequestComments.findLast(({ body }) => body.includes('<summary>Screenshots'))
  assert.notEqual(after.url, shown.url)
  assert.ok(shown.body.includes('This part of the run details is no longer used.'), shown.body)
  assert.ok(!after.body.includes(`](${FROM_BODY}/`), after.body)
  assert.match((await host.publish()).reason, /up to date/)
})

const CUT = '[cut: the description holds more than a pull request takes; read it whole in the tracking folder, pull-request.md]'

test('screenshots Git cannot commit are not recorded, and the run goes on', async () => {
  const host = visualsRun({ codeHost: azure() })
  host.git.commitFails = 'git commit failed: SECRET-STDERR'

  assert.equal((await host.start(STORY)).status, 'done')

  assert.deepEqual(visualsStep(host), { outcome: 'not-recorded', next: 'publish', reason: 'no screenshot recorded: web: 4 screenshots not recorded: Git could not commit them' })
  assert.ok(!(await host.tracking.read(SLUG, 'pull-request-body.md')).includes('SECRET'))
})
const FRENCH_ISSUE = { title: 'Payer par carte', body: 'En tant que client, je veux payer par carte pour que la commande soit validée sans passer par la livraison.' }
const FRENCH = { story: { issue: 42, title: FRENCH_ISSUE.title } }
/** The Screenshots section, under its French heading, of the body the run wrote. */
const frenchShots = async (host) => section(await host.tracking.read(SLUG, 'pull-request-body.md'), 'Captures d\'écran')

test('a French story\'s screenshots are told in French: each e2e run, the dark theme, the screenshots left out, a remote on no forge, no front end', async () => {
  const host = visualsRun({ codeHost: new InMemoryCodeHost({ issues: { 42: FRENCH_ISSUE } }) })
  await host.start(FRENCH)
  assert.equal(await frenchShots(host), [
    '- web : run e2e passed (`npx playwright test`, preuve `logs/runs/deliver-1-1/1.log`) ; 4 screenshots attached to the pull request',
    '',
    `![Checkout form, card filled in](${FROM_BODY}/${SHOTS}/checkout-light.png)`,
    '',
    `![Payment accepted](${FROM_BODY}/${SHOTS}/accepted-light.png)`,
    '',
    '<details><summary>Thème sombre</summary>',
    '',
    `![Checkout form, card filled in](${FROM_BODY}/${SHOTS}/checkout-dark.png)`,
    '',
    `![Payment accepted](${FROM_BODY}/${SHOTS}/accepted-dark.png)`,
    '',
    '</details>',
  ].join('\n'))

  const shot = (theme, n) => ({ title: `Step ${n}`, theme, path: `skraft-visuals/${theme}-${n}.png`, bytes: 'PNG' })
  const admin = { ...WEB, name: 'admin', root: 'admin', commands: { build: 'npm run build' } }
  const many = visualsRun({ codeHost: azure({ issues: { 42: FRENCH_ISSUE }, fileUrl: () => null }), components: [API, WEB, admin], screenshots: [...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => shot('light', n)), ...[1, 2, 3, 4, 5, 6, 7].map((n) => shot('dark', n))] })
  await many.start(FRENCH)
  const lines = (await frenchShots(many)).split('\n')
  assert.equal(lines[1], '- admin : no traced e2e run: run the front end\'s e2e command through skraft_repl with gate(\'e2e\', <command>, { cwd: <its root> })')
  assert.equal(lines[3], 'Le remote ne nomme aucun dépôt sur une forge : chaque image pointe vers son chemin au commit `root-1`, que la forge n\'affiche pas.')
  assert.ok(lines.includes(`2 autres captures du thème clair de web dans \`${EVIDENCE}/web\``), lines.join('\n'))
  assert.ok(lines.includes(`1 autre capture du thème sombre de web dans \`${EVIDENCE}/web\``), lines.join('\n'))

  const always = scripted({ workflow: WORKFLOW.replace(', when="frontend"', ''), codeHost: new InMemoryCodeHost({ issues: { 42: FRENCH_ISSUE } }), components: [API], config: { publish: { pullRequest: true, questionVersions: { pullRequest: 2, visuals: 2 }, visuals: true } } }, (it) => [agent()(it)])
  await always.start(FRENCH)
  assert.equal(await frenchShots(always), 'Aucune consignée : aucun composant de skraft-config.json n\'est un front end (stack react, ou une commande e2e).')
})

test('a traced e2e run that failed is told in the pull request with its log, nothing is committed, and the run still opens it', async () => {
  const host = visualsRun({ exits: { [E2E]: 1 } })

  const outcome = await host.start(STORY)

  assert.equal(outcome.status, 'done')
  assert.deepEqual(host.git.engineCommits, [])
  assert.deepEqual(visualsStep(host), { outcome: 'e2e-failed', next: 'publish', reason: 'the e2e run of web failed' })
  assert.equal(await screenshots(host), '- web: e2e run failed (`npx playwright test`, evidence `logs/runs/deliver-1-1/1.log`); no screenshots: the traced e2e run did not exit 0')
  assert.equal(host.codeHost.calls.find((call) => call.startsWith('create ')), 'create main <- checkout (draft): Pay by card')
})

test('a front end with no traced e2e run is told how to trace one: the engine starts no e2e command', async () => {
  const host = visualsRun({ traced: false })

  assert.equal((await host.start(STORY)).status, 'done')

  assert.deepEqual(host.git.engineCommits, [])
  assert.equal(visualsStep(host).outcome, 'not-recorded')
  assert.match(await screenshots(host), /^- web: no traced e2e run: run the front end's e2e command through skraft_repl with gate\('e2e', <command>, \{ cwd: <its root> \}\)/)
  assert.deepEqual(host.machine.lines(), [])
})
