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

/**
 * What a person types for a journal: `adopt`, the command that adopts it on this machine;
 * `start`, what to do when it has no line yet.
 * @typedef {{ adopt: string, start: string }} JournalCommands
 */

/** A pipeline's journal, the one under `.copilot-tracking/skraft-plans/`. @type {JournalCommands} */
export const PIPELINE_JOURNAL = Object.freeze({ adopt: 'skraft journal adopt', start: 'start it with an explicit init' })

/** @param {string} command */
const adoptHint = (command) => `adopt the journal on this machine with ${command}, typed in your own terminal (its earlier lines stay unverified)`

/** @param {string} unverified the lines this machine cannot verify, as unverifiedLines names them @param {string} adopt */
export const keyMissingReason = (unverified, adopt) =>
  `journal unverifiable: the key that signed events.jsonl is not in ~/.skraft/journal-keys on this machine (unverified: ${unverified}); restore it from the machine that started the run, or ${adoptHint(adopt)}`

/** @param {string} unverified @param {string} adopt */
export const notSignedReason = (unverified, adopt) => `journal unverifiable: events.jsonl is not signed, it was written before journals were (unverified: ${unverified}); ${adoptHint(adopt)}`

/** @param {number} line */
export const misfitReason = (line) => tampered(line, 'is an adoption that does not follow the lines before it')

/**
 * Whether an adoption line follows the lines before it: it names the key of the segment before
 * it (null for a journal written before signing) and at most as many unverified lines as precede it.
 * @param {{ start: number, lines: string[] }} segment @param {string | null} previousKeyId
 */
export const misfits = ({ start, lines }, previousKeyId) => {
  const { previousKeyId: named, unverified } = JSON.parse(lines[0])
  return named !== previousKeyId || !Number.isInteger(unverified) || unverified < 0 || unverified > start
}

/**
 * The lines this machine cannot verify, by range, with the event types they hold in order of
 * appearance; a type this engine never writes counts as `other`, so no line's own text is shown.
 * @param {Array<{ start: number, lines: string[] }>} segments
 */
export const unverifiedLines = (segments) => segments.map(rangeOf).join('; ')

/** @param {{ start: number, lines: string[] }} segment */
const rangeOf = ({ start, lines }) => {
  const last = start + lines.length
  return `${last === start + 1 ? `line ${last}` : `lines ${start + 1}-${last}`}: ${typeCounts(lines)}`
}

/** @param {string[]} lines */
const typeCounts = (lines) => {
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const type of lines.map(knownType)) counts.set(type, (counts.get(type) ?? 0) + 1)
  return [...counts].map(([type, count]) => `${count} ${type}`).join(', ')
}

/** @param {string} line */
const knownType = (line) => {
  const { type } = JSON.parse(line)
  return EVENT_TYPES.has(type) ? type : 'other'
}

/** Every event type this engine writes to a journal. */
const EVENT_TYPES = new Set([
  'run.started', 'run.finished', 'run.stopped', 'step.started', 'step.recorded', 'phase.closed', 'gate.ran', 'commits.checked',
  'question.asked', 'question.answered', 'review.lens', 'review.refuted', 'review.cost', 'tdd.replay-slow', 'visuals.recorded',
  'publish.requested', 'pull-request.opened', 'pull-request.updated', 'issue.commented', 'issue.comment-skipped', ADOPTED,
])

/** @param {string} slug */
export const verifiedReason = (slug) => `${slug}: this machine verifies every line of the journal; there is nothing to adopt`

/** @param {string} slug @param {number} unverified */
export const adoptedReason = (slug, unverified) => `${slug}: journal adopted with a new key of this machine; its ${unverified} earlier lines stay unverified`
