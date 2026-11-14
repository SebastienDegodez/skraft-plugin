import { deriveRun, openNode } from '../../domain/journal/run-state.mjs'
import { dayOf, templateName } from '../../domain/pipeline/outputs.mjs'
import { receiptPath } from '../../domain/pipeline/precheck-receipt.mjs'
import { callsPath, withCall } from '../../domain/pipeline/precheck-calls.mjs'
import { roleOf } from '../../domain/pipeline/roles.mjs'
import { loadWorkflow } from '../workflow/load-workflow.mjs'
import { loadConfig } from '../config/bases.mjs'
import { storyLanguage } from '../publish/story-language.mjs'
import { openActiveRun } from './active-run.mjs'
import { writtenFailures } from './step-checks.mjs'
import { recordingReads, receiptOf } from './precheck-reads.mjs'

/**
 * @typedef {{
 *   status: 'passed' | 'failed' | 'refused' | 'blocked', slug: string | null, step: string | null,
 *   attempt: number | null, failures: Array<{ code: string, line: string }>, code: string | null, reason: string,
 * }} PrecheckOutcome
 *   failures: each anomaly with the check that found it, as the submission names them.
 */

export const UNAVAILABLE = 'precheck-unavailable'

/**
 * Precheck — `skraft precheck`: during an agent's attempt, runs the mechanical checks the engine
 * runs on its submission over what the attempt has written, and hands back every anomaly with the
 * check that found it, so the agent corrects them without a replay. It reads no result file and no
 * commit, since the agent writes them last. It starts no agent, changes nothing of the agent's
 * work, and approves nothing: the engine's own checks still run at the submission, and the review
 * still happens (#581).
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
  const loaded = await loadConfig(deps)
  if (!loaded.ok) return { ...nothingRead(slug), status: 'blocked', step: found.step, attempt: found.open.attempt, code: 'environment', reason: loaded.reason }
  return runCheck(deps, { slug, run, config: loaded.config, step: found.step, open: found.open, role: found.role })
}

/**
 * What a pre-check that read nothing of the step answers; its caller gives the status, the code and
 * the reason, so no default of them is ever read.
 * @param {string | null} slug @returns {Pick<PrecheckOutcome, 'slug' | 'step' | 'attempt' | 'failures'>}
 */
const nothingRead = (slug) => ({ slug, step: null, attempt: null, failures: [] })

/**
 * The attempt a pre-check applies to: an open one whose node plays a role, so the checks know
 * what it owes. A step with no open attempt, or a node that plays none, is refused rather than
 * answered, so no agent reads a success it was never given.
 * @param {any} deps @param {import('../../domain/journal/run-state.mjs').RunState} run
 */
const applicable = async (deps, run) => {
  const found = openNode(run)
  if (found === null) return refusal(UNAVAILABLE, 'no attempt is open in this run: nothing to pre-check')
  // Stryker disable next-line ObjectLiteral,BooleanLiteral: a pre-check asks for no agent, so what the catalogue answers cannot change its verdict; a catalogue that cannot place an agent stops the run before an attempt opens
  const loaded = await loadWorkflow(deps, { agents: false })
  if (!loaded.ok) return { ok: false, status: 'blocked', code: 'workflow-refused', reason: loaded.errors.join('; ') }
  const node = loaded.workflow.nodes[found.step]
  if (node === undefined || node.kind !== 'agent') return refusal(UNAVAILABLE, `${found.step} is no agent step: a pre-check reads what an agent writes`)
  return { ok: true, step: found.step, open: found.open, role: roleOf(node) }
}

/** @param {string} code @param {string} reason */
const refusal = (code, reason) => ({ ok: /** @type {const} */ (false), status: /** @type {const} */ ('refused'), code, reason })

/**
 * The checks, read through a recorder, their receipt beside the attempt's documents — the step,
 * the attempt, what they read and what they found — and the call itself in the step's trail.
 * @param {any} deps @param {{ slug: string, run: any, config: any, step: string, open: any, role: any }} on
 * @returns {Promise<PrecheckOutcome>}
 */
const runCheck = async (deps, on) => {
  const { slug, step, open } = on
  const recorder = recordingReads(deps)
  const found = await writtenFailures(context(recorder.deps, on), await stepOf(deps, on))
  if (found.ok === false) return { ...nothingRead(slug), status: 'blocked', step, attempt: open.attempt, code: 'environment', reason: found.reason }
  const at = deps.clock.now()
  await keepReceipt(deps, { slug, step, attempt: open.attempt, at, inputs: await receiptOf(deps, recorder.seen), failures: found.failures })
  const status = found.failures.length === 0 ? 'passed' : 'failed'
  await trace(deps, slug, { at: at.toISOString(), step, visit: open.visit, attempt: open.attempt, status, failures: found.failures.length, found: found.failures })
  return { status, slug, step, attempt: open.attempt, failures: found.failures, code: null, reason: verdict(found.failures) }
}

/** What the checks need of the run, through the deps that note every read. @param {any} deps @param {any} on */
const context = (deps, { slug, config, run }) => ({ deps, slug, config, base: run.base })

/**
 * The attempt as the checks read it: the role it plays, the outputs it owes with the text the
 * engine pre-created each from, and the heads its pass started on.
 * @param {any} deps @param {any} on
 */
const stepOf = async (deps, { slug, run, role, open }) => ({
  role,
  outputs: open.outputs,
  precreated: await precreated(deps, { slug, run, role }),
  visitHeads: open.heads,
})

/**
 * The text the engine pre-created each output from, in the order of the role's outputs: the
 * template of the story's language for an output that names one, null for an output that names
 * none. An output still holding its template counts as unfilled, as it does at the submission.
 * @param {any} deps @param {{ slug: string, run: any, role: any }} on @returns {Promise<Array<string | null>>}
 */
const precreated = async (deps, { slug, run, role }) => {
  const language = await storyLanguage(deps, slug, run)
  return Promise.all(role.outputs.map(({ template }) => (template === null ? null : deps.templates.read(templateName(template, language)))))
}

/** @param {any} deps @param {{ slug: string, step: string, attempt: number, at: Date, inputs: any[], failures: any[] }} call */
const keepReceipt = async (deps, { slug, step, attempt, at, inputs, failures }) => {
  const receipt = { step, attempt, inputs, failures }
  await deps.files.write(slug, receiptPath(step, dayOf(at)), `${JSON.stringify(receipt, null, 2)}\n`)
}

/**
 * Appends the call to its step's trail, which the engine reads when it records the attempt: a
 * pre-check never writes the run's journal, whose single writer is the process holding the run.
 * @param {any} deps @param {string} slug @param {import('../../domain/pipeline/precheck-calls.mjs').PrecheckCall} call
 */
const trace = async (deps, slug, call) => {
  const path = callsPath(call.step)
  await deps.files.write(slug, path, withCall(await deps.files.read(slug, path), call))
}

/** @param {Array<{ code: string, line: string }>} failures */
const verdict = (failures) => (failures.length === 0
  ? 'these checks pass on what this attempt has written; the engine runs them again at the submission'
  : `${failures.length} anomaly(ies) of this attempt do not pass: correct them and pre-check again`)
