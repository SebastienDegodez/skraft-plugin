import { heldReason, isLive, LEASE_TTL_MS, leaseText, lostReason, parseLease, racedReason, RENEW_EVERY_MS, unavailableReason } from '../../domain/pipeline/run-lease.mjs'

/**
 * @typedef {{
 *   runLock: import('../ports/run-lock.mjs').RunLock,
 *   timer: import('../ports/timer.mjs').Timer,
 *   clock: import('../ports/clock.mjs').Clock,
 * }} LockDeps
 * @typedef {{ lost: () => boolean, release: () => Promise<void> }} HeldRun
 *   lost: another session replaced the lease since, or it was not renewed for LEASE_TTL_MS (the
 *   machine slept); release: ends the lease, once.
 * @typedef {{ deps: LockDeps, slug: string, since: Date, renewed: Date, text: string, lost: boolean, stop: () => void }} Lease
 * @typedef {import('./active-run.mjs').RunOutcome} RunOutcome
 */

/**
 * Takes the pipeline's lease for this session: a new one when nobody holds it, the one a gone
 * session left; refused while another session renews its own. Held, it is renewed every
 * RENEW_EVERY_MS until released.
 * @param {LockDeps} deps @param {string} slug
 * @returns {Promise<{ ok: true, held: HeldRun } | { ok: false, outcome: RunOutcome }>}
 */
export const holdRun = async (deps, slug) => {
  const now = deps.clock.now()
  /** @type {Lease} */
  const lease = { deps, slug, since: now, renewed: now, text: leaseText({ owner: deps.runLock.owner, since: now, renewed: now }), lost: false, stop: () => {} }
  const refusal = await take(lease).then((reason) => reason && { code: 'pipeline-locked', reason }, () => ({ code: 'lock-unavailable', reason: unavailableReason(slug) }))
  if (refusal !== null) return { ok: false, outcome: { status: 'refused', slug, phase: null, ...refusal } }
  lease.stop = deps.timer.every(RENEW_EVERY_MS, () => renew(lease))
  return { ok: true, held: Object.freeze({ lost: () => isLost(lease), release: () => release(lease) }) }
}

/**
 * @param {Lease} lease
 * @returns {Promise<string | null>} why the lease cannot be taken, null once it is
 */
const take = async ({ deps, slug, text }) => {
  if (await deps.runLock.create(slug, text)) return null
  const seen = await deps.runLock.read(slug)
  const held = parseLease(seen ?? '')
  if (held !== null && isLive(held, deps.clock.now())) return heldReason(slug, held)
  return takeOver({ deps, slug, text }, seen)
}

/**
 * The lease a gone session left becomes this one's, unless a third session took it first.
 * @param {Pick<Lease, 'deps' | 'slug' | 'text'>} lease @param {string | null} seen
 * @returns {Promise<string | null>}
 */
const takeOver = async ({ deps, slug, text }, seen) => {
  const taken = seen === null ? await deps.runLock.create(slug, text) : await deps.runLock.replace(slug, seen, text)
  return taken ? null : racedReason(slug)
}

/** A lease another session replaced, or the machine failed to renew, is lost for good. @param {Lease} lease */
const renew = async (lease) => {
  const now = lease.deps.clock.now()
  const text = leaseText({ owner: lease.deps.runLock.owner, since: lease.since, renewed: now })
  const renewed = await lease.deps.runLock.renew(lease.slug, lease.text, text).catch(() => false)
  if (renewed) Object.assign(lease, { text, renewed: now })
  else lease.lost = true
}

/** @param {Lease} lease */
const isLost = (lease) => lease.lost || lease.deps.clock.now().getTime() - lease.renewed.getTime() >= LEASE_TTL_MS

/** A lease the machine fails to end expires on its own. @param {Lease} lease */
const release = async (lease) => {
  lease.stop()
  await lease.deps.runLock.replace(lease.slug, lease.text, null).catch(() => false)
}

/** The session lost its lease: it writes nothing more to the run. */
export class LockLost extends Error {}

/**
 * The journal as this session may write it: no event once another session took the lease.
 * @param {import('../journal/run-journal.mjs').OpenJournal} journal @param {HeldRun} held @param {string} slug
 * @returns {import('../journal/run-journal.mjs').OpenJournal}
 */
export const writingWhileHeld = (journal, held, slug) => ({
  events: journal.events,
  append: async (type, payload) => {
    if (held.lost()) throw new LockLost(lostReason(slug))
    return journal.append(type, payload)
  },
})
