// A real repository the whole pipeline runs on, and the scripted LLM that works in it. The
// agents act as a model would: they read their brief, fill the outputs it lists, write the
// result JSON it names, change files and make real Git commits. The gates then run the
// repository's real test command. No doubles: every driver test stages the same repository.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { answerYaml } from '../../unit/support/answer-yaml.mjs'
import { PLUGIN_ROOT, commitAll, git, tempFolder } from './workspace.mjs'
import { NO_COMMENT } from './issue-forge.mjs'

export const SLUG = 'checkout'

/** The test command of the `app` component: node by its absolute path, so no PATH is needed. */
export const TEST_COMMAND = `"${process.execPath}" tests/unit/check.mjs`

/** `tests/unit/check.mjs`, in the unit place of a JavaScript component: fails while `src/pay.mjs` is missing or `pay(10)` is not `paid 10`. */
export const CHECK = [
  "let pay",
  "try {",
  "  ({ pay } = await import('../../src/pay.mjs'))",
  "} catch {",
  "  console.error('src/pay.mjs is missing')",
  '  process.exit(1)',
  '}',
  "if (pay(10) !== 'paid 10') {",
  '  console.error(`pay(10) answered ${pay(10)}`)',
  '  process.exit(1)',
  '}',
  "console.log('pay ok')",
  '',
].join('\n')

export const PAY = 'export const pay = (amount) => `paid ${amount}`\n'
export const WRONG_PAY = 'export const pay = (amount) => `owed ${amount}`\n'
/** A pay that answers nothing to pay for zero, a branch `tests/unit/check.mjs` never takes: `>` mutated to `>=` survives. */
export const PAY_OR_NOTHING = "export const pay = (amount) => (amount > 0 ? `paid ${amount}` : 'nothing to pay')\n"

/** `tests/unit/zero.mjs`: the test that kills the `>=` mutant of PAY_OR_NOTHING. */
export const ZERO_CHECK = [
  "import { pay } from '../../src/pay.mjs'",
  "if (pay(0) !== 'nothing to pay') {",
  '  console.error(`pay(0) answered ${pay(0)}`)',
  '  process.exit(1)',
  '}',
  '',
].join('\n')

/** A software engineer that kills the `>=` mutant of PAY_OR_NOTHING with a test of its own. @type {Act} */
export const killsZero = (brief, { cwd, slug }) => {
  fillOutputs(brief, 'Killed the zero mutant.\n')
  commit(cwd, `test(${slug}): pay nothing for zero`, { 'tests/unit/zero.mjs': ZERO_CHECK })
  writeResult(brief, { status: 'done', summary: 'mutant killed' })
}

/** A software engineer that proposes the test that kills the `>=` mutant of PAY_OR_NOTHING, and changes no code. @type {Act} */
export const proposesZero = (brief) => {
  fillOutputs(brief, 'test: tests/unit/zero.mjs asserts that pay(0) answers nothing to pay.\n')
  writeResult(brief, { status: 'done', summary: 'proposal written' })
}

/** The mutation command of the `app` component: a mutation tool in miniature, by node's absolute path. */
export const MUTATION_COMMAND = `"${process.execPath}" tools/mutate.mjs`

/**
 * `tools/mutate.mjs`: each mutant is one text replacement in `src/pay.mjs`; a mutant some test of
 * `tests/unit/` fails on is killed. It writes the mutation-testing-elements report where
 * StrykerJS writes it, and exits 0 whatever survives, as StrykerJS does without a break threshold:
 * the engine judges the score from the report.
 */
export const MUTATE = [
  "import { spawnSync } from 'node:child_process'",
  "import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'",
  "const file = 'src/pay.mjs'",
  "const source = existsSync(file) ? readFileSync(file, 'utf8') : ''",
  "const tests = readdirSync('tests/unit').filter((name) => name.endsWith('.mjs'))",
  "const killedBy = () => tests.some((name) => spawnSync(process.execPath, [`tests/unit/${name}`]).status !== 0)",
  "const mutants = [['paid', 'owed', 'StringLiteral'], [' > ', ' >= ', 'EqualityOperator']].flatMap(([from, to, mutatorName], index) => {",
  '  const at = source.indexOf(from)',
  '  if (at < 0) return []',
  '  writeFileSync(file, `${source.slice(0, at)}${to}${source.slice(at + from.length)}`)',
  '  const line = source.slice(0, at).split(\'\\n\').length',
  "  return [{ id: String(index + 1), mutatorName, replacement: to.trim(), location: { start: { line, column: 1 }, end: { line, column: 1 } }, status: killedBy() ? 'Killed' : 'Survived' }]",
  '})',
  'if (source !== \'\') writeFileSync(file, source)',
  "mkdirSync('reports/mutation', { recursive: true })",
  "writeFileSync('reports/mutation/mutation.json', JSON.stringify({ schemaVersion: '1', thresholds: { high: 100, low: 100 }, files: { [file]: { language: 'javascript', source, mutants } } }))",
  '',
].join('\n')

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

/** A repository workflow: a reduced one, with the plugin's mandatory reviews and a repository agent between the architect and the design review. */
export const SECURITY_WORKFLOW = `digraph skraft {
  graph [version="2", goal="Deliver the story"]

  start    [shape=Mdiamond]
  research [shape=box, agent="solution-researcher", phase="RESEARCH"]
  design   [shape=box, agent="solution-architect", phase="DESIGN"]
  security [shape=box, agent="acme-security-reviewer"]
  distill  [shape=box, agent="acceptance-designer", phase="DISTILL"]
  deliver  [shape=box, agent="software-engineer", phase="DELIVER"]
  gates    [shape=parallelogram, gate="build,format,lint,test,architecture,coverage", goal_gate=true, locked=true, phase="DELIVER"]
  mutation [shape=parallelogram, gate="mutation", goal_gate=true, locked=true]
  exit     [shape=Msquare]
  design_review_lenses [shape=component]
  design_review_consistency [shape=note, lens="consistency"]
  design_review [shape=tripleoctagon, mandatory=true]
  distill_review_lenses [shape=component]
  distill_review_coverage [shape=note, lens="coverage"]
  distill_review [shape=tripleoctagon, mandatory=true]
  deliver_review [shape=house, workflow="review", mandatory=true]

  start -> research -> design -> security -> design_review_lenses -> design_review_consistency -> design_review
  design_review -> design [label="NEEDS_REWORK", max_visits=3]
  design_review -> distill [label="APPROVED"]
  distill -> distill_review_lenses -> distill_review_coverage -> distill_review
  distill_review -> distill [label="NEEDS_REWORK", max_visits=3]
  distill_review -> deliver [label="APPROVED"]
  deliver -> gates
  gates -> deliver [label="FAIL", max_visits=3]
  gates -> mutation [label="PASS"]
  mutation -> kill_mutants [label="FAIL", max_visits=5]
  kill_mutants [shape=box, agent="software-engineer", each="survivor-file"]
  mutation_review_lenses [shape=component]
  mutation_review_test_integrity [shape=note, lens="test-integrity"]
  mutation_review [shape=tripleoctagon, mandatory=true]
  kill_mutants -> mutation_review_lenses -> mutation_review_test_integrity -> mutation_review
  mutation_review -> kill_mutants [label="NEEDS_REWORK", max_visits=3]
  mutation_review -> gates [label="APPROVED"]
  mutation -> deliver_review [label="PASS"]
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
    fault: 'locked gates dropped without unlock',
    workflow: faulty([['gate="build,format,lint,test,architecture,coverage"', 'gate="build,format,lint,test"']]),
    reason: 'locked node gates drops architecture, coverage; keep them, or skip the node with unlock="<reason>"',
  },
  {
    fault: 'a loop without max_visits',
    workflow: faulty([['gates -> deliver [label="FAIL", max_visits=3]', 'gates -> deliver [label="FAIL"]']]),
    reason: 'loop gates -> deliver -> gates has no max_visits',
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
    .replace('  lenses -> test_integrity -> verdict\n', '')
  if (dropped.length >= shipped.length - 60) throw new Error('the plugin review.skraft.dot no longer holds test_integrity')
  mkdirSync(join(cwd, '.skraft'), { recursive: true })
  writeFileSync(join(cwd, '.skraft/review.skraft.dot'), dropped)
  return '.skraft/pipeline.skraft.dot is invalid: mandatory node test_integrity (lens test-integrity between lenses and verdict of review) is missing; this node is mandatory and cannot be removed'
}

/** A repository workflow: the plugin's, its design review with the repository lens last. */
export const LENS_WORKFLOW = readFileSync(join(PLUGIN_ROOT, 'workflows', 'pipeline.skraft.dot'), 'utf8')
  .replace('  design_review [shape=tripleoctagon, mandatory=true]\n', `  design_review_acme_security [shape=note, lens="${SECURITY_LENS}"]\n  design_review [shape=tripleoctagon, mandatory=true]\n`)
  .replace('  design_review_lenses -> design_review_fitness -> design_review\n', '  design_review_lenses -> design_review_fitness -> design_review\n  design_review_lenses -> design_review_acme_security -> design_review\n')

/** @param {string} cwd @param {string} agent @param {string} description @param {string[]} [skills] the skills its front matter lists */
const repositoryAgent = (cwd, agent, description, skills = []) => {
  const listed = skills.length === 0 ? '' : `metadata:\n  skills:\n${skills.map((skill) => `    - ${skill}\n`).join('')}`
  for (const [folder, name] of [['.claude', `${agent}.md`], ['.github', `${agent}.agent.md`]]) {
    mkdirSync(join(cwd, folder, 'agents'), { recursive: true })
    writeFileSync(join(cwd, folder, 'agents', name), `---\nname: ${agent}\ndescription: ${description}\n${listed}---\nReview the design.\n`)
  }
}

/**
 * A repository on `main` with one JavaScript component `app` at its root, mutated by
 * `tools/mutate.mjs`, the tracking folder and the mutation reports ignored, and the Git identity a developer's machine has, which the engine commits a
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

/** The `web` front end: a build that passes, a mutation run with nothing to mutate, and an e2e command that runs PLAYWRIGHT, by node's absolute path. */
export const WEB = Object.freeze({
  name: 'web', root: 'web', stack: 'react', mocking: { strategy: 'inprocess' },
  paths: { src: ['src'], tests: ['tests'] },
  commands: { build: `"${process.execPath}" tools/build.mjs`, mutation: `"${process.execPath}" tools/mutate.mjs`, e2e: `"${process.execPath}" tools/playwright.mjs` },
})

/** `web/tools/mutate.mjs`: a StrykerJS report of no file. */
const NOTHING_TO_MUTATE = [
  "import { mkdirSync, writeFileSync } from 'node:fs'",
  "mkdirSync('reports/mutation', { recursive: true })",
  "writeFileSync('reports/mutation/mutation.json', JSON.stringify({ schemaVersion: '1', thresholds: { high: 100, low: 100 }, files: {} }))",
  '',
].join('\n')

/**
 * With `frontend`, the repository also holds WEB, its screenshots folder ignored as a developer
 * ignores Playwright's output. `tdd`, when given, is the configuration's `tdd` key. With `contractTesting`,
 * `app` turns contract testing on. Each folder of `skills`, relative to the working copy, holds a
 * SKILL.md of the working copy.
 */
export const pipelineRepository = (t, { security = false, lens = false, lensSkills = [], models, tdd, publish = { pullRequest: false }, frontend = false, contractTesting = false, skills = [] } = {}) => {
  const cwd = join(tempFolder(t, 'skraft-pipeline-'), 'payment')
  mkdirSync(cwd)
  const config = {
    ...(models === undefined ? {} : { models }),
    ...(publish === null ? {} : { publish }),
    ...(tdd === undefined ? {} : { tdd }),
    components: [{
      name: 'app', root: '.', stack: 'javascript', mocking: { strategy: 'inprocess' },
      paths: { src: ['src'], tests: ['tests'] },
      commands: { test: TEST_COMMAND, mutation: MUTATION_COMMAND },
      ...(contractTesting ? { contractTesting: true } : {}),
    }, ...(frontend ? [WEB] : [])],
  }
  if (frontend) {
    mkdirSync(join(cwd, 'web', 'tools'), { recursive: true })
    writeFileSync(join(cwd, 'web', 'tools', 'build.mjs'), "console.log('built')\n")
    writeFileSync(join(cwd, 'web', 'tools', 'playwright.mjs'), PLAYWRIGHT)
    writeFileSync(join(cwd, 'web', 'tools', 'mutate.mjs'), NOTHING_TO_MUTATE)
    writeFileSync(join(cwd, 'web', '.gitignore'), 'skraft-visuals/\n')
  }
  writeFileSync(join(cwd, 'skraft-config.json'), `${JSON.stringify(config, null, 2)}\n`)
  writeFileSync(join(cwd, 'skraft-config.local.json'), `${JSON.stringify({ configurationConfirmed: true })}\n`)
  writeFileSync(join(cwd, '.gitignore'), '.copilot-tracking/\nreports/\nskraft-config.local.json\n')
  mkdirSync(join(cwd, 'tools'))
  writeFileSync(join(cwd, 'tools', 'mutate.mjs'), MUTATE)
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
 * What a run of a repository with `frontend` left: its visuals step, the commit that holds the
 * screenshots, each byte for byte in the story's evidence folder, and the pull request's Screenshots
 * section, which links them at that commit on the forge the story's issue is on (issueForge).
 * @param {string} cwd @param {object[]} events
 */
export const visualsKept = (cwd, events) => {
  const forge = 'https://github.example.com/acme/payment/raw'
  const evidence = `.copilot-tracking/skraft-plans/${SLUG}/evidence/${SLUG}/web`
  const step = events.find((event) => event.type === 'step.recorded' && event.step === 'visuals')
  const sha = git(cwd, 'log', '-1', '--format=%H', '--', evidence)
  assert.deepEqual([step.outcome, step.next, step.reason], ['recorded', 'pr_writer', `2 screenshots committed in ${sha}`])
  assert.equal(git(cwd, 'log', '-1', '--format=%B', sha), 'docs(evidence): screenshots of web\n\nRefs: #42')
  assert.deepEqual(git(cwd, 'show', '--name-only', '--format=', sha).split('\n'), [`${evidence}/dark-1.png`, `${evidence}/light-1.png`])
  for (const theme of ['light', 'dark']) assert.deepEqual(readFileSync(join(cwd, ...evidence.split('/'), `${theme}-1.png`)), screenshotBytes(theme))
  const body = readFileSync(join(cwd, '.copilot-tracking', 'skraft-plans', SLUG, 'pull-request-body.md'), 'utf8')
  assert.ok(body.includes([
    '<details><summary>Screenshots</summary>',
    '',
    '- web: e2e run passed (`' + WEB.commands.e2e + '`, evidence `visuals/web/e2e-1.log`); 2 screenshots committed',
    '',
    `![Checkout, card paid](${forge}/${sha}/${evidence}/light-1.png)`,
    '',
    '<details><summary>Dark theme</summary>',
    '',
    `![Checkout, card paid](${forge}/${sha}/${evidence}/dark-1.png)`,
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
  assert.ok(body.includes('\nQuality gates:\n- app/test pass · `gates/app/test-1.log`\n- app/mutation pass · `gates/app/mutation-1.log`\n\nPull request: none opened or updated by this run.\n'), body)
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

/** Fills every output of the brief: the pre-created text with its placeholders filled, then `text`. */
export const fillOutputs = (brief, text = 'Findings.\n') => {
  for (const path of brief.outputs) {
    let before = ''
    try {
      before = readFileSync(path, 'utf8')
    } catch {
      // the engine pre-created nothing at this path
    }
    writeFile(path, `${before.replace(/\{\{[^{}]*\}\}/g, 'filled in')}\n${text}`)
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

/**
 * The engineer's TDD cycle: a red test commit while the code is missing or wrong, then the code.
 * @param {string} code what src/pay.mjs holds once it is done
 * @returns {Act}
 */
export const deliverWith = (code) => (brief, { cwd, slug }) => {
  const fixing = brief.prompt.includes('The gates failed on pass')
  fillOutputs(brief, fixing ? 'Fixed the amount.\n' : 'Paid by card.\n')
  commit(cwd, `test(${slug}): ${fixing ? 'pay answers the amount paid' : 'pay a card amount'}`, { [`tests/pay-${fixing ? 'fix' : 'amount'}.md`]: 'pay(10) answers paid 10\n' }, brief)
  commit(cwd, `${fixing ? 'fix' : 'feat'}(${slug}): pay by card`, { 'src/pay.mjs': code }, brief)
  writeResult(brief, { status: 'done', summary: 'delivered' })
}

/**
 * CHECK taking a second to fail while src/pay.mjs is missing: replaying a red commit then takes
 * longer than the agent's work, on any machine.
 */
export const SLOW_CHECK = CHECK.replace('} catch {\n', '} catch {\n  await new Promise((resolve) => setTimeout(resolve, 1000))\n')

/** The acceptance designer committing `check` as its failing acceptance test. @param {string} check @returns {Act} */
export const acceptanceWith = (check) => (brief, { cwd, slug }) => {
  fillOutputs(brief, 'pay(10) answers paid 10.\n')
  commit(cwd, `test(${slug}): pay by card`, { 'tests/unit/check.mjs': check }, brief)
  writeResult(brief, { status: 'done', summary: 'acceptance test committed red' })
}

/** The engineer's TDD cycle opened by two red commits of the story while src/pay.mjs is missing, then the code. @type {Act} */
export const twoRedsThenPay = (brief, { cwd, slug }) => {
  fillOutputs(brief, 'Paid by card.\n')
  commit(cwd, `test(${slug}): pay a card amount`, { 'tests/pay-amount.md': 'pay(10) answers paid 10\n' }, brief)
  commit(cwd, `test(${slug}): pay by card twice`, { 'tests/pay-twice.md': 'pay(10) answers paid 10 each time\n' }, brief)
  commit(cwd, `feat(${slug}): pay by card`, { 'src/pay.mjs': PAY }, brief)
  writeResult(brief, { status: 'done', summary: 'delivered' })
}

/** What each agent of the plugin's workflow does when it does its job. @type {Record<string, Act>} */
export const NOMINAL = Object.freeze({
  'solution-researcher': (brief) => {
    fillOutputs(brief, '## Key discoveries\nNo payment code exists yet.\n')
    writeResult(brief, { status: 'done', summary: 'research written' })
  },
  'solution-architect': (brief, { cwd, slug }) => {
    fillOutputs(brief, 'The payment lives in src/pay.mjs.\n')
    writeFile(join(dirname(brief.outputs[0]), `consistency-matrix-${slug}.md`), '| ADR | Verdict |\n- consistency-gate: PASS\n')
    const revising = brief.prompt.includes('A human refused the work')
    commit(cwd, `docs(${slug}): ${revising ? 'revise' : 'record'} the card payment decision`, { [ADR_PATH]: revising ? `${ADR}\nRevised after the human's reason.\n` : ADR }, brief)

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
  deliver_review: ['test-integrity', 'architecture-boundaries', 'cold-reader'],
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
export const finding = (id, severity, description, more = {}) => ({ id, gate: 'G1', severity, location: 'docs/adr/adr-001-card-payment.md:3', description, suggestion: 'name the provider', ...more })

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
