import { citedPaths, settleRepeats } from '../../domain/review/repeats.mjs'
import { shortLocation, workingCopyOf } from '../../domain/review/locations.mjs'
import { readOrName } from '../shared/workspace-reading.mjs'

/**
 * What a review pass takes from the pass before it of the same step (`repeats.mjs`). Each pass
 * keeps beside it, in snapshot.json, what each file it reviewed held: the changed paths, the
 * documents its lenses read, and the files its blocker, high and medium findings cite. From the
 * second pass, with the last pass's snapshot, it journals each finding carried over as refuted
 * (`review.refuted` with `carried`: the pass the refuter refuted it on, its reason, assignment
 * and model) and each finding noted as new on an unchanged line (`review.noted`, `since` the
 * last pass); a resumed pass journals neither twice. A pass without the last one's snapshot
 * takes nothing from it.
 *
 * @typedef {import('./review-runs.mjs').Review} Review
 * @typedef {import('../../domain/review/answers.mjs').LensResult} LensResult
 * @typedef {import('../../domain/review/repeats.mjs').Snapshot} Snapshot
 * @typedef {import('../../domain/review/repeats.mjs').Settled} Settled
 * @typedef {import('../../domain/review/verdict.mjs').RecordedRefutation} RecordedRefutation
 * @typedef {import('../../domain/review/verdict.mjs').UnchangedFinding} UnchangedFinding
 * @typedef {import('../../domain/journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {{ carried: RecordedRefutation[], unchanged: UnchangedFinding[] }} Taken
 */

/** The longest text a snapshot keeps of a file; a longer one counts as unread. */
const MAX_TEXT = 1_000_000

/**
 * @param {Review} review
 * @param {{ prepared: { paths: string[], inputs: { outputs: string[], context: string[] } }, results: LensResult[], engine: readonly string[], journaled: (type: string) => RunEvent[], last: (type: string) => RunEvent[] }} pass
 *   prepared: the changed paths, relative to the working copy, and the documents the lenses read,
 *   relative to the tracking folder; engine: the lens ids of the engine's own checks; journaled:
 *   the events of a type this pass already wrote; last: those of the step's last pass
 * @returns {Promise<Taken>}
 */
export const takeFromLastPass = async (review, { prepared, results, engine, journaled, last }) => {
  const prefix = trackedPrefix(review)
  const documents = [...prepared.inputs.outputs, ...prepared.inputs.context].map((path) => `${prefix}${path}`)
  const snapshot = await snapshotOf(review, prefix, [...prepared.paths, ...documents, ...citedPaths(results)])
  const { slug, step } = review
  await review.deps.files.write(slug, snapshotPath(step.node.id, step.visit), `${JSON.stringify(snapshot)}\n`)
  const settled = settleRepeats({ results, last: await lastPassOf(review, last), snapshot, engine })
  return { carried: await carryOver(review, settled.carried, journaled('review.refuted')), unchanged: await noteUnchanged(review, settled.unchanged, journaled('review.noted')) }
}

/** Where a pass keeps what its files held. @param {string} step @param {number} visit */
const snapshotPath = (step, visit) => `reviews/${step}-${visit}/snapshot.json`

/**
 * The tracking folder as a finding cites it, relative to the working copy, with its trailing `/`.
 * @param {Review} review
 */
const trackedPrefix = ({ deps, slug }) => {
  const marker = deps.files.location(slug, 'marker')
  return shortLocation(marker, workingCopyOf(marker)).slice(0, -'marker'.length)
}

/**
 * What each path holds, each once: a file of the tracking folder read there, any other in the
 * working copy; a path above the working copy is left out.
 * @param {Review} review @param {string} prefix @param {string[]} paths @returns {Promise<Snapshot>}
 */
const snapshotOf = async (review, prefix, paths) => {
  const kept = paths.filter((path) => !path.startsWith('../'))
  const texts = await Promise.all(kept.map((path) => textOf(review, prefix, path)))
  return Object.fromEntries(kept.map((path, index) => [path, texts[index]]))
}

/** @param {Review} review @param {string} prefix @param {string} path @returns {Promise<string | null>} */
const textOf = async ({ deps, slug }, prefix, path) => {
  const text = path.startsWith(prefix) ? await deps.files.read(slug, path.slice(prefix.length)) : await readOrName(deps.workspace, path)
  return text === `unreadable: ${path}` || (text?.length ?? 0) > MAX_TEXT ? null : text
}

/**
 * The last pass of the step: its snapshot, its findings and its refutations; nothing when it
 * kept no readable snapshot (the first pass, or one an earlier engine ran).
 * @param {Review} review @param {(type: string) => RunEvent[]} last the events of a type the last pass wrote
 * @returns {Promise<import('../../domain/review/repeats.mjs').LastPass>}
 */
const lastPassOf = async (review, last) => {
  const { step } = review
  const snapshot = parsed(await review.deps.files.read(review.slug, snapshotPath(step.node.id, step.visit - 1)))
  // Stryker disable next-line ArrayDeclaration: with no finding of the last pass, no refutation of it is ever looked up
  if (snapshot === null) return { snapshot: {}, findings: [], refuted: [] }
  const findings = last('review.lens').flatMap(({ lens, findings: found }) => found.map((/** @type {any} */ finding) => ({ lens, finding })))
  return { snapshot, findings, refuted: last('review.refuted').filter(({ verdict }) => verdict === 'refuted').map(refutedOf) }
}

/** What a snapshot file holds; null when there is none or it is no JSON. @param {string | null} text @returns {Snapshot | null} */
const parsed = (text) => {
  try {
    return JSON.parse(String(text))
  } catch {
    return null
  }
}

/** @param {RunEvent} event @returns {import('../../domain/review/repeats.mjs').Refuted} */
const refutedOf = ({ lens, finding, reason, visit, carried, assignment, model }) => ({ lens, finding, reason, pass: carried ?? visit, assignment, model })

/**
 * Each finding carried over as refuted, journaled once a pass.
 * @param {Review} review @param {Settled['carried']} carried
 * @param {RunEvent[]} done the refutations this pass journaled: a pass journals what it carried over before it asks the refuter, so a resumed one holds them all
 * @returns {Promise<RecordedRefutation[]>}
 */
const carryOver = async (review, carried, done) => {
  const { journal, step } = review
  for (const { lens, finding, prior } of carried) {
    const { reason, pass, assignment, model } = prior
    if (done.length === 0) await journal.append('review.refuted', { step: step.node.id, visit: step.visit, lens, finding: finding.id, verdict: 'refuted', reason, carried: pass, assignment, model })
  }
  return carried.map(({ lens, finding, prior }) => ({ lens, finding: finding.id, verdict: /** @type {const} */ ('refuted'), reason: prior.reason, carried: prior.pass }))
}

/**
 * Each finding noted as new on an unchanged line, journaled once a pass.
 * @param {Review} review @param {Settled['unchanged']} unchanged @param {RunEvent[]} done the notes this pass journaled, all at once
 * @returns {Promise<UnchangedFinding[]>}
 */
const noteUnchanged = async (review, unchanged, done) => {
  const { journal, step } = review
  const since = step.visit - 1
  for (const { lens, finding } of unchanged) {
    if (done.length === 0) await journal.append('review.noted', { step: step.node.id, visit: step.visit, lens, finding: finding.id, since })
  }
  return unchanged.map(({ lens, finding }) => ({ lens, finding: finding.id, since }))
}
