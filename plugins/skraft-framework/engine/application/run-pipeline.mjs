import { CONFIG_FILE } from '../domain/config/skraft-config.mjs'
import { deriveRun } from '../domain/journal/run-state.mjs'
import { DEFAULT_ATTEMPTS, nextStep, route } from '../domain/pipeline/next-step.mjs'
import { composeBrief, dispatchLabel } from '../domain/pipeline/dispatch-brief.mjs'
import { dayOf, isFilled, outputPath } from '../domain/pipeline/outputs.mjs'
import { allowedPaths, roleOf } from '../domain/pipeline/roles.mjs'
import { REPLAY_SHARE } from '../domain/pipeline/commits.mjs'
import { openActiveRun } from './active-run.mjs'
import { baseOf, loadConfig } from './bases.mjs'
import { runGates } from './gate-runs.mjs'
import { loadWorkflow } from './load-workflow.mjs'
import { JournalConflict } from './run-journal.mjs'
import { checkStep, headsOf } from './step-checks.mjs'

/**
 * @typedef {import('./active-run.mjs').RunOutcome} RunOutcome
 * @typedef {import('./run-journal.mjs').OpenJournal} OpenJournal
 * @typedef {import('../domain/journal/run-state.mjs').RunState} RunState
 * @typedef {import('../domain/pipeline/next-step.mjs').WorkStep} WorkStep
 * @typedef {import('../domain/pipeline/next-step.mjs').SkipStep} SkipStep
 * @typedef {import('../domain/pipeline/next-step.mjs').BlockedStep} BlockedStep
 * @typedef {import('../domain/config/skraft-config.mjs').SkraftConfig} SkraftConfig
 * @typedef {{
 *   journal: import('./ports/run-journal-store.mjs').RunJournalStore,
 *   activePipeline: import('./ports/active-pipeline.mjs').ActivePipeline,
 *   files: import('./ports/tracking-files.mjs').TrackingFiles,
 *   templates: import('./ports/template-library.mjs').TemplateLibrary,
 *   clock: import('./ports/clock.mjs').Clock,
 *   hasher: import('./ports/hasher.mjs').Hasher,
 *   agentRunner: import('./ports/agent-runner.mjs').AgentRunner,
 *   progress: import('./ports/pipeline-progress.mjs').PipelineProgress,
 *   workspace: import('./ports/workspace.mjs').ConfigSource,
 *   sourceControl: import('./ports/source-control.mjs').SourceControl,
 *   commandRunner: import('./ports/command-runner.mjs').CommandRunner,
 *   commitReplay: import('./ports/commit-replay.mjs').CommitReplay,
 *   workflowSource: import('./ports/workflow-source.mjs').WorkflowSource,
 *   agentCatalog: import('./ports/agent-catalog.mjs').AgentCatalog,
 * }} PipelineDeps
 * @typedef {{
 *   deps: PipelineDeps, slug: string, journal: OpenJournal, config: SkraftConfig,
 *   loaded: Extract<import('./load-workflow.mjs').WorkflowLoading, { ok: true }>,
 * }} Context
 */

/**
 * RunPipeline — runs the active pipeline along its workflow until it reaches the exit, is
 * blocked, or the host or the machine stops it. Every fact goes to the journal before the
 * next step is decided from it.
 * @param {PipelineDeps} deps
 */
export const createRunPipeline = (deps) => Object.freeze({
  /** @param {{ slug?: string | null }} [request] @returns {Promise<RunOutcome>} */
  run: async ({ slug: requested } = {}) => {
    const opened = await openActiveRun(deps, requested)
    if (!opened.ok) return opened.outcome
    const { slug, journal } = opened
    const config = await loadConfig(deps)
    if (!config.ok) return { status: 'blocked', slug, phase: null, code: 'config-invalid', reason: config.reason }
    const loaded = await loadWorkflow(deps, { config: config.config })
    if (!loaded.ok) return { status: 'blocked', slug, phase: null, code: 'workflow-invalid', reason: loaded.reason }
    try {
      return await runFrom({ deps, slug, journal, config: config.config, loaded })
    } catch (error) {
      if (!(error instanceof JournalConflict)) throw error
      return { status: 'blocked', slug, phase: null, code: 'journal-changed', reason: error.message }
    }
  },
})

/** @param {Context} context @returns {Promise<RunOutcome>} */
const runFrom = async (context) => {
  const { deps, slug, journal, loaded } = context
  let shown = null
  for (;;) {
    const run = deriveRun(journal.events)
    const next = nextStep(loaded.workflow, run)
    if (next.kind === 'done') {
      const reason = `${next.phase} closed`
      if (!run.finished) await journal.append('run.finished', { status: 'completed', reason })
      return { status: 'done', slug, phase: next.phase, code: null, reason }
    }
    if (next.kind === 'blocked') {
      const { code, reason } = blockedBy(context, next)
      if (!run.finished) await journal.append('run.finished', { status: 'blocked', code, reason })
      return { status: 'blocked', slug, phase: next.phase, code, reason }
    }
    if (next.kind === 'close-phase') {
      await journal.append('phase.closed', { phase: next.phase })
      deps.progress.log(`${slug}: ${next.phase} closed`)
      continue
    }
    if (shown !== next.phase) deps.progress.phase(next.phase)
    shown = next.phase
    const stopped = next.kind === 'skip' ? await skip(context, run, next) : next.kind === 'gate' ? await gate(context, run, next) : await dispatch(context, run, next)
    if (stopped) return stopped
  }
}

/**
 * @param {Context} context
 * @param {BlockedStep} next
 * @returns {{ code: string, reason: string }}
 */
const blockedBy = ({ deps, slug }, { cause, node, last, previous, missingNode }) => {
  if (cause === 'workflow-changed') return { code: 'workflow-changed', reason: `the workflow has no node ${missingNode} any more; restore the workflow the run started with` }
  const event = /** @type {import('../domain/journal/run-state.mjs').RunEvent} */ (last)
  if (cause === 'route') return { code: event.code, reason: event.reason }
  const agent = /** @type {{ agent: string }} */ (node).agent
  if (cause === 'agent-blocked') return { code: event.code, reason: `${agent} is blocked: ${event.failures[0]}` }
  const details = [
    ...(event.missing.length > 0 ? [`missing outputs: ${event.missing.map((/** @type {string} */ path) => deps.files.location(slug, path)).join(', ')}`] : []),
    ...event.failures,
  ].join('; ')
  return cause === 'breaker'
    ? { code: event.code, reason: `${agent} failed the same way on attempts ${/** @type {{ attempt: number }} */ (previous).attempt} and ${event.attempt}: ${details}` }
    : { code: event.code, reason: `${agent} still failed after ${event.attempt} attempts: ${details}` }
}

/**
 * Where the run goes once a node passed, or why it cannot go on.
 * @param {Context} context @param {RunState} run @param {string} from @param {'PASS' | 'FAIL' | null} label @param {string[]} failures
 * @returns {{ next: string | null, code?: string, reason?: string }}
 */
const leave = ({ loaded }, run, from, label, failures) => {
  const routed = route(loaded.workflow, run, from, label)
  if (routed.ok) return { next: routed.to }
  const why = routed.code === 'gates-failed'
    ? `${from} failed and the workflow has no FAIL edge out of it`
    : `${from} -> ${routed.to} was already taken ${routed.taken} times, its max_visits`
  return { next: null, code: routed.code, reason: [why, ...failures].join('; ') }
}

/**
 * One attempt of an agent node: pre-create the outputs, start the agent unless a resumed
 * attempt already left them done, then check what it did.
 * @param {Context} context
 * @param {RunState} run
 * @param {WorkStep} next
 * @returns {Promise<RunOutcome | null>}
 */
const dispatch = async (context, run, next) => {
  const { deps, slug, journal, config, loaded } = context
  const { phase, node, visit, attempt, missing, feedback, resumed } = next
  const agent = /** @type {string} */ (node.agent)
  const role = roleOf(node)
  const date = dayOf(deps.clock.now())
  const outputs = run.nodes[node.id]?.outputs ?? role.outputs.map((output) => outputPath(output.path, { date, slug }))
  const result = `results/${node.id}-${visit}-${attempt}.json`
  const precreated = await Promise.all(role.outputs.map((output) => (output.template ? deps.templates.read(output.template) : null)))
  let heads = resumed?.heads
  if (!heads) {
    for (const [index, path] of outputs.entries()) {
      const text = precreated[index]
      if (text !== null && (await deps.files.read(slug, path)) === null) await deps.files.write(slug, path, text)
    }
    heads = await headsOf(deps, run.base)
    await journal.append('step.started', { step: node.id, phase, agent, visit, attempt, outputs, result, missing, feedback, heads })
  }
  deps.progress.log(`${slug}: ${agent}${visit > 1 ? `, pass ${visit}` : ''}, attempt ${attempt}`)
  const components = role.components.length > 0 ? config.components : []
  const maxAttempts = node.maxAttempts ?? DEFAULT_ATTEMPTS
  const pending = async () => {
    const texts = await Promise.all(outputs.map((path) => deps.files.read(slug, path)))
    const left = outputs.filter((_, index) => !isFilled(texts[index], precreated[index]))
    return left.length > 0 || (await deps.files.read(slug, result)) === null
  }
  const started = deps.clock.now()
  /** @type {number | undefined} */
  let cost
  if (!resumed || (await pending())) {
    const inputs = [...run.artifacts, ...Object.entries(run.nodes).filter(([id]) => id !== node.id).flatMap(([, state]) => state.outputs)]
    const answer = await deps.agentRunner.run({
      agent,
      source: loaded.sources[agent],
      label: dispatchLabel({ slug, step: node.id, visit, attempt }),
      prompt: composeBrief({
        agent, phase, slug, story: run.story, visit, attempt, maxAttempts,
        inputs: inputs.map((path) => deps.files.location(slug, path)),
        outputs: outputs.map((path) => deps.files.location(slug, path)),
        result: deps.files.location(slug, result),
        allowed: allowedPaths(role, { slug, components: config.components }),
        components: components.map(({ name, root, stack, commands }) => ({ name, root, stack, test: testLine(commands.test, baseOf(run.base, name)?.sha) })),
        tdd: role.components.includes('src') ? 'cycle' : role.components.length > 0 ? 'red' : null,
        missing: missing.map((path) => deps.files.location(slug, path)),
        feedback,
      }),
    })
    if (answer.unavailable) return stop(context, phase, 'agent-unavailable', answer.error ?? `${agent} could not be started`)
    cost = answer.costUsd
    if (!answer.ok && (await pending())) return stop(context, phase, 'agent-failed', `${agent} stopped without finishing: ${answer.error ?? 'no answer'}`)
  }
  const inState = attempt > 1 || resumed !== null
  const known = new Map(journal.events
    .filter((event) => event.type === 'commits.checked' && event.step === node.id && event.visit === visit)
    .flatMap((event) => event.commits.map((/** @type {{ sha: string, verdict: string, replay: any }} */ commit) => [commit.sha, commit])))
  const checked = await checkStep({ deps, slug, config, base: run.base }, {
    role, outputs, precreated, result, known,
    visitHeads: inState ? run.nodes[node.id].heads : heads,
    sentBack: inState ? run.nodes[node.id].sentBack : feedback.length > 0,
  })
  if (checked.commits.length > 0) await journal.append('commits.checked', { step: node.id, visit, attempt, commits: checked.commits })
  if (checked.environment !== null) return stop(context, phase, 'environment', checked.environment)
  const failed = checked.missing.length > 0 || checked.failures.length > 0
  const routed = failed ? { next: null } : leave(context, run, node.id, null, [])
  await journal.append('step.recorded', {
    step: node.id,
    visit,
    attempt,
    outcome: failed ? 'failed' : 'done',
    code: failed ? checked.code : routed.code ?? null,
    missing: checked.missing,
    failures: checked.failures,
    next: routed.next,
    reason: routed.reason,
    durationMs: deps.clock.now().getTime() - started.getTime(),
    replayMs: checked.replayMs,
    cost, // undefined when the host reports none: the journal line leaves it out
  })
  await warnSlowReplay(context, phase)
  return null
}

/**
 * A test command as the agent can run it: the base the run diffs against in place of `{baseSha}`.
 * @param {string | undefined} line @param {string | undefined} sha
 */
const testLine = (line, sha) => (line === undefined ? null : sha ? line.replaceAll('{baseSha}', sha) : line)

/**
 * Tells the developer once per phase that replaying red commits takes more than its share of
 * the phase, while every red commit is replayed.
 * @param {Context} context @param {string} phase
 */
const warnSlowReplay = async ({ deps, slug, journal, config }, phase) => {
  if (config.tdd.replay !== 'all') return
  const run = deriveRun(journal.events)
  const replayMs = run.replayMs[phase] ?? 0
  const phaseMs = deps.clock.now().getTime() - Date.parse(run.phaseStarted[phase])
  if (run.replayWarned.includes(phase) || replayMs <= REPLAY_SHARE * phaseMs) return
  await journal.append('tdd.replay-slow', { phase, replayMs, phaseMs })
  deps.progress.log(
    `${slug}: replaying test commits took ${Math.round((100 * replayMs) / phaseMs)}% of ${phase}; ` +
    `set "tdd": { "replay": "last-red" } in ${CONFIG_FILE} to replay only the last test commit of each story`,
  )
}

/**
 * A gate node: the gates of the components the story touched, then for a goal gate those of
 * every other component.
 * @param {Context} context
 * @param {RunState} run
 * @param {WorkStep} next
 * @returns {Promise<RunOutcome | null>}
 */
const gate = async (context, run, next) => {
  const { deps, slug, journal, config } = context
  const { phase, node, visit, attempt, resumed } = next
  if (!resumed) await journal.append('step.started', { step: node.id, phase, gates: node.gates, visit, attempt })
  deps.progress.log(`${slug}: ${node.id} (${node.gates.join(', ')})${visit > 1 ? `, pass ${visit}` : ''}`)
  if (config.components.length === 0) return stop(context, phase, 'no-components', `${CONFIG_FILE} lists no component, so ${node.id} has nothing to run; run skraft init to detect them`)
  const started = deps.clock.now()
  const request = { slug, journal, components: config.components, base: run.base, only: node.gates }
  const touched = await runGates(deps, { ...request, scope: 'touched' })
  if (touched.conflict !== null) throw new JournalConflict(touched.conflict)
  let { gates, failure } = touched
  if (failure === null && node.goal) {
    const rest = await runGates(deps, { ...request, scope: 'all', skip: touched.components })
    gates = [...gates, ...rest.gates]
    failure = rest.failure
  }
  const failures = gates.filter((result) => result.status === 'fail').map((result) => `${result.component}/${result.gate}: ${result.reason} (evidence: ${result.evidence})`)
  if (failure === 'environment') return stop(context, phase, 'environment', failures.join('; '))
  const routed = leave(context, run, node.id, failure === null ? 'PASS' : 'FAIL', failures)
  await journal.append('step.recorded', {
    step: node.id,
    visit,
    attempt,
    outcome: failure === null ? 'pass' : 'fail',
    code: routed.code ?? null,
    failures,
    next: routed.next,
    reason: routed.reason,
    durationMs: deps.clock.now().getTime() - started.getTime(),
  })
  return null
}

/**
 * A locked gate the repository's workflow unlocked: journaled with its reason, then passed.
 * @param {Context} context @param {RunState} run @param {SkipStep} next
 * @returns {Promise<null>}
 */
const skip = async (context, run, { phase, node, visit, resumed }) => {
  const { deps, slug, journal } = context
  const reason = /** @type {string} */ (node.unlock)
  if (!resumed) await journal.append('step.started', { step: node.id, phase, gates: node.gates, visit, attempt: 1 })
  const routed = leave(context, run, node.id, 'PASS', [])
  await journal.append('step.recorded', { step: node.id, visit, attempt: 1, outcome: 'skipped', code: routed.code ?? null, failures: [], next: routed.next, reason: routed.reason ?? `unlocked: ${reason}`, durationMs: 0 })
  deps.progress.log(`${slug}: ${node.id} skipped, unlocked: ${reason}`)
  return null
}

/**
 * The host or the machine stopped the run: the step stays open, and the next run picks it up.
 * @param {Context} context @param {string} phase @param {string} code @param {string} reason
 * @returns {Promise<RunOutcome>}
 */
const stop = async ({ slug, journal }, phase, code, reason) => {
  await journal.append('run.stopped', { code, reason })
  return { status: 'blocked', slug, phase, code, reason }
}
