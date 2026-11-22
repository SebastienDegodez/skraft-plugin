// A real repository the whole pipeline runs on, and the scripted LLM that works in it. The
// agents act as a model would: they read their brief, fill the outputs it lists, write the
// result JSON it names, change files and make real Git commits. The gates then run the
// repository's real test command. No doubles: every driver test stages the same repository.
import { traceDelivery, traceRed } from './delivery-trace.mjs'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { answerYaml, withContext } from '../../unit/support/answer-yaml.mjs'
import { PLUGIN_ROOT, commitAll, git, tempFolder } from './workspace.mjs'
import { NO_COMMENT } from './issue-forge.mjs'

export const SLUG = 'checkout'

/** The test command of the `app` component: node by its absolute path, so no PATH is needed. */
export const TEST_COMMAND = `"${process.execPath}" tests/unit/check.mjs`

/**
 * `tests/unit/check.mjs`, in the unit place of a JavaScript component: fails while `src/pay.mjs`
 * is missing or `pay(10)` is not `paid 10`. As a test runner does, it writes the JUnit report
 * `reports/junit.xml` once its test ran, the assertion failing or passing, and none when the
 * import fails before.
 */
export const CHECK = [
  "import { mkdirSync, writeFileSync } from 'node:fs'",
  'const report = (body) => {',
  "  mkdirSync('reports', { recursive: true })",
  "  writeFileSync('reports/junit.xml', `<testsuite><testcase classname=\"check\" name=\"pay answers the amount paid\">${body}</testcase></testsuite>\\n`)",
  '}',
  'let pay',
  'try {',
  "  ({ pay } = await import('../../src/pay.mjs'))",
  '} catch {',
  "  console.error('src/pay.mjs is missing')",
  '  process.exit(1)',
  '}',
  "if (pay(10) !== 'paid 10') {",
  '  console.error(`pay(10) answered ${pay(10)}`)',
  '  report(`<failure message=\"pay(10) answered ${pay(10)}\"/>`)',
  '  process.exit(1)',
  '}',
  "report('')",
  "console.log('pay ok')",
  '',
].join('\n')

/** The skeleton the acceptance test calls: `pay` answering the empty value of its type, so that its assertion runs and fails. */
export const SKELETON = "export const pay = () => ''\n"

export const PAY = 'export const pay = (amount) => `paid ${amount}`\n'
export const WRONG_PAY = 'export const pay = (amount) => `owed ${amount}`\n'
/** The ADR the architect drafts: Proposed until a human ratifies it. */
export const ADR = [
  '---',
  'adr: 1',
  'title: Card payment',
  'status: Proposed',
  'decision: We will pay by card.',
  'supersedes: null',
  'ratified_by: null',
  '---',
  '',
  '# ADR-001 — Card payment',
  '',
  '**Status:** Proposed',
  '',
].join('\n')
export const ADR_PATH = 'docs/adr/adr-001-card-payment.md'
export const INDEX_PATH = 'docs/adr/decisions-index.md'

/** The decisions index with a Proposed row for each ADR number. @param {...number} numbers */
export const decisionsIndex = (...numbers) => [
  '| ADR | Title | Status | Chosen | Decision (1 line) | Ratified by | Date |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...numbers.map((number) => `| ADR-${String(number).padStart(3, '0')} | Card payment | Proposed | — | We will pay by card. | — | 2026-10-11 |`),
  '',
].join('\n')

/** A repository workflow: a reduced one, with the plugin's mandatory reviews and a repository agent between the architect and the design review. */
export const SECURITY_WORKFLOW = `digraph skraft {
  graph [version="2", goal="Deliver the story"]

  start    [shape=Mdiamond]
  research [shape=box, agent="solution-researcher", phase="RESEARCH"]
  design   [shape=box, agent="solution-architect", phase="DESIGN"]
  security [shape=box, agent="acme-security-reviewer"]
  distill  [shape=box, agent="acceptance-designer", phase="DISTILL"]
  deliver  [shape=box, agent="software-engineer", phase="DELIVER"]
  exit     [shape=Msquare]
  design_review_lenses [shape=component]
  design_review_consistency [shape=note, lens="consistency"]
  design_review_refuter [shape=octagon]
  design_review [shape=tripleoctagon, mandatory=true]
  distill_review_lenses [shape=component]
  distill_review_coverage [shape=note, lens="coverage"]
  distill_review_refuter [shape=octagon]
  distill_review [shape=tripleoctagon, mandatory=true]
  deliver_review [shape=house, workflow="review", mandatory=true]

  start -> research -> design -> security -> design_review_lenses -> design_review_consistency -> design_review_refuter -> design_review
  design_review -> design [label="NEEDS_REWORK", max_visits=3]
  design_review -> distill [label="APPROVED"]
  distill -> distill_review_lenses -> distill_review_coverage -> distill_review_refuter -> distill_review
  distill_review -> distill [label="NEEDS_REWORK", max_visits=3]
  distill_review -> deliver [label="APPROVED"]
  deliver -> deliver_review
  deliver_review -> deliver [label="NEEDS_REWORK", max_visits=3]
  deliver_review -> exit [label="APPROVED"]
}
`

export const SECURITY_AGENT = 'acme-security-reviewer'

/** SECURITY_WORKFLOW with each replacement made; throws when one no longer matches it. @param {Array<[string, string]>} replacements */
const faulty = (replacements) => replacements.reduce((text, [from, to]) => {
  if (!text.includes(from)) throw new Error(`SECURITY_WORKFLOW no longer holds ${from}`)
  return text.replace(from, to)
}, SECURITY_WORKFLOW)

/**
 * Repository workflows every host refuses before any agent starts: SECURITY_WORKFLOW with one
 * fault each, and the reason the engine gives.
 */
export const REFUSED_WORKFLOWS = Object.freeze([
  {
    fault: 'a gate node of an earlier engine',
    workflow: faulty([['  exit     [shape=Msquare]\n', '  exit     [shape=Msquare]\n  gates    [shape=parallelogram, gate="build,test", phase="DELIVER"]\n']]),
    reason: 'node gates: a gate node is gone: skraft runs no gate. The software engineer runs each gate through skraft_repl, and the DELIVER review reads the traced runs of its attempt; remove the node and its PASS and FAIL edges (skraft workflow diff shows the plugin\'s pipeline); node gates: publish node needs exactly one outgoing edge, has 0; node gates is unreachable from start; node gates never reaches an exit',
  },
  {
    fault: 'a loop without max_visits',
    workflow: faulty([['deliver_review -> deliver [label="NEEDS_REWORK", max_visits=3]', 'deliver_review -> deliver [label="NEEDS_REWORK"]']]),
    reason: 'loop deliver_review -> deliver -> deliver_review has no max_visits',
  },
  {
    fault: 'a node the start cannot reach',
    workflow: faulty([['  exit     [shape=Msquare]\n', '  exit     [shape=Msquare]\n  orphan   [shape=box, agent="software-engineer", phase="DELIVER"]\n  orphan -> exit\n']]),
    reason: 'node orphan is unreachable from start',
  },
  {
    fault: 'an agent nobody provides',
    workflow: faulty([[`agent="${SECURITY_AGENT}"`, 'agent="acme-privacy-reviewer"']]),
    reason: 'node security: agent acme-privacy-reviewer not found in the plugin, .claude/agents/ or .github/agents/',
  },
].map((refused) => Object.freeze({ ...refused, reason: `.skraft/pipeline.skraft.dot is invalid: ${refused.reason}` })))

/** Writes `workflow` as the working copy's .skraft/pipeline.skraft.dot. @param {string} cwd @param {string} workflow */
export const designateWorkflow = (cwd, workflow) => {
  mkdirSync(join(cwd, '.skraft'), { recursive: true })
  writeFileSync(join(cwd, '.skraft', 'pipeline.skraft.dot'), workflow)
}

/** A repository lens: the agent `acme-security-lens`. */
export const SECURITY_LENS = 'acme-security'

/**
 * Writes into .skraft/review.skraft.dot the plugin's review without its mandatory lens
 * test-integrity; returns the reason every host refuses it with.
 * @param {string} cwd a working copy
 */
export const dropMandatoryLens = (cwd) => {
  const shipped = readFileSync(join(PLUGIN_ROOT, 'workflows', 'review.skraft.dot'), 'utf8')
  const dropped = shipped
    .replace('  test_integrity          [shape=note, lens="test-integrity", mandatory=true]\n', '')
    .replace('  lenses -> test_integrity -> refuter\n', '')
  if (dropped.length >= shipped.length - 60) throw new Error('the plugin review.skraft.dot no longer holds test_integrity')
  mkdirSync(join(cwd, '.skraft'), { recursive: true })
  writeFileSync(join(cwd, '.skraft/review.skraft.dot'), dropped)
  return '.skraft/pipeline.skraft.dot is invalid: mandatory node test_integrity (lens test-integrity between lenses and verdict of review) is missing; this node is mandatory and cannot be removed'
}

/** A repository workflow: the plugin's, its design review with the repository lens last. */
export const LENS_WORKFLOW = readFileSync(join(PLUGIN_ROOT, 'workflows', 'pipeline.skraft.dot'), 'utf8')
  .replace('  design_review [shape=tripleoctagon, mandatory=true]\n', `  design_review_acme_security [shape=note, lens="${SECURITY_LENS}"]\n  design_review [shape=tripleoctagon, mandatory=true]\n`)
  .replace('  design_review_lenses -> design_review_fitness -> design_review_refuter\n', '  design_review_lenses -> design_review_fitness -> design_review_refuter\n  design_review_lenses -> design_review_acme_security -> design_review_refuter\n')

/** @param {string} cwd @param {string} agent @param {string} description @param {string[]} [skills] the skills its front matter lists */
const repositoryAgent = (cwd, agent, description, skills = []) => {
  const listed = skills.length === 0 ? '' : `metadata:\n  skills:\n${skills.map((skill) => `    - ${skill}\n`).join('')}`
  for (const [folder, name] of [['.claude', `${agent}.md`], ['.github', `${agent}.agent.md`]]) {
    mkdirSync(join(cwd, folder, 'agents'), { recursive: true })
    writeFileSync(join(cwd, folder, 'agents', name), `---\nname: ${agent}\ndescription: ${description}\n${listed}---\nReview the design.\n`)
  }
}

/**
 * A repository on `main` with one JavaScript component `app` at its root,, the tracking folder and the reports folder ignored, and the Git identity a developer's machine has, which the engine commits a
 * ratification with. Its skraft-config.json has answered the publish consent with `publish`
 * (no pull request), unless `publish` is null, when the run asks. With `security`, it runs SECURITY_WORKFLOW and defines its repository agent for
 * both hosts; with `lens`, it runs LENS_WORKFLOW and defines its repository lens for both hosts,
 * listing `lensSkills` under `skills:`.
 * @param {import('node:test').TestContext} t
 * @param {{ security?: boolean, lens?: boolean, lensSkills?: string[] }} [options]
 */
/** The three tiers, with a model for each host. */
export const FAMILY_MODELS = Object.freeze({
  economy: { 'claude-code': { model: 'haiku' }, copilot: { model: 'copilot-small' } },
  standard: { 'claude-code': { model: 'sonnet' }, copilot: { model: 'copilot-medium' } },
  frontier: { 'claude-code': { model: 'opus' }, copilot: { model: 'copilot-large' } },
})

/** The bytes of a screenshot: a PNG signature, then bytes no text encoding keeps as they are. */
export const screenshotBytes = (theme) => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0x0d, 0x0a, ...Buffer.from(theme)])

/**
 * `web/tools/playwright.mjs`: Playwright in miniature, its light and dark projects each taking a
 * screenshot of the checkout, then its reporter writing the manifest the engine reads.
 */
export const PLAYWRIGHT = [
  "import { mkdirSync, writeFileSync } from 'node:fs'",
  "mkdirSync('skraft-visuals', { recursive: true })",
  "const png = (theme) => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0x0d, 0x0a, ...Buffer.from(theme)])",
  "for (const theme of ['light', 'dark']) writeFileSync(`skraft-visuals/checkout-${theme}.png`, png(theme))",
  "writeFileSync('skraft-visuals/manifest.json', JSON.stringify({ screenshots: ['light', 'dark'].map((theme) => ({ title: 'Checkout, card paid', theme, path: `skraft-visuals/checkout-${theme}.png` })) }))",
  "console.log('2 passed')",
  '',
].join('\n')

/** The `web` front end: a build that passes and an e2e command that runs PLAYWRIGHT, by node's absolute path. */
export const WEB = Object.freeze({
  name: 'web', root: 'web', stack: 'react', bdd: false, mocking: { strategy: 'inprocess' },
  paths: { src: ['src'], tests: ['tests'] },
  commands: { build: `"${process.execPath}" tools/build.mjs`, e2e: `"${process.execPath}" tools/playwright.mjs` },
})

/**
 * With `frontend`, the repository also holds WEB, its screenshots folder ignored as a developer
 * ignores Playwright's output. `tdd`, when given, is the configuration's `tdd` key. With `contractTesting`,
 * `app` turns contract testing on. Each folder of `skills`, relative to the working copy, holds a
 * SKILL.md of the working copy.
 */
/** The publication consents settled, as /skraft-init leaves them: a configuration a run may start on. */
export const SETTLED_PUBLISH = Object.freeze({ pullRequest: false, visuals: false, questionVersions: Object.freeze({ pullRequest: 2, visuals: 1 }) })

export const pipelineRepository = (t, { security = false, lens = false, lensSkills = [], models, tdd, publish = SETTLED_PUBLISH, frontend = false, contractTesting = false, skills = [] } = {}) => {
  const cwd = join(tempFolder(t, 'skraft-pipeline-'), 'payment')
  mkdirSync(cwd)
  const config = {
    ...(models === undefined ? {} : { models }),
    ...(publish === null ? {} : { publish }),
    ...(tdd === undefined ? {} : { tdd }),
    components: [{
      name: 'app', root: '.', stack: 'javascript', bdd: false, mocking: { strategy: 'inprocess' },
      paths: { src: ['src'], tests: ['tests'] },
      commands: { test: TEST_COMMAND },
      ...(contractTesting ? { contractTesting: true } : {}),
    }, ...(frontend ? [WEB] : [])],
  }
  if (frontend) {
    mkdirSync(join(cwd, 'web', 'tools'), { recursive: true })
    writeFileSync(join(cwd, 'web', 'tools', 'build.mjs'), "console.log('built')\n")
    writeFileSync(join(cwd, 'web', 'tools', 'playwright.mjs'), PLAYWRIGHT)
    writeFileSync(join(cwd, 'web', '.gitignore'), 'skraft-visuals/\n')
  }
  writeFileSync(join(cwd, 'skraft-config.json'), `${JSON.stringify(config, null, 2)}\n`)
  writeFileSync(join(cwd, 'skraft-config.local.json'), `${JSON.stringify({ configurationConfirmed: true })}\n`)
  writeFileSync(join(cwd, '.gitignore'), '.copilot-tracking/\nreports/\nskraft-config.local.json\n')
  writeFileSync(join(cwd, 'README.md'), '# payment\n')
  for (const folder of skills) writeFile(join(cwd, ...folder.split('/'), 'SKILL.md'), `---\nname: ${folder.split('/').at(-1)}\n---\n`)
  if (security) {
    mkdirSync(join(cwd, '.skraft'), { recursive: true })
    writeFileSync(join(cwd, '.skraft/pipeline.skraft.dot'), SECURITY_WORKFLOW)
    repositoryAgent(cwd, SECURITY_AGENT, 'Reviews the design for security')
  }
  if (lens) {
    mkdirSync(join(cwd, '.skraft'), { recursive: true })
    writeFileSync(join(cwd, '.skraft/pipeline.skraft.dot'), LENS_WORKFLOW)
    repositoryAgent(cwd, `${SECURITY_LENS}-lens`, 'Reviews the design for security, as a lens', lensSkills)
  }
  const main = commitAll(cwd)
  for (const [key, value] of [['user.name', 'skraft'], ['user.email', 'skraft@example.invalid'], ['commit.gpgsign', 'false']]) git(cwd, 'config', key, value)
  return { cwd, main }
}

/**
 * What a run with a front end leaves on a GitHub remote, whichever driver ran it: the screenshots
 * where Playwright wrote them, nothing committed, and the pull request's body referring to each by
 * its path, which gh rewrites once it attached the file.
 * @param {string} cwd @param {Array<Record<string, any>>} events
 */
export const visualsKept = (cwd, events) => {
  const shots = 'web/skraft-visuals'
  const step = events.find((event) => event.type === 'step.recorded' && event.step === 'visuals')
  assert.deepEqual([step.outcome, step.next, step.reason], ['recorded', 'pr_writer', '2 screenshots to attach to the pull request'])
  assert.equal(git(cwd, 'log', '--format=%s', '--grep=docs(evidence)', '--fixed-strings'), '')
  for (const theme of ['light', 'dark']) assert.deepEqual(readFileSync(join(cwd, 'web', 'skraft-visuals', `checkout-${theme}.png`)), screenshotBytes(theme))
  const body = readFileSync(join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'pull-request-body.md'), 'utf8')
  assert.ok(body.includes([
    '<details><summary>Screenshots</summary>',
    '',
    '- web: e2e run passed (`' + WEB.commands.e2e + '`, evidence `logs/runs/deliver-1-1/13.log`); 2 screenshots attached to the pull request',
    '',
    `![Checkout, card paid](./${shots}/checkout-light.png)`,
    '',
    '<details><summary>Dark theme</summary>',
    '',
    `![Checkout, card paid](./${shots}/checkout-dark.png)`,
    '',
    '</details>',
  ].join('\n')), body)
}

/**
 * What a run of the story #42 on the forge of issueForge, the developer consenting, keeps on its
 * issue, whichever driver ran it: each phase closed and the summary, journaled skipped since that
 * forge takes no comment, the one comment kept in the tracking folder, its head as the engine renders it.
 * @param {string} cwd @param {Array<Record<string, any>>} events
 */
export const issueProgressKept = (cwd, events) => {
  const reason = NO_COMMENT
  assert.deepEqual(events.filter((event) => event.type.startsWith('issue.')).map(({ type, kind, phase, issue, reason: why }) => [type, kind, phase, issue, why]), [
    ...['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'PUBLISH'].map((phase) => ['issue.comment-skipped', 'phase', phase, 42, reason]),
    ['issue.comment-skipped', 'summary', null, 42, reason],
  ])
  const body = readFileSync(join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'issue-progress.md'), 'utf8')
  assert.ok(body.startsWith([
    `<!-- skraft:issue-progress slug=${SLUG} -->`, `### skraft · ${SLUG} — run done`, '', 'done', '',
    '- [x] RESEARCH', '- [x] DESIGN', '- [x] DISTILL', '- [x] DELIVER', '- [x] PUBLISH', '',
  ].join('\n')), body)
  assert.ok(body.includes('\nQuality evidence:\n- build · `.` · `logs/runs/deliver-1-1/1.log`\n- format · `.` · `logs/runs/deliver-1-1/2.log`\n- lint · `.` · `logs/runs/deliver-1-1/3.log`\n- test · `.` · `logs/runs/deliver-1-1/4.log`\n- architecture · `.` · `logs/runs/deliver-1-1/5.log`\n- coverage · `.` · `logs/runs/deliver-1-1/6.log`\n\nPull request: none opened or updated by this run.\n'), body)
}

/**
 * What a brief asks for.
 * @param {string} prompt
 */
export const briefOf = (prompt) => {
  const lines = prompt.split('\n')
  const header = /^## Skraft dispatch: (\S+) \(([A-Z_0-9]+)\)$/.exec(lines[0] ?? '')
  /** The absolute paths listed under the line that starts with `title`. @param {string} title */
  const listed = (title) => {
    const from = lines.findIndex((line) => line.startsWith(title))
    if (from < 0) return []
    const paths = []
    for (const line of lines.slice(from + 1)) {
      const path = line.startsWith('- ') ? line.slice(2) : null
      if (path === null || !isAbsolute(path)) break
      paths.push(path)
    }
    return paths
  }
  const result = lines.map((line) => /^- Write your result as JSON to (.+): \{/.exec(line)).find(Boolean)?.[1] ?? null
  const nowhereAt = lines.findIndex((line) => line.startsWith('- Skills your components ask for that exist nowhere'))
  const nowhere = nowhereAt < 0 ? [] : lines.slice(nowhereAt + 1)
  const named = nowhere.findIndex((line) => !/^- \S+ \(\S+\)$/.test(line))
  return {
    agent: header?.[1] ?? null,
    phase: header?.[2] ?? null,
    skills: listed('- Skills (read each before you start):'),
    nowhere: nowhere.slice(0, named < 0 ? nowhere.length : named).map((line) => line.slice(2)),
    inputs: listed('- Read first:'),
    outputs: listed('- Fill each output in place'),
    missing: listed('Missing outputs from'),
    result,
    prompt,
  }
}

/**
 * What the briefs of a run on a repository whose `app` turns contract testing on, its working
 * copy holding the SKILL.md of `mocking-inprocess-javascript` in `skillFolder`, ask the agents to
 * read: the TDD cycle the SKILL.md of its components' skills, the working copy's and the
 * plugin's, then the one found nowhere; the agents before it, no skill.
 * @param {string} cwd @param {string} skillFolder @param {string[]} prompts every brief of the run, in dispatch order
 */
export const componentSkillsBriefed = (cwd, skillFolder, prompts) => {
  const briefs = prompts.map(briefOf).filter(({ agent }) => agent !== null)
  const slashed = (/** @type {string[]} */ paths) => paths.map((path) => path.replace(/\\/g, '/'))
  assert.deepEqual(briefs.map(({ agent, skills, nowhere }) => [agent, slashed(skills), nowhere]), [
    ['solution-researcher', [], []],
    ['solution-architect', [], []],
    ['acceptance-designer', [], []],
    ['software-engineer', slashed([join(cwd, ...skillFolder.split('/'), 'SKILL.md'), join(PLUGIN_ROOT, 'skills', 'contract-testing', 'SKILL.md')]), ['contract-testing-javascript (app)']],
  ])
  for (const path of briefs[3].skills) assert.ok(readFileSync(path, 'utf8').startsWith('---\nname: '), path)
}

/** @param {string} path @param {string} text */
const writeFile = (path, text) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text, 'utf8')
}

/** @param {string} template */
export const filledResearch = (template) => template.replace(/\{\{[^{}]*\}\}/g, 'filled in')
  .replace('(Source: filled in)', '(Source: https://example.com/research)')
  .replace('| filled in | filled in | filled in |', '| | | |')
  .replace('structural patterns DESIGN reuses: filled in -> filled in', 'structural patterns DESIGN reuses:')

/** Fills every output of the brief: the pre-created text with its placeholders filled, then `text`. */
export const fillOutputs = (brief, text = 'Findings.\n') => {
  for (const path of brief.outputs) {
    let before = ''
    try {
      before = readFileSync(path, 'utf8')
    } catch {
      // the engine pre-created nothing at this path
    }
    const output = brief.agent === 'solution-researcher' ? filledResearch(before) : before.replace(/\{\{[^{}]*\}\}/g, 'filled in')
    writeFile(path, `${output}\n${text}`)
  }
}

/** Writes the result JSON the brief names; a string is written as is. @param {object | string} value */
export const writeResult = (brief, value) => writeFile(brief.result, typeof value === 'string' ? value : JSON.stringify(value))

/**
 * Writes (or with null, deletes) files of the repository, then commits them with `subject`,
 * and the body the brief asks for when one is given.
 * @param {string} cwd @param {string} subject @param {Record<string, string | null>} files
 * @param {{ prompt: string }} [brief]
 */
export const commit = (cwd, subject, files, brief) => {
  for (const [path, text] of Object.entries(files)) {
    if (text === null) rmSync(join(cwd, ...path.split('/')), { force: true })
    else writeFile(join(cwd, ...path.split('/')), text)
  }
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '-m', messageFor(subject, brief))
}

/** The subject, with `Refs: #<issue>` as the body when the brief asks every commit to end with it. @param {string} subject @param {{ prompt: string }} [brief] */
const messageFor = (subject, brief) => {
  const refs = /End every commit body with `(Refs: #\d+)`/.exec(brief?.prompt ?? '')
  return refs ? `${subject}\n\n${refs[1]}` : subject
}

/**
 * @typedef {ReturnType<typeof briefOf>} Brief
 * @typedef {(brief: Brief, repository: { cwd: string, slug: string }) => void} Act
 *   what one agent does in one dispatch.
 */

/** @param {string} summary @returns {Act} */
export const blocked = (summary) => (brief) => writeResult(brief, { status: 'blocked', summary })

/** Fills its outputs and writes a result, nothing else. @param {object | string} [result] @returns {Act} */
export const writesOnly = (result = { status: 'done', summary: 'outputs written' }) => (brief) => {
  fillOutputs(brief)
  writeResult(brief, result)
}

/** Whether the brief puts the groups of the story's scenarios in the engineer's hands. @param {Brief} brief */
const onScenario = (brief) => brief.prompt.includes('\n- Groups, in the order you work them')

/**
 * The engineer's work: on the groups of the story, the one green commit of the code with its unit
 * test, once the group passes; on a pass with none (the gates or the review sent the work back, or a
 * workflow that builds no scenario), its TDD cycle: a red test commit while the code is missing
 * or wrong, then the code.
 * @param {string} code what src/pay.mjs holds once it is done
 * @returns {Act}
 */
export const deliverWith = (code) => (brief, { cwd, slug }) => {
  const fixing = brief.prompt.includes('The gates failed on pass')
  fillOutputs(brief, fixing ? 'Fixed the amount.\n' : 'Paid by card.\n')
  const test = { [`tests/pay-${fixing ? 'fix' : 'amount'}.md`]: 'pay(10) answers paid 10\n' }
  if (onScenario(brief)) commit(cwd, `feat(${slug}): S1 pay by card`, { ...test, 'src/pay.mjs': code }, brief)
  else if (fixing) commit(cwd, `fix(${slug}): pay answers the amount paid`, { ...test, 'src/pay.mjs': code }, brief)
  else {
    commit(cwd, `test(${slug}): pay a card amount`, test, brief)
    commit(cwd, `feat(${slug}): pay by card`, { 'src/pay.mjs': code }, brief)
  }
  traceDelivery(cwd, slug)
  writeResult(brief, { status: 'done', summary: 'delivered' })
}

/** The Scenarios table of the test plan: the story's one scenario, its walking skeleton, in `app`. */
export const SCENARIOS = '\n## Scenarios\n\n| # | Scenario | Component | Tags |\n|---|---|---|---|\n| S1 | Customer pays by card | app | @walking-skeleton |\n'

/** The acceptance test of S1, as the acceptance designer commits it beside the walking skeleton. */
export const FIRST_ACCEPTANCE = Object.freeze({ path: 'tests/acceptance/customer-pays-by-card.md', text: 'Given a basket of 10\nWhen the customer pays by card\nThen pay(10) answers paid 10\n' })

/** The last commit whose subject is `subject`, by its short sha. @param {string} cwd @param {string} subject */
const shortShaOf = (cwd, subject) => git(cwd, 'log', '-1', '--format=%H', '--fixed-strings', `--grep=${subject}`).slice(0, 7)

/**
 * What the human is asked to read before DELIVER, on a run whose acceptance designer acts as
 * NOMINAL's: the story's one scenario in one group, and the last red commit DISTILL made of its
 * walking skeleton and acceptance test.
 * @param {string} cwd @param {string} [slug]
 */
export const scenarioReviewText = (cwd, slug = SLUG, visit = 1) => {
  const red = `test(${slug}): pay by card`
  const log = join(realpathSync(cwd), '.copilot-tracking', 'skraft-plans', slug, 'logs', 'runs', `distill-${visit}-1`, '1.log')
  return `Read the 1 scenario of the story before DELIVER builds them: S1 "Customer pays by card" (app; @walking-skeleton). DELIVER makes them pass in one pass and one commit, working the groups in this order: 1. S1. The acceptance tests of every scenario, the walking skeleton and the skeleton of its chain are commit ${shortShaOf(cwd, red)} "${red}": src/pay.mjs, ${FIRST_ACCEPTANCE.path}, tests/unit/check.mjs. skraft does not run them: check that each fails on its own assertion; the designer's traced run is in ${log}. APPROVED delivers them; REVISE sends DISTILL back with your corrections (edit the .feature or the test yourself first if you like, and say so).`
}

/**
 * The acceptance designer as its descriptor asks: `check` as the failing walking skeleton and the
 * acceptance test of S1, with the skeleton they call, in one red commit, its test plan listing the
 * story's scenario; a pass that finds them already committed (DISTILL sent back) commits nothing.
 * @param {string} check @returns {Act}
 */
export const acceptanceWith = (check) => (brief, { cwd, slug }) => {
  fillOutputs(brief, `pay(10) answers paid 10.\n${SCENARIOS}`)
  const files = { 'tests/unit/check.mjs': check, 'src/pay.mjs': SKELETON, [FIRST_ACCEPTANCE.path]: FIRST_ACCEPTANCE.text }
  const written = Object.entries(files).every(([path, text]) => existsSync(join(cwd, ...path.split('/'))) && readFileSync(join(cwd, ...path.split('/')), 'utf8') === text)
  if (!written) commit(cwd, `test(${slug}): pay by card`, files, brief)
  traceRed(cwd, slug)
  writeResult(brief, { status: 'done', summary: 'acceptance tests committed red' })
}

const CONTEXT_MAP = 'docs/architecture/context-map.md'

/** What each agent of the plugin's workflow does when it does its job. @type {Record<string, Act>} */
export const NOMINAL = Object.freeze({
  'solution-researcher': (brief) => {
    fillOutputs(brief, '## Key discoveries\nNo payment code exists yet.\n')
    writeResult(brief, { status: 'done', summary: 'research written' })
  },
  'solution-architect': (brief, { cwd, slug }) => {
    fillOutputs(brief, 'The payment lives in src/pay.mjs.\n')
    writeFile(join(dirname(brief.outputs[0]), `consistency-matrix-${slug}.md`), '| ADR | Verdict |\n- docs-relied-on: docs/architecture/context-map.md\n- consistency-gate: PASS\n')
    const revising = brief.prompt.includes('A human refused the work')
    const adr = revising ? `${ADR}\nRevised after the human's reason.\n` : ADR
    const contextMap = revising ? 'Payment: Core, revised.\n' : 'Payment: Core.\n'
    for (const [path, text] of Object.entries({ [ADR_PATH]: adr, [INDEX_PATH]: decisionsIndex(1), [CONTEXT_MAP]: contextMap })) writeFile(join(cwd, ...path.split('/')), text)

    writeResult(brief, { status: 'done', summary: 'context map and ADR written' })
  },
  'acceptance-designer': acceptanceWith(CHECK),
  'software-engineer': deliverWith(PAY),
  'pr-writer': (brief) => {
    const [output] = brief.outputs
    writeFile(output, readFileSync(output, 'utf8')
      .replace('{{summary}}', 'Pay by card at checkout')
      .replace('{{what}}', 'pay(amount) answers what was paid.')
      .replace('{{why}}', 'Customers pay by card.')
      .replace('{{limitations}}', 'Refunds are out of scope.'))
    writeResult(brief, { status: 'done', summary: 'prose written' })
  },
  [SECURITY_AGENT]: (brief) => writeResult(brief, { status: 'done', summary: 'no security finding' }),
})

/** The lenses of the plugin workflow's review nodes, in node order; deliver_review's triggered lenses left out. */
export const LENSES = Object.freeze({
  design_review: ['consistency', 'architecture-compliance', 'fitness'],
  distill_review: ['coverage', 'business-alignment', 'testability', 'boundary-enforcement'],
  deliver_review: ['test-integrity', 'architecture-boundaries', 'cold-reader', 'quality-gates'],
})

/**
 * The labels a review node's lenses are started under, in node order.
 * @param {keyof typeof LENSES} node @param {{ visit?: number, attempt?: number, lenses?: string[] }} [options]
 */
export const lensLabels = (node, { visit = 1, attempt = 1, lenses = LENSES[node] } = {}) =>
  lenses.map((lens) => `skraft ${SLUG} · ${node} · ${lens}${visit > 1 ? ` · pass ${visit}` : ''} · attempt ${attempt}`)

/**
 * `<agent> | <label>` of each lens a review node starts, the plugin's lenses by their plugin id.
 * @param {keyof typeof LENSES} node @param {Parameters<typeof lensLabels>[1]} [options]
 */
export const lensDispatches = (node, options = {}) => {
  const lenses = options.lenses ?? LENSES[node]
  const labels = lensLabels(node, { ...options, lenses })
  return lenses.map((lens, index) => `skraft:${lens}-lens | ${labels[index]}`)
}

/**
 * The lines in order, the lenses each review node starts together sorted among themselves: a
 * host may start them in any order. A line names its node by ` · <node>_review · `.
 * @param {string[]} lines
 */
export const batchesSorted = (lines) => {
  const nodeOf = (/** @type {string} */ line) => / · (\w+_review) · /.exec(line)?.[1] ?? null
  /** @type {string[][]} */
  const groups = []
  for (const line of lines) {
    const last = groups.at(-1)
    if (last && nodeOf(line) !== null && nodeOf(last[0]) === nodeOf(line)) last.push(line)
    else groups.push([line])
  }
  return groups.flatMap((group) => [...group].sort())
}

/** The step.recorded of the review nodes: step, visit, outcome, next. @param {object[]} events */
export const reviewsOf = (events) => events
  .filter((event) => event.type === 'step.recorded' && event.step.endsWith('_review'))
  .map(({ step, visit, outcome, next }) => [step, visit, outcome, next])

/**
 * A lens's answer as its final message.
 * @param {string} lens @param {'pass' | 'fail' | 'inconclusive'} verdict @param {object[]} [findings]
 */
export const says = (lens, verdict, findings = []) => `I read the inputs.\n\n\`\`\`yaml\n${answerYaml({ lens, verdict, findings })}\n\`\`\``

/** A finding of a lens's answer. @param {string} id @param {string} severity @param {string} description @param {object} [more] */
export const finding = (id, severity, description, more = {}) => withContext({ id, gate: 'G1', severity, location: 'docs/adr/adr-001-card-payment.md:3', description, suggestion: 'name the provider', ...more })

/** The refuter's answer. @param {'confirmed' | 'refuted' | 'unverifiable'} verdict @param {string} [reason] */
export const refutes = (verdict, reason = `${verdict} by the patch`) => answerYaml({ verdict, reason })

/** The refuter's answer on several findings at one line, each its own verdict. @param {Array<[string, string, string?]>} each `<lens> <id>`, verdict, reason */
export const checksOf = (each) => answerYaml({ checks: each.map(([finding, verdict, reason = `${verdict} by the patch`]) => ({ finding, verdict, reason })) })

/**
 * What a review brief asks: the lens it names, or `refuter` with the lens and finding it checks
 * (the first of a group of several); null for a phase agent's brief.
 * @param {string} prompt
 * @returns {{ name: string, lens: string, finding: string | null, prompt: string } | null}
 */
export const reviewBriefOf = (prompt) => {
  const first = prompt.split('\n')[0] ?? ''
  const lens = /^## Skraft review lens: (\S+)/.exec(first)
  if (lens) return { name: lens[1], lens: lens[1], finding: null, prompt }
  const check = /^## Skraft finding check: (\S+) (\S+?)(?:, .+)?$/.exec(first)
  return check ? { name: 'refuter', lens: check[1], finding: check[2], prompt } : null
}

/**
 * @typedef {string | ((brief: NonNullable<ReturnType<typeof reviewBriefOf>>) => string)} ReviewAnswer
 *   what one lens or the refuter answers to one brief: its final message.
 */

/**
 * The scripted LLM of one run: each dispatch is answered by the next act queued for its agent,
 * else by its NOMINAL act. A lens `<name>` answers the next of `reviews[name]`, the refuter the
 * next of `reviews.refuter`; what a queue does not script passes, or is confirmed.
 * `dispatched` lists the phase briefs in dispatch order, `reviewed` the lens and refuter briefs.
 * @param {{ cwd: string, slug?: string, acts?: Record<string, Act[]>, reviews?: Record<string, ReviewAnswer[]> }} options
 */
export const scriptedLlm = ({ cwd, slug = SLUG, acts = {}, reviews = {} }) => {
  const queues = Object.fromEntries(Object.entries(acts).map(([agent, list]) => [agent, [...list]]))
  const answers = Object.fromEntries(Object.entries(reviews).map(([name, list]) => [name, [...list]]))
  /** @type {Brief[]} */
  const dispatched = []
  /** @type {Array<NonNullable<ReturnType<typeof reviewBriefOf>>>} */
  const reviewed = []
  /** @param {NonNullable<ReturnType<typeof reviewBriefOf>>} brief @returns {string} */
  const review = (brief) => {
    reviewed.push(brief)
    const next = answers[brief.name]?.shift()
    if (typeof next === 'function') return next(brief)
    if (next !== undefined) return next
    return brief.name === 'refuter' ? refutes('confirmed') : says(brief.lens, 'pass')
  }
  return {
    dispatched,
    reviewed,
    /**
     * Acts on one brief, as the agent it names; a lens or the refuter returns its final message.
     * @param {string} prompt @returns {string | undefined}
     */
    act: (prompt) => {
      const asked = reviewBriefOf(prompt)
      if (asked !== null) return review(asked)
      const brief = briefOf(prompt)
      dispatched.push(brief)
      const act = queues[/** @type {string} */ (brief.agent)]?.shift() ?? NOMINAL[/** @type {string} */ (brief.agent)]
      if (!act) throw new Error(`no scripted act for ${brief.agent}`)
      act(brief, { cwd, slug })
      return undefined
    },
  }
}
