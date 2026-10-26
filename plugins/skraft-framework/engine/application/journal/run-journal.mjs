import { chainBreak, tamperedReason } from '../../domain/journal/hash-chain.mjs'
import { forgedReason, KEY_MISSING_REASON, keyIdOf, NO_HOME_REASON, NO_KEY_REASON, signatureOf, signedLine, unsignedReason } from '../../domain/journal/signature.mjs'

/**
 * @typedef {import('../ports/run-journal-store.mjs').RunJournalStore} RunJournalStore
 * @typedef {import('../ports/hasher.mjs').Hasher} Hasher
 * @typedef {import('../ports/clock.mjs').Clock} Clock
 * @typedef {import('../ports/journal-keys.mjs').JournalKeys} JournalKeys
 * @typedef {import('../../domain/journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {{ events: RunEvent[], append: (type: string, payload?: Record<string, unknown>) => Promise<void> }} OpenJournal
 * @typedef {{ journal: RunJournalStore, hasher: Hasher, clock: Clock, journalKeys: JournalKeys }} JournalDeps
 * @typedef {{ deps: JournalDeps, slug: string, events: RunEvent[], last: string | null, count: number, key: string | null }} JournalTail
 *   last: the hash of the last line this journal knows; count: how many lines it knows; key: the
 *   run's signing key, null until the first line.
 * @typedef {{ ok: false, code: 'journal-tampered' | 'journal-unverifiable', reason: string }} Unreadable
 */

/**
 * Reads `<slug>/events.jsonl`, checks its hash chain and the signature of every line under the
 * run's key; appends chained, signed events.
 * @param {JournalDeps} deps
 * @param {string} slug
 * @returns {Promise<{ ok: true, journal: OpenJournal } | Unreadable>}
 */
export const openJournal = async (deps, slug) => {
  const lines = await deps.journal.lines(slug)
  const hashes = await Promise.all(lines.map((line) => deps.hasher.sha256(line)))
  const broken = chainBreak(lines, hashes)
  if (broken) return { ok: false, code: 'journal-tampered', reason: tamperedReason(broken) }
  const signing = await signingKey(deps, lines)
  if (!signing.ok) return signing
  /** @type {JournalTail} */
  const tail = { deps, slug, events: lines.map((line) => JSON.parse(line)), last: hashes.at(-1) ?? null, count: lines.length, key: signing.key }
  const append = (/** @type {string} */ type, payload = {}) => appendEvent(tail, type, payload)
  return { ok: true, journal: { events: tail.events, append } }
}

/**
 * The key the first line names, once every line carries its signature under it; null for a
 * journal with no line yet.
 * @param {JournalDeps} deps @param {string[]} lines
 * @returns {Promise<{ ok: true, key: string | null } | Unreadable>}
 */
const signingKey = async (deps, lines) => {
  if (lines.length === 0) return { ok: true, key: null }
  const id = keyIdOf(lines[0])
  if (id === null) return { ok: false, code: 'journal-tampered', reason: NO_KEY_REASON }
  if (!(await deps.journalKeys.available())) return { ok: false, code: 'journal-unverifiable', reason: NO_HOME_REASON }
  const key = await deps.journalKeys.read(id)
  if (key === null) return { ok: false, code: 'journal-unverifiable', reason: KEY_MISSING_REASON }
  const reason = await firstUnsigned(deps.hasher, key, lines)
  return reason === null ? { ok: true, key } : { ok: false, code: 'journal-tampered', reason }
}

/**
 * @param {Hasher} hasher @param {string} key @param {string[]} lines
 * @returns {Promise<string | null>} why the first line not signed under the key is refused
 */
const firstUnsigned = async (hasher, key, lines) => {
  for (const [index, line] of lines.entries()) {
    const signed = signatureOf(line)
    if (signed === null) return unsignedReason(index + 1)
    if ((await hasher.hmacSha256(key, signed.body)) !== signed.sig) return forgedReason(index + 1)
  }
  return null
}

/**
 * Appends one event chained to the last line and signed, once no other writer touched the
 * journal; the first event creates the run's key and names it.
 * @param {JournalTail} tail @param {string} type @param {Record<string, unknown>} payload
 */
const appendEvent = async (tail, type, payload) => {
  await refuseOtherWriter(tail)
  const named = tail.key === null ? await newKey(tail) : {}
  const event = { type, at: tail.deps.clock.now().toISOString(), prev: tail.last, ...payload, ...named }
  const line = await signed(tail, JSON.stringify(event))
  await tail.deps.journal.append(tail.slug, line)
  tail.last = await tail.deps.hasher.sha256(line)
  tail.count += 1
  tail.events.push(/** @type {RunEvent} */ (event))
}

/** The run's new key, which the first event names. @param {JournalTail} tail */
const newKey = async (tail) => {
  const { id, key } = await tail.deps.journalKeys.create()
  tail.key = key
  return { keyId: id }
}

/** @param {JournalTail} tail @param {string} body */
const signed = async (tail, body) => signedLine(body, await tail.deps.hasher.hmacSha256(/** @type {string} */ (tail.key), body))

/**
 * Throws a JournalConflict when the file no longer ends where this journal does.
 * @param {JournalTail} tail
 */
const refuseOtherWriter = async ({ deps, slug, last, count }) => {
  const now = await deps.journal.lines(slug)
  if (now.length === count && (count === 0 || (await deps.hasher.sha256(now[count - 1])) === last)) return
  throw new JournalConflict(`${slug}: another run wrote events.jsonl meanwhile; run again once it stops`)
}

/** Another writer appended to the journal since it was opened. */
export class JournalConflict extends Error {}
