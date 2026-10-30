import { ADOPTED } from '../journal/signature.mjs'

/**
 * @typedef {import('../journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {{ line: number, at: string, kind: 'step', step: string, phase: string, pass: number, attempt: number, outcome: string, next: string | null }} StepEntry
 *   line: 1-based line of events.jsonl; pass: the visit; next: the step the edge taken leads to, null when the run stopped there.
 * @typedef {{ line: number, at: string, kind: 'decision', key: string, step: string, answer: string, reason: string | null, by: string }} DecisionEntry
 *   step: the node the question was about; by: how the journal knows a person gave it.
 * @typedef {StepEntry | DecisionEntry} JournalEntry
 */

/**
 * The lines an adoption left unverified: the last adoption's count; 0 for a journal never adopted.
 * @param {RunEvent[]} events
 * @returns {number}
 */
export const unverifiedCount = (events) => events.findLast((event) => event.type === ADOPTED)?.unverified ?? 0
