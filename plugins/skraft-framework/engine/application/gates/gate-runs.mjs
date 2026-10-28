import { CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { commandText, parseCommand } from '../../domain/gates/command-line.mjs'
import { DOCKER_HINT, DOCKER_PROBE, failureOf, GATE_ORDER, gatesOf, isTouched, needsDocker } from '../../domain/gates/gate-plan.mjs'
import { isChanged, missedBars, missedText, scopeScores } from '../../domain/gates/mutation-bar.mjs'
import { aliveCount, mutationReportOf, readMutants, sourceCandidates, survivorLine } from '../../domain/gates/mutation-report.mjs'
import { joinRelative } from '../../domain/config/relative-path.mjs'
import { workingCopyOf } from '../../domain/review/locations.mjs'
import { baseOf } from '../config/bases.mjs'
import { JournalConflict } from '../journal/run-journal.mjs'
import { startFirst } from './program-start.mjs'

/**
 * @typedef {import('../../domain/config/skraft-config.mjs').Component} Component
 * @typedef {import('../../domain/gates/gate-plan.mjs').FailureClass} FailureClass
 * @typedef {import('../config/bases.mjs').Base} Base
 * @typedef {'touched' | 'all'} GateScope
 *   touched: during the DELIVER loop, the components the story changed since their base;
 *   all: at the close of DELIVER, every component.
 * @typedef {import('../../domain/gates/mutation-report.mjs').Survivor} Survivor
 * @typedef {import('../../domain/gates/mutation-report.mjs').Mutant} Mutant
 * @typedef {{ component: string, gate: string, status: 'pass' | 'fail', failure: FailureClass | null, reason: string, evidence: string, survivors: Survivor[] | null }} GateResult
 *   survivors: the mutants a failed mutation run left alive in the scopes that miss their bar,
 *   from its report; null for any other result.
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
 * @typedef {{ cwd: string, timeoutMs: number | undefined }} Where
 *   cwd: the component's root; timeoutMs: how long the program may run, no limit when undefined.
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
  const { failure, reason, survivors, scores } = await judgeRun(deps, { slug, component, gate, baseSha }, tried)
  const status = failure === null ? 'pass' : 'fail'
  await recordGate(deps, context, { gate, line, status, failure, evidence, tried: { ...tried, reason }, survivors, scores })
  return { component: component.name, gate, status, failure, reason, evidence: deps.files.location(slug, evidence), survivors }
}

/**
 * @typedef {{ slug: string, component: Component, gate: string, baseSha: string | null }} Ran
 * @typedef {{ failure: FailureClass | null, reason: string, survivors: Survivor[] | null, scores: ScopeScore[] | null }} Judged
 *   scores: the score of each scope of a mutation run whose report was read, null otherwise.
 * @typedef {import('../../domain/gates/mutation-bar.mjs').ScopeScore} ScopeScore
 */

/**
 * The run's failure class and reason. A mutation run that started is judged by its report, not
 * by its exit code.
 * @param {GateRunDeps} deps @param {Ran} ran @param {Attempt} tried
 * @returns {Promise<Judged>}
 */
const judgeRun = async (deps, ran, tried) => {
  const failure = tried.result === null ? 'environment' : failureOf(tried.result)
  if (ran.gate !== 'mutation' || failure === 'environment') return { failure, reason: tried.reason, survivors: null, scores: null }
  return judgeMutation(deps, ran, tried)
}

/**
 * A mutation run fails while a scope of the files in scope misses its bar, and hands out the
 * survivors of those scopes only; the bar decides, whatever the exit code. A report that cannot
 * be read leaves the run unproven: a human looks first.
 * @param {GateRunDeps} deps @param {Ran} ran @param {Attempt} tried
 * @returns {Promise<Judged>}
 */
const judgeMutation = async (deps, { slug, component, baseSha }, tried) => {
  const read = await reportOf(deps, slug, component)
  if (!read.ok) return { failure: 'environment', reason: `${tried.reason}; ${read.reason}`, survivors: null, scores: null }
  const scores = scopeScores(await mutantsInScope(deps, component, { baseSha, read }), component.root)
  const missed = missedBars(scores)
  if (missed.length > 0) return { ...missedVerdict(tried, missed), scores }
  return { failure: null, reason: `${tried.reason}, each scope meets its bar`, survivors: null, scores }
}

/**
 * The score of each scope against its bar, then how many survivors the run hands out.
 * @param {Attempt} tried @param {import('../../domain/gates/mutation-bar.mjs').ScopeScore[]} missed
 * @returns {Omit<Judged, 'scores'>}
 */
const missedVerdict = (tried, missed) => {
  const survivors = missed.flatMap((score) => score.survivors)
  return { failure: 'deterministic', reason: [tried.reason, ...missed.map(missedText), aliveCount(survivors.length)].join(', '), survivors }
}

/**
 * The mutants of the files the component changed since its base, every one when it has no base
 * or Git cannot list its changes; a file PIT names then located in its source folder.
 * @param {GateRunDeps} deps @param {Component} component
 * @param {{ baseSha: string | null, read: import('../../domain/gates/mutation-report.mjs').MutantReading & { ok: true } }} report
 * @returns {Promise<Mutant[]>}
 */
const mutantsInScope = async (deps, component, { baseSha, read }) => {
  const changed = await changedSince(deps, component, baseSha)
  const kept = changed === null ? read.mutants : read.mutants.filter((mutant) => isChanged(mutant.file, changed, read.inSources))
  return read.inSources ? inSourceFolders(deps, component, kept) : kept
}

/**
 * The files the component changed since its base, relative to the working copy; null when it
 * has no base or Git cannot list its changes.
 * @param {GateRunDeps} deps @param {Component} component @param {string | null} baseSha
 * @returns {Promise<string[] | null>}
 */
const changedSince = async (deps, component, baseSha) => {
  if (baseSha === null) return null
  const changed = await deps.sourceControl.changedFiles(component.root, baseSha)
  return changed === null ? null : changed.map((file) => joinRelative(component.root, file))
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
 * The mutants the component's mutation report counts, or why it counts none.
 * @param {GateRunDeps} deps @param {string} slug @param {Component} component
 * @returns {Promise<import('../../domain/gates/mutation-report.mjs').MutantReading>}
 */
const reportOf = async (deps, slug, component) => {
  const report = mutationReportOf(component)
  const path = joinRelative(component.root, report)
  const text = await deps.workspace.read(path)
  // Stryker disable next-line StringLiteral: workingCopyOf drops the slug's folder and what follows it, so any file name stands for the slug's folder
  const workingCopy = workingCopyOf(deps.files.location(slug, 'marker'))
  const read = text === null || text === '' ? { ok: /** @type {const} */ (false), reason: 'is missing' } : readMutants(text, { report, root: component.root, workingCopy })
  if (!read.ok) return { ok: false, reason: `the mutation report ${path} ${read.reason}; have the command write it there, or name the file it writes with mutationReport on ${component.name} in ${CONFIG_FILE}` }
  return read
}

/**
 * Mutants a report names relative to a source folder, each in the folder that holds its file;
 * under the component's root when none does.
 * @param {GateRunDeps} deps @param {Component} component @param {Mutant[]} mutants
 */
const inSourceFolders = async (deps, component, mutants) => {
  /** @type {Map<string, string>} */
  const located = new Map()
  for (const file of new Set(mutants.map((mutant) => mutant.file))) located.set(file, await locateSource(deps, component, file))
  return mutants.map((mutant) => ({ ...mutant, file: /** @type {string} */ (located.get(mutant.file)) }))
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
 * @param {{ gate: string, line: string, status: GateResult['status'], failure: FailureClass | null, evidence: string, tried: Attempt, survivors: Survivor[] | null, scores: ScopeScore[] | null }} ran
 *   a mutation gate journals how many survivors it hands out, null when it passed or could not tell,
 *   and the score of each scope with every mutant left alive in it, null when its report was not read
 */
const recordGate = async (deps, { slug, component, scope, journal }, { gate, line, status, failure, evidence, tried, survivors, scores }) => {
  await deps.files.write(slug, evidence, evidenceLog(component, failure, tried))
  await journal.append('gate.ran', {
    component: component.name, gate, scope, command: line, status, failure,
    exitCode: tried.result?.exitCode ?? null, durationMs: tried.durationMs, evidence,
    ...(gate === 'mutation' ? { survivors: survivors?.length ?? null, scores: journaledScores(scores) } : {}),
  })
}

/**
 * Each scope's score as the journal keeps it: its survivors told on one line each.
 * @param {ScopeScore[] | null} scores
 */
const journaledScores = (scores) => scores?.map(({ scope, bar, detected, survivors }) => ({ scope, bar, detected, survivors: survivors.map(survivorLine) })) ?? null

/**
 * The log of a command run from a component's root: the command, where, the result, then what
 * the program wrote.
 * @param {Component} component @param {FailureClass | null} failure @param {Attempt} tried
 * @returns {string}
 */
export const evidenceLog = (component, failure, { shown, result, reason }) => [
  `$ ${shown}`,
  `cwd: ${component.root}`,
  `result: ${failure === null ? 'pass' : `fail (${failure})`}: ${reason}`,
  ...(result ? ['--- stdout', result.stdout, '--- stderr', result.stderr] : []),
  '',
].join('\n')

/**
 * The gate's command started from the component's root, unless it does not parse or needs a
 * Docker that does not answer. shown: the command as the evidence writes it.
 * @param {Pick<GateRunDeps, 'commandRunner' | 'clock'>} deps @param {Component} component
 * @param {{ line: string, baseSha: string | null, docker: boolean, timeoutMs?: number }} request
 * @returns {Promise<Attempt>}
 */
const attempt = async (deps, component, { line, baseSha, docker, timeoutMs }) => {
  const parsed = parseCommand(line, { baseSha })
  if (!parsed.ok) return { shown: line, result: null, durationMs: 0, reason: `command ${JSON.stringify(line)} ${parsed.reason}` }
  if (!docker) {
    return { shown: commandText(parsed.argv), result: null, durationMs: 0, reason: `Docker does not answer and ${component.name} mocks with Microcks; ${DOCKER_HINT}` }
  }
  return startTimed(deps, parsed.argv, { cwd: component.root, timeoutMs })
}

/**
 * A command line of the component started from its root, `{baseSha}` filled in, the first
 * program choice that starts taken.
 * @param {Pick<GateRunDeps, 'commandRunner' | 'clock'>} deps @param {Component} component
 * @param {{ line: string, baseSha: string | null, timeoutMs?: number }} request timeoutMs: how long it may run
 * @returns {Promise<Attempt>}
 */
export const startCommand = (deps, component, request) => attempt(deps, component, { ...request, docker: true })

/**
 * @param {Pick<GateRunDeps, 'commandRunner' | 'clock'>} deps @param {string[]} argv @param {Where} where
 * @returns {Promise<Attempt>}
 */
const startTimed = async (deps, argv, where) => {
  const started = deps.clock.now()
  const result = await startFirst((choice) => deps.commandRunner.run({ argv: choice, ...where }), argv)
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
