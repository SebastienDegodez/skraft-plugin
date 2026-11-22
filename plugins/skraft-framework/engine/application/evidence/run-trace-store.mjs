import { signatureOf, signedLine } from '../../domain/journal/signature.mjs'

/**
 * Reads and writes the signed trace of an attempt's runs. The key is the run's journal key, which
 * lives outside the working copy; an agent's cells can edit the file, not forge a line that carries
 * the signature of that key without reading it, which a run's own command could also do: the trace
 * is tamper-evident, not tamper-proof.
 *
 * @typedef {import('../../domain/evidence/run-trace.mjs').TraceRecord} TraceRecord
 */

/** @param {string} folder the attempt's folder of runs, relative to `<slug>/` */
export const tracePath = (folder) => `${folder}/runs.jsonl`

/**
 * The key the run's lines are signed under now: the last one its journal names. Null when the
 * machine holds none.
 * @param {any} deps @param {Array<{ keyId?: string }>} events @returns {Promise<string | null>}
 */
export const signingKeyOf = async (deps, events) => {
  const named = events.findLast((event) => typeof event.keyId === 'string')
  return named === undefined ? null : deps.journalKeys.read(/** @type {string} */ (named.keyId))
}

/**
 * Appends a record, signed when a key is held, after every record asked for before it. A write
 * that fails leaves its error in `where.traceError`, the first one kept, and the chain goes on.
 * @param {any} deps @param {{ slug: string, folder: string, signingKey: string | null, chain: Promise<void>, traceError?: unknown }} where @param {TraceRecord} record
 * @returns {Promise<void>} when this record is written; the entry's chain follows it
 */
export const appendRecord = (deps, where, record) => {
  where.chain = where.chain.then(() => write(deps, where, record)).catch((error) => { where.traceError ??= error })
  return where.chain
}

/** @param {any} deps @param {{ slug: string, folder: string, key: string | null }} where @param {TraceRecord} record */
const write = async (deps, { slug, folder, signingKey: key }, record) => {
  const body = JSON.stringify(record)
  const line = key === null ? body : signedLine(body, await deps.hasher.hmacSha256(key, body))
  await deps.files.appendText(slug, tracePath(folder), `${line}\n`)
}

/**
 * The trace of an attempt with every line's signature checked; refused, the code of the first
 * line that breaks it: `unsigned-line`, `no-key` (this machine holds no key of the run) or
 * `wrong-signature` (a line edited after it was signed).
 * @param {any} deps @param {{ slug: string, folder: string, events: Array<{ keyId?: string }> }} where
 * @returns {Promise<{ ok: true, records: TraceRecord[] } | { ok: false, code: TraceRefusal, reason: string }>}
 */
export const readTrace = async (deps, { slug, folder, events }) => {
  const text = await deps.files.read(slug, tracePath(folder))
  if (text === null) return { ok: true, records: [] }
  const key = await signingKeyOf(deps, events)
  const checked = await checkedLines(deps, text.split('\n').filter((line) => line !== ''), key)
  return checked.refused === null ? { ok: true, records: checked.records } : { ok: false, ...checked.refused }
}

/** @param {any} deps @param {string[]} lines @param {string | null} key @returns {Promise<{ records: TraceRecord[], refused: Refused | null }>} */
const checkedLines = async (deps, lines, key) => {
  const records = []
  for (const [index, line] of lines.entries()) {
    const refused = await refusal(deps, line, key, index + 1)
    if (refused !== null) return { records: [], refused }
    records.push(JSON.parse(signatureOf(line)?.body ?? line))
  }
  return { records, refused: null }
}

/**
 * @typedef {'unsigned-line' | 'no-key' | 'wrong-signature'} TraceRefusal
 * @typedef {{ code: TraceRefusal, reason: string }} Refused
 */

/** Why the line is not one this server signed; null when it is. @param {any} deps @param {string} line @param {string | null} key @param {number} number @returns {Promise<Refused | null>} */
const refusal = async (deps, line, key, number) => {
  const signed = signatureOf(line)
  if (signed === null) return { code: 'unsigned-line', reason: `runs.jsonl line ${number} is not signed` }
  if (key === null) return { code: 'no-key', reason: 'runs.jsonl cannot be verified: this machine holds no key of the run' }
  return (await deps.hasher.hmacSha256(key, signed.body)) === signed.sig ? null : { code: 'wrong-signature', reason: `runs.jsonl line ${number} does not carry the signature of the run's key` }
}
