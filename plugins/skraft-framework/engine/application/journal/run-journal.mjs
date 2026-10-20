import { chainBreak, tamperedReason } from '../../domain/journal/hash-chain.mjs'

/**
 * @typedef {import('../ports/run-journal-store.mjs').RunJournalStore} RunJournalStore
 * @typedef {import('../ports/hasher.mjs').Hasher} Hasher
 * @typedef {import('../ports/clock.mjs').Clock} Clock
 * @typedef {import('../../domain/journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {{ events: RunEvent[], append: (type: string, payload?: Record<string, unknown>) => Promise<void> }} OpenJournal
 * @typedef {{ store: RunJournalStore, hasher: Hasher, clock: Clock, slug: string, events: RunEvent[], last: string | null, count: number }} JournalTail
 *   last: the hash of the last line this journal knows; count: how many lines it knows.
 */

/**
 * Reads `<slug>/events.jsonl` and checks its hash chain; appends chained events.
 * @param {{ journal: RunJournalStore, hasher: Hasher, clock: Clock }} deps
 * @param {string} slug
 * @returns {Promise<{ ok: true, journal: OpenJournal } | { ok: false, reason: string }>}
 */
export const openJournal = async ({ journal: store, hasher, clock }, slug) => {
  const lines = await store.lines(slug)
  const hashes = await Promise.all(lines.map((line) => hasher.sha256(line)))
  const broken = chainBreak(lines, hashes)
  if (broken) return { ok: false, reason: tamperedReason(broken) }
  /** @type {JournalTail} */
  const tail = { store, hasher, clock, slug, events: lines.map((line) => JSON.parse(line)), last: hashes.at(-1) ?? null, count: lines.length }
  const append = (/** @type {string} */ type, payload = {}) => appendEvent(tail, type, payload)
  return { ok: true, journal: { events: tail.events, append } }
}

/**
 * Appends one event chained to the last line, once no other writer touched the journal.
 * @param {JournalTail} tail @param {string} type @param {Record<string, unknown>} payload
 */
const appendEvent = async (tail, type, payload) => {
  await refuseOtherWriter(tail)
  const event = { type, at: tail.clock.now().toISOString(), prev: tail.last, ...payload }
  const line = JSON.stringify(event)
  await tail.store.append(tail.slug, line)
  tail.last = await tail.hasher.sha256(line)
  tail.count += 1
  tail.events.push(/** @type {RunEvent} */ (event))
}

/**
 * Throws a JournalConflict when the file no longer ends where this journal does.
 * @param {JournalTail} tail
 */
const refuseOtherWriter = async ({ store, hasher, slug, last, count }) => {
  const now = await store.lines(slug)
  if (now.length === count && (count === 0 || (await hasher.sha256(now[count - 1])) === last)) return
  throw new JournalConflict(`${slug}: another run wrote events.jsonl meanwhile; run again once it stops`)
}

/** Another writer appended to the journal since it was opened. */
export class JournalConflict extends Error {}
