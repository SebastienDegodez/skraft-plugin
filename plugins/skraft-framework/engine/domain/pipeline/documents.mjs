/**
 * The documents of a pipeline: every file of its tracking folder but those the engine keeps
 * (the journal, the session's lease, the agents' result files, the review inputs).
 */

const ENGINE_FILES = /^(events\.jsonl$|\.lock(\.|$)|results\/|reviews\/)/

/** @param {string} path relative to the pipeline's tracking folder */
export const isDocument = (path) => !ENGINE_FILES.test(path)

/**
 * The documents an attempt wrote: those that did not exist before it, or whose content changed.
 * @param {Record<string, string>} before document → content hash when the attempt started
 * @param {Record<string, string>} after document → content hash when it ended
 */
export const writtenDocuments = (before, after) => Object.keys(after).filter((path) => before[path] !== after[path]).sort()
