import { normalizeRelative } from '../config/relative-path.mjs'
import { BLOCKING } from './verdict.mjs'

/**
 * What a later pass of a review step takes from the pass before it, so that it neither asks the
 * refuter again about a finding it refuted nor sends the work back for a line the agent left as
 * it was. A finding stands at a place: `path:line` (the first line when it names several), or
 * its whole location when it names no line. Two findings of one lens and one gate stand at the
 * same place when:
 *   with a line     the same path, and the text of the line each cites appears exactly once in
 *                   that file as the last pass read it and exactly once as this pass reads it,
 *                   at those lines: a line that moved is the same, an edited or repeated one is
 *                   not. A lens rewords its claim on every pass, so the claim is not compared.
 *   without a line  the same location and the same claim, word for word (the engine's checks).
 * On a pass after the first, each blocker, high or medium finding:
 *   at the place of one the last pass refuted (or carried over)   carried over as refuted, with that reason
 *   at the place of one the last pass did not refute              checked again as usual
 *   otherwise, from a lens (not the engine), on a line the last
 *   pass read with the same text, as above                         a note, never a reason to send the work back
 *   otherwise                                                      checked as usual
 * A file either pass could not read counts as changed.
 *
 * @typedef {import('./answers.mjs').Finding} Finding
 * @typedef {import('./answers.mjs').LensResult} LensResult
 * @typedef {{ lens: string, finding: Finding }} Member
 * @typedef {Record<string, string | null>} Snapshot
 *   what each file a pass reviewed held, by path relative to the working copy; null when it could not be read.
 * @typedef {{ lens: string, finding: string, reason: string, pass: number, [field: string]: unknown }} Refuted
 *   a refutation of the last pass, refuted there or carried over to it from the pass `pass`
 * @typedef {{ findings: Member[], refuted: Refuted[], snapshot: Snapshot }} LastPass
 *   findings: every finding of the last pass; only its blocker, high and medium ones stand at a place.
 * @typedef {{ carried: Array<Member & { prior: Refuted }>, unchanged: Member[] }} Settled
 */

/** A path, then its first line: `src/Pay.cs:12`, `src/Pay.cs:12-14`, `src/Pay.cs:12:5`. */
const LINE = /(.+?):(\d+)/

/**
 * @param {{ results: LensResult[], last: LastPass, snapshot: Snapshot, engine: readonly string[] }} pass
 *   engine: the lens ids of the engine's own checks
 * @returns {Settled}
 */
export const settleRepeats = ({ results, last, snapshot, engine }) => {
  /** @type {Settled} */
  const settled = { carried: [], unchanged: [] }
  const blocking = last.findings.filter(({ finding }) => BLOCKING.includes(finding.severity))
  for (const member of blockingMembers(results)) {
    const earlier = blocking.filter((other) => samePlace(other, member, { before: last.snapshot, after: snapshot }))
    const prior = last.refuted.find((refuted) => earlier.some(({ lens, finding }) => refuted.lens === lens && refuted.finding === finding.id))
    if (prior !== undefined) settled.carried.push({ ...member, prior })
    else if (earlier.length === 0 && !engine.includes(member.lens) && heldLine(member.finding, last.snapshot, snapshot) !== null) settled.unchanged.push(member)
  }
  return settled
}

/**
 * The paths the blocker, high and medium findings cite with a line, each once.
 * @param {LensResult[]} results
 */
export const citedPaths = (results) => [...new Set(blockingMembers(results).map(({ finding }) => placeOf(finding)?.path).filter((path) => path !== undefined))]

/** @param {LensResult[]} results @returns {Member[]} */
const blockingMembers = (results) => results.flatMap(({ lens, findings }) => findings.filter((finding) => BLOCKING.includes(finding.severity)).map((finding) => ({ lens, finding })))

/**
 * @param {Member} earlier a finding of the last pass @param {Member} member one of this pass
 * @param {{ before: Snapshot, after: Snapshot }} snapshots
 */
const samePlace = (earlier, member, { before, after }) => {
  if (earlier.lens !== member.lens || earlier.finding.gate !== member.finding.gate) return false
  const [then, now] = [placeOf(earlier.finding), placeOf(member.finding)]
  if (then === null || now === null) return sameClaim(earlier.finding, member.finding)
  return then.path === now.path && heldLine(member.finding, before, after) === then.line
}

/** @param {Finding} earlier @param {Finding} finding */
const sameClaim = (earlier, finding) => earlier.location === finding.location && earlier.description === finding.description

/** The path and the first line a location cites; null when it cites no line. @param {Finding} finding */
const placeOf = ({ location }) => {
  const match = LINE.exec(location)
  return match === null ? null : { path: normalizeRelative(match[1]), line: Number(match[2]) }
}

/**
 * The line of the file, as the last pass read it, that the finding's line was then; null when
 * the finding cites no line, either pass could not read the file, or the line's text is not
 * there exactly once in each.
 * @param {Finding} finding @param {Snapshot} before @param {Snapshot} after
 */
const heldLine = (finding, before, after) => {
  const place = placeOf(finding)
  const [then, now] = place === null ? [null, null] : [before[place.path] ?? null, after[place.path] ?? null]
  if (then === null || now === null) return null
  const text = linesOf(now)[/** @type {{ line: number }} */ (place).line - 1]
  return onlyOnce(linesOf(now), text) ? onlyAt(linesOf(then), text) : null
}

/** @param {string} text */
const linesOf = (text) => text.split(/\r?\n/)

/** @param {string[]} lines @param {string} text */
const onlyOnce = (lines, text) => lines.indexOf(text) === lines.lastIndexOf(text)

/** The line, from 1, that holds the text, when it is the only one; else null. @param {string[]} lines @param {string} text */
const onlyAt = (lines, text) => {
  const at = lines.indexOf(text)
  return at >= 0 && onlyOnce(lines, text) ? at + 1 : null
}
