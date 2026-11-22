import { emptiedPart, markerOf } from '../../domain/reporting/run-details.mjs'
import { OPENS } from '../../domain/pipeline/forge-comment.mjs'
import { keptComment } from './forge-writes.mjs'
import { referredIn } from '../../domain/reporting/visuals.mjs'

/**
 * The run details of a pull request, kept in comments of it when its body would not hold them:
 * each part written to the tracking folder, then posted or rewritten through the forge, unless
 * the last one kept says the same. A part kept before and no longer used is emptied. The first
 * part that fails stops the rest: it is journaled skipped with its fixed reason, and the next
 * publication tries again.
 *
 * @typedef {{ number: number, details: string[], language: import('../../domain/reporting/language.mjs').Language, attachments?: Attachment[] }} Details
 *   attachments: the screenshots the forge's client attaches; a part goes with those it refers to.
 * @typedef {{ ok: true, parts: number, first: string | null, unattached: string[] } | { ok: false, reason: string }} DetailsOutcome
 *   unattached: the screenshots a part kept now still refers to as files when read back, by path.
 * @typedef {{ url: string, bodyHash: string, unattached: string[] }} KeptPart
 *   unattached: what its comment did not attach; a part with any is posted again.
 * @typedef {import('../ports/code-host.mjs').Attachment} Attachment
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
  const unattached = /** @type {string[]} */ ([])
  for (const [index, body] of parts.entries()) {
    const failed = await keepPart(deps, request, { ...wanted, part: index + 1, body, kept, unattached })
    if (failed !== null) return failed
  }
  return { ok: true, parts: wanted.details.length, first: kept.get(1)?.url ?? null, unattached }
}

/** The emptied comment of each part kept before above the parts now wanted. @param {string} slug @param {Details} wanted @param {Map<number, KeptPart>} kept */
const unusedParts = (slug, { details, language }, kept) => [...kept.keys()].filter((part) => part > details.length).map((part) => emptiedPart({ slug, language }, part))

/**
 * The parts of the pull request kept so far: the last event of each, by part.
 * @param {import('../../domain/journal/run-state.mjs').RunEvent[]} events @param {number} number @returns {Map<number, KeptPart>}
 */
const keptParts = (events, number) => new Map(events
  .filter((event) => event.type === 'pull-request.details-kept' && event.number === number)
  .map((event) => [event.part, { url: event.url, bodyHash: event.bodyHash, unattached: event.unattached ?? [] }]))

/**
 * @typedef {Details & { part: number, body: string, kept: Map<number, KeptPart>, unattached: string[] }} Part
 *   unattached: what the parts kept so far did not attach, which this one adds to.
 */

/**
 * One part kept, unless the forge already holds it as it is, every screenshot attached: null when
 * it is or once kept, the failure otherwise. A part that attaches screenshots is posted anew, gh
 * attaching only to a comment it writes, and the comment before it is emptied.
 * @param {DetailsDeps} deps @param {DetailsRequest} request @param {Part} part
 * @returns {Promise<DetailsOutcome | null>}
 */
const keepPart = async (deps, request, part) => {
  const bodyHash = await deps.hasher.sha256(part.body)
  const before = part.kept.get(part.part)
  if (isSettled(before, bodyHash)) return null
  const attachments = referredIn(part.attachments ?? [], part.body)
  const made = await verifiedPart(deps, request.journal, await requestOf(deps, request.slug, { ...part, url: rewrittenUrl(before, attachments), attachments }))
  const fields = { number: part.number, part: part.part, parts: part.details.length }
  if (!made.ok) return skipped(request, fields, made)
  await emptied(deps, request, { part, before, attachments })
  return recorded(request, part, { fields, url: made.url, bodyHash, unattached: await unattachedOf(deps, made.url, attachments) })
}

/** The forge holds the part as it is, every screenshot of it attached. @param {KeptPart | undefined} before @param {string} bodyHash */
const isSettled = (before, bodyHash) => before !== undefined && before.bodyHash === bodyHash && before.unattached.length === 0

/** The comment the part rewrites: none for a part that attaches screenshots, which is posted anew. @param {KeptPart | undefined} before @param {Attachment[]} attachments */
const rewrittenUrl = (before, attachments) => (attachments.length > 0 ? null : before?.url ?? null)

/**
 * The part journaled kept, with what it did not attach.
 * @param {DetailsRequest} request @param {Part} part
 * @param {{ fields: Record<string, number>, url: string, bodyHash: string, unattached: string[] }} made
 */
const recorded = async ({ journal }, part, { fields, url, bodyHash, unattached }) => {
  await journal.append('pull-request.details-kept', { ...fields, url, bodyHash, ...(unattached.length === 0 ? {} : { unattached }) })
  part.kept.set(part.part, { url, bodyHash, unattached })
  part.unattached.push(...unattached)
  return null
}

/**
 * The screenshots a comment still refers to as files when read back, by path: those the forge's
 * client did not attach; all of them when it cannot be read.
 * @param {DetailsDeps} deps @param {string} url @param {Attachment[]} attachments @returns {Promise<string[]>}
 */
const unattachedOf = async (deps, url, attachments) => {
  if (attachments.length === 0) return []
  const reading = await deps.codeHost.readComment(url)
  const body = reading.ok ? reading.body : null
  return attachments.filter(({ reference }) => body === null || body.includes(`](${reference})`)).map(({ path }) => path)
}

/**
 * The comment a part was kept in before it was posted anew, emptied; what becomes of it is
 * journaled as any write, and stops nothing. None for a part rewritten in place.
 * @param {DetailsDeps} deps @param {DetailsRequest} request
 * @param {{ part: Part, before: KeptPart | undefined, attachments: Attachment[] }} posted
 */
const emptied = async (deps, request, { part, before, attachments }) => {
  if (attachments.length === 0 || before === undefined) return
  const body = emptiedPart({ slug: request.slug, language: part.language }, part.part)
  await verifiedPart(deps, request.journal, await requestOf(deps, request.slug, { ...part, body, url: before.url, attachments: [], stem: `pull-request-details-${part.part}-before` }))
}

/**
 * The part kept on the pull request, then read back at the URL the forge gave.
 * @param {DetailsDeps} deps @param {DetailsRequest['journal']} journal @param {import('../ports/code-host.mjs').PullRequestCommentRequest} asked
 */
const verifiedPart = (deps, journal, asked) => keptComment(journal, { write: 'pull-request-comment', subject: String(asked.number), marker: asked.marker, markerAt: OPENS }, {
  keep: () => deps.codeHost.keepPullRequestComment(asked),
  read: (url) => deps.codeHost.readComment(url),
})

/** @param {DetailsRequest} request @param {Record<string, number>} fields @param {{ reason: string }} made @returns {Promise<DetailsOutcome>} */
const skipped = async ({ journal }, fields, made) => {
  await journal.append('pull-request.details-skipped', { ...fields, reason: made.reason })
  return { ok: false, reason: made.reason }
}

/**
 * The files of a part in the tracking folder, and the request the forge is handed: the body
 * as Markdown, and, for a forge whose client sends JSON, the thread to post and the comment to rewrite.
 * @param {DetailsDeps} deps @param {string} slug
 * @param {{ number: number, part: number, body: string, url: string | null, attachments: Attachment[], stem?: string }} part
 *   stem: the name of its files, the part's own unless given
 * @returns {Promise<import('../ports/code-host.mjs').PullRequestCommentRequest>}
 */
const requestOf = async ({ files, codeHost }, slug, { number, part, body, url, attachments, stem = `pull-request-details-${part}` }) => {
  await files.write(slug, `${stem}.md`, body)
  const json = codeHost.takesRequestFile ? await jsonFiles(files, slug, { stem, body }) : { threadFile: '', commentFile: '' }
  return { number, marker: markerOf(slug, part), url, bodyFile: files.location(slug, `${stem}.md`), body, attachments, ...json }
}

/** The thread to post, closed so that a branch policy on comment resolution is not blocked, and the comment to rewrite. @param {import('../ports/tracking-files.mjs').TrackingFiles} files @param {string} slug @param {{ stem: string, body: string }} part */
const jsonFiles = async (files, slug, { stem, body }) => {
  await files.write(slug, `${stem}.thread.json`, JSON.stringify({ comments: [{ parentCommentId: 0, content: body, commentType: 1 }], status: 4 }))
  await files.write(slug, `${stem}.comment.json`, JSON.stringify({ content: body }))
  return { threadFile: files.location(slug, `${stem}.thread.json`), commentFile: files.location(slug, `${stem}.comment.json`) }
}
