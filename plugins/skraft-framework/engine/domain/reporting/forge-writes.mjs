import { cell } from './markdown-safety.mjs'

/**
 * The writes a run made on its forge, as the journal tells them: each one's outcome once read back.
 * applied: the forge shows it; refused: the forge said no; verification-failed: the forge said yes
 * and does not show it; unknown: no answer came (a time limit, a cut), so nobody knows. Only
 * applied counts as done.
 *
 * @typedef {import('../journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {'applied' | 'refused' | 'verification-failed' | 'unknown'} WriteOutcome
 * @typedef {{ write: string, subject: string, outcome: WriteOutcome, reason: string | null }} ForgeWrite
 *   write: what was written (push, pull-request-create, pull-request-edit, issue-comment,
 *   pull-request-comment, review-comment); subject: the branch or the number it was written to;
 *   reason: the fixed reason of an outcome other than applied, null for applied.
 */

/** The journal event of one write on the forge. */
export const FORGE_WRITE = 'forge.write'

/** The journal event written before a pull request is opened, so that a run resumed after a cut finds it again instead of opening another. */
export const CREATE_STARTED = 'pull-request.create-started'

/** Each write on the forge, in journal order. @param {RunEvent[]} events @returns {ForgeWrite[]} */
export const forgeWrites = (events) => events
  .filter((event) => event.type === FORGE_WRITE)
  .map(({ write, subject, outcome, reason }) => ({ write, subject, outcome, reason }))

/** One row per write on the forge, its reason fixed by skraft; `-` for an applied one. @param {ForgeWrite[]} writes */
export const forgeWritesTable = (writes) => [
  '| Write | Subject | Outcome | Reason |',
  '| --- | --- | --- | --- |',
  ...writes.map(({ write, subject, outcome, reason }) => `| ${write} | ${cell(subject)} | ${outcome} | ${reason === null ? '-' : cell(reason)} |`),
]
