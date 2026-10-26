/**
 * How a journal line carries its signature: the event's JSON, then `"sig"` as its last field,
 * the HMAC of the line without that field under the run's key. The first line names that key
 * by its id (`keyId`). A `journal.adopted` line, written by `skraft journal adopt` on a machine
 * that could not verify the journal, names a new key the lines from it on are signed under; the
 * lines before it stay as they were, signed under keys of their own.
 */

export const ADOPTED = 'journal.adopted'

/**
 * The journal's runs of lines signed under one key: from the first line, then from each
 * adoption line, to the next one.
 * @param {string[]} lines JSON objects, as a chained journal holds them
 * @returns {Array<{ start: number, lines: string[] }>} start: the 0-based index of the first line
 */
export const segmentsOf = (lines) => {
  const starts = lines.flatMap((line, index) => (index === 0 || JSON.parse(line).type === ADOPTED ? [index] : []))
  return starts.map((start, index) => ({ start, lines: lines.slice(start, starts[index + 1] ?? lines.length) }))
}

const SIGNED = /,"sig":"([0-9a-f]+)"}$/
const KEY_ID = /^[0-9a-f]{32}$/

/** @param {string} body an event's JSON @param {string} sig @returns {string} the line */
export const signedLine = (body, sig) => `${body.slice(0, -1)},"sig":"${sig}"}`

/**
 * @param {string} line
 * @returns {{ body: string, sig: string } | null} null when the line carries no signature
 */
export const signatureOf = (line) => {
  const match = SIGNED.exec(line)
  return match === null ? null : { body: `${line.slice(0, match.index)}}`, sig: match[1] }
}

/** @param {string} line the first line of a segment @returns {string | null} null when it names no key id of this form */
export const keyIdOf = (line) => {
  const { keyId } = JSON.parse(line)
  return typeof keyId === 'string' && KEY_ID.test(keyId) ? keyId : null
}

/** @param {number} line 1-based @param {string} detail */
const tampered = (line, detail) => `journal tampered: events.jsonl line ${line} ${detail}; restore the file or start a new slug`

/** @param {number} line */
export const noKeyReason = (line) => tampered(line, 'names no signing key')

/** @param {number} line */
export const unsignedReason = (line) => tampered(line, 'is not signed')

/** @param {number} line */
export const forgedReason = (line) => tampered(line, 'does not carry the signature of the run\'s key')

export const NO_HOME_REASON =
  'journal unverifiable: the environment names no home folder (HOME or USERPROFILE), where the key that signs events.jsonl is kept; set it and run again'

const ADOPT = 'adopt the journal on this machine with skraft journal adopt, typed in your own terminal (its earlier lines stay unverified)'

export const KEY_MISSING_REASON =
  `journal unverifiable: the key that signed events.jsonl is not in ~/.skraft/journal-keys on this machine; restore it from the machine that started the run, or ${ADOPT}`

export const UNSIGNED_REASON = `journal unverifiable: events.jsonl is not signed (it was written before journals were); ${ADOPT}`

/** @param {string} slug */
export const verifiedReason = (slug) => `${slug}: this machine verifies every line of the journal; there is nothing to adopt`

/** @param {string} slug @param {number} unverified */
export const adoptedReason = (slug, unverified) => `${slug}: journal adopted with a new key of this machine; its ${unverified} earlier lines stay unverified`
