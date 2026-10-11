import { chainBreak, tamperedReason } from '../domain/journal/hash-chain.mjs'

/**
 * @typedef {import('./ports/run-journal-store.mjs').RunJournalStore} RunJournalStore
 * @typedef {import('./ports/hasher.mjs').Hasher} Hasher
 * @typedef {import('./ports/clock.mjs').Clock} Clock
 * @typedef {import('../domain/journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {{ events: RunEvent[], append: (type: string, payload?: Record<string, unknown>) => Promise<void> }} OpenJournal
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
  /** @type {RunEvent[]} */
  const events = lines.map((line) => JSON.parse(line))
  let last = hashes.at(-1) ?? null
  const append = async (/** @type {string} */ type, payload = {}) => {
    const event = { type, at: clock.now().toISOString(), prev: last, ...payload }
    const line = JSON.stringify(event)
    await store.append(slug, line)
    last = await hasher.sha256(line)
    events.push(event)
  }
  return { ok: true, journal: { events, append } }
}
