/**
 * Where the engine keeps what a pre-check read, inside the run's tracking folder: one file per
 * step, rewritten by each call, so the receipt is what the step's current attempt last read. The
 * run's journal keeps a single writer — the process that holds the run — and a pre-check runs
 * inside an agent's attempt, so it writes beside the attempt's documents instead (#581).
 * @param {string} step @param {string} date the UTC calendar day of the call
 */
export const receiptPath = (step, date) => `details/${date}/precheck-${step}.json`
