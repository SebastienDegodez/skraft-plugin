import { CONFIG_FILE } from '../domain/config/skraft-config.mjs'
import { deriveRun } from '../domain/journal/run-state.mjs'
import { parseCommand } from '../domain/gates/command-line.mjs'
import { failureOf, GATE_ORDER, gatesOf, isTouched, needsDocker } from '../domain/gates/gate-plan.mjs'
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
 *   workspace: import('./ports/workspace.mjs').Workspace,
 *   sourceControl: import('./ports/source-control.mjs').SourceControl,
 *   commandRunner: import('./ports/command-runner.mjs').CommandRunner,
 * } & Parameters<typeof openActiveRun>[0]} GateDeps
 */

/** Asked once per RunGate call, when a Microcks component runs a test gate. */
const DOCKER_PROBE = Object.freeze(['docker', 'info'])

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
    if (components.length === 0) {
      return { ...empty, status: 'refused', slug, code: 'no-components', reason: `${CONFIG_FILE} lists no component; run skraft init to detect them` }
    }
    const { base } = deriveRun(journal.events)
    const selected = []
    for (const component of components) {
      if (scope === 'all' || (await touched(deps, component, components, baseOf(base, component.name)?.sha ?? null))) selected.push(component)
    }
    /** @type {GateResult[]} */
    const gates = []
    /** @type {Promise<boolean> | null} */
    let docker = null
    const dockerReady = () => (docker ??= dockerAnswers(deps))
    try {
      for (const component of selected) {
        if (gatesOf(component).length === 0) {
          gates.push(await noGate(deps, { slug, component, scope, journal }))
          continue
        }
        for (const gate of gatesOf(component)) {
          const ready = needsDocker(component, gate) ? await dockerReady() : true
          const result = await runOne(deps, { slug, component, gate, scope, journal, baseSha: baseOf(base, component.name)?.sha ?? null, docker: ready })
          gates.push(result)
          if (result.status === 'fail') break
        }
      }
    } catch (error) {
      if (!(error instanceof JournalConflict)) throw error
      return { ...empty, status: 'blocked', slug, components: selected.map(({ name }) => name), gates, code: 'journal-changed', reason: error.message }
    }
    const failed = gates.filter((gate) => gate.status === 'fail')
    const failure = failed.some((gate) => gate.failure === 'environment') ? 'environment' : failed.length > 0 ? 'deterministic' : null
    const names = selected.map(({ name }) => name)
    return {
      status: failed.length > 0 ? 'failed' : 'passed',
      slug,
      scope,
      components: names,
      gates,
      failure,
      code: null,
      reason: failed.length > 0
        ? failed.map((gate) => `${gate.component}/${gate.gate}: ${gate.reason}`).join('; ')
        : names.length === 0 ? 'no component changed since its base; no gate to run' : `${gates.length} gates passed on ${names.join(', ')}`,
    }
  },
})

/**
 * A component with no gate command cannot prove anything: it fails, as environment, until the
 * developer gives it one.
 * @param {GateDeps} deps
 * @param {{ slug: string, component: Component, scope: GateScope, journal: import('./run-journal.mjs').OpenJournal }} context
 * @returns {Promise<GateResult>}
 */
const noGate = async (deps, { slug, component, scope, journal }) => {
  const reason = `no gate command; give it at least one of ${GATE_ORDER.join(', ')} in ${CONFIG_FILE}`
  await journal.append('gate.ran', { component: component.name, gate: 'none', scope, command: null, status: 'fail', failure: 'environment', exitCode: null, durationMs: 0, evidence: null })
  return { component: component.name, gate: 'none', status: 'fail', failure: 'environment', reason, evidence: deps.files.location(slug, `gates/${component.name}`) }
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
const dockerAnswers = async (deps) => {
  const answer = await deps.commandRunner.run({ argv: [...DOCKER_PROBE], cwd: '.' })
  return answer.started && answer.exitCode === 0
}

/**
 * @param {GateDeps} deps
 * @param {{ slug: string, component: Component, gate: string, scope: GateScope, journal: import('./run-journal.mjs').OpenJournal, baseSha: string | null, docker: boolean }} context
 * @returns {Promise<GateResult>}
 */
const runOne = async (deps, { slug, component, gate, scope, journal, baseSha, docker }) => {
  const line = component.commands[gate]
  const earlier = journal.events.filter((event) => event.type === 'gate.ran' && event.component === component.name && event.gate === gate).length
  const evidencePath = `gates/${component.name}/${gate}-${earlier + 1}.log`
  const evidence = deps.files.location(slug, evidencePath)
  const parsed = parseCommand(line, { baseSha })
  /** @type {{ started: boolean, exitCode: number | null, stdout: string, stderr: string, error?: string } | null} */
  let result = null
  let reason
  let durationMs = 0
  if (!parsed.ok) {
    reason = `command ${JSON.stringify(line)} ${parsed.reason}`
  } else if (!docker) {
    reason = `Docker does not answer and ${component.name} mocks with Microcks; start Docker, or set "mocking": { "strategy": "inprocess" } on the component`
  } else {
    const started = deps.clock.now()
    result = await deps.commandRunner.run({ argv: parsed.argv, cwd: component.root })
    durationMs = deps.clock.now().getTime() - started.getTime()
    reason = !result.started
      ? `${result.error ?? `${parsed.argv[0]} could not be started`}; install it or change the command in ${CONFIG_FILE}`
      : result.exitCode === null ? `${result.error ?? 'stopped without an exit code'}; run it again` : `exited ${result.exitCode}`
  }
  const failure = result === null ? 'environment' : failureOf(result)
  await deps.files.write(slug, evidencePath, [
    `$ ${line}`,
    `cwd: ${component.root}`,
    `result: ${failure === null ? 'pass' : `fail (${failure})`}: ${reason}`,
    ...(result ? ['--- stdout', result.stdout, '--- stderr', result.stderr] : []),
    '',
  ].join('\n'))
  const status = failure === null ? 'pass' : 'fail'
  await journal.append('gate.ran', {
    component: component.name, gate, scope, command: line, status, failure,
    exitCode: result?.exitCode ?? null, durationMs, evidence: evidencePath,
  })
  return { component: component.name, gate, status, failure, reason: failure === null ? 'passed' : reason, evidence }
}
