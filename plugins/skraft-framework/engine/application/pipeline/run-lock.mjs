import {
  handOverMs, heldReason, isLive, LEASE_TTL_MS, leaseText, lostReason, parseLease, racedReason, RENEW_EVERY_MS, unavailableReason,
} from '../../domain/pipeline/run-lease.mjs'

/**
 * @typedef {{
 *   runLock: import('../ports/run-lock.mjs').RunLock,
 *   timer: import('../ports/timer.mjs').Timer,
 *   clock: import('../ports/clock.mjs').Clock,
 * }} LockDeps
 * @typedef {{ lost: () => boolean, release: () => Promise<void>, handOver: (agents: number) => Promise<void> }} HeldRun
 *   lost: another session replaced the lease since, or it was not renewed for LEASE_TTL_MS (the
 *   machine slept); release: ends the lease; handOver: leaves it, without renewing it, for the
 *   time that many agents handed over to the agent loop take.
 * @typedef {{ deps: LockDeps, slug: string, since: Date, renewed: Date, text: string, lost: boolean, stop: () => void }} Lease
 * @typedef {{ status: 'refused' | 'blocked', code: string, reason: string }} Refusal
 * @typedef {import('./active-run.mjs').RunOutcome} RunOutcome
 */

/**
 * Takes the pipeline's lease for this session: a new one when nobody holds it, its own, the one
 * a gone session left; refused while another session renews its own. handedBack: the session
 * takes back the lease it left when it handed its agents over, which must still be its own.
 * Held, it is renewed every RENEW_EVERY_MS until released or handed over again.
 * @param {LockDeps} deps @param {string} slug @param {{ handedBack?: boolean }} [request]
 * @returns {Promise<{ ok: true, held: HeldRun } | { ok: false, outcome: RunOutcome }>}
 */
export const holdRun = async (deps, slug, { handedBack = false } = {}) => {
  const now = deps.clock.now()
  /** @type {Lease} */
  const lease = { deps, slug, since: now, renewed: now, text: leaseText({ owner: deps.runLock.owner, since: now, renewed: now }), lost: false, stop: () => {} }
  const refusal = await (handedBack ? takeBack(lease) : take(lease)).catch(() => unavailable(slug))
  if (refusal !== null) return { ok: false, outcome: { slug, phase: null, ...refusal } }
  lease.stop = deps.timer.every(RENEW_EVERY_MS, () => renew(lease))
  return { ok: true, held: Object.freeze({ lost: () => isLost(lease), release: () => release(lease), handOver: (agents) => handOver(lease, agents) }) }
}

/** @param {string} slug @returns {Refusal} */
const unavailable = (slug) => ({ status: 'refused', code: 'lock-unavailable', reason: unavailableReason(slug) })

/**
 * @param {Lease} lease
 * @returns {Promise<Refusal | null>} why the lease cannot be taken, null once it is
 */
const take = async (lease) => {
  const { deps, slug, text } = lease
  if (await deps.runLock.create(slug, text)) return null
  const seen = await deps.runLock.read(slug)
  const held = parseLease(seen ?? '')
  if (held?.owner === deps.runLock.owner) return takeOwn(lease, /** @type {string} */ (seen), held)
  if (held !== null && isLive(held, deps.clock.now())) return { status: 'refused', code: 'pipeline-locked', reason: heldReason(slug, held) }
  return takeOver(lease, seen)
}

/**
 * The lease this session left when it handed its agents over; lost when another session took
 * it, or when there is none any more.
 * @param {Lease} lease @returns {Promise<Refusal | null>}
 */
const takeBack = async (lease) => {
  const seen = await lease.deps.runLock.read(lease.slug)
  const held = parseLease(seen ?? '')
  if (held?.owner !== lease.deps.runLock.owner) return lost(lease.slug)
  return takeOwn(lease, /** @type {string} */ (seen), held)
}

/**
 * This session's own lease, renewed from the time it started, past its time too when nobody
 * took it meanwhile.
 * @param {Lease} lease @param {string} seen @param {import('../../domain/pipeline/run-lease.mjs').RunLease} held
 * @returns {Promise<Refusal | null>}
 */
const takeOwn = async (lease, seen, held) => {
  const text = leaseText({ owner: held.owner, since: held.since, renewed: lease.renewed })
  if (!(await lease.deps.runLock.renew(lease.slug, seen, text))) return lost(lease.slug)
  Object.assign(lease, { since: held.since, text })
  return null
}

/** @param {string} slug @returns {Refusal} */
const lost = (slug) => ({ status: 'blocked', code: 'lock-lost', reason: lostReason(slug) })

/**
 * The lease a gone session left becomes this one's, unless a third session took it first.
 * @param {Pick<Lease, 'deps' | 'slug' | 'text'>} lease @param {string | null} seen
 * @returns {Promise<Refusal | null>}
 */
const takeOver = async ({ deps, slug, text }, seen) => {
  const taken = seen === null ? await deps.runLock.create(slug, text) : await deps.runLock.replace(slug, seen, text)
  return taken ? null : { status: 'refused', code: 'pipeline-locked', reason: racedReason(slug) }
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

/**
 * The lease left for the agents handed over, renewed now for the time they take; one the
 * machine fails to write keeps the time it had. The release that follows finds it renewed and
 * leaves it.
 * @param {Lease} lease @param {number} agents
 */
const handOver = async (lease, agents) => {
  const text = leaseText({ owner: lease.deps.runLock.owner, since: lease.since, renewed: lease.deps.clock.now(), ttlMs: handOverMs(agents) })
  await lease.deps.runLock.renew(lease.slug, lease.text, text).catch(() => false)
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
