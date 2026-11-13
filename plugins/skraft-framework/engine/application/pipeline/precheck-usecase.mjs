import { deriveRun, openNode } from '../../domain/journal/run-state.mjs'
import { dayOf } from '../../domain/pipeline/outputs.mjs'
import { receiptPath } from '../../domain/pipeline/precheck-receipt.mjs'
import { roleOf } from '../../domain/pipeline/roles.mjs'
import { loadWorkflow } from '../workflow/load-workflow.mjs'
import { openActiveRun } from './active-run.mjs'
import { checkDesignRecords } from './design-records.mjs'
import { recordingReads, receiptOf } from './precheck-reads.mjs'

/**
 * @typedef {{
 *   status: 'passed' | 'failed' | 'refused' | 'blocked', slug: string | null, step: string | null,
 *   attempt: number | null, check: string | null, failures: string[], code: string | null, reason: string,
 * }} PrecheckOutcome
 */

export const UNAVAILABLE = 'precheck-unavailable'
const CHECK = 'design-records'

/**
 * Precheck — `skraft precheck`: during a producer's attempt, runs the mechanical check the engine
 * runs on its submission and hands back what it found, so the agent corrects it without a replay.
 * It starts no agent, changes nothing of the agent's work, and approves nothing: the engine's own
 * check still runs at the submission (#581).
 * @param {any} deps
 */
export const createPrecheck = (deps) => Object.freeze({
  /** @param {{ slug?: string | null }} [request] @returns {Promise<PrecheckOutcome>} */
  precheck: (request) => precheck(deps, request),
})

/** @param {any} deps @param {{ slug?: string | null }} [request] @returns {Promise<PrecheckOutcome>} */
const precheck = async (deps, { slug: requested } = {}) => {
  const opened = await openActiveRun(deps, requested)
  if (!opened.ok) return { ...nothingRead(opened.outcome.slug), status: opened.outcome.status, code: opened.outcome.code, reason: opened.outcome.reason }
  const { slug, journal } = opened
  const run = deriveRun(journal.events)
  const found = await applicable(deps, run)
  if (found.ok === false) return { ...nothingRead(slug), status: found.status, code: found.code, reason: found.reason }
  return runCheck(deps, { slug, base: run.base, step: found.step, attempt: found.attempt })
}

/**
 * What a pre-check that read nothing of the step answers; its caller gives the status, the code and
 * the reason, so no default of them is ever read.
 * @param {string | null} slug @returns {Pick<PrecheckOutcome, 'slug' | 'step' | 'attempt' | 'check' | 'failures'>}
 */
const nothingRead = (slug) => ({ slug, step: null, attempt: null, check: null, failures: [] })

/**
 * The attempt a pre-check applies to: an open one whose role keeps the DESIGN records. Any other
 * step is refused rather than answered, so no agent reads a success it was never given.
 * @param {any} deps @param {import('../../domain/journal/run-state.mjs').RunState} run
 */
const applicable = async (deps, run) => {
  const found = openNode(run)
  if (found === null) return refusal(UNAVAILABLE, 'no attempt is open in this run: nothing to pre-check')
  // Stryker disable next-line ObjectLiteral,BooleanLiteral: a pre-check asks for no agent, so what the catalogue answers cannot change its verdict; a catalogue that cannot place an agent stops the run before an attempt opens
  const loaded = await loadWorkflow(deps, { agents: false })
  if (!loaded.ok) return { ok: false, status: 'blocked', code: 'workflow-refused', reason: loaded.errors.join('; ') }
  const node = loaded.workflow.nodes[found.step]
  // Stryker disable next-line ConditionalExpression,LogicalOperator: the guard turns a step naming a node the workflow does not hold into a refusal instead of a crash; no workflow a run can follow reaches it, since the one it validated holds the nodes its journal names
  if (node === undefined || !roleOf(node).records) {
    return refusal(UNAVAILABLE, `${found.step} keeps no records a pre-check reads; only the design step has one`)
  }
  return { ok: true, step: found.step, attempt: found.open.attempt }
}

/** @param {string} code @param {string} reason */
const refusal = (code, reason) => ({ ok: /** @type {const} */ (false), status: /** @type {const} */ ('refused'), code, reason })

/**
 * The check, read through a recorder, and its receipt beside the attempt's documents: the step,
 * the attempt, what it read and what it found.
 * @param {any} deps @param {{ slug: string, base: any, step: string, attempt: number }} on
 * @returns {Promise<PrecheckOutcome>}
 */
const runCheck = async (deps, { slug, base, step, attempt }) => {
  const recorder = recordingReads(deps)
  const found = await checkDesignRecords(recorder.deps, { slug, base })
  if (typeof found === 'string') return { ...nothingRead(slug), status: 'blocked', step, attempt, code: 'environment', reason: found }
  const receipt = { step, attempt, check: CHECK, inputs: await receiptOf(deps, recorder.seen), failures: found }
  await deps.files.write(slug, receiptPath(step, dayOf(deps.clock.now())), `${JSON.stringify(receipt, null, 2)}\n`)
  return { status: found.length === 0 ? 'passed' : 'failed', slug, step, attempt, check: CHECK, failures: found, code: null, reason: verdict(found) }
}

/** @param {string[]} failures */
const verdict = (failures) => (failures.length === 0
  ? 'the design records pass this check; the engine checks them again at the submission'
  : `${failures.length} record(s) of this design do not pass: correct them and pre-check again`)
