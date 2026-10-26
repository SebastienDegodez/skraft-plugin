/**
 * The lease a session holds on a pipeline, as `<slug>/.lock` keeps it: one line,
 * `<owner> <since> <renewed> [<ttl>]`, the two times in ISO-8601 UTC. The session renews it
 * while it drives the run; a lease not renewed for its ttl (LEASE_TTL_MS when the line names
 * none) is the trace of a session that is gone. A run that hands its agents over to the agent
 * loop leaves its lease for the time they take (handOverMs), the next `skraft record` takes it back.
 *
 * @typedef {{ owner: string, since: Date, renewed: Date, ttlMs: number }} RunLease
 */

export const LEASE_TTL_MS = 120_000
export const RENEW_EVERY_MS = 30_000
export const HAND_OVER_PER_AGENT_MS = 1_800_000
export const HAND_OVER_MAX_MS = 7_200_000

const LINE = /^(\S+) (\S+) (\S+)(?: (\d+))?$/

/** @param {Omit<RunLease, 'ttlMs'> & { ttlMs?: number }} lease */
export const leaseText = ({ owner, since, renewed, ttlMs = LEASE_TTL_MS }) =>
  `${owner} ${since.toISOString()} ${renewed.toISOString()}${ttlMs === LEASE_TTL_MS ? '' : ` ${ttlMs}`}\n`

/** How long a lease handed over with that many agents lasts: each its own time, bounded. @param {number} agents */
export const handOverMs = (agents) => Math.min(HAND_OVER_MAX_MS, agents * HAND_OVER_PER_AGENT_MS)

/**
 * @param {string | null} text the lock file's content, null when there is none
 * @returns {RunLease | null} null when it holds no lease this engine wrote
 */
export const parseLease = (text) => {
  if (text === null) return null
  const match = LINE.exec(text.trim())
  if (match === null) return null
  const [, owner, since, renewed, ttl] = match
  const times = [new Date(since), new Date(renewed)]
  if (times.some((time) => Number.isNaN(time.getTime()))) return null
  return { owner, since: times[0], renewed: times[1], ttlMs: ttl === undefined ? LEASE_TTL_MS : Number(ttl) }
}

/** Whether the session that holds the lease may still be driving the run. @param {RunLease} lease @param {Date} now */
export const isLive = (lease, now) => now.getTime() - lease.renewed.getTime() < lease.ttlMs

/** @param {string} slug @param {RunLease} lease */
export const heldReason = (slug, { since, renewed, ttlMs }) =>
  `${slug} is driven by another session (started ${since.toISOString()}, last seen ${renewed.toISOString()}); ` +
  `let it finish or stop it, or run again after ${new Date(renewed.getTime() + ttlMs).toISOString()} if that session is gone`

/** @param {string} slug */
export const lostReason = (slug) =>
  `${slug}: this session no longer holds the pipeline's lease (another session took it over, or renewing it failed); this run stops here and writes nothing more`

/** @param {string} slug */
export const racedReason = (slug) =>
  `${slug}: another session took over the lease a gone session left at the same moment; run again to see which one drives it`

/** @param {string} slug */
export const unavailableReason = (slug) =>
  `${slug}: this session cannot write the pipeline's lock file (.copilot-tracking/skraft-plans/${slug}/.lock); check that the tracking folder is writable and that node starts on this machine`
