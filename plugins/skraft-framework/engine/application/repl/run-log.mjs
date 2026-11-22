/**
 * The log of a run, `<attempt>/<rid>.log`, written as the program's output arrives and hashed as
 * it is written: 64 MiB at most. Past it, the log keeps the first half, written as it came, and the
 * last half, kept in memory and written after a fixed marker when the run ends; each half is cut on
 * whole UTF-8 characters.
 *
 * @typedef {{
 *   digest: import('../ports/run-digests.mjs').RunDigest, writing: Promise<void>, half: number,
 *   bytes: number, tail: Uint8Array[], kept: number, over: number,
 * }} RunLog
 *   writing: the last append; half: the bytes of each half; bytes: written so far; tail, kept: the
 *   output past the first half, its last chunks and their size; over: every byte past the first half.
 * @typedef {{ slug: string, traceError?: unknown }} Where
 *   traceError: the first error of a write of the attempt's trace or logs.
 */

/** The most of a run's output its log holds. */
export const MAX_LOG_BYTES = 67_108_864
const MARKER = '\n… the output was cut here: the log keeps its first and last halves …\n'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * A run's log is new: run ids are never reused within an attempt, so no earlier log is touched.
 * @param {any} deps @returns {RunLog}
 */
export const openLog = (deps) => ({ digest: deps.repl.digests.start(), writing: Promise.resolve(), half: Math.floor((deps.repl.logLimitBytes ?? MAX_LOG_BYTES) / 2), bytes: 0, tail: [], kept: 0, over: 0 })

/**
 * Output of the program: the first half of the log is written as it arrives, the rest kept as a tail.
 * @param {any} deps @param {Where} where @param {{ log: string, logFile: RunLog }} run @param {string} text
 */
export const logChunk = (deps, where, run, text) => {
  const bytes = encoder.encode(text)
  const head = wholeHead(bytes, Math.max(run.logFile.half - run.logFile.bytes, 0))
  if (head.length > 0) append(deps, where, run, decoder.decode(head))
  run.logFile.bytes += head.length
  if (head.length < bytes.length) keepTail(run.logFile, bytes.subarray(head.length))
}

/** @param {any} deps @param {Where} where @param {{ log: string, logFile: RunLog }} run @param {string} text */
const append = (deps, where, { log, logFile }, text) => {
  logFile.digest.update(text)
  logFile.writing = logFile.writing.then(() => deps.files.appendText(where.slug, log, text)).catch((error) => { where.traceError ??= error })
}

/** The last half of the output past the first, in chunks. @param {RunLog} logFile @param {Uint8Array} rest */
const keepTail = (logFile, rest) => {
  logFile.tail.push(rest)
  logFile.kept += rest.length
  logFile.over += rest.length
  while (logFile.kept - logFile.tail[0].length >= logFile.half) logFile.kept -= /** @type {Uint8Array} */ (logFile.tail.shift()).length
}

/**
 * The run is over: every write of its log is done, its tail written after the marker when some of
 * the output was dropped, the file exists even when the program wrote nothing, and its hash is the
 * one of the file.
 * @param {any} deps @param {Where} where @param {{ log: string, logFile: RunLog }} run @returns {Promise<{ sha256: string, cut: boolean }>}
 */
export const closeLog = async (deps, where, run) => {
  const cut = run.logFile.over > run.logFile.half
  const tail = tailText(run.logFile)
  append(deps, where, run, tail === '' ? '' : `${cut ? MARKER : ''}${tail}`)
  await run.logFile.writing
  return { sha256: await run.logFile.digest.digest(), cut }
}

/** @param {RunLog} logFile @returns {string} the last half kept, from a whole character on */
const tailText = ({ tail, half }) => {
  const all = concat(tail)
  return decoder.decode(wholeTail(all.subarray(Math.max(all.length - half, 0))))
}

/** @param {Uint8Array[]} chunks */
const concat = (chunks) => {
  const all = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0))
  chunks.reduce((at, chunk) => { all.set(chunk, at); return at + chunk.length }, 0)
  return all
}

/** @param {number} byte */
const isContinuation = (byte) => (byte & 0xc0) === 0x80

/**
 * The first bytes of a chunk, at most `room`, without a character the cut would split: when the
 * cut falls inside a character, the head ends before it.
 * @param {Uint8Array} bytes @param {number} room
 */
const wholeHead = (bytes, room) => {
  let end = Math.min(room, bytes.length)
  while (end > 0 && end < bytes.length && isContinuation(bytes[end])) end -= 1
  return bytes.subarray(0, end)
}

/** The tail without the continuation bytes of a character its cut split. @param {Uint8Array} bytes */
const wholeTail = (bytes) => {
  let start = 0
  while (start < bytes.length && isContinuation(bytes[start])) start += 1
  return bytes.subarray(start)
}
