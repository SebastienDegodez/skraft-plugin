/**
 * The commits an agent made in one step, judged against the commit convention and the TDD
 * cycle: `test(<story>): …` commits the failing test (red), `feat` or `fix` the code that makes
 * it pass (green), `refactor` the clean-up. The engine replays the test command at each red
 * commit; that part runs in the application.
 *
 * @typedef {'red' | 'green' | 'refactor' | 'other' | 'invalid'} CommitKind
 * @typedef {'ok' | 'not-conventional' | 'issue-reference-missing' | 'issue-closed' | 'issue-not-in-story' | 'green-without-red' | 'not-red' | 'no-component'} CommitVerdict
 * @typedef {{ repository: string, sha: string, subject: string, body: string, files: string[] }} StepCommit
 *   body: the message after the subject; files relative to the working copy.
 * @typedef {StepCommit & { kind: CommitKind, scope: string | null, verdict: CommitVerdict }} JudgedCommit
 */

const CONVENTIONAL = /^([a-z]+)(?:\(([^()\r\n]+)\))?!?: \S/
const KINDS = Object.freeze({
  test: 'red',
  feat: 'green',
  fix: 'green',
  refactor: 'refactor',
  docs: 'other',
  chore: 'other',
  build: 'other',
  ci: 'other',
  perf: 'other',
  style: 'other',
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
 * Judges every commit of a pass in its order, so a commit refused once stays refused until it
 * leaves the history. A green needs a red after the previous green of its repository; on a
 * pass the gates sent back, their failure is the red of the first green. With an issue, every
 * message ends its body with `Refs: #<issue>`, cites no other issue and closes none; without
 * one, it cites none.
 * @param {StepCommit[]} commits oldest first, every repository of the run
 * @param {{ redByGateFailure: boolean, issue: number | null }} pass
 * @returns {JudgedCommit[]}
 */
export const judgeCommits = (commits, { redByGateFailure, issue }) => {
  /** @type {Set<string>} repositories with a red since their last green */
  // Stryker disable next-line ArrayDeclaration: no commit is in a repository named like the placeholder
  const red = new Set(redByGateFailure ? commits.map((commit) => commit.repository) : [])
  return commits.map((commit) => {
    const { kind, scope } = classify(commit.subject)
    const verdict = verdictOf(commit, { kind, red, issue })
    if (kind === 'red') red.add(commit.repository)
    if (kind === 'green') red.delete(commit.repository)
    return { ...commit, kind, scope, verdict }
  })
}

/**
 * The convention first, then the issue reference, then the TDD order.
 * @param {StepCommit} commit @param {{ kind: CommitKind, red: Set<string>, issue: number | null }} pass
 * @returns {CommitVerdict}
 */
const verdictOf = (commit, { kind, red, issue }) => {
  if (kind === 'invalid') return 'not-conventional'
  const reference = issueVerdict(commit, issue)
  if (reference !== null) return reference
  return kind === 'green' && !red.has(commit.repository) ? 'green-without-red' : 'ok'
}

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
 * The red commits of a pass the engine replays: every one, or with `last-red` only the last of
 * each story (the commit scope).
 * @param {JudgedCommit[]} judged
 * @param {import('../config/skraft-config.mjs').ReplayMode} mode
 */
export const redsToReplay = (judged, mode) => {
  const reds = judged.filter((commit) => commit.kind === 'red')
  if (mode === 'all') return reds
  return reds.filter((commit, index) => !reds.slice(index + 1).some((later) => later.scope === commit.scope))
}

/**
 * Whether a verdict refuses the commit's message rather than its place in the TDD cycle.
 * @param {CommitVerdict} verdict
 */
export const breaksConvention = (verdict) => verdict === 'not-conventional' || verdict.startsWith('issue-')

/**
 * @typedef {{ detail: string | undefined, issue: number | null }} FailureContext
 *   detail: why a red is not red; issue: the run's story issue.
 * @type {Readonly<Record<Exclude<CommitVerdict, 'ok'>, (named: string, context: FailureContext) => string>>}
 */
const FAILURES = Object.freeze({
  'not-conventional': (named) => `${named} is not a conventional commit (type(scope): subject); reword it`,
  'issue-reference-missing': (named, { issue }) => `${named} does not end its message with "Refs: #${issue}"; make "Refs: #${issue}" the last line of the body, before any trailer such as Signed-off-by`,
  'issue-closed': (named, { issue }) => `${named} closes an issue; a commit never closes one: end the body with "Refs: #${issue}" and close the issue in the pull request body`,
  'issue-not-in-story': (named, { issue }) => (issue === null
    ? `${named} cites an issue, and the story has none; reference no issue in a commit`
    : `${named} cites an issue other than #${issue}; cite only #${issue}, as "Refs: #${issue}" on the last line of the body`),
  'green-without-red': (named) => `${named} makes code pass with no test commit since the last feat or fix; rewrite it after a failing test commit`,
  'not-red': (named, { detail }) => `${named} is not red: ${detail}; a test commit must fail before the code that makes it pass`,
  'no-component': (named) => `${named} changes no component: a test commit adds a failing test to a component`,
})

/**
 * What a refused commit tells the agent.
 * @param {JudgedCommit} commit
 * @param {FailureContext} context
 */
export const commitFailure = (commit, context) => FAILURES[/** @type {Exclude<CommitVerdict, 'ok'>} */ (commit.verdict)](`commit ${commit.sha.slice(0, 7)} "${commit.subject}"`, context)

/** Above this share of a phase's time, replaying red commits is reported to the developer. */
export const REPLAY_SHARE = 0.2
