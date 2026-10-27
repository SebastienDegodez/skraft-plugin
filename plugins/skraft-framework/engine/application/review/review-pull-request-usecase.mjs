/**
 * @typedef {{ number: number, publish: boolean, workingCopyName: string }} ReviewRequest
 * @typedef {{ status: 'APPROVED' | 'NEEDS_REWORK' | 'BLOCKED' | 'stopped', number: number, pass: number | null, code: string | null, reason: string, reasons: string[], notes: string[], file: string | null, comment: string | null }} ReviewOutcome
 */

/**
 * ReviewPullRequest — `skraft review --pr <number>`.
 * @param {object} deps
 */
export const createReviewPullRequest = (deps) => Object.freeze({
  /** @param {ReviewRequest} request @returns {Promise<ReviewOutcome>} */
  review: async (request) => ({ status: 'stopped', number: request.number, pass: null, code: null, reason: '', reasons: [], notes: [], file: null, comment: null, deps }),
})
