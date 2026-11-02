import { holdsMarker } from '../../domain/pipeline/forge-comment.mjs'
import { FORGE_WRITE } from '../../domain/reporting/forge-writes.mjs'

/**
 * A write on the forge is applied only once the forge shows it when asked again: a comment read
 * back at the URL the forge gave, holding its marker; a branch seen at the local commit by
 * `git ls-remote`. Each write is journaled with its outcome (applied, refused,
 * verification-failed, unknown) and the fixed reason of any outcome but applied.
 *
 * @typedef {import('../../domain/reporting/forge-writes.mjs').WriteOutcome} WriteOutcome
 * @typedef {import('../ports/code-host.mjs').Failed} Failed
 * @typedef {import('../ports/code-host.mjs').CommentReading} CommentReading
 * @typedef {{ ok: true, url: string } | { ok: false, reason: string, outcome: Exclude<WriteOutcome, 'applied'> }} Verified
 * @typedef {{ events: unknown[], append: (type: string, payload?: Record<string, unknown>) => Promise<void> }} WriteJournal
 * @typedef {{ write: string, subject: string }} WriteName
 *   write: what is written; subject: the branch or the number written to.
 */

/** The outcome a failed write answered: refused unless it says otherwise. @param {{ outcome?: Exclude<WriteOutcome, 'applied'> }} failed @returns {Exclude<WriteOutcome, 'applied'>} */
export const failedOutcome = (failed) => failed.outcome ?? 'refused'

/** One write journaled with its outcome. @param {WriteJournal} journal @param {WriteName} name @param {{ outcome: WriteOutcome, reason?: string }} told */
export const journalWrite = (journal, { write, subject }, { outcome, reason }) =>
  journal.append(FORGE_WRITE, { write, subject, outcome, reason: outcome === 'applied' ? null : reason })

/** @param {WriteJournal} journal @param {WriteName} name @param {Verified} verified @returns {Promise<Verified>} */
const journaled = async (journal, name, verified) => {
  await journalWrite(journal, name, verified.ok ? { outcome: 'applied' } : verified)
  return verified
}

/**
 * A comment kept, then read back at the URL the forge gave: applied once it holds its marker
 * where it should; verification-failed when the forge said it kept it and does not show it.
 * @param {WriteJournal} journal @param {WriteName & { marker: string, markerAt: import('../../domain/pipeline/forge-comment.mjs').MarkerAt }} request
 * @param {{ keep: () => Promise<{ ok: true, url: string } | Failed>, read: (url: string) => Promise<CommentReading> }} forge
 * @returns {Promise<Verified>}
 */
export const keptComment = async (journal, request, { keep, read }) => {
  const kept = await keep()
  if (!kept.ok) return journaled(journal, request, { ok: false, reason: kept.reason, outcome: failedOutcome(kept) })
  const reading = await read(kept.url)
  return journaled(journal, request, readBack(request, kept.url, reading))
}

/** @param {WriteName & { marker: string, markerAt: import('../../domain/pipeline/forge-comment.mjs').MarkerAt }} request @param {string} url @param {CommentReading} reading @returns {Verified} */
const readBack = (request, url, reading) => {
  if (reading.ok && reading.body !== null && holdsMarker(reading.body, request)) return { ok: true, url }
  return { ok: false, outcome: 'verification-failed', reason: `the forge said it kept the comment on #${request.subject}, but reading it back at ${url} does not show it` }
}

/** How many times a push the remote does not show is sent: once, then once again. */
const PUSHES = 2

/**
 * The branch pushed, never forced, then read back with `git ls-remote`: applied once the remote's
 * branch is at the local commit; pushed once more when it is not; never declared pushed otherwise.
 * @param {WriteJournal} journal
 * @param {Pick<import('../ports/code-host.mjs').CodeHost, 'push' | 'localTip' | 'remoteTip'>} codeHost
 * @param {string} branch @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
export const pushedBranch = async (journal, codeHost, branch) => {
  const name = { write: 'push', subject: branch }
  const local = await codeHost.localTip(branch)
  const verified = local === null ? { ok: false, outcome: /** @type {const} */ ('refused'), reason: `git cannot tell which commit ${branch} points at, so nothing is pushed` } : await pushedAt(codeHost, branch, local)
  await journalWrite(journal, name, verified.ok ? { outcome: 'applied' } : verified)
  return verified
}

/**
 * The push sent until the remote shows the local commit, at most PUSHES times; a refusal stops at
 * once. What the last try told when the remote never showed it.
 * @param {Pick<import('../ports/code-host.mjs').CodeHost, 'push' | 'remoteTip'>} codeHost @param {string} branch @param {string} local
 * @returns {Promise<{ ok: true } | { ok: false, reason: string, outcome: Exclude<WriteOutcome, 'applied'> }>}
 */
const pushedAt = async (codeHost, branch, local) => {
  for (let attempt = 1; ; attempt += 1) {
    const pushed = await codeHost.push(branch)
    if (!pushed.ok && failedOutcome(pushed) === 'refused') return { ok: false, outcome: 'refused', reason: pushed.reason }
    const tip = await codeHost.remoteTip(branch)
    if (tip.ok && tip.sha === local) return { ok: true }
    if (attempt === PUSHES) return unconfirmed(branch, { unanswered: !pushed.ok, unread: !tip.ok })
  }
}

/**
 * A push the remote never showed after its last try: unknown when that try got no answer;
 * verification-failed when it answered, the remote showing another commit or none, or unread.
 * @param {string} branch @param {{ unanswered: boolean, unread: boolean }} last
 * @returns {{ ok: false, reason: string, outcome: 'unknown' | 'verification-failed' }}
 */
const unconfirmed = (branch, { unanswered, unread }) => {
  if (unanswered) return { ok: false, outcome: 'unknown', reason: `git push of ${branch} got no answer twice, and git ls-remote does not show the branch at the local commit` }
  if (unread) return { ok: false, outcome: 'verification-failed', reason: `git push of ${branch} answered, but git ls-remote could not read the remote to confirm it: the push is not declared done` }
  return { ok: false, outcome: 'verification-failed', reason: `git push of ${branch} answered, twice, but git ls-remote does not show the branch at the local commit` }
}
