/**
 * The last pass of each review step, read from the journal alone: what each lens said and how
 * many findings it gave, then the verdict the step recorded.
 *
 * @typedef {import('../journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {{ lens: string, verdict: string, findings: number }} LensVerdict
 * @typedef {{ step: string, visit: number, verdict: string | null, lenses: LensVerdict[] }} ReviewPass
 *   verdict: `approved`, `needs-rework` or `blocked`, null while the pass goes on.
 */

/** Each review step in the order its lenses first answered. @param {RunEvent[]} events @returns {ReviewPass[]} */
export const reviewPasses = (events) => {
  const lenses = events.filter((event) => event.type === 'review.lens')
  return [...new Set(lenses.map((event) => event.step))].map((step) => lastPass(events, lenses.filter((event) => event.step === step)))
}

/** @param {RunEvent[]} events @param {RunEvent[]} lenses the review.lens events of one step @returns {ReviewPass} */
const lastPass = (events, lenses) => {
  const { step, visit } = /** @type {RunEvent} */ (lenses.at(-1))
  // Stryker disable next-line ConditionalExpression: the other events of a review pass (its lenses, refutations, cost) carry no outcome
  const records = events.filter((event) => event.type === 'step.recorded')
  const recorded = records.findLast((event) => event.step === step && event.visit === visit)
  const byLens = new Map(lenses.filter((event) => event.visit === visit).map((event) => [event.lens, event]))
  return { step, visit, verdict: recorded?.outcome ?? null, lenses: [...byLens.values()].map(({ lens, verdict, findings }) => ({ lens, verdict, findings: findings.length })) }
}
