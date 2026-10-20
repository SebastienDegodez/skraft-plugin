import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { commandText, lookedFor, parseCommand, programChoices } from '../../domain/gates/command-line.mjs'
import { DOCKER_HINT, DOCKER_PROBE, failureOf, GATE_ORDER, gatesOf, isTouched, needsDocker } from '../../domain/gates/gate-plan.mjs'
import { aliveCount, mutationReportOf, readSurvivors, sourceCandidates } from '../../domain/gates/mutation-report.mjs'
import { joinRelative } from '../../domain/config/relative-path.mjs'
import { workingCopyOf } from '../../domain/review/locations.mjs'
import { baseOf } from '../config/bases.mjs'
import { JournalConflict } from '../journal/run-journal.mjs'

/**
 * @typedef {import('../../domain/config/skraft-config.mjs').Component} Component
 * @typedef {import('../../domain/gates/gate-plan.mjs').FailureClass} FailureClass
 * @typedef {import('../config/bases.mjs').Base} Base
 * @typedef {'touched' | 'all'} GateScope
 *   touched: during the DELIVER loop, the components the story changed since their base;
 *   all: at the close of DELIVER, every component.
 * @typedef {import('../../domain/gates/mutation-report.mjs').Survivor} Survivor
 * @typedef {{ component: string, gate: string, status: 'pass' | 'fail', failure: FailureClass | null, reason: string, evidence: string, survivors: Survivor[] | null }} GateResult
 *   survivors: the mutants a failed mutation run left alive, from its report; null for any other result.
 * @typedef {{
 *   files: import('../ports/tracking-files.mjs').TrackingFiles,
 *   workspace: Pick<import('../ports/workspace.mjs').Workspace, 'read' | 'write'>,
 *   sourceControl: import('../ports/source-control.mjs').SourceControl,
 *   commandRunner: import('../ports/command-runner.mjs').CommandRunner,
 *   clock: import('../ports/clock.mjs').Clock,
 * }} GateRunDeps
 * @typedef {{
 *   slug: string, journal: import('../journal/run-journal.mjs').OpenJournal, components: Component[], base: ReadonlyArray<Base>,
 *   scope: GateScope, only?: readonly string[], skip?: readonly string[],
 * }} GateRunRequest
 *   only: the gates to run, every one of GATE_ORDER when absent; skip: components not to run.
 * @typedef {{ components: string[], gates: GateResult[], failure: FailureClass | null, conflict: string | null }} GateRun
 * @typedef {{ slug: string, component: Component, scope: GateScope, journal: GateRunRequest['journal'], only: readonly string[] }} GateContext
 * @typedef {{ argv: string[], started: boolean, exitCode: number | null, stdout: string, stderr: string, error?: string }} Started
 * @typedef {{ shown: string, result: Started | null, durationMs: number, reason: string }} Attempt
 */

/**
 * Runs the gate commands of the components in scope from each component's root, writes the
 * evidence under the tracking folder and journals one `gate.ran` per gate. A component stops
 * at its first failing gate; the others still run. Another writer of the journal stops the
 * gates: conflict says so, with the gates run until then.
 * @param {GateRunDeps} deps @param {GateRunRequest} request @returns {Promise<GateRun>}
 */
// Stryker disable next-line ArrayDeclaration: component names are kebab-case, so no component is named like the placeholder
export const runGates = async (deps, { slug, journal, components, base, scope, only = GATE_ORDER, skip = [] }) => {
  const shaOf = (/** @type {Component} */ component) => baseOf(base, component.name)?.sha ?? null
  const selected = await selectComponents(deps, components, { scope, skip, shaOf })
  const names = selected.map(({ name }) => name)
  /** @type {GateResult[]} */
  const gates = []
  try {
    await runEachComponent(deps, { slug, scope, journal, only }, { selected, shaOf, gates })
  } catch (error) {
    return stoppedBy(error, { components: names, gates })
  }
  return { components: names, gates, failure: failureOfGates(gates), conflict: null }
}

/**
 * Another writer of the journal stops the gates with those run until then; any other error is
 * not the gates' to handle.
 * @param {unknown} error @param {Pick<GateRun, 'components' | 'gates'>} ran @returns {GateRun}
 */
const stoppedBy = (error, { components, gates }) => {
  if (!(error instanceof JournalConflict)) throw error
  return { components, gates, failure: null, conflict: error.message }
}

/**
 * Environment when any failed gate is, so a human looks first; null when every gate passed.
 * @param {GateResult[]} gates @returns {FailureClass | null}
 */
const failureOfGates = (gates) => {
  const failed = gates.filter((gate) => gate.status === 'fail')
  if (failed.length === 0) return null
  return failed.some((gate) => gate.failure === 'environment') ? 'environment' : 'deterministic'
}

/**
 * The components whose gates run, the skipped ones left out: every one for `all`, the touched
 * ones otherwise.
 * @param {GateRunDeps} deps @param {Component[]} components
 * @param {{ scope: GateScope, skip: readonly string[], shaOf: (component: Component) => string | null }} selection
 */
const selectComponents = async (deps, components, { scope, skip, shaOf }) => {
  const selected = []
  for (const component of components.filter(({ name }) => !skip.includes(name))) {
    if (scope === 'all' || (await touched(deps, component, components, shaOf(component)))) selected.push(component)
  }
  return selected
}

/**
 * Docker is probed once per run of the gates, on the first gate that needs it.
 * @param {GateRunDeps} deps @param {Omit<GateContext, 'component'>} run
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
 * Appends a component's gate results, among the gates asked for, until its first failing
 * gate; with none of them, the component fails.
 * @param {GateRunDeps} deps @param {GateContext} context
 * @param {{ baseSha: string | null, dockerReady: () => Promise<boolean>, gates: GateResult[] }} plan
 */
const runComponentGates = async (deps, context, { baseSha, dockerReady, gates }) => {
  const { component, only } = context
  const names = gatesOf(component).filter((gate) => only.includes(gate))
  if (names.length === 0) gates.push(await noGate(deps, context))
  for (const gate of names) {
    const docker = needsDocker(component, gate) ? await dockerReady() : true
    const result = await runOne(deps, context, { gate, baseSha, docker })
    gates.push(result)
    if (result.status === 'fail') break
  }
}

/**
 * A component with none of the gates asked for cannot prove anything: it fails, as
 * environment, until the developer gives it one.
 * @param {GateRunDeps} deps @param {GateContext} context @returns {Promise<GateResult>}
 */
const noGate = async (deps, { slug, component, scope, journal, only }) => {
  const reason = `no gate command; give it at least one of ${only.join(', ')} in ${CONFIG_FILE}`
  await journal.append('gate.ran', { component: component.name, gate: 'none', scope, command: null, status: 'fail', failure: 'environment', exitCode: null, durationMs: 0, evidence: null })
  return { component: component.name, gate: 'none', status: 'fail', failure: 'environment', reason, evidence: deps.files.location(slug, `gates/${component.name}`), survivors: null }
}

/**
 * A component without a base, or whose changes Git cannot list, counts as touched.
 * @param {GateRunDeps} deps @param {Component} component @param {Component[]} components @param {string | null} sha
 */
const touched = async (deps, component, components, sha) => {
  if (sha === null) return true
  const changed = await deps.sourceControl.changedFiles(component.root, sha)
  return changed === null || isTouched(component, components, changed)
}

/** @param {GateRunDeps} deps */
const dockerAnswers = async (deps) => failureOf(await deps.commandRunner.run({ argv: [...DOCKER_PROBE], cwd: '.' })) === null

/**
 * @param {GateRunDeps} deps @param {GateContext} context
 * @param {{ gate: string, baseSha: string | null, docker: boolean }} request
 * @returns {Promise<GateResult>}
 */
const runOne = async (deps, context, { gate, baseSha, docker }) => {
  const { slug, component, journal } = context
  const line = component.commands[gate]
  const evidence = nextEvidencePath(journal, component, gate)
  if (gate === 'mutation') await clearReport(deps, component)
  const tried = await attempt(deps, component, { line, baseSha, docker })
  const { failure, reason, survivors } = await judgeRun(deps, { slug, component, gate }, tried)
  const status = failure === null ? 'pass' : 'fail'
  await recordGate(deps, context, { gate, line, status, failure, evidence, tried: { ...tried, reason }, survivors })
  return { component: component.name, gate, status, failure, reason, evidence: deps.files.location(slug, evidence), survivors }
}

/**
 * The run's failure class and reason; a mutation run that failed also names the mutants it left
 * alive, from the report its tool wrote. A report that cannot be read leaves the run unproven:
 * a human looks first.
 * @param {GateRunDeps} deps @param {{ slug: string, component: Component, gate: string }} ran @param {Attempt} tried
 * @returns {Promise<{ failure: FailureClass | null, reason: string, survivors: Survivor[] | null }>}
 */
const judgeRun = async (deps, { slug, component, gate }, tried) => {
  const failure = tried.result === null ? 'environment' : failureOf(tried.result)
  if (gate !== 'mutation' || failure !== 'deterministic') return { failure, reason: tried.reason, survivors: null }
  const read = await survivorsOf(deps, slug, component)
  if (!read.ok) return { failure: 'environment', reason: `${tried.reason}; ${read.reason}`, survivors: null }
  return { failure, reason: `${tried.reason}, ${aliveCount(read.survivors.length)}`, survivors: read.survivors }
}

/**
 * A report an earlier run left is emptied before the next run, so that only one this run wrote
 * is read; a missing one is not created.
 * @param {GateRunDeps} deps @param {Component} component
 */
const clearReport = async (deps, component) => {
  const path = joinRelative(component.root, mutationReportOf(component))
  if ((await deps.workspace.read(path)) !== null) await deps.workspace.write(path, '')
}

/**
 * The survivors the component's mutation report names, each file in the working copy, or why it
 * names none.
 * @param {GateRunDeps} deps @param {string} slug @param {Component} component
 * @returns {Promise<import('../../domain/gates/mutation-report.mjs').SurvivorReading>}
 */
const survivorsOf = async (deps, slug, component) => {
  const report = mutationReportOf(component)
  const path = joinRelative(component.root, report)
  const text = await deps.workspace.read(path)
  const workingCopy = workingCopyOf(deps.files.location(slug, 'marker'), slug)
  const read = text === null || text === '' ? { ok: /** @type {const} */ (false), reason: 'is missing' } : readSurvivors(text, { report, root: component.root, workingCopy })
  if (!read.ok) return { ok: false, reason: `the mutation report ${path} ${read.reason}; have the command write it there, or name the file it writes with mutationReport on ${component.name} in ${CONFIG_FILE}` }
  return read.inSources ? { ...read, survivors: await inSourceFolders(deps, component, read.survivors) } : read
}

/**
 * Survivors a report names relative to a source folder, each in the folder that holds its file;
 * under the component's root when none does.
 * @param {GateRunDeps} deps @param {Component} component @param {Survivor[]} survivors
 */
const inSourceFolders = async (deps, component, survivors) => {
  /** @type {Map<string, string>} */
  const located = new Map()
  for (const file of new Set(survivors.map((survivor) => survivor.file))) located.set(file, await locateSource(deps, component, file))
  return survivors.map((survivor) => ({ ...survivor, file: /** @type {string} */ (located.get(survivor.file)) }))
}

/** @param {GateRunDeps} deps @param {Component} component @param {string} file relative to a source folder */
const locateSource = async (deps, component, file) => {
  for (const candidate of sourceCandidates(component, file)) if ((await deps.workspace.read(candidate)) !== null) return candidate
  return joinRelative(component.root, file)
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
 * @param {GateRunDeps} deps @param {GateContext} context
 * @param {{ gate: string, line: string, status: GateResult['status'], failure: FailureClass | null, evidence: string, tried: Attempt, survivors: Survivor[] | null }} ran
 *   a mutation gate journals how many mutants it left alive, null when it passed or could not tell
 */
const recordGate = async (deps, { slug, component, scope, journal }, { gate, line, status, failure, evidence, tried, survivors }) => {
  await deps.files.write(slug, evidence, evidenceLog(component, failure, tried))
  await journal.append('gate.ran', {
    component: component.name, gate, scope, command: line, status, failure,
    exitCode: tried.result?.exitCode ?? null, durationMs: tried.durationMs, evidence,
    ...(gate === 'mutation' ? { survivors: survivors?.length ?? null } : {}),
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
 * @param {GateRunDeps} deps @param {Component} component
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
 * @param {GateRunDeps} deps @param {string[]} argv @param {string} cwd
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
 * @param {GateRunDeps} deps @param {string[]} argv @param {string} cwd
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
