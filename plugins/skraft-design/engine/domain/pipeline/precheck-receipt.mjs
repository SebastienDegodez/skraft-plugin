/**
 * Where the engine keeps what a pre-check read, inside the run's tracking folder: one file per
 * step, rewritten by each call, so the receipt is what the step's current attempt last read. It
 * lives beside the step's trail of calls, in the folder the engine keeps its own records in: the
 * run's journal keeps a single writer — the process that holds the run — and a pre-check runs
 * inside an agent's attempt, so it writes a file of its own instead (#581). A step's documents are
 * what the step wrote; a receipt is the engine's record of a call, so it is none of them and no
 * lens is ever served it.
 * @param {string} step
 */
export const receiptPath = (step) => `logs/precheck-${step}-inputs.json`
