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
 */

/**
 * RunGate — runs the gate commands of `skraft-config.json` from each component's root, writes
 * the evidence under the tracking folder and journals one `gate.ran` per gate. A component
 * stops at its first failing gate; the others still run.
 * @param {GateDeps} deps
 */
export const createRunGate = (deps) => Object.freeze({
  /** @param {{ slug?: string | null, scope?: GateScope }} [request] @returns {Promise<GateOutcome>} */
  run: async ({ slug: requested, scope = 'touched' } = {}) => {
    const empty = { scope, components: [], gates: [], failure: null }
    const opened = await openActiveRun(deps, requested)
    if (!opened.ok) return { ...empty, ...opened.outcome, status: opened.outcome.status === 'refused' ? 'refused' : 'blocked' }
    const { slug, journal } = opened
    const loaded = await loadConfig(deps)
    if (!loaded.ok) return { ...empty, status: 'refused', slug, code: 'config-invalid', reason: loaded.reason }
    const { components } = loaded.config
    if (components.length === 0) return { ...empty, status: 'refused', slug, code: 'no-components', reason: NO_COMPONENT }
    const { base } = deriveRun(journal.events)
    const shaOf = (/** @type {Component} */ component) => baseOf(base, component.name)?.sha ?? null
    const selected = []
    for (const component of components) {
      if (scope === 'all' || (await touched(deps, component, components, shaOf(component)))) selected.push(component)
    }
    const names = selected.map(({ name }) => name)
    /** @type {GateResult[]} */
    const gates = []
    /** @type {Promise<boolean> | null} */
    let docker = null
    const dockerReady = () => (docker ??= dockerAnswers(deps))
    try {
      for (const component of selected) {
        const context = { slug, component, scope, journal }
        if (gatesOf(component).length === 0) gates.push(await noGate(deps, context))
        for (const gate of gatesOf(component)) {
          const ready = needsDocker(component, gate) ? await dockerReady() : true
          const result = await runOne(deps, context, { gate, baseSha: shaOf(component), docker: ready })
          gates.push(result)
          if (result.status === 'fail') break
        }
      }
    } catch (error) {
      if (!(error instanceof JournalConflict)) throw error
      return { ...empty, status: 'blocked', slug, components: names, gates, code: 'journal-changed', reason: error.message }
    }
    const { status, failure, reason } = verdict(gates, names)
    return { status, slug, scope, components: names, gates, failure, code: null, reason }
  },
})

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
const runOne = async (deps, { slug, component, scope, journal }, { gate, baseSha, docker }) => {
  const line = component.commands[gate]
  const earlier = journal.events.filter((event) => event.component === component.name && event.gate === gate).length
  const evidencePath = `gates/${component.name}/${gate}-${earlier + 1}.log`
  const { shown, result, durationMs, reason } = await attempt(deps, component, { line, baseSha, docker })
  const failure = result === null ? 'environment' : failureOf(result)
  const status = failure === null ? 'pass' : 'fail'
  await deps.files.write(slug, evidencePath, [
    `$ ${shown}`,
    `cwd: ${component.root}`,
    `result: ${failure === null ? 'pass' : `fail (${failure})`}: ${reason}`,
    ...(result ? ['--- stdout', result.stdout, '--- stderr', result.stderr] : []),
    '',
  ].join('\n'))
  await journal.append('gate.ran', {
    component: component.name, gate, scope, command: line, status, failure,
    exitCode: result?.exitCode ?? null, durationMs, evidence: evidencePath,
  })
  return { component: component.name, gate, status, failure, reason, evidence: deps.files.location(slug, evidencePath) }
}

/**
 * The gate's command started from the component's root, unless it does not parse or needs a
 * Docker that does not answer. shown: the command as the evidence writes it.
 * @param {GateDeps} deps @param {Component} component
 * @param {{ line: string, baseSha: string | null, docker: boolean }} request
 * @returns {Promise<{ shown: string, result: Started | null, durationMs: number, reason: string }>}
 */
const attempt = async (deps, component, { line, baseSha, docker }) => {
  const parsed = parseCommand(line, { baseSha })
  if (!parsed.ok) return { shown: line, result: null, durationMs: 0, reason: `command ${JSON.stringify(line)} ${parsed.reason}` }
  if (!docker) {
    return { shown: commandText(parsed.argv), result: null, durationMs: 0, reason: `Docker does not answer and ${component.name} mocks with Microcks; ${DOCKER_HINT}` }
  }
  const started = deps.clock.now()
  const result = await startFirst(deps, parsed.argv, component.root)
  const durationMs = deps.clock.now().getTime() - started.getTime()
  const reason = !result.started
    ? `${result.error}; install it or change the command in ${CONFIG_FILE}`
    : result.exitCode === null ? `${result.error}; run it again` : `exited ${result.exitCode}`
  return { shown: commandText(result.argv), result, durationMs, reason }
}

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
