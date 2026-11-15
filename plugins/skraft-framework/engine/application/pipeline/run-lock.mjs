import {
  handOverMs, heldReason, isLive, isRenewable, isRenewed, LEASE_TTL_MS, leaseText, lostReason, parseLease, racedReason, reclaimedNote, RENEW_EVERY_MS, unavailableReason,
} from '../../domain/pipeline/run-lease.mjs'

/**
 * @typedef {{
 *   runLock: import('../ports/run-lock.mjs').RunLock,
 *   timer: import('../ports/timer.mjs').Timer,
 *   clock: import('../ports/clock.mjs').Clock,
 * }} LockDeps
 * @typedef {{ holds: () => Promise<boolean>, reclaims: () => Reclaim[], release: () => Promise<void>, handOver: (agents: number) => Promise<void> }} HeldRun
 *   holds: whether this session still holds the lease, taken back first when it went unrenewed
 *   past its time (the machine slept) and nobody touched it; false for good once another session
 *   replaced it, it vanished, or the machine failed to write it. reclaims: the take-backs not
 *   told yet, each once. release: ends the lease; handOver: leaves it, without renewing it, for
 *   the time that many agents handed over to the agent loop take.
 * @typedef {{ renewed: Date, at: Date }} Reclaim when the lease was renewed last, when it was taken back
 * @typedef {{ deps: LockDeps, slug: string, since: Date, renewed: Date, text: string, lost: boolean, handed: boolean, stop: () => void, writing: Promise<unknown>, gaps: Reclaim[] }} Lease
 *   handed: left for agents handed over; the release leaves it. writing: the lease write under
 *   way, the next one waits for it. gaps: the take-backs not told yet.
 * @typedef {{ status: 'refused' | 'blocked', code: string, reason: string }} Refusal
 * @typedef {import('./active-run.mjs').RunOutcome} RunOutcome
 */

/**
 * Takes the pipeline's lease for this session: a new one when nobody holds it, its own, the one
 * a gone session left; refused while another session renews its own. handedBack: the session
 * takes back the lease it left when it handed its agents over, which must still be its own.
 * Held, it is renewed every RENEW_EVERY_MS until released or handed over again.
 * @param {LockDeps} deps @param {string} slug @param {{ handedBack?: boolean }} [request] handedBack: false when absent
 * @returns {Promise<{ ok: true, held: HeldRun } | { ok: false, outcome: RunOutcome }>}
 */
export const holdRun = async (deps, slug, { handedBack } = {}) => {
  const lease = newLease(deps, slug, deps.clock.now())
  const refusal = await (handedBack ? takeBack(lease) : take(lease)).catch(() => unavailable(slug))
  if (refusal !== null) return { ok: false, outcome: { slug, phase: null, ...refusal } }
  lease.stop = deps.timer.every(RENEW_EVERY_MS, () => serially(lease, () => renew(lease)))
  return { ok: true, held: heldRun(lease) }
}

/** @param {LockDeps} deps @param {string} slug @param {Date} now @returns {Lease} */
const newLease = (deps, slug, now) => ({
  deps, slug, since: now, renewed: now, text: leaseText({ owner: deps.runLock.owner, since: now, renewed: now }), lost: false, handed: false, stop: () => {}, writing: Promise.resolve(), gaps: [],
})

/** @param {Lease} lease @returns {HeldRun} */
const heldRun = (lease) => Object.freeze({
  holds: () => serially(lease, () => stillHeld(lease)),
  reclaims: () => lease.gaps.splice(0),
  release: () => release(lease),
  handOver: (agents) => handOver(lease, agents),
})

/** @param {string} slug @returns {Refusal} */
const unavailable = (slug) => ({ status: 'refused', code: 'lock-unavailable', reason: unavailableReason(slug) })

/**
 * @param {Lease} lease
 * @returns {Promise<Refusal | null>} why the lease cannot be taken, null once it is
 */
const take = async (lease) => {
  const { deps, slug } = lease
  const seen = await deps.runLock.read(slug)
  const held = parseLease(seen)
  const live = held !== null && isLive(held, deps.clock.now())
  if (held?.owner === deps.runLock.owner && !(live && isRenewed(held))) return takeOwn(lease, /** @type {string} */ (seen), held)
  if (live) return { status: 'refused', code: 'pipeline-locked', reason: heldReason(slug, /** @type {import('../../domain/pipeline/run-lease.mjs').RunLease} */ (held)) }
  return takeOver(lease, seen)
}

/**
 * The lease this session left when it handed its agents over; lost when another session took
 * it, or when there is none any more; refused while a run of this same id drives it again on a
 * renewed lease (a record started twice).
 * @param {Lease} lease @returns {Promise<Refusal | null>}
 */
const takeBack = async (lease) => {
  const seen = await lease.deps.runLock.read(lease.slug)
  const held = parseLease(seen)
  if (held?.owner !== lease.deps.runLock.owner) return lost(lease.slug)
  if (isLive(held, lease.renewed) && isRenewed(held)) return { status: 'refused', code: 'pipeline-locked', reason: heldReason(lease.slug, held) }
  return takeOwn(lease, /** @type {string} */ (seen), held)
}

/**
 * This session's own lease, from the time it started: renewed in place while far from its end,
 * else taken over the way a gone session's is, where one session only wins.
 * @param {Lease} lease @param {string} seen @param {import('../../domain/pipeline/run-lease.mjs').RunLease} held
 * @returns {Promise<Refusal | null>}
 */
const takeOwn = async (lease, seen, held) => {
  const text = leaseText({ owner: held.owner, since: held.since, renewed: lease.renewed })
  const { runLock } = lease.deps
  const taken = isRenewable(held, lease.renewed) ? await runLock.renew(lease.slug, seen, text) : await runLock.replace(lease.slug, seen, text)
  if (!taken) return missedOwn(lease)
  Object.assign(lease, { since: held.since, text })
  return null
}

/**
 * Why this session's own lease was not taken: refused when a run of this same id took it at the
 * same moment (two records at once: run again once it ends), lost when another session holds it
 * or none is left.
 * @param {Lease} lease @returns {Promise<Refusal>}
 */
const missedOwn = async (lease) => {
  const now = parseLease(await lease.deps.runLock.read(lease.slug))
  if (now?.owner === lease.deps.runLock.owner) return { status: 'refused', code: 'pipeline-locked', reason: heldReason(lease.slug, now) }
  return lost(lease.slug)
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

/**
 * The lease renewed in place while far from its end. Past that, the machine slept: it is taken
 * back when nobody touched it meanwhile. One another session replaced, or the machine failed to
 * renew in place, is lost for good.
 * @param {Lease} lease
 */
const renew = async (lease) => {
  if (!renewable(lease)) return void (await reclaim(lease))
  const now = lease.deps.clock.now()
  const text = leaseText({ owner: lease.deps.runLock.owner, since: lease.since, renewed: now })
  const renewed = await lease.deps.runLock.renew(lease.slug, lease.text, text).catch(ignored)
  if (renewed) Object.assign(lease, { text, renewed: now })
  else lease.lost = true
}

/** Whether this session still holds its lease, taken back first when it went past its time untouched. @param {Lease} lease */
const stillHeld = async (lease) => !lease.lost && (renewable(lease) || reclaim(lease))

/** @param {Lease} lease */
const renewable = (lease) => isRenewable({ renewed: lease.renewed, ttlMs: LEASE_TTL_MS }, lease.deps.clock.now())

/**
 * The lease this session left past its time, taken back only while it holds exactly what this
 * session wrote last: the way a gone session's is, where one session only wins.
 * @param {Lease} lease @returns {Promise<boolean>}
 */
const reclaim = async (lease) => {
  const now = lease.deps.clock.now()
  const text = leaseText({ owner: lease.deps.runLock.owner, since: lease.since, renewed: now })
  const taken = await lease.deps.runLock.replace(lease.slug, lease.text, text).catch(ignored)
  if (!taken) return lapsed(lease)
  lease.gaps.push({ renewed: lease.renewed, at: now })
  Object.assign(lease, { text, renewed: now })
  return true
}

/** @param {Lease} lease */
const lapsed = (lease) => {
  lease.lost = true
  return false
}

/** One lease write at a time: a renewal and a journal write never take the lease back twice. @param {Lease} lease @param {() => Promise<T>} write @template T */
const serially = (lease, write) => /** @type {Promise<T>} */ (lease.writing = lease.writing.then(write))

/** A lease the machine fails to end expires on its own. @param {Lease} lease */
const release = async (lease) => {
  lease.stop()
  if (!lease.handed) await lease.deps.runLock.replace(lease.slug, lease.text, null).catch(ignored)
}

/**
 * The lease left for the agents handed over, renewed now for the time they take, no longer
 * renewed by this session; one the machine fails to write keeps the time it had, and stays
 * left to them all the same.
 * @param {Lease} lease @param {number} agents
 */
const handOver = async (lease, agents) => {
  // Stryker disable next-line BlockStatement,ExpressionStatement: the release right after stops the timer too; stopping first only keeps a renewal from racing the hand-over write, which no scenario can time
  lease.stop()
  lease.handed = true
  const text = leaseText({ owner: lease.deps.runLock.owner, since: lease.since, renewed: lease.deps.clock.now(), ttlMs: handOverMs(agents) })
  await lease.deps.runLock.renew(lease.slug, lease.text, text).catch(ignored)
}

/** A lease write the machine failed: no write, which the caller reads as not done. */
const ignored = () => {}

/** The session lost its lease: it writes nothing more to the run. */
export class LockLost extends Error {}

/**
 * The journal as this session may write it: no event once another session took the lease; a
 * lease taken back after the machine slept is journaled and told before the next event.
 * @param {import('../journal/run-journal.mjs').OpenJournal} journal @param {HeldRun} held @param {string} slug
 * @param {Pick<import('../ports/pipeline-progress.mjs').PipelineProgress, 'log'>} progress
 * @returns {import('../journal/run-journal.mjs').OpenJournal}
 */
export const writingWhileHeld = (journal, held, slug, progress) => ({
  events: journal.events,
  append: async (type, payload) => {
    if (!(await held.holds())) throw new LockLost(lostReason(slug))
    await journalReclaims({ journal, slug, progress }, held.reclaims())
    return journal.append(type, payload)
  },
})

/**
 * @param {{ journal: import('../journal/run-journal.mjs').OpenJournal, slug: string, progress: Pick<import('../ports/pipeline-progress.mjs').PipelineProgress, 'log'> }} at
 * @param {Reclaim[]} reclaims
 */
const journalReclaims = async ({ journal, slug, progress }, reclaims) => {
  for (const { renewed, at } of reclaims) {
    const gapMs = at.getTime() - renewed.getTime()
    await journal.append('lease.reclaimed', { renewed: renewed.toISOString(), gapMs })
    progress.log(reclaimedNote(slug, gapMs))
  }
}
