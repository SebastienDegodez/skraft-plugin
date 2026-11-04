import { cell, inert } from './markdown-safety.mjs'

/**
 * The findings a human accepted when a review reached its ceiling (#499), read from the journal:
 * each ACCEPT given to a review-ceiling question takes the findings of the review step recorded
 * just before that question was asked. They are not lost: the run report and the pull request
 * list them.
 *
 * @typedef {import('../journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {import('../review/verdict.mjs').LeftFinding & { review: string }} AcceptedFinding
 */

/** @param {RunEvent[]} events the run's journal @returns {AcceptedFinding[]} */
export const acceptedFindings = (events) => events
  .filter((event) => event.type === 'question.answered' && event.answer === 'ACCEPT')
  .flatMap((answer) => findingsAccepted(events, answer.key))

/**
 * The findings a review-ceiling question asked about; none for a question of another kind.
 * @param {RunEvent[]} events @param {string} key
 * @returns {AcceptedFinding[]}
 */
const findingsAccepted = (events, key) => {
  const at = events.findIndex((event) => event.type === 'question.asked' && event.key === key)
  if (at < 0 || events[at].kind !== 'review-ceiling') return []
  const review = events.slice(0, at).findLast((event) => event.type === 'step.recorded')
  return (review?.findings ?? []).map((/** @type {import('../review/verdict.mjs').LeftFinding} */ finding) => ({ review: review?.step, ...finding }))
}

/**
 * The accepted findings as a Markdown table: the review, the severity, the finding, where, what;
 * every agent-written value made inert and kept in its cell.
 * @param {AcceptedFinding[]} findings
 */
export const acceptedTable = (findings) => [
  '| Review | Severity | Finding | Where | What |',
  '| --- | --- | --- | --- | --- |',
  ...findings.map(({ review, severity, lens, id, location, description }) => `| ${review} | ${severity} | ${cell(`${lens} ${id}`)} | ${cell(inert(location || '-'))} | ${cell(inert(description))} |`),
]
