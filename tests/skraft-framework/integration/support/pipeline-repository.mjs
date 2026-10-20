// A real repository the whole pipeline runs on, and the scripted LLM that works in it. The
// agents act as a model would: they read their brief, fill the outputs it lists, write the
// result JSON it names, change files and make real Git commits. The gates then run the
// repository's real test command. No doubles: every driver test stages the same repository.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { answerYaml } from '../../unit/support/answer-yaml.mjs'
import { PLUGIN_ROOT, commitAll, git, tempFolder } from './workspace.mjs'

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

/** The ADR the architect drafts: Proposed until a human ratifies it. */
export const ADR = [
  '---',
  'adr: 1',
  'title: Card payment',
  'status: Proposed',
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

/** A repository workflow: the plugin's, with a repository agent between design and distill. */
export const SECURITY_WORKFLOW = `digraph skraft {
  graph [version="2", goal="Deliver the story"]

  start    [shape=Mdiamond]
  research [shape=box, agent="solution-researcher", phase="RESEARCH"]
  design   [shape=box, agent="solution-architect", phase="DESIGN"]
  security [shape=box, agent="acme-security-reviewer"]
  distill  [shape=box, agent="acceptance-designer", phase="DISTILL"]
  deliver  [shape=box, agent="software-engineer", phase="DELIVER"]
  gates    [shape=parallelogram, gate="build,format,lint,test,architecture,coverage,mutation", goal_gate=true, locked=true, phase="DELIVER"]
  exit     [shape=Msquare]

  start -> research -> design -> security -> distill -> deliver -> gates
  gates -> deliver [label="FAIL", max_visits=3]
  gates -> exit    [label="PASS"]
}
`

export const SECURITY_AGENT = 'acme-security-reviewer'

/** A repository lens: the agent `acme-security-lens`. */
export const SECURITY_LENS = 'acme-security'

/** A repository workflow: the plugin's, its design review with the repository lens last. */
export const LENS_WORKFLOW = readFileSync(join(PLUGIN_ROOT, 'workflows', 'skraft.dot'), 'utf8')
  .replace('lenses="consistency,architecture-compliance,fitness"', `lenses="consistency,architecture-compliance,fitness,${SECURITY_LENS}"`)

/** @param {string} cwd @param {string} agent @param {string} description @param {string[]} [skills] the skills its front matter lists */
const repositoryAgent = (cwd, agent, description, skills = []) => {
  const listed = skills.length === 0 ? '' : `metadata:\n  skills:\n${skills.map((skill) => `    - ${skill}\n`).join('')}`
  for (const [folder, name] of [['.claude', `${agent}.md`], ['.github', `${agent}.agent.md`]]) {
    mkdirSync(join(cwd, folder, 'agents'), { recursive: true })
    writeFileSync(join(cwd, folder, 'agents', name), `---\nname: ${agent}\ndescription: ${description}\n${listed}---\nReview the design.\n`)
  }
}

/**
 * A repository on `main` with one JavaScript component `app` at its root, the tracking folder
 * ignored, and the Git identity a developer's machine has, which the engine commits a
 * ratification with. With `security`, it runs SECURITY_WORKFLOW and defines its repository agent for
 * both hosts; with `lens`, it runs LENS_WORKFLOW and defines its repository lens for both hosts,
 * listing `lensSkills` under `skills:`.
 * @param {import('node:test').TestContext} t
 * @param {{ security?: boolean, lens?: boolean, lensSkills?: string[] }} [options]
 */
/** The families of the plugin's workflow, weakest first, with a model for each host. */
export const FAMILY_MODELS = Object.freeze({
  haiku: { 'claude-code': 'haiku', copilot: 'copilot-small' },
  sonnet: { 'claude-code': 'sonnet', copilot: 'copilot-medium' },
  opus: { 'claude-code': 'opus', copilot: 'copilot-large' },
})

export const pipelineRepository = (t, { security = false, lens = false, lensSkills = [], models } = {}) => {
  const cwd = join(tempFolder(t, 'skraft-pipeline-'), 'payment')
  mkdirSync(cwd)
  const config = {
    ...(security || lens ? { workflow: 'skraft-workflow.dot' } : {}),
    ...(models === undefined ? {} : { models }),
    components: [{
      name: 'app', root: '.', stack: 'javascript', mocking: { strategy: 'inprocess' },
      paths: { src: ['src'], tests: ['tests'] },
      commands: { test: TEST_COMMAND },
    }],
  }
  writeFileSync(join(cwd, 'skraft-config.json'), `${JSON.stringify(config, null, 2)}\n`)
  writeFileSync(join(cwd, '.gitignore'), '.copilot-tracking/\n')
  writeFileSync(join(cwd, 'README.md'), '# payment\n')
  if (security) {
    writeFileSync(join(cwd, 'skraft-workflow.dot'), SECURITY_WORKFLOW)
    repositoryAgent(cwd, SECURITY_AGENT, 'Reviews the design for security')
  }
  if (lens) {
    writeFileSync(join(cwd, 'skraft-workflow.dot'), LENS_WORKFLOW)
    repositoryAgent(cwd, `${SECURITY_LENS}-lens`, 'Reviews the design for security, as a lens', lensSkills)
  }
  const main = commitAll(cwd)
  for (const [key, value] of [['user.name', 'skraft'], ['user.email', 'skraft@example.invalid'], ['commit.gpgsign', 'false']]) git(cwd, 'config', key, value)
  return { cwd, main }
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
  return {
    agent: header?.[1] ?? null,
    phase: header?.[2] ?? null,
    inputs: listed('- Read first:'),
    outputs: listed('- Fill each output in place'),
    missing: listed('Missing outputs from'),
    result,
    prompt,
  }
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
 * Writes (or with null, deletes) files of the repository, then commits them with `subject`.
 * @param {string} cwd @param {string} subject @param {Record<string, string | null>} files
 */
export const commit = (cwd, subject, files) => {
  for (const [path, text] of Object.entries(files)) {
    if (text === null) rmSync(join(cwd, ...path.split('/')), { force: true })
    else writeFile(join(cwd, ...path.split('/')), text)
  }
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '-m', subject)
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
  commit(cwd, `test(${slug}): ${fixing ? 'pay answers the amount paid' : 'pay a card amount'}`, { [`tests/pay-${fixing ? 'fix' : 'amount'}.md`]: 'pay(10) answers paid 10\n' })
  commit(cwd, `${fixing ? 'fix' : 'feat'}(${slug}): pay by card`, { 'src/pay.mjs': code })
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
    commit(cwd, `docs(${slug}): ${revising ? 'revise' : 'record'} the card payment decision`, { [ADR_PATH]: revising ? `${ADR}\nRevised after the human's reason.\n` : ADR })

    writeResult(brief, { status: 'done', summary: 'context map and ADR written' })
  },
  'acceptance-designer': (brief, { cwd, slug }) => {
    fillOutputs(brief, 'pay(10) answers paid 10.\n')
    commit(cwd, `test(${slug}): pay by card`, { 'tests/unit/check.mjs': CHECK })
    writeResult(brief, { status: 'done', summary: 'acceptance test committed red' })
  },
  'software-engineer': deliverWith(PAY),
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
