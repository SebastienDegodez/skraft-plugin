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
 * Each step recorded and each answer a human gave, in journal order, with the line that holds it.
 * @param {RunEvent[]} events
 * @returns {JournalEntry[]}
 */
export const journalEntries = (events) => {
  const reading = { phases: new Map(), asked: new Map() }
  return events.flatMap((event, index) => ON_EVENT[event.type]?.(reading, event, index + 1) ?? [])
}

/** @param {Reading} reading @param {RunEvent} event @returns {JournalEntry[]} */
const started = (reading, event) => {
  reading.phases.set(event.step, event.phase)
  return []
}

/** @param {Reading} reading @param {RunEvent} event @returns {JournalEntry[]} */
const asked = (reading, event) => {
  reading.asked.set(event.key, event.step)
  return []
}

/** @param {Reading} reading @param {RunEvent} event @param {number} line @returns {JournalEntry[]} */
const recorded = (reading, { at, step, visit, attempt, outcome, next }, line) => [
  { line, at, kind: 'step', step, phase: reading.phases.get(step), pass: visit, attempt, outcome, next },
]

/** @param {Reading} reading @param {RunEvent} event @param {number} line @returns {JournalEntry[]} */
const answered = (reading, { at, key, answer, reason, by }, line) => [
  { line, at, kind: 'decision', key, step: reading.asked.get(key), answer, reason, by },
]

/** @typedef {{ phases: Map<string, string>, asked: Map<string, string> }} Reading */
/** @type {Readonly<Record<string, (reading: Reading, event: RunEvent, line: number) => JournalEntry[]>>} */
const ON_EVENT = Object.freeze({ __proto__: null, 'step.started': started, 'question.asked': asked, 'step.recorded': recorded, 'question.answered': answered })

/**
 * The lines an adoption left unverified: the last adoption's count; 0 for a journal never adopted.
 * @param {RunEvent[]} events
 * @returns {number}
 */
export const unverifiedCount = (events) => events.findLast((event) => event.type === ADOPTED)?.unverified ?? 0
