import { failureSignature, REPEATS } from '../../domain/pipeline/failure-signature.mjs'

/**
 * @typedef {import('../../domain/journal/run-state.mjs').RunState} RunState
 * @typedef {import('../../domain/journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {{ deps: { files: import('../ports/tracking-files.mjs').TrackingFiles }, slug: string, journal: { events: RunEvent[] } }} SignatureContext
 * @typedef {{ next: string | null, code?: string, reason?: string, ceiling?: string | null }} Route
 */

/**
 * The signature of a refused attempt: its step, its code, its missing outputs and its failures.
 * @param {SignatureContext} context @param {{ step: string, code: string | null, missing: string[], failures: string[] }} attempt
 */
export const attemptSignature = (context, { step, code, missing, failures }) => failureSignature({ step, code, lines: [...missing, ...failures] }, placesOf(context))

/**
 * The signature of an incident asked of a human: its step, its cause and its reason, so that the
 * same incident on another run, or another machine, is known as the same.
 * @param {SignatureContext} context @param {{ step: string, owner: string, reason: string }} incident
 */
export const incidentSignature = (context, { step, owner, reason }) => failureSignature({ step, code: owner, lines: [reason] }, placesOf(context))

/**
 * The signature of a failed gate step: its failures, then the evidence log of each gate that
 * failed on this pass, which holds what the command printed.
 * @param {SignatureContext} context @param {{ step: string, failures: string[] }} failed
 */
export const gateSignature = async (context, { step, failures }) => failureSignature({ step, code: null, lines: [...failures, ...await failedLogs(context)] }, placesOf(context))

/**
 * The evidence logs of the gates that failed since the gate step started: no event but a
 * gate.ran says fail, and a gate that failed for the machine escalates before its step is signed.
 * @param {SignatureContext} context @returns {Promise<string[]>}
 */
const failedLogs = ({ deps, slug, journal }) => {
  const since = journal.events.findLastIndex((event) => event.type === 'step.started')
  const logs = journal.events.slice(since).filter((event) => event.status === 'fail')
  return Promise.all(logs.map(async ({ evidence }) => String(await deps.files.read(slug, evidence))))
}

/**
 * The slug and the working copy of the run, which holds its tracking folder.
 * @param {SignatureContext} context @returns {import('../../domain/pipeline/failure-signature.mjs').SignatureContext}
 */
// Stryker disable next-line StringLiteral: every path of the run's folder lies under the same working copy
const placesOf = ({ deps, slug }) => ({ slug, root: deps.files.location(slug, '').split(/[\\/]\.copilot-tracking[\\/]/)[0] })

/**
 * A gate that failed the same way as often as a run allows since it last passed stops sending the work back: the
 * human is asked, as at the loop's ceiling, to give an instruction or stop; its route otherwise.
 * @param {RunState} run @param {string} id the gate node
 * @param {{ routed: Route, signature: string, failures: string[] }} failed
 * @returns {Route}
 */
export const repeatedGate = (run, id, { routed, signature, failures }) => (routed.next !== null && (run.signatures[id]?.[signature] ?? 0) + 1 >= REPEATS
  ? { next: null, code: 'repeated-failure', reason: [`${id} failed the same way ${REPEATS} times since it last passed`, ...failures].join('; '), ceiling: routed.next }
  : routed)
