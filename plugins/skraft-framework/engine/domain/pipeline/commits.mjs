import { isCode, ownersOf } from './component-files.mjs'

/**
 * The commits an agent made in one step, judged against the commit convention and the TDD
 * cycle: `test(<story>): …` commits the failing test (red), `feat` or `fix` the code that makes
 * it pass (green), `refactor`, `style` or `perf` a change under green; `docs`, `chore`, `build`,
 * `ci` and `revert` stay outside TDD and change no component's source or tests. A story built
 * from its acceptance tests first takes one red commit holding the acceptance test of every
 * scenario, then, in one pass, at most one green commit per group of scenarios, in the order of
 * the implementation plan: the inner TDD loop is not committed.
 *
 * @typedef {'red' | 'green' | 'refactor' | 'other' | 'invalid'} CommitKind
 * @typedef {'ok' | 'not-conventional' | 'issue-reference-missing' | 'issue-closed' | 'issue-not-in-story' | 'outside-tdd' | 'green-without-red' | 'no-component'
 *   | 'oracle-split' | 'oracle-component' | 'oracle-without-test' | 'code-in-oracle' | 'test-in-scenario' | 'refactor-in-scenario' | 'green-out-of-order' | 'green-beyond-groups' | 'oracle-touched'} CommitVerdict
 * @typedef {import('./component-files.mjs').CodeComponent} CodeComponent
 * @typedef {{ kind: 'oracle', components: string[] | null }
 *   | { kind: 'delivery', groups: string[], immutable: string[] }
 *   | { kind: 'rework', immutable: string[] }} ScenarioJudging
 *   oracle: the pass that writes every scenario's failing acceptance test, in the `components`
 *   its plan names (null when it names none yet); delivery: the one pass that makes the `groups`
 *   pass (each as its green's subject names it), at most one green per group in that order, never
 *   changing the `immutable` files of the acceptance tests; rework: a pass after the story is
 *   delivered, whose commits follow the TDD cycle and never change the `immutable` files either.
 *   The engine opens DELIVER only once that red is committed.
 * @typedef {{ repository: string, sha: string, parent: string, subject: string, body: string, files: string[] }} StepCommit
 *   parent: its first parent's sha; body: the message after the subject; files relative to the working copy.
 * @typedef {StepCommit & { kind: CommitKind, scope: string | null, verdict: CommitVerdict }} JudgedCommit
 */

const CONVENTIONAL = /^([a-z]+)(?:\(([^()\r\n]+)\))?!?: \S/
const KINDS = Object.freeze({
  test: 'red',
  feat: 'green',
  fix: 'green',
  refactor: 'refactor',
  style: 'refactor',
  perf: 'refactor',
  docs: 'other',
  chore: 'other',
  build: 'other',
  ci: 'other',
  revert: 'other',
})

/**
 * @param {string} subject
 * @returns {{ kind: CommitKind, scope: string | null }}
 */
const classify = (subject) => {
  const match = CONVENTIONAL.exec(subject)
  const kind = match ? /** @type {Record<string, CommitKind>} */ (KINDS)[match[1]] : undefined
  return kind ? { kind, scope: /** @type {RegExpExecArray} */ (match)[2] ?? null } : { kind: 'invalid', scope: null }
}

/** An issue cited: `#12` (not an HTML entity), `GH-12`, or an issue URL; the number captured. */
const REFERENCE = /(?:(?<!&)#|\bGH-|\/issues\/)(\d+)\b/gi
/** A closing keyword, a colon or not, before an issue reference. */
const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b\s*:?\s*(?:[\w.-]+\/[\w.-]+)?(?:#|GH-|\S*\/issues\/)\d+/i
/** A body line that references or closes an issue by its keyword: `Refs: …`, `Closes: …`. */
const REFERENCE_LINE = /^(?:refs|close[sd]?)\s*:/im
/** A git trailer line other than the reference: `Signed-off-by: …`, `Co-authored-by: …`. */
const TRAILER = /^(?!Refs:)[A-Za-z0-9-]+: \S/

/** The run's story issue, null when it has none. @param {{ issue?: number | null } | null} story */
export const issueOf = (story) => story?.issue ?? null

/**
 * A commit message the engine writes: the subject, and `Refs: #<issue>` as its body's last line
 * when the story has an issue.
 * @param {string} subject @param {number | null} issue
 */
export const engineMessage = (subject, issue) => (issue === null ? subject : `${subject}\n\nRefs: #${issue}`)

/**
 * @typedef {{ redByGateFailure: boolean, issue: number | null, scenario: ScenarioJudging | null, components: readonly CodeComponent[] }} Pass
 *   scenario: the scenario the pass works on, null for a pass that works on none (the gates or
 *   the review sent the story back, or the workflow builds no scenario).
 * @typedef {{ kind: CommitKind, red: Set<string>, seen: CommitKind[], greens: { next: number, count: number }, issue: number | null, scenario: ScenarioJudging | null, components: readonly CodeComponent[] }} Judging
 *   red: the repositories with a red since their last green; seen: the kinds judged before;
 *   greens.next: the first group of a delivery no green named yet; greens.count: the greens judged.
 */

/**
 * Judges every commit of a pass in its order, so a commit refused once stays refused until it
 * leaves the history. With an issue, every message ends its body with `Refs: #<issue>`, cites no
 * other issue and closes none; without one, it cites none. A commit outside TDD changes no
 * component's source or tests. A pass on a scenario follows its rules (`scenarioVerdict`); any
 * other pass needs a red after the previous green of its repository for each green; on a pass
 * the gates sent back, their failure is the red of the first green.
 * @param {StepCommit[]} commits oldest first, every repository of the run
 * @param {Pass} pass
 * @returns {JudgedCommit[]}
 */
export const judgeCommits = (commits, { redByGateFailure, issue, scenario, components }) => {
  // Stryker disable next-line ArrayDeclaration: no commit is in a repository named like the placeholder
  const judging = { red: new Set(redByGateFailure ? commits.map((commit) => commit.repository) : []), seen: /** @type {CommitKind[]} */ ([]), greens: { next: 0, count: 0 }, issue, scenario, components }
  return commits.map((commit) => judgeOne(commit, judging))
}

/** @param {StepCommit} commit @param {Omit<Judging, 'kind'>} judging @returns {JudgedCommit} */
const judgeOne = (commit, judging) => {
  const { kind, scope } = classify(commit.subject)
  const verdict = verdictOf(commit, { ...judging, kind })
  if (kind === 'red') judging.red.add(commit.repository)
  if (kind === 'green') judging.red.delete(commit.repository)
  judging.seen.push(kind)
  return { ...commit, kind, scope, verdict }
}

/**
 * The convention first, then the issue reference, then what TDD allows.
 * @param {StepCommit} commit @param {Judging} judging
 * @returns {CommitVerdict}
 */
const verdictOf = (commit, judging) => {
  if (judging.kind === 'invalid') return 'not-conventional'
  const reference = issueVerdict(commit, judging.issue)
  if (reference !== null) return reference
  if (judging.kind === 'other') return codeOf(commit).some((file) => isCode(file, judging.components)) ? 'outside-tdd' : 'ok'
  if (judging.kind === 'red' && ownersOf(judging.components, commit.files).length === 0) return 'no-component'
  return judging.scenario === null ? cycleVerdict(commit, judging) : scenarioVerdict(commit, judging, judging.scenario)
}

/** Scenarios written in Gherkin and documents in Markdown are text, wherever they live, never code. */
const TEXT = /\.(?:feature|md|mdx)$/

/** The files of a commit that may be code: all but its Gherkin and Markdown files. @param {StepCommit} commit */
const codeOf = ({ files }) => files.filter((file) => !TEXT.test(file))

/** A green needs a red of its repository since the previous green. @param {StepCommit} commit @param {Judging} judging @returns {CommitVerdict} */
const cycleVerdict = (commit, { kind, red }) => (kind === 'green' && !red.has(commit.repository) ? 'green-without-red' : 'ok')

/**
 * The pass that writes the acceptance tests commits them red, once, in the components of the
 * scenarios, with no code of its own; a pass that makes a group pass commits one green.
 * @param {StepCommit} commit @param {Judging} judging @param {ScenarioJudging} scenario @returns {CommitVerdict}
 */
const scenarioVerdict = (commit, judging, scenario) => SCENARIO_VERDICTS[scenario.kind](commit, judging, /** @type {never} */ (scenario))

/** @param {StepCommit} commit @param {Judging} judging @param {Extract<ScenarioJudging, { kind: 'oracle' }>} scenario @returns {CommitVerdict} */
const oracleVerdict = (commit, { kind, seen, components }, scenario) => {
  if (kind !== 'red') return 'code-in-oracle'
  if (seen.includes('red')) return 'oracle-split'
  const owners = ownersOf(components, codeOf(commit)).map(({ name }) => name)
  if (scenario.components !== null && owners.some((name) => !scenario.components?.includes(name))) return 'oracle-component'
  return commit.files.some((file) => isCode(file, components, ['tests'])) ? 'ok' : 'oracle-without-test'
}

/** @param {StepCommit} commit @param {Judging} judging @param {Extract<ScenarioJudging, { kind: 'delivery' }>} scenario @returns {CommitVerdict} */
const deliveryVerdict = (commit, { kind, greens }, scenario) => {
  if (kind !== 'green') return kind === 'red' ? 'test-in-scenario' : 'refactor-in-scenario'
  const order = greenOrder(commit, greens, scenario.groups)
  return order === 'ok' ? touching(commit, scenario) : order
}

/**
 * A green names the group it makes pass first in its subject: the groups come in the plan's order,
 * one green each; a group whose tests already pass takes none.
 * @param {StepCommit} commit @param {Judging['greens']} greens @param {string[]} labels @returns {CommitVerdict}
 */
const greenOrder = ({ subject }, greens, labels) => {
  const named = labels.findIndex((label) => namesGroup(subject, label))
  greens.count += 1
  if (greens.count > labels.length) return 'green-beyond-groups'
  if (named < greens.next) return 'green-out-of-order'
  greens.next = named + 1
  return 'ok'
}

/** Whether the subject's text after its type and scope starts with the group's label. @param {string} subject @param {string} label */
export const namesGroup = (subject, label) => new RegExp(`^[a-z]+(?:\\([^()]*\\))?!?: ${label}(?![0-9])`).test(subject)

/** @param {StepCommit} commit @param {{ immutable: string[] }} scenario @returns {CommitVerdict} */
const touching = (commit, { immutable }) => (commit.files.some((file) => immutable.includes(file)) ? 'oracle-touched' : 'ok')

/** @param {StepCommit} commit @param {Judging} judging @param {Extract<ScenarioJudging, { kind: 'rework' }>} scenario @returns {CommitVerdict} */
const reworkVerdict = (commit, judging, scenario) => {
  const touched = touching(commit, scenario)
  return touched === 'ok' ? cycleVerdict(commit, judging) : touched
}

/** The rules of a pass on the story's scenarios, by kind of pass. */
const SCENARIO_VERDICTS = Object.freeze({ oracle: oracleVerdict, delivery: deliveryVerdict, rework: reworkVerdict })

/** @param {StepCommit} commit @param {number | null} issue @returns {CommitVerdict | null} */
const issueVerdict = ({ subject, body }, issue) => (issue === null ? withoutIssue(subject, body) : withIssue({ subject, body }, issue))

/** @param {string} subject @param {string} body @returns {CommitVerdict | null} */
const withoutIssue = (subject, body) => (cited(`${subject}\n${body}`).length > 0 || REFERENCE_LINE.test(body) ? 'issue-not-in-story' : null)

/** @param {{ subject: string, body: string }} message @param {number} issue @returns {CommitVerdict | null} */
const withIssue = ({ subject, body }, issue) => {
  const text = `${subject}\n${body}`
  if (CLOSING.test(text)) return 'issue-closed'
  if (cited(text).some((number) => number !== issue)) return 'issue-not-in-story'
  return lastLine(body) === `Refs: #${issue}` ? null : 'issue-reference-missing'
}

/** The issue numbers a message cites. @param {string} text */
const cited = (text) => [...text.matchAll(REFERENCE)].map((match) => Number(match[1]))

/** The last line of a body that is neither empty nor a trailer. @param {string} body */
const lastLine = (body) => body.split(/\r?\n/).filter((line) => line.trim() !== '' && !TRAILER.test(line)).at(-1)

/**
 * Whether a verdict refuses the commit's message rather than its place in the TDD cycle.
 * @param {CommitVerdict} verdict
 */
export const breaksConvention = (verdict) => verdict === 'not-conventional' || verdict.startsWith('issue-')

/**
 * @typedef {{ issue: number | null }} FailureContext
 *   issue: the run's story issue.
 * @type {Readonly<Record<Exclude<CommitVerdict, 'ok'>, (named: string, context: FailureContext) => string>>}
 */
const FAILURES = Object.freeze({
  'not-conventional': (named) => `${named} is not a conventional commit (type(scope): subject); reword it`,
  'issue-reference-missing': (named, { issue }) => `${named} does not end its message with "Refs: #${issue}"; make "Refs: #${issue}" the last line of the body, before any trailer such as Signed-off-by`,
  'issue-closed': (named, { issue }) => `${named} closes an issue; a commit never closes one: end the body with "Refs: #${issue}" and close the issue in the pull request body`,
  'issue-not-in-story': (named, { issue }) => (issue === null
    ? `${named} cites an issue, and the story has none; reference no issue in a commit`
    : `${named} cites an issue other than #${issue}; cite only #${issue}, as "Refs: #${issue}" on the last line of the body`),
  'outside-tdd': (named) => `${named} changes a component's source or tests outside TDD; a docs, chore, build, ci or revert commit changes neither: put that change in the test, feat or fix commit it belongs to`,
  'green-without-red': (named) => `${named} makes code pass with no test commit since the last feat or fix; rewrite it after a failing test commit`,
  'no-component': (named) => `${named} changes no component: a test commit adds a failing test to a component`,
  'oracle-split': (named) => `${named} is a second test commit; commit the acceptance tests of every scenario, the walking skeleton and the skeleton they call in one test commit`,
  'oracle-component': (named) => `${named} changes a component no scenario names: each acceptance test lives in the component the test plan names for its scenario`,
  'oracle-without-test': (named) => `${named} commits no test of its component: the acceptance tests of the scenarios go in its test paths, with the skeleton they call`,
  'code-in-oracle': (named) => `${named} is no test commit: the acceptance tests of the scenarios and the skeleton they call go in one test commit, and no behaviour`,
  'test-in-scenario': (named) => `${named} commits a test on its own: the tests of the inner loop go in the one feat or fix commit that makes the group pass`,
  'refactor-in-scenario': (named) => `${named} commits a change under green on its own: the group takes one feat or fix commit, refactoring included`,
  'green-out-of-order': (named) => `${named} names no group still to deliver, or one before the last you committed: commit the groups in the order of your implementation plan, each subject starting with its group's scenarios (S1, S2 <rule>)`,
  'green-beyond-groups': (named) => `${named} is a feat or fix commit with no group left: one commit per group, no more`,
  'oracle-touched': (named) => `${named} changes the acceptance tests, which DISTILL owns; undo that change, and if a test is wrong, stop blocked naming it`,
})

/**
 * What a refused commit tells the agent.
 * @param {JudgedCommit} commit
 * @param {FailureContext} context
 */
export const commitFailure = (commit, context) => FAILURES[/** @type {Exclude<CommitVerdict, 'ok'>} */ (commit.verdict)](commitName(commit), context)

/** A commit as a refusal names it: its short sha and its subject. @param {{ sha: string, subject: string }} commit */
export const commitName = ({ sha, subject }) => `commit ${sha.slice(0, 7)} "${subject}"`
