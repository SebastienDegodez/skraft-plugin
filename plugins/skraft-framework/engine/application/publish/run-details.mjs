import { emptiedPart, markerOf } from '../../domain/reporting/run-details.mjs'

/**
 * The run details of a pull request, kept in comments of it when its body would not hold them:
 * each part written to the tracking folder, then posted or rewritten through the forge, unless
 * the last one kept says the same. A part kept before and no longer used is emptied. The first
 * part that fails stops the rest: it is journaled skipped with its fixed reason, and the next
 * publication tries again.
 *
 * @typedef {{ number: number, details: string[], language: import('../../domain/reporting/language.mjs').Language }} Details
 * @typedef {{ ok: true, parts: number, first: string | null } | { ok: false, reason: string }} DetailsOutcome
 * @typedef {{ url: string, bodyHash: string }} KeptPart
 * @typedef {{
 *   files: import('../ports/tracking-files.mjs').TrackingFiles, hasher: import('../ports/hasher.mjs').Hasher,
 *   codeHost: import('../ports/code-host.mjs').CodeHost,
 * }} DetailsDeps
 * @typedef {{ slug: string, journal: import('../journal/run-journal.mjs').OpenJournal }} DetailsRequest
 */

/** @param {DetailsDeps} deps @param {DetailsRequest} request @param {Details} wanted @returns {Promise<DetailsOutcome>} */
export const keepRunDetails = async (deps, request, wanted) => {
  const kept = keptParts(request.journal.events, wanted.number)
  const parts = [...wanted.details, ...unusedParts(request.slug, wanted, kept)]
  for (const [index, body] of parts.entries()) {
    const failed = await keepPart(deps, request, { ...wanted, part: index + 1, body, kept })
    if (failed !== null) return failed
  }
  return { ok: true, parts: wanted.details.length, first: kept.get(1)?.url ?? null }
}

/** The emptied comment of each part kept before above the parts now wanted. @param {string} slug @param {Details} wanted @param {Map<number, KeptPart>} kept */
const unusedParts = (slug, { details, language }, kept) => [...kept.keys()].filter((part) => part > details.length).map((part) => emptiedPart({ slug, language }, part))

/**
 * The parts of the pull request kept so far: the last event of each, by part.
 * @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events @param {number} number @returns {Map<number, KeptPart>}
 */
const keptParts = (events, number) => new Map(events
  .filter((event) => event.type === 'pull-request.details-kept' && event.number === number)
  .map((event) => [event.part, { url: event.url, bodyHash: event.bodyHash }]))

/**
 * One part kept, unless the forge already holds it as it is: null when it is or once kept, the failure otherwise.
 * @param {DetailsDeps} deps @param {DetailsRequest} request @param {Details & { part: number, body: string, kept: Map<number, KeptPart> }} part
 * @returns {Promise<DetailsOutcome | null>}
 */
const keepPart = async (deps, request, part) => {
  const bodyHash = await deps.hasher.sha256(part.body)
  const before = part.kept.get(part.part)
  if (before?.bodyHash === bodyHash) return null
  const made = await deps.codeHost.keepPullRequestComment(await requestOf(deps, request.slug, { ...part, url: before?.url ?? null }))
  const fields = { number: part.number, part: part.part, parts: part.details.length }
  if (!made.ok) return skipped(request, fields, made)
  await request.journal.append('pull-request.details-kept', { ...fields, url: made.url, bodyHash })
  part.kept.set(part.part, { url: made.url, bodyHash })
  return null
}

/** @param {DetailsRequest} request @param {Record<string, number>} fields @param {{ reason: string }} made @returns {Promise<DetailsOutcome>} */
const skipped = async ({ journal }, fields, made) => {
  await journal.append('pull-request.details-skipped', { ...fields, reason: made.reason })
  return { ok: false, reason: made.reason }
}

/**
 * The files of a part in the tracking folder, and the request the forge is handed: the body
 * as Markdown, and, for a forge whose client sends JSON, the thread to post and the comment to rewrite.
 * @param {DetailsDeps} deps @param {string} slug @param {{ number: number, part: number, body: string, url: string | null }} part
 * @returns {Promise<import('../ports/code-host.mjs').PullRequestCommentRequest>}
 */
const requestOf = async ({ files, codeHost }, slug, { number, part, body, url }) => {
  const stem = `pull-request-details-${part}`
  await files.write(slug, `${stem}.md`, body)
  const json = codeHost.takesRequestFile ? await jsonFiles(files, slug, { stem, body }) : { threadFile: '', commentFile: '' }
  return { number, marker: markerOf(slug, part), url, bodyFile: files.location(slug, `${stem}.md`), body, ...json }
}

/** The thread to post, closed so that a branch policy on comment resolution is not blocked, and the comment to rewrite. @param {import('../ports/tracking-files.mjs').TrackingFiles} files @param {string} slug @param {{ stem: string, body: string }} part */
const jsonFiles = async (files, slug, { stem, body }) => {
  await files.write(slug, `${stem}.thread.json`, JSON.stringify({ comments: [{ parentCommentId: 0, content: body, commentType: 1 }], status: 4 }))
  await files.write(slug, `${stem}.comment.json`, JSON.stringify({ content: body }))
  return { threadFile: files.location(slug, `${stem}.thread.json`), commentFile: files.location(slug, `${stem}.comment.json`) }
}
