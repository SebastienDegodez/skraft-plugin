/**
 * The log of a run, `<attempt>/<rid>.log`, written as the program's output arrives and hashed as
 * it is written: 64 MiB at most, the first ones; nothing of the whole output stays in memory.
 *
 * @typedef {{ digest: import('../ports/run-digests.mjs').RunDigest, writing: Promise<void>, bytes: number, cut: boolean }} RunLog
 *   writing: the last append; bytes: written so far; cut: output arrived past the limit and was not written.
 * @typedef {{ slug: string, traceError?: unknown }} Where
 *   traceError: the first error of a write of the attempt's trace or logs.
 */

/** The most of a run's output its log holds. */
export const MAX_LOG_BYTES = 67_108_864

const encoder = new TextEncoder()

/** @param {any} deps @returns {RunLog} */
export const openLog = (deps) => ({ digest: deps.repl.digests.start(), writing: Promise.resolve(), bytes: 0, cut: false })

/**
 * Output of the program: written at the end of its log, up to the limit.
 * @param {any} deps @param {Where} where @param {{ log: string, logFile: RunLog }} run @param {string} text
 */
export const logChunk = (deps, where, { log, logFile }, text) => {
  const kept = keptOf(logFile, text)
  if (kept === '') return
  logFile.digest.update(kept)
  logFile.writing = logFile.writing.then(() => deps.files.appendText(where.slug, log, kept)).catch((error) => { where.traceError ??= error })
}

/** What of the text still fits in the log; the rest is cut. @param {RunLog} logFile @param {string} text */
const keptOf = (logFile, text) => {
  const room = MAX_LOG_BYTES - logFile.bytes
  const size = encoder.encode(text).length
  const kept = size <= room ? text : text.slice(0, Math.max(room, 0))
  logFile.cut ||= kept !== text
  logFile.bytes += kept === text ? size : encoder.encode(kept).length
  return kept
}

/**
 * The run is over: every write of its log is done, the file exists even when the program wrote
 * nothing, and its hash is the one of the file.
 * @param {any} deps @param {Where} where @param {{ log: string, logFile: RunLog }} run @returns {Promise<{ sha256: string, cut: boolean }>}
 */
export const closeLog = async (deps, where, { log, logFile }) => {
  await logFile.writing
  if (logFile.bytes === 0) await deps.files.appendText(where.slug, log, '').catch((/** @type {unknown} */ error) => { where.traceError ??= error })
  return { sha256: await logFile.digest.digest(), cut: logFile.cut }
}
