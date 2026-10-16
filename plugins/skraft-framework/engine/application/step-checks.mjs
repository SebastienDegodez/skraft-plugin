import { CONFIG_FILE } from '../domain/config/skraft-config.mjs'
import { joinRelative, pathUnder } from '../domain/config/relative-path.mjs'
import { parseCommand } from '../domain/gates/command-line.mjs'
import { failureOf } from '../domain/gates/gate-plan.mjs'
import { readResult } from '../domain/pipeline/agent-result.mjs'
import { commitFailure, judgeCommits, redsToReplay } from '../domain/pipeline/commits.mjs'
import { isFilled } from '../domain/pipeline/outputs.mjs'
import { allowedPaths } from '../domain/pipeline/roles.mjs'
import { baseOf } from './bases.mjs'

/**
 * @typedef {import('../domain/journal/run-state.mjs').Head} Head
 * @typedef {import('../domain/pipeline/commits.mjs').JudgedCommit} JudgedCommit
 * @typedef {import('../domain/config/skraft-config.mjs').Component} Component
 * @typedef {'missing-outputs' | 'invalid-result' | 'agent-blocked' | 'write-scope' | 'commit-convention' | 'tdd'} FailureCode
 * @typedef {{
 *   repository: string, sha: string, subject: string, kind: string, verdict: string,
 *   replay: { component: string, exitCode: number | null, durationMs: number } | null,
 * }} CheckedCommit
 * @typedef {{
 *   missing: string[], failures: string[], code: FailureCode | null, commits: CheckedCommit[],
 *   environment: null, replayMs: number,
 * } | { commits: CheckedCommit[], environment: string }} StepCheck
 *   environment: why the machine could not check the step (a missing test command, Git
 *   failing); the step then stays open.
 * @typedef {{
 *   files: import('./ports/tracking-files.mjs').TrackingFiles,
 *   sourceControl: import('./ports/source-control.mjs').SourceControl,
 *   commitReplay: import('./ports/commit-replay.mjs').CommitReplay,
 *   clock: import('./ports/clock.mjs').Clock,
 * }} CheckDeps
 */

/** Failure codes, the first one found naming the step's refusal. */
const PRIORITY = /** @type {const} */ (['missing-outputs', 'invalid-result', 'write-scope', 'commit-convention', 'tdd'])

/**
 * Where each repository of the run stands before an attempt: its HEAD and the files already
 * changed, which the attempt is not answerable for.
 * @param {Pick<CheckDeps, 'sourceControl'>} deps
 * @param {ReadonlyArray<{ repository: string }>} base the run's bases, one per repository folder
 * @returns {Promise<Head[]>}
 */
export const headsOf = async ({ sourceControl }, base) => {
  /** @type {Head[]} */
  const heads = []
  for (const repository of new Set(base.map((entry) => entry.repository))) {
    const sha = /** @type {string} */ (await sourceControl.head(repository))
    // Stryker disable next-line ArrayDeclaration: dirty only filters the changed paths, and no changed path is a placeholder
    const dirty = (await sourceControl.changedFiles(repository, sha)) ?? []
    heads.push({ repository, sha, dirty: dirty.map((path) => joinRelative(repository, path)) })
  }
  return heads
}

/**
 * What an agent's attempt left: its outputs, its result, the files it changed against its
 * write scope, and its commits against the commit convention and the TDD cycle, each red
 * commit replayed.
 * @param {{ deps: CheckDeps, slug: string, config: import('../domain/config/skraft-config.mjs').SkraftConfig, base: import('./bases.mjs').Base[] }} context
 * @param {{
 *   role: import('../domain/pipeline/roles.mjs').Role, outputs: string[], precreated: Array<string | null>, result: string,
 *   attemptHeads: Head[], visitHeads: Head[],
 * }} step
 * @returns {Promise<StepCheck>}
 */
export const checkStep = async ({ deps, slug, config, base }, { role, outputs, precreated, result, attemptHeads, visitHeads }) => {
  /** @type {Array<{ code: FailureCode, line: string }>} */
  const found = []
  const texts = await Promise.all(outputs.map((path) => deps.files.read(slug, path)))
  const missing = outputs.filter((_, index) => !isFilled(texts[index], precreated[index]))
  const reading = readResult(await deps.files.read(slug, result))
  if (!reading.ok) found.push({ code: 'invalid-result', line: `result ${deps.files.location(slug, result)} ${reading.errors.join('; ')}` })
  else if (reading.result.status === 'blocked') {
    return { missing: [], failures: [reading.result.summary], code: 'agent-blocked', commits: [], environment: null, replayMs: 0 }
  }

  const scope = await outOfScope(deps, { slug, config, role, visitHeads })
  if (typeof scope === 'string') return environmentOnly(scope)
  found.push(...scope.map((path) => ({ code: /** @type {const} */ ('write-scope'), line: `out of write scope: ${path}` })))

  const history = await commitsOf(deps, { attemptHeads, visitHeads })
  if (typeof history === 'string') return environmentOnly(history)
  const judged = judgeCommits(history)
  const replayed = await replayReds(deps, { config, base, judged })
  if (replayed.environment !== null) return { ...environmentOnly(replayed.environment), commits: report(judged, replayed.replays) }
  for (const commit of judged.filter((candidate) => candidate.verdict !== 'ok')) {
    found.push({ code: commit.verdict === 'not-conventional' ? 'commit-convention' : 'tdd', line: commitFailure(commit, replayed.details.get(commit.sha)) })
  }
  const code = PRIORITY.find((candidate) => (candidate === 'missing-outputs' ? missing.length > 0 : found.some((failure) => failure.code === candidate))) ?? null
  return { missing, failures: found.map((failure) => failure.line), code, commits: report(judged, replayed.replays), environment: null, replayMs: replayed.replayMs }
}

/** @param {string} reason @returns {StepCheck} */
const environmentOnly = (reason) => ({ commits: [], environment: reason })

/**
 * The files changed since the pass started that the agent may not change; a string when Git
 * cannot tell.
 * @param {CheckDeps} deps
 * @param {{ slug: string, config: import('../domain/config/skraft-config.mjs').SkraftConfig, role: import('../domain/pipeline/roles.mjs').Role, visitHeads: Head[] }} request
 * @returns {Promise<string[] | string>}
 */
const outOfScope = async ({ sourceControl }, { slug, config, role, visitHeads }) => {
  const allowed = allowedPaths(role, { slug, components: config.components })
  const engineFiles = [CONFIG_FILE, config.workflow]
  /** @type {string[]} */
  const refused = []
  for (const { repository, sha, dirty } of visitHeads) {
    const changed = await sourceControl.changedFiles(repository, sha)
    if (changed === null) return `Git cannot list what changed in ${repository} since ${sha}`
    for (const path of changed.map((file) => joinRelative(repository, file)).filter((file) => !dirty.includes(file))) {
      if (engineFiles.includes(path) || !allowed.some((folder) => pathUnder(path, folder) !== null)) refused.push(path)
    }
  }
  return refused
}

/**
 * The commits of the pass in every repository, oldest first, those of this attempt marked;
 * a string when Git cannot tell.
 * @param {Pick<CheckDeps, 'sourceControl'>} deps
 * @param {{ attemptHeads: Head[], visitHeads: Head[] }} heads
 * @returns {Promise<import('../domain/pipeline/commits.mjs').StepCommit[] | string>}
 */
const commitsOf = async ({ sourceControl }, { attemptHeads, visitHeads }) => {
  // Stryker disable next-line ArrayDeclaration: an element that is not a commit is judged ok and is not mine, so nothing reports or replays it
  const commits = []
  for (const { repository, sha } of visitHeads) {
    const listed = await sourceControl.commits(repository, sha)
    if (listed === null) return `Git cannot list the commits of ${repository} since ${sha}`
    const from = /** @type {Head} */ (attemptHeads.find((head) => head.repository === repository)).sha
    const before = listed.findIndex((commit) => commit.sha === from)
    commits.push(...listed.map((commit, index) => ({
      repository, sha: commit.sha, subject: commit.subject, files: commit.files.map((file) => joinRelative(repository, file)), mine: index > before,
    })))
  }
  return commits
}

/**
 * Replays the test command of each component a red commit of this attempt touches, at that
 * commit. A red whose tests pass everywhere is refused; a machine that cannot run them stops
 * the check.
 * @param {CheckDeps} deps
 * @param {{ config: import('../domain/config/skraft-config.mjs').SkraftConfig, base: import('./bases.mjs').Base[], judged: JudgedCommit[] }} request
 */
const replayReds = async (deps, { config, base, judged }) => {
  /** @type {Map<string, CheckedCommit['replay']>} */
  const replays = new Map()
  /** @type {Map<string, string>} */
  const details = new Map()
  let replayMs = 0
  for (const red of redsToReplay(judged, config.tdd.replay)) {
    const components = componentsOf(config.components, red.files)
    if (components.length === 0) {
      red.verdict = 'no-component'
      continue
    }
    let failing = false
    for (const component of components) {
      const line = component.commands.test
      if (line === undefined) return { environment: `component ${component.name} has no test command; add commands.test to it in ${CONFIG_FILE} so test commits can be replayed`, replays, details, replayMs }
      const parsed = parseCommand(line, { baseSha: baseOf(base, component.name)?.sha ?? null })
      if (!parsed.ok) return { environment: `${component.name} command ${JSON.stringify(line)} ${parsed.reason}`, replays, details, replayMs }
      const started = deps.clock.now()
      const answer = await deps.commitReplay.run({ repository: red.repository, sha: red.sha, cwd: /** @type {string} */ (pathUnder(component.root, red.repository)), argv: parsed.argv })
      const durationMs = deps.clock.now().getTime() - started.getTime()
      replayMs += durationMs
      const failure = failureOf(answer)
      if (!replays.has(red.sha)) replays.set(red.sha, { component: component.name, exitCode: answer.exitCode, durationMs })
      if (failure === 'environment') {
        return { environment: `replaying ${red.sha.slice(0, 7)} for ${component.name}: ${answer.error ?? `${line} exited ${answer.exitCode}`}`, replays, details, replayMs }
      }
      failing ||= failure === 'deterministic'
    }
    if (!failing) {
      red.verdict = 'not-red'
      details.set(red.sha, `the tests of ${components.map(({ name }) => name).join(', ')} pass at it`)
    }
  }
  return { environment: null, replays, details, replayMs }
}

/**
 * The components a commit's files belong to, each file to the deepest component root holding
 * it; files of the tracking folder belong to none.
 * @param {Component[]} components @param {string[]} files relative to the working copy
 */
const componentsOf = (components, files) => {
  /** @type {Set<Component>} */
  const touched = new Set()
  for (const file of files.filter((path) => pathUnder(path, '.copilot-tracking') === null)) {
    const owner = components
      .filter((component) => pathUnder(file, component.root) !== null)
      .sort((a, b) => b.root.length - a.root.length)[0]
    if (owner) touched.add(owner)
  }
  return [...touched]
}

/** @param {JudgedCommit[]} judged @param {Map<string, CheckedCommit['replay']>} replays @returns {CheckedCommit[]} */
const report = (judged, replays) => judged
  .filter((commit) => commit.mine)
  .map(({ repository, sha, subject, kind, verdict }) => ({ repository, sha, subject, kind, verdict, replay: replays.get(sha) ?? null }))

