import { normalizeRelative, pathUnder } from '../config/relative-path.mjs'
import { GATE_NAMES } from './gate-names.mjs'
import { openRuns } from './run-trace.mjs'

/**
 * What the traced runs of a DELIVER attempt must show: for each component the story changed, the
 * last run of every gate under the component's folder passed on the commit the attempt ends on,
 * or the gate is declared absent. The run of the commit line, the whole test suite chained to
 * `git add` and `git commit`, labelled `green`, is the one run that starts on an unclean tree
 * and ends on a new HEAD: it counts when that HEAD is the final commit. Texts are fixed: no
 * output, no command, no exception.
 *
 * @typedef {import('./run-trace.mjs').TraceRecord} TraceRecord
 * @typedef {import('./run-trace.mjs').RunRecord} RunRecord
 * @typedef {{ name: string, root: string, head: string | null }} Subject
 *   head: the commit the repository holding the component stands on at the submission.
 */

/** The gates a component's runs are asked for, in the order a developer runs them. */
export const REQUIRED_GATES = GATE_NAMES

/** The label of the run of the commit line. */
export const GREEN_LABEL = 'green'

/** @param {string | null} sha */
const shown = (sha) => (sha === null ? 'none' : sha.slice(0, 7))

/**
 * @param {TraceRecord[]} records @param {Subject[]} subjects the components the story changed
 * @param {string[]} roots the root of every component of the configuration: a run belongs to the deepest one holding its folder
 * @returns {string[]} one line per refusal, none when the attempt holds its evidence
 */
export const evidenceFailures = (records, subjects, roots) => [
  ...openRuns(records).map((run) => `run ${run} of skraft_repl is still open: await it or kill it`),
  ...subjects.flatMap((subject) => REQUIRED_GATES.flatMap((gate) => gateFailure(records, subject, gate, roots))),
]

/** @param {TraceRecord[]} records @param {Subject} subject @param {string} gate @param {string[]} roots @returns {string[]} */
const gateFailure = (records, subject, gate, roots) => {
  const last = lastRun(records, subject, gate, roots)
  if (last === null) return isAbsent(records, subject, gate) ? [] : [missing(subject, gate)]
  const reason = refusalOf(last, subject, gate)
  return reason === null ? [] : [`${subject.name}/${gate}: ${reason}`]
}

/** @param {TraceRecord[]} records @param {Subject} subject @param {string} gate @param {string[]} roots @returns {RunRecord | null} */
const lastRun = (records, { root }, gate, roots) => {
  const runs = /** @type {RunRecord[]} */ (records.filter((record) => record.type === 'run' && record.gate === gate && belongsTo(record.cwd, root, roots)))
  return runs.at(-1) ?? null
}

/** A folder belongs to the deepest component root that holds it; a folder outside the working copy (`..`) to none but a root that starts there. @param {string} cwd @param {string} root @param {string[]} roots */
const belongsTo = (cwd, root, roots) => {
  const inside = (/** @type {string} */ folder) => pathUnder(cwd, folder) !== null && (normalizeRelative(folder) !== '.' || !normalizeRelative(cwd).startsWith('..'))
  const deeper = roots.some((other) => normalizeRelative(other) !== normalizeRelative(root) && pathUnder(other, root) !== null && inside(other))
  return inside(root) && !deeper
}

/** The test gate is never absent: the suite is what the commit stands on. @param {TraceRecord[]} records @param {Subject} subject @param {string} gate */
const isAbsent = (records, { name }, gate) => gate !== 'test' && records.some((record) => record.type === 'absent' && record.gate === gate && record.component === name)

/** @param {Subject} subject @param {string} gate */
const missing = ({ name, root }, gate) => (gate === 'test'
  ? `${name}/${gate}: no run is traced under ${root}: run the whole suite through skraft_repl with the commit line`
  : `${name}/${gate}: no run is traced under ${root}: run it through skraft_repl with gate('${gate}', <command>, { cwd: '${root}' }), or declare absent('${gate}', '${name}', <reason>) when the project's documents name no such gate`)

/** @param {RunRecord} run */
const passed = (run) => run.started && run.exitCode === 0 && !run.timedOut && !run.killed

/** @param {RunRecord} run @param {Subject} subject @param {string} gate @returns {string | null} why the run is no evidence */
const refusalOf = (run, { head }, gate) => {
  if (!passed(run)) return `the last run did not end with exit 0 (log ${run.log})`
  if (run.headAfter !== head) return `the last run ended on ${shown(run.headAfter)}, not on the final commit ${shown(head)}: run it again on the final commit`
  const commitLine = gate === 'test' && run.label === GREEN_LABEL
  return run.clean || commitLine ? null : 'the last run started on a tree with uncommitted files: commit them, then run it again'
}
