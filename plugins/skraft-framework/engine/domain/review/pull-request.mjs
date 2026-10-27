import { inert } from '../reporting/markdown-safety.mjs'

/**
 * A pull request reviewed alone, by `skraft review --pr <number>`: its folder, the document that
 * tells what it is for, and the one comment the review keeps on it, found again by a marker any
 * reader sees.
 *
 * @typedef {import('./verdict.mjs').ReviewVerdict} ReviewVerdict
 */

/** The folder of a pull request's review under `.copilot-tracking/skraft-reviews/`. @param {number} number */
export const reviewSlug = (number) => `pr-${number}`

/** The pull request's title and body, beside its review, for the lenses that read the story. */
export const PULL_REQUEST_FILE = 'pull-request.md'

/** The review's comment as last rendered, beside its review: what `--publish` posts. */
export const COMMENT_FILE = 'comment.md'

/** The visible line that finds the review's comment again, on any machine. @param {number} number */
export const markerOf = (number) => `<sub>skraft-review pr=${number}</sub>`

/** @param {{ number: number, title: string, body: string }} pullRequest */
export const pullRequestText = ({ number, title, body }) => `# Pull request #${number}: ${title}\n\n${body}\n`

/**
 * The comment: the verdict of the pass, what sends the work back, what does not, and the marker;
 * what a lens wrote made inert.
 * @param {{ number: number, pass: number, verdict: ReviewVerdict }} review
 */
export const renderComment = ({ number, pass, verdict }) => [
  `### skraft review · #${number} — ${verdict.status} (pass ${pass})`, '',
  inert(verdict.summary), '',
  ...listed('To address', verdict.reasons),
  ...listed('Not counted', verdict.details),
  markerOf(number), '',
].join('\n')

/** @param {string} title @param {string[]} lines */
const listed = (title, lines) => (lines.length === 0 ? [] : [`${title}:`, ...lines.map((line) => `- ${inert(line)}`), ''])
