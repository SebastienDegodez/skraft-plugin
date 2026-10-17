import { CONFIG_FILE, NO_COMPONENT, NO_GATE } from '../domain/config/skraft-config.mjs'
import { deriveRun } from '../domain/journal/run-state.mjs'
import { commandText, lookedFor, parseCommand, programChoices } from '../domain/gates/command-line.mjs'
import { DOCKER_HINT, DOCKER_PROBE, failureOf, gatesOf, isTouched, needsDocker } from '../domain/gates/gate-plan.mjs'
import { baseOf, loadConfig } from './bases.mjs'
import { openActiveRun } from './active-run.mjs'
import { JournalConflict } from './run-journal.mjs'

/**
 * @typedef {import('../domain/config/skraft-config.mjs').Component} Component
 * @typedef {import('../domain/gates/gate-plan.mjs').FailureClass} FailureClass
 * @typedef {'touched' | 'all'} GateScope
 *   touched: during the DELIVER loop, the components the story changed since their base;
 *   all: at the close of DELIVER, every component.
 * @typedef {{ component: string, gate: string, status: 'pass' | 'fail', failure: FailureClass | null, reason: string, evidence: string }} GateResult
 * @typedef {{
 *   status: 'passed' | 'failed' | 'refused' | 'blocked', slug: string | null, scope: GateScope,
 *   components: string[], gates: GateResult[], failure: FailureClass | null, code: string | null, reason: string,
 * }} GateOutcome
 * @typedef {{
 *   activePipeline: import('./ports/active-pipeline.mjs').ActivePipeline,
 *   files: import('./ports/tracking-files.mjs').TrackingFiles,
 *   workspace: import('./ports/workspace.mjs').ConfigSource,
 *   sourceControl: import('./ports/source-control.mjs').SourceControl,
 *   commandRunner: import('./ports/command-runner.mjs').CommandRunner,
 * } & Parameters<typeof openActiveRun>[0]} GateDeps
 * @typedef {{ slug: string, component: Component, scope: GateScope, journal: import('./run-journal.mjs').OpenJournal }} GateContext
 * @typedef {{ argv: string[], started: boolean, exitCode: number | null, stdout: string, stderr: string, error?: string }} Started
 * @typedef {{ shown: string, result: Started | null, durationMs: number, reason: string }} Attempt
 */

/**
 * RunGate — runs the gate commands of `skraft-config.json` from each component's root, writes
 * the evidence under the tracking folder and journals one `gate.ran` per gate. A component
 * stops at its first failing gate; the others still run.
 * @param {GateDeps} deps
 */
export const createRunGate = (deps) => Object.freeze({
  /** @param {{ slug?: string | null, scope?: GateScope }} [request] @returns {Promise<GateOutcome>} */
  run: (request) => runGate(deps, request),
})

/**
 * @param {GateDeps} deps @param {{ slug?: string | null, scope?: GateScope }} [request]
 * @returns {Promise<GateOutcome>}
 */
const runGate = async (deps, { slug: requested, scope = 'touched' } = {}) => {
  const opened = await openRunAndConfig(deps, requested)
  if (!opened.ok) return { scope, components: [], gates: [], failure: null, ...opened.refusal }
  const { slug, journal, components, shaOf } = opened
  const selected = await selectComponents(deps, components, { scope, shaOf })
  return gateSelected(deps, { slug, scope, journal }, { selected, shaOf })
}

/**
 * The active run and its configured components, or the refusal that stops before any gate.
 * shaOf: the base SHA each component diffs against.
 * @param {GateDeps} deps @param {string | null | undefined} requested
 * @returns {Promise<
 *   | { ok: true, slug: string, journal: GateContext['journal'], components: Component[], shaOf: (component: Component) => string | null }
 *   | { ok: false, refusal: Pick<GateOutcome, 'status' | 'slug' | 'code' | 'reason'> }
 * >}
 */
const openRunAndConfig = async (deps, requested) => {
  const opened = await openActiveRun(deps, requested)
  if (!opened.ok) return { ok: false, refusal: notOpened(opened.outcome) }
  const { slug, journal } = opened
  const loaded = await loadConfig(deps)
  if (!loaded.ok) return refused(slug, 'config-invalid', loaded.reason)
  const { components } = loaded.config
  if (components.length === 0) return refused(slug, 'no-components', NO_COMPONENT)
  return { ok: true, slug, journal, components, shaOf: baseShas(journal) }
}

/**
 * A run that does not open refuses when the caller can fix it, else it is blocked.
 * @param {import('./active-run.mjs').RunOutcome} outcome
 * @returns {Pick<GateOutcome, 'status' | 'slug' | 'code' | 'reason'>}
 */
const notOpened = (outcome) => ({ ...outcome, status: outcome.status === 'refused' ? 'refused' : 'blocked' })

/**
 * @param {string} slug @param {string} code @param {string} reason
 * @returns {{ ok: false, refusal: { status: 'refused', slug: string, code: string, reason: string } }}
 */
const refused = (slug, code, reason) => ({ ok: false, refusal: { status: 'refused', slug, code, reason } })

/**
 * The base SHA of a component in the run, or null when the run has no base for it.
 * @param {GateContext['journal']} journal
 */
const baseShas = (journal) => {
  const { base } = deriveRun(journal.events)
  return (/** @type {Component} */ component) => baseOf(base, component.name)?.sha ?? null
}

/**
 * The components whose gates run: every one for `all`, the touched ones otherwise.
 * @param {GateDeps} deps @param {Component[]} components
 * @param {{ scope: GateScope, shaOf: (component: Component) => string | null }} selection
 */
const selectComponents = async (deps, components, { scope, shaOf }) => {
  const selected = []
  for (const component of components) {
    if (scope === 'all' || (await touched(deps, component, components, shaOf(component)))) selected.push(component)
  }
  return selected
}

/**
 * Runs the selected components' gates; a journal changed under the run blocks it with the
 * gates that ran so far.
 * @param {GateDeps} deps @param {Omit<GateContext, 'component'>} run
 * @param {{ selected: Component[], shaOf: (component: Component) => string | null }} plan
 * @returns {Promise<GateOutcome>}
 */
const gateSelected = async (deps, run, { selected, shaOf }) => {
  const names = selected.map(({ name }) => name)
  /** @type {GateResult[]} */
  const gates = []
  try {
    await runEachComponent(deps, run, { selected, shaOf, gates })
  } catch (error) {
    return blockedOn(error, { ...run, names, gates })
  }
  const { status, failure, reason } = verdict(gates, names)
  return { status, slug: run.slug, scope: run.scope, components: names, gates, failure, code: null, reason }
}

/**
 * Docker is probed once per run, on the first gate that needs it.
 * @param {GateDeps} deps @param {Omit<GateContext, 'component'>} run
 * @param {{ selected: Component[], shaOf: (component: Component) => string | null, gates: GateResult[] }} plan
 */
const runEachComponent = async (deps, run, { selected, shaOf, gates }) => {
  /** @type {Promise<boolean> | null} */
  let docker = null
  const dockerReady = () => (docker ??= dockerAnswers(deps))
  for (const component of selected) {
    await runComponentGates(deps, { ...run, component }, { baseSha: shaOf(component), dockerReady, gates })
  }
}

/**
 * Appends a component's gate results until its first failing gate; with no gate, the
 * component fails.
 * @param {GateDeps} deps @param {GateContext} context
 * @param {{ baseSha: string | null, dockerReady: () => Promise<boolean>, gates: GateResult[] }} plan
 */
const runComponentGates = async (deps, context, { baseSha, dockerReady, gates }) => {
  const { component } = context
  if (gatesOf(component).length === 0) gates.push(await noGate(deps, context))
  for (const gate of gatesOf(component)) {
    const docker = needsDocker(component, gate) ? await dockerReady() : true
    const result = await runOne(deps, context, { gate, baseSha, docker })
    gates.push(result)
    if (result.status === 'fail') break
  }
}

/**
 * A journal changed under the run blocks it; any other error is not the gates' to handle.
 * @param {unknown} error
 * @param {{ slug: string, scope: GateScope, names: string[], gates: GateResult[] }} ran
 * @returns {GateOutcome}
 */
const blockedOn = (error, { slug, scope, names, gates }) => {
  if (!(error instanceof JournalConflict)) throw error
  return {
    scope, components: names, gates, failure: null,
    status: 'blocked', slug, code: 'journal-changed', reason: error.message,
  }
}

/**
 * Failed as environment when any failed gate is, so a human looks first.
 * @param {GateResult[]} gates @param {string[]} names the components the gates ran on
 * @returns {Pick<GateOutcome, 'status' | 'failure' | 'reason'>}
 */
const verdict = (gates, names) => {
  const failed = gates.filter((gate) => gate.status === 'fail')
  if (failed.length > 0) {
    return {
      status: 'failed',
      failure: failed.some((gate) => gate.failure === 'environment') ? 'environment' : 'deterministic',
      reason: failed.map((gate) => `${gate.component}/${gate.gate}: ${gate.reason}`).join('; '),
    }
  }
  const reason = names.length === 0 ? 'no component changed since its base; no gate to run' : `${gates.length} gates passed on ${names.join(', ')}`
  return { status: 'passed', failure: null, reason }
}

/**
 * A component with no gate command cannot prove anything: it fails, as environment, until the
 * developer gives it one.
 * @param {GateDeps} deps @param {GateContext} context @returns {Promise<GateResult>}
 */
const noGate = async (deps, { slug, component, scope, journal }) => {
  await journal.append('gate.ran', { component: component.name, gate: 'none', scope, command: null, status: 'fail', failure: 'environment', exitCode: null, durationMs: 0, evidence: null })
  return { component: component.name, gate: 'none', status: 'fail', failure: 'environment', reason: NO_GATE, evidence: deps.files.location(slug, `gates/${component.name}`) }
}

/**
 * A component without a base, or whose changes Git cannot list, counts as touched.
 * @param {GateDeps} deps @param {Component} component @param {Component[]} components @param {string | null} sha
 */
const touched = async (deps, component, components, sha) => {
  if (sha === null) return true
  const changed = await deps.sourceControl.changedFiles(component.root, sha)
  return changed === null || isTouched(component, components, changed)
}

/** @param {GateDeps} deps */
const dockerAnswers = async (deps) => failureOf(await deps.commandRunner.run({ argv: [...DOCKER_PROBE], cwd: '.' })) === null

/**
 * @param {GateDeps} deps @param {GateContext} context
 * @param {{ gate: string, baseSha: string | null, docker: boolean }} request
 * @returns {Promise<GateResult>}
 */
const runOne = async (deps, context, { gate, baseSha, docker }) => {
  const { slug, component, journal } = context
  const line = component.commands[gate]
  const evidence = nextEvidencePath(journal, component, gate)
  const tried = await attempt(deps, component, { line, baseSha, docker })
  const failure = tried.result === null ? 'environment' : failureOf(tried.result)
  const status = failure === null ? 'pass' : 'fail'
  await recordGate(deps, context, { gate, line, status, failure, evidence, tried })
  return { component: component.name, gate, status, failure, reason: tried.reason, evidence: deps.files.location(slug, evidence) }
}

/**
 * Each run of a gate keeps its own log: the count of its earlier runs, plus one.
 * @param {GateContext['journal']} journal @param {Component} component @param {string} gate
 */
const nextEvidencePath = (journal, component, gate) => {
  const earlier = journal.events.filter((event) => event.component === component.name && event.gate === gate).length
  return `gates/${component.name}/${gate}-${earlier + 1}.log`
}

/**
 * Writes the gate's evidence log, then journals its `gate.ran`.
 * @param {GateDeps} deps @param {GateContext} context
 * @param {{ gate: string, line: string, status: GateResult['status'], failure: FailureClass | null, evidence: string, tried: Attempt }} ran
 */
const recordGate = async (deps, { slug, component, scope, journal }, { gate, line, status, failure, evidence, tried }) => {
  await deps.files.write(slug, evidence, evidenceLog(component, failure, tried))
  await journal.append('gate.ran', {
    component: component.name, gate, scope, command: line, status, failure,
    exitCode: tried.result?.exitCode ?? null, durationMs: tried.durationMs, evidence,
  })
}

/**
 * @param {Component} component @param {FailureClass | null} failure @param {Attempt} tried
 * @returns {string}
 */
const evidenceLog = (component, failure, { shown, result, reason }) => [
  `$ ${shown}`,
  `cwd: ${component.root}`,
  `result: ${failure === null ? 'pass' : `fail (${failure})`}: ${reason}`,
  ...(result ? ['--- stdout', result.stdout, '--- stderr', result.stderr] : []),
  '',
].join('\n')

/**
 * The gate's command started from the component's root, unless it does not parse or needs a
 * Docker that does not answer. shown: the command as the evidence writes it.
 * @param {GateDeps} deps @param {Component} component
 * @param {{ line: string, baseSha: string | null, docker: boolean }} request
 * @returns {Promise<Attempt>}
 */
const attempt = async (deps, component, { line, baseSha, docker }) => {
  const parsed = parseCommand(line, { baseSha })
  if (!parsed.ok) return { shown: line, result: null, durationMs: 0, reason: `command ${JSON.stringify(line)} ${parsed.reason}` }
  if (!docker) {
    return { shown: commandText(parsed.argv), result: null, durationMs: 0, reason: `Docker does not answer and ${component.name} mocks with Microcks; ${DOCKER_HINT}` }
  }
  return startTimed(deps, parsed.argv, component.root)
}

/**
 * @param {GateDeps} deps @param {string[]} argv @param {string} cwd
 * @returns {Promise<Attempt>}
 */
const startTimed = async (deps, argv, cwd) => {
  const started = deps.clock.now()
  const result = await startFirst(deps, argv, cwd)
  const durationMs = deps.clock.now().getTime() - started.getTime()
  return { shown: commandText(result.argv), result, durationMs, reason: startReason(result) }
}

/**
 * What the developer does next: install a program that did not start, rerun a command that
 * did not finish.
 * @param {Started} result
 */
const startReason = (result) => !result.started
  ? `${result.error}; install it or change the command in ${CONFIG_FILE}`
  : result.exitCode === null ? `${result.error}; run it again` : `exited ${result.exitCode}`

/**
 * The first of the command's program choices that starts, with the argv it started. When none
 * starts, the answer to the program as written, with every place it was looked for.
 * @param {GateDeps} deps @param {string[]} argv @param {string} cwd
 * @returns {Promise<Started>}
 */
const startFirst = async (deps, argv, cwd) => {
  const choices = programChoices(argv)
  const answers = []
  for (const choice of choices) {
    const answer = await deps.commandRunner.run({ argv: choice, cwd })
    if (answer.started) return { ...answer, argv: choice }
    answers.push(answer)
  }
  const written = answers[choices.findIndex(([program]) => program === argv[0])]
  return { ...written, argv, error: `${written.error}${lookedFor(choices)}` }
}
