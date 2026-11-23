import { chainBreak, tamperedReason } from '../../domain/journal/hash-chain.mjs'
import {
  ADOPTED, adoptedReason, forgedReason, keyIdOf, keyMissingReason, misfitReason, misfits, NO_HOME_REASON, noKeyReason, notSignedReason, PIPELINE_JOURNAL, segmentsOf,
  signatureOf, signedLine, unsignedReason, unverifiedLines, verifiedReason,
} from '../../domain/journal/signature.mjs'

/**
 * @typedef {import('../ports/run-journal-store.mjs').RunJournalStore} RunJournalStore
 * @typedef {import('../ports/hasher.mjs').Hasher} Hasher
 * @typedef {import('../ports/clock.mjs').Clock} Clock
 * @typedef {import('../ports/journal-keys.mjs').JournalKeys} JournalKeys
 * @typedef {import('../../domain/journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {{ events: RunEvent[], append: (type: string, payload?: Record<string, unknown>) => Promise<void> }} OpenJournal
 * @typedef {{ journal: RunJournalStore, hasher: Hasher, clock: Clock, journalKeys: JournalKeys, commands?: import('../../domain/journal/signature.mjs').JournalCommands }} JournalDeps
 *   commands: what a person types for this journal; a pipeline's when absent.
 * @typedef {{ deps: JournalDeps, slug: string, events: RunEvent[], last: string | null, count: number, key: string | null }} JournalTail
 *   last: the hash of the last line this journal knows; count: how many lines it knows; key: the
 *   key the run signs under, null until the first line.
 * @typedef {{ previousKeyId: string | null, unverified: number }} Adoption
 *   what an adoption on this machine records: the key of the last lines, null when they are not
 *   signed; how many lines this machine cannot verify.
 * @typedef {{ ok: false, code: 'journal-tampered' | 'journal-unverifiable', reason: string, adoption?: Adoption, unverifiedLines?: string }} Unreadable
 *   adoption: present when `skraft journal adopt` can sign the journal on from here, with
 *   unverifiedLines: the lines it would leave unverified, by range and event type.
 * @typedef {{ start: number, lines: string[] }} Segment
 * @typedef {{ known: true, key: string } | { known: false, keyId: string | null, missing: boolean }} Verified
 *   missing: the segment names a key this machine does not hold; else it is the unsigned start
 *   of a journal written before signing.
 * @typedef {Verified | { tampered: string }} SegmentState
 */

/**
 * Reads `<slug>/events.jsonl`, checks its hash chain and the signature of every line this
 * machine holds the key of; appends chained, signed events.
 * @param {JournalDeps} deps
 * @param {string} slug
 * @returns {Promise<{ ok: true, journal: OpenJournal } | Unreadable>}
 */
export const openJournal = async (deps, slug) => {
  const { lines, hashes, refused } = await readChained(deps, slug)
  if (refused) return refused
  const signing = await signingKey(deps, lines)
  if (!signing.ok) return signing
  /** @type {JournalTail} */
  const tail = { deps, slug, events: lines.map((line) => JSON.parse(line)), last: hashes.at(-1) ?? null, count: lines.length, key: signing.key }
  const append = (/** @type {string} */ type, payload = {}) => appendEvent(tail, type, payload)
  return { ok: true, journal: { events: tail.events, append } }
}

/**
 * The journal's lines and their hashes, refused when the chain breaks.
 * @param {JournalDeps} deps @param {string} slug
 * @returns {Promise<{ lines: string[], hashes: string[], refused: Unreadable | null }>}
 */
const readChained = async (deps, slug) => {
  const lines = await deps.journal.lines(slug)
  const hashes = await Promise.all(lines.map((line) => deps.hasher.sha256(line)))
  const broken = chainBreak(lines, hashes)
  return { lines, hashes, refused: broken ? { ok: false, code: 'journal-tampered', reason: tamperedReason(broken) } : null }
}

/**
 * The key the last lines are signed under, once every segment this machine holds the key of
 * verifies under it and the last one is such a segment. Null for a journal with no line yet.
 * @param {JournalDeps} deps @param {string[]} lines
 * @returns {Promise<{ ok: true, key: string | null } | Unreadable>}
 */
const signingKey = async (deps, lines) => {
  if (lines.length === 0) return { ok: true, key: null }
  if (!(await deps.journalKeys.available())) return { ok: false, code: 'journal-unverifiable', reason: NO_HOME_REASON }
  const segments = segmentsOf(lines)
  const states = await statesOf(deps, segments)
  const tampered = states.find((state) => 'tampered' in state)
  if (tampered !== undefined) return { ok: false, code: 'journal-tampered', reason: /** @type {{ tampered: string }} */ (tampered).tampered }
  return lastKey(segments, /** @type {Verified[]} */ (states), commandsOf(deps).adopt)
}

/** @param {JournalDeps} deps @param {Segment[]} segments @returns {Promise<SegmentState[]>} */
const statesOf = async (deps, segments) => {
  /** @type {SegmentState[]} */
  const states = []
  for (const [index, segment] of segments.entries()) states.push(await stateOf(deps, segment, segments[index - 1]))
  return states
}

/**
 * The last segment's key; when this machine has none for it, what an adoption would record.
 * @param {Segment[]} segments @param {Verified[]} states @param {string} adopt the command that adopts it
 * @returns {{ ok: true, key: string } | Unreadable}
 */
const lastKey = (segments, states, adopt) => {
  const last = /** @type {Verified} */ (states.at(-1))
  if (last.known) return { ok: true, key: last.key }
  const unknown = segments.filter((_, index) => !states[index].known)
  const reason = (last.missing ? keyMissingReason : notSignedReason)(unverifiedLines(unknown), adopt)

  const unverified = unknown.reduce((sum, { lines }) => sum + lines.length, 0)
  return { ok: false, code: 'journal-unverifiable', reason, adoption: { previousKeyId: last.keyId, unverified }, unverifiedLines: unverifiedLines(unknown) }
}

/**
 * A segment verified under the key it names; unknown when this machine holds no such key, or
 * when it is the unsigned start of a journal written before signing; tampered otherwise, an
 * adoption that does not follow the segment before it included.
 * @param {JournalDeps} deps @param {Segment} segment @param {Segment | undefined} before
 * @returns {Promise<SegmentState>}
 */
const stateOf = async (deps, segment, before) => {
  if (before !== undefined && misfits(segment, keyIdOf(before.lines[0]))) return { tampered: misfitReason(segment.start + 1) }
  const keyId = keyIdOf(segment.lines[0])
  if (keyId === null) return unnamed(segment)
  const key = await deps.journalKeys.read(keyId)
  if (key === null) return { known: false, keyId, missing: true }
  const reason = await firstUnsigned(deps.hasher, key, segment)
  return reason === null ? { known: true, key } : { tampered: reason }
}

/** @param {Segment} segment @returns {SegmentState} */
const unnamed = ({ start, lines }) => {
  if (start === 0 && lines.every((line) => signatureOf(line) === null)) return { known: false, keyId: null, missing: false }
  return { tampered: noKeyReason(start + 1) }
}

/**
 * @param {Hasher} hasher @param {string} key @param {Segment} segment
 * @returns {Promise<string | null>} why the first line not signed under the key is refused
 */
const firstUnsigned = async (hasher, key, { start, lines }) => {
  for (const [index, line] of lines.entries()) {
    const signed = signatureOf(line)
    if (signed === null) return unsignedReason(start + index + 1)
    if ((await hasher.hmacSha256(key, signed.body)) !== signed.sig) return forgedReason(start + index + 1)
  }
  return null
}

/**
 * Signs the journal on from here with a new key of this machine, when this machine cannot
 * verify its last lines: one `journal.adopted` line, chained, signed under the new key, naming
 * the key of the lines before it and how many lines stay unverified; refused when the journal is
 * no longer the one the person was shown (its last line, its count of unverified lines).
 * @param {JournalDeps} deps @param {string} slug @param {{ head?: string, unverified?: number }} shown
 * @returns {Promise<{ ok: boolean, slug: string, code: string, reason: string }>}
 */
export const adoptJournal = async (deps, slug, shown) => {
  const adoptable = await adoptionOf(deps, slug)
  if (!adoptable.ok) return adoptable
  if (adoptable.prev !== shown.head || adoptable.adoption.unverified !== shown.unverified) return changedReason(slug, commandsOf(deps).adopt)
  await appendAdoption(deps, slug, adoptable)
  return { ok: true, slug, code: 'adopted', reason: adoptedReason(slug, adoptable.adoption.unverified) }
}

/**
 * What adopting the journal would leave unverified, before a person agrees to it: the lines by
 * range and event type, never their text.
 * @param {JournalDeps} deps @param {string} slug
 * @returns {Promise<{ ok: true, slug: string, unverifiedLines: string, head: string, unverified: number } | { ok: false, slug: string, code: string, reason: string }>}
 *   head: the hash of the last line shown; unverified: how many lines it leaves unverified
 */
export const adoptionPreview = async (deps, slug) => {
  const adoptable = await adoptionOf(deps, slug)
  if (!adoptable.ok) return adoptable
  return { ok: true, slug, unverifiedLines: adoptable.unverifiedLines, head: adoptable.prev, unverified: adoptable.adoption.unverified }
}

/** @param {string} slug @param {string} adopt */
const changedReason = (slug, adopt) => ({
  ok: false, slug, code: 'journal-changed', reason: `${slug}: the journal changed since you were shown what adopting it leaves unverified; run ${adopt} again`,
})

/** @param {JournalDeps} deps */
const commandsOf = (deps) => deps.commands ?? PIPELINE_JOURNAL

/**
 * The adoption this machine can write, or why it cannot.
 * @param {JournalDeps} deps @param {string} slug
 * @returns {Promise<{ ok: true, prev: string, adoption: Adoption, unverifiedLines: string } | { ok: false, slug: string, code: string, reason: string }>}
 */
const adoptionOf = async (deps, slug) => {
  const { lines, hashes, refused } = await readChained(deps, slug)
  if (refused) return { ok: false, slug, code: refused.code, reason: refused.reason }
  const signing = await signingKey(deps, lines)
  if (signing.ok) return refusedAdoption(slug, lines, commandsOf(deps).start)
  if (signing.adoption === undefined) return { ok: false, slug, code: signing.code, reason: signing.reason }
  return { ok: true, prev: /** @type {string} */ (hashes.at(-1)), adoption: signing.adoption, unverifiedLines: /** @type {string} */ (signing.unverifiedLines) }
}

/** A journal this machine verifies, or none yet: nothing to adopt. @param {string} slug @param {string[]} lines @param {string} start */
const refusedAdoption = (slug, lines, start) => (lines.length === 0
  ? { ok: false, slug, code: 'not-initialised', reason: `${slug} has no journal (events.jsonl); ${start}` }
  : { ok: false, slug, code: 'journal-verified', reason: verifiedReason(slug) })

/** @param {JournalDeps} deps @param {string} slug @param {{ prev: string, adoption: Adoption }} adopted */
const appendAdoption = async (deps, slug, { prev, adoption }) => {
  const { id, key } = await deps.journalKeys.create()
  const body = JSON.stringify({ type: ADOPTED, at: deps.clock.now().toISOString(), prev, keyId: id, ...adoption })
  await deps.journal.append(slug, signedLine(body, await deps.hasher.hmacSha256(key, body)))
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
