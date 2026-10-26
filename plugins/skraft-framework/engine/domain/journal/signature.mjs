/**
 * How a journal line carries its signature: the event's JSON, then `"sig"` as its last field,
 * the HMAC of the line without that field under the run's key. The first line names that key
 * by its id (`keyId`).
 */

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

/** @param {string} line the first line @returns {string | null} null when it names no key id of this form */
export const keyIdOf = (line) => {
  const { keyId } = JSON.parse(line)
  return typeof keyId === 'string' && KEY_ID.test(keyId) ? keyId : null
}

/** @param {number} line 1-based @param {string} detail */
const tampered = (line, detail) => `journal tampered: events.jsonl line ${line} ${detail}; restore the file or start a new slug`

export const NO_KEY_REASON = tampered(1, 'names no signing key')

/** @param {number} line */
export const unsignedReason = (line) => tampered(line, 'is not signed')

/** @param {number} line */
export const forgedReason = (line) => tampered(line, 'does not carry the signature of the run\'s key')

export const NO_HOME_REASON =
  'journal unverifiable: the environment names no home folder (HOME or USERPROFILE), where the key that signs events.jsonl is kept; set it and run again'

export const KEY_MISSING_REASON =
  'journal unverifiable: the key that signed events.jsonl is not in ~/.skraft/journal-keys on this machine; restore it from the machine that started the run, or start a new slug'
