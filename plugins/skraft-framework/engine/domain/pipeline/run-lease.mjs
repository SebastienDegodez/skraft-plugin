/**
 * The lease a session holds on a pipeline, as `<slug>/.lock` keeps it: one line,
 * `<owner> <since> <renewed>`, the two times in ISO-8601 UTC. The session renews it while it
 * drives the run; a lease not renewed for LEASE_TTL_MS is the trace of a session that is gone.
 *
 * @typedef {{ owner: string, since: Date, renewed: Date }} RunLease
 */

export const LEASE_TTL_MS = 120_000
export const RENEW_EVERY_MS = 30_000

const LINE = /^(\S+) (\S+) (\S+)$/

/** @param {RunLease} lease */
export const leaseText = ({ owner, since, renewed }) => `${owner} ${since.toISOString()} ${renewed.toISOString()}\n`

/**
 * @param {string} text the lock file's content
 * @returns {RunLease | null} null when it holds no lease this engine wrote
 */
export const parseLease = (text) => {
  const match = LINE.exec(text.trim())
  if (match === null) return null
  const [, owner, since, renewed] = match
  const times = [new Date(since), new Date(renewed)]
  if (times.some((time) => Number.isNaN(time.getTime()))) return null
  return { owner, since: times[0], renewed: times[1] }
}

/** Whether the session that holds the lease may still be driving the run. @param {RunLease} lease @param {Date} now */
export const isLive = (lease, now) => now.getTime() - lease.renewed.getTime() < LEASE_TTL_MS

/** @param {string} slug @param {RunLease} lease */
export const heldReason = (slug, { since, renewed }) =>
  `${slug} is driven by another session (started ${since.toISOString()}, last seen ${renewed.toISOString()}); ` +
  `let it finish or stop it, or run again after ${new Date(renewed.getTime() + LEASE_TTL_MS).toISOString()} if that session is gone`

/** @param {string} slug */
export const lostReason = (slug) =>
  `${slug}: this session no longer holds the pipeline's lease (another session took it over, or renewing it failed); this run stops here and writes nothing more`

/** @param {string} slug */
export const racedReason = (slug) =>
  `${slug}: another session took over the lease a gone session left at the same moment; run again to see which one drives it`

/** @param {string} slug */
export const unavailableReason = (slug) =>
  `${slug}: this session cannot write the pipeline's lock file (.copilot-tracking/skraft-plans/${slug}/.lock); check that the tracking folder is writable and that node starts on this machine`
