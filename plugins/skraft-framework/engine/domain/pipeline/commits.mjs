/**
 * The commits an agent made in one step, judged against the commit convention and the TDD
 * cycle: `test(<story>): …` commits the failing test (red), `feat` or `fix` the code that makes
 * it pass (green), `refactor` the clean-up. The engine replays the test command at each red
 * commit; that part runs in the application.
 *
 * @typedef {'red' | 'green' | 'refactor' | 'other' | 'invalid'} CommitKind
 * @typedef {'ok' | 'not-conventional' | 'green-without-red' | 'not-red' | 'no-component'} CommitVerdict
 * @typedef {{ repository: string, sha: string, subject: string, files: string[], mine: boolean }} StepCommit
 *   files relative to the working copy; mine: made by the attempt being checked, not by an
 *   earlier attempt of the same pass.
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

/**
 * Judges the commits of a pass in their order; only those of the current attempt get a
 * verdict other than ok. A green needs a red after the previous green of its repository.
 * @param {StepCommit[]} commits oldest first, every repository of the run
 * @returns {JudgedCommit[]}
 */
export const judgeCommits = (commits) => {
  /** @type {Set<string>} repositories with a red since their last green */
  const red = new Set()
  return commits.map((commit) => {
    const { kind, scope } = classify(commit.subject)
    /** @type {CommitVerdict} */
    let verdict = 'ok'
    if (kind === 'invalid') verdict = 'not-conventional'
    else if (kind === 'green' && !red.has(commit.repository)) verdict = 'green-without-red'
    if (kind === 'red') red.add(commit.repository)
    if (kind === 'green') red.delete(commit.repository)
    return { ...commit, kind, scope, verdict: commit.mine ? verdict : 'ok' }
  })
}

/**
 * The red commits of the current attempt the engine replays: every one, or with `last-red`
 * only the last of each story (the commit scope).
 * @param {JudgedCommit[]} judged
 * @param {import('../config/skraft-config.mjs').ReplayMode} mode
 */
export const redsToReplay = (judged, mode) => {
  const reds = judged.filter((commit) => commit.mine && commit.kind === 'red')
  if (mode === 'all') return reds
  return reds.filter((commit, index) => !reds.slice(index + 1).some((later) => later.scope === commit.scope))
}

/**
 * What a refused commit tells the agent.
 * @param {JudgedCommit} commit
 * @param {string} [detail] why a red is not red
 */
export const commitFailure = (commit, detail) => {
  const named = `commit ${commit.sha.slice(0, 7)} "${commit.subject}"`
  switch (commit.verdict) {
    case 'not-conventional': return `${named} is not a conventional commit (type(scope): subject)`
    case 'green-without-red': return `${named} makes code pass with no test commit before it`
    case 'not-red': return `${named} is not red: ${detail}`
    default: return `${named} changes no component: a test commit adds a failing test to a component`
  }
}

/** Above this share of a phase's time, replaying red commits is reported to the developer. */
export const REPLAY_SHARE = 0.2
