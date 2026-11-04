import { durationText, reportTable } from './run-report.mjs'
import { SUMMARY_LENGTH } from './pull-request-prose.mjs'
import { cell, code, embedded, inert, oneLine, openFence } from './markdown-safety.mjs'
import { screenshotLines } from './visuals.mjs'
import { detailParts, pointerOf, roomOf } from './run-details.mjs'
import { layerCounts } from './test-plan-layers.mjs'
import { counted, DESCRIPTION_WORDS, PULL_REQUEST_FILE } from './pull-request-words.mjs'
import { asksAction, reviewCount, stepTable } from './review-table.mjs'

/**
 * The description of the pull request a run opens, as "Writing good CL descriptions" lays it
 * out: a summary line, then what and why, then the facts the engine read in the journal, each
 * section saying so when this run recorded nothing for it, every fixed text in the story's
 * language. Only What changes, Why and Out of scope come from the pr-writer agent. What a reviewer decides on shows under a heading; the
 * details fold in a block that opens on a click, its summary the heading and what it counts.
 *
 * @typedef {import('./pull-request-prose.mjs').Prose} Prose
 * @typedef {import('./run-facts.mjs').RedCommit} RedCommit
 * @typedef {import('./run-facts.mjs').GateFact} GateFact
 * @typedef {import('./run-facts.mjs').ReviewFacts} ReviewFacts
 * @typedef {{
 *   slug: string, story: { issue?: number | null, title?: string | null } | null, link: string | null, prose: Prose | null,
 *   adrs: Array<{ path: string, number: number, title: string | null }>, unlocked: Array<{ node: string, reason: string }>,
 *   reds: RedCommit[], gates: GateFact[], review: ReviewFacts, status: string,
 *   report: import('./run-report.mjs').RunReport, models: { families: string[], models: string[] },
 *   visuals: import('./visuals.mjs').Visuals | null, repository: import('./visuals.mjs').Repository,
 *   bodyLimit: number, commentLimit: number, language: import('./language.mjs').Language,
 *   testPlans: TrackedDocument[], matrices: TrackedDocument[],
 * }} PullRequestFacts
 *   link: the line that links the pull request to its story, as its forge writes it; null for none.
 *   visuals: what the run's last visuals step recorded, null without one; repository: the one the
 *   remote names on its forge, where the kept screenshots are shown from; bodyLimit: the
 *   longest body its forge takes, commentLimit: the longest comment; language: the story's, which the
 *   description and the comments of the run details are written in; testPlans: the test plans DISTILL wrote, matrices: the
 *   consistency matrices DESIGN wrote, those of the latest attempt that wrote any, none when the journal
 *   names none or the tracking folder lost them.
 * @typedef {{ path: string, text: string }} TrackedDocument
 *   path: relative to the tracking folder; text: as the agent wrote it.
 * @typedef {{ title: string, body: string, description: string, details: string[] }} PullRequest
 *   description: the title, a blank line, then the whole body; details: the comments that keep
 *   the folded sections when the whole body is past bodyLimit, none otherwise.
 */

export { PULL_REQUEST_FILE }
/** Its body alone, which the pull request is opened or updated with. */
export const PULL_REQUEST_BODY_FILE = 'pull-request-body.md'

/** The words of the description, in the story's language. @param {{ language: import('./language.mjs').Language }} facts */
const wordsOf = ({ language }) => DESCRIPTION_WORDS[language]

/**
 * The description whole, and the body the pull request takes: the same while it holds at most the
 * forge's bodyLimit characters. Past it, the body keeps what decides (the sections shown under a
 * heading, those open on a gate that failed or a finding to fix or to decide) and a fixed line that sends
 * to the comments; the folded sections go to `details`, one comment per part. What decides is cut
 * with the fixed mark only when it alone is past the limit.
 * @param {PullRequestFacts} facts @returns {PullRequest}
 */
export const renderPullRequest = (facts) => {
  const title = titleOf(facts)
  const counts = layerCounts(facts.testPlans)
  const sections = SECTIONS.flatMap((section) => section(facts, counts) ?? [])
  const { body, details } = split(facts, sections)
  return { title, body, description: `${title}\n\n${bodyOf(facts, sections)}`, details }
}

/** @param {PullRequestFacts} facts @param {Section[]} sections */
const split = (facts, sections) => {
  if (bodyOf(facts, sections).length <= facts.bodyLimit) return { body: bodyOf(facts, sections), details: [] }
  const body = fitted(facts, sections.filter(({ detail }) => !detail), [pointerOf(facts.language)])
  const folded = sections.filter(({ detail }) => detail)
  const room = roomOf(facts, folded.length)
  return { body, details: detailParts(facts, folded.map((section) => blockOf(section, room, wordsOf(facts).cut))) }
}

/** A section as one block of a comment, cut to the room a comment leaves it. @param {Section} section @param {number} room @param {string} mark */
const blockOf = (section, room, mark) => {
  const block = linesOf(section).join('\n')
  return block.length <= room ? block : linesOf(cut(section, block.length - room, mark)).join('\n')
}

/**
 * @typedef {{ head: string, text: string, foot: string[], open: boolean, detail: boolean }} Section
 *   head: the line that opens it, a heading or the summary of the block that folds it; foot: the
 *   lines that close that block, none under a heading; open: a block open on what blocks the
 *   work or waits on a human; detail: a folded block not open, which goes to the run details
 *   comments when the body is past the forge's limit.
 */

/** @param {Section} section */
const linesOf = ({ head, text, foot }) => [head, '', text, ...foot, '']

/** @param {PullRequestFacts} facts @param {Section[]} sections @param {string[]} [tail] the lines that end the body, each its own paragraph */
const bodyOf = (facts, sections, tail = []) => [...issueLine(facts), ...sections.flatMap(linesOf), ...tail.flatMap((line) => [line, ''])].join('\n')

/**
 * The body, its sections cut one at a time until it holds at most bodyLimit characters: the
 * longest that yields first, an open one only once none yields. Once a cut gives nothing more,
 * the forge takes less than the headings and marks alone: the body is cut whole.
 * @param {PullRequestFacts} facts @param {Section[]} sections @param {string[]} tail @returns {string}
 */
const fitted = (facts, sections, tail) => {
  const body = bodyOf(facts, sections, tail)
  const excess = body.length - facts.bodyLimit
  // Stryker disable next-line EqualityOperator: a body of exactly bodyLimit cut by nothing is the same body
  if (excess <= 0) return body
  const { cut: mark } = wordsOf(facts)
  const first = sections.reduce((best, section, index) => (cutBefore(section, sections[best], mark) ? index : best), 0)
  const shorter = sections.map((section, index) => (index === first ? cut(section, excess, mark) : section))
  return bodyOf(facts, shorter, tail).length < body.length ? fitted(facts, shorter, tail) : cutWhole(body, facts.bodyLimit, mark)
}

/** The body's first characters, without a tag or block left open, then a blank line and the mark. @param {string} body @param {number} limit @param {string} mark */
const cutWhole = (body, limit, mark) => `${closed(body.slice(0, limit - mark.length - 2))}\n\n${mark}`

/** A section that yields is cut before one that does not, else the longer first. @param {Section} section @param {Section} other @param {string} mark */
const cutBefore = (section, other, mark) => {
  // Stryker disable next-line EqualityOperator: of two sections of the same length, either is the longest
  if (yields(section, mark) === yields(other, mark)) return section.text.length > other.text.length
  return yields(section, mark)
}

/** A section with text left to give, not open on what blocks the work or waits on a human. @param {Section} section @param {string} mark */
const yields = ({ open, text }, mark) => !open && text.length > mark.length + 2

/** The section without as many of its last characters as the excess takes, then a blank line and the mark. @param {Section} section @param {number} excess @param {string} mark */
const cut = ({ head, text, foot, open, detail }, excess, mark) => ({ head, foot, open, detail, text: `${closed(text.slice(0, Math.max(0, text.length - excess - mark.length - 2)))}\n\n${mark}` })

/** A text cut inside a tag, inside a block it folds (the dark screenshots) or inside a code block, without that tag or block, nor the blanks it ends on. @param {string} text */
const closed = (text) => {
  const open = text.lastIndexOf('<details')
  const end = open > text.lastIndexOf('</details>') ? open : tagCutAt(text)
  return text.slice(0, Math.min(end, openFence(text)?.at ?? end)).trimEnd()
}

/** Where the tag a text ends inside starts, the text's end when it ends inside none. @param {string} text */
const tagCutAt = (text) => /<[a-z]+$/.exec(text)?.index ?? text.length

/** The summary line: the pr-writer's, else the story's title, else the slug, cut to 72 characters. @param {PullRequestFacts} facts */
const titleOf = ({ prose, story, slug }) => {
  const line = prose === null ? story?.title || slug : inert(prose.summary)
  return line.length > SUMMARY_LENGTH ? `${line.slice(0, SUMMARY_LENGTH - 1)}…` : line
}

/** The line that links the pull request to its story, as its forge writes it; none without one. @param {PullRequestFacts} facts */
const issueLine = ({ link }) => (link === null ? [] : [link, ''])

/** @typedef {import('./pull-request-words.mjs').Words} Words */

/** What a section of the pr-writer says when no pr-writer wrote it. @param {keyof Words['notWritten']} key @returns {Lines} */
const notWritten = (key) => (facts) => [wordsOf(facts).notWritten[key]]

/** @typedef {(facts: PullRequestFacts) => string[]} Lines */
/** @typedef {keyof Words['headings']} Heading */

/** A section under its heading. @param {Heading} heading @param {Lines} lines @returns {(facts: PullRequestFacts) => Section} */
const shown = (heading, lines) => (facts) => ({ head: `## ${wordsOf(facts).headings[heading]}`, text: lines(facts).join('\n'), foot: [], open: false, detail: false })

/**
 * @typedef {{ count: string | null, open: boolean }} Fold
 *   count: what the summary says after the heading, null for nothing; open: the block shows its
 *   section until a click folds it, for what blocks the work or waits on a human.
 */

/** A section that counts nothing and folds. */
const FOLDED = Object.freeze({ count: null, open: false })

/**
 * A section in a block whose summary is its heading, then what it counts when it counts something.
 * @param {Heading} key @param {Lines} lines @param {(facts: PullRequestFacts) => Fold} fold
 * @returns {(facts: PullRequestFacts) => Section}
 */
const folded = (key, lines, fold = () => FOLDED) => (facts) => {
  const { count, open } = fold(facts)
  const heading = wordsOf(facts).headings[key]
  return { head: `<details${open ? ' open' : ''}><summary>${count === null ? heading : `${heading}: ${count}`}</summary>`, text: lines(facts).join('\n'), foot: ['', '</details>'], open, detail: !open }
}

/** @typedef {import('./test-plan-layers.mjs').LayerCounts} LayerCounts */

/** The test plans plan more Domain tests than acceptance tests. @param {LayerCounts} counts */
const domainHeavy = ({ domain, acceptance }) => domain > acceptance

/** @param {Words} words @param {LayerCounts} counts */
const domainHeavyLine = (words, { domain, acceptance }) => `${words.domainHeavy(counted(words, domain, words.domainRow), counted(words, acceptance, words.acceptanceRow))} ${words.prune}`

/** The suggestion in the clear, under its heading, when the test plans are Domain heavy. @param {PullRequestFacts} facts @param {LayerCounts} counts */
const domainHeavySection = (facts, counts) => (domainHeavy(counts) ? shown('domainHeavy', () => [domainHeavyLine(wordsOf(facts), counts)])(facts) : null)

/** @type {ReadonlyArray<(facts: PullRequestFacts, counts: LayerCounts) => Section | null>} */
const SECTIONS = Object.freeze([
  shown('what', (facts) => (facts.prose === null ? notWritten('what')(facts) : [inert(facts.prose.what)])),
  shown('why', (facts) => (facts.prose === null ? notWritten('why')(facts) : [inert(facts.prose.why)])),
  shown('decisions', (facts) => decisionLines(facts)),
  folded('matrix', (facts) => documentLines(facts.matrices, wordsOf(facts), 'noMatrix')),
  folded('tests', (facts) => documentLines(facts.testPlans, wordsOf(facts), 'noTestPlan')),
  folded('red', (facts) => redLines(facts.reds, wordsOf(facts)), (facts) => ({ count: counted(wordsOf(facts), facts.reds.length, wordsOf(facts).redCommit), open: false })),
  folded('gates', (facts) => gateLines(facts.gates, wordsOf(facts)), (facts) => gateFold(facts.gates, wordsOf(facts))),
  folded('review', (facts) => reviewLines(facts.review, wordsOf(facts)), (facts) => reviewFold(facts.review, wordsOf(facts))),
  folded('screenshots', ({ visuals, repository, language }) => screenshotLines(visuals, repository, language)),
  domainHeavySection,
  shown('limitations', (facts) => (facts.prose === null ? notWritten('limitations')(facts) : [inert(facts.prose.limitations)])),
  (facts, counts) => folded('summary', ({ status, report, language }) => [status, '', ...reportTable(report, language), ...(domainHeavy(counts) ? [] : ['', wordsOf(facts).prune])])(facts),
  folded('disclosure', (facts) => [disclosure(facts.models, wordsOf(facts))]),
])

/** Where each document of the tracking folder is, then what it says, made inert; the fixed text when there is none. @param {TrackedDocument[]} documents @param {Words} words @param {'noMatrix' | 'noTestPlan'} none */
const documentLines = (documents, words, none) => {
  const shown = documents.map((document) => shownDocument(document, words)).filter((lines) => lines.length > 0)
  return shown.length === 0 ? [words[none]] : shown.flatMap((lines, n) => (n === 0 ? lines : ['', ...lines]))
}

/** @param {TrackedDocument} document @param {Words} words */
const shownDocument = ({ path, text }, words) => {
  const inertText = embedded(text).trim()
  return inertText === '' ? [] : [words.from(code(path)), '', inertText]
}

/** The gates that failed and those that passed, nothing when none ran; open while one failed. @param {GateFact[]} gates @param {Words} words @returns {Fold} */
const gateFold = (gates, words) => {
  if (gates.length === 0) return FOLDED
  const failed = gates.filter(({ status }) => status === 'fail').length
  return { count: `${failed > 0 ? `${failed} ${words.failed}, ` : ''}${counted(words, gates.length - failed, words.passed)}`, open: failed > 0 }
}

/** The lines of the review by status, nothing when it holds none; open while one asks for an action. @param {ReviewFacts} review @param {Words} words @returns {Fold} */
const reviewFold = (review, words) => ({ count: reviewCount(review, words), open: asksAction(review) })

/** @param {PullRequestFacts} facts */
const decisionLines = (facts) => {
  const words = wordsOf(facts)
  const lines = [
    ...facts.adrs.map(({ path, number, title }) => `- ADR-${String(number).padStart(3, '0')}${title ? ` ${title}` : ''} (${code(path)}), ${words.ratified}`),
    ...facts.unlocked.map(({ node, reason }) => `- ${words.unlocked(code(node), oneLine(reason))}`),
  ]
  return lines.length > 0 ? lines : [words.noDecision]
}

/** @param {RedCommit[]} reds @param {Words} words */
const redLines = (reds, words) => (reds.length === 0
  ? [words.noRed]
  : [
    words.redHeader,
    '| --- | --- | ---: |',
    ...reds.map(({ sha, subject, exitCode }) => `| ${code(sha)} | ${cell(subject)} | ${exitCode ?? words.notReplayed} |`),
    '',
    words.noExcerpt,
  ])

/** @param {GateFact[]} gates @param {Words} words */
const gateLines = (gates, words) => (gates.length === 0
  ? [words.noGate]
  : [
    words.gateHeader,
    '| --- | --- | --- | --- | ---: | --- |',
    ...gates.map(({ component, gate, command, status, durationMs, evidence }) => `| ${component} | ${gate} | ${cell(code(command))} | ${status} | ${durationText(durationMs)} | ${cell(code(evidence))} |`),
  ])

/** One table per review step under its name. @param {ReviewFacts} review @param {Words} words */
const reviewLines = (review, words) => (review.length === 0
  ? [words.allPassed]
  : review.flatMap(({ step, lines }, index) => [...(index === 0 ? [] : ['']), `**${step}**`, '', ...stepTable(lines, words)]))

/** @param {{ families: string[], models: string[] }} models @param {Words} words */
const disclosure = ({ families, models }, words) => [
  words.preparedBy,
  families.length > 0 ? words.families(families.join(', ')) : '',
  models.length > 0 ? words.models(models.join(', ')) : words.noModel,
  words.writtenBy,
].join('')
