import { durationText, reportTable } from './run-report.mjs'
import { SUMMARY_LENGTH } from './pull-request-prose.mjs'
import { cell, code, embedded, inert, oneLine, openFence } from './markdown-safety.mjs'
import { screenshotLines } from './visuals.mjs'
import { detailParts, pointerOf, roomOf } from './run-details.mjs'

/**
 * The description of the pull request a run opens, as "Writing good CL descriptions" lays it
 * out: a summary line, then what and why, then the facts the engine read in the journal, each
 * section saying so when this run recorded nothing for it. Only What changes, Why and Out of
 * scope come from the pr-writer agent. What a reviewer decides on shows under a heading; the
 * details fold in a block that opens on a click, its summary the heading and what it counts.
 *
 * @typedef {import('./pull-request-prose.mjs').Prose} Prose
 * @typedef {import('./run-facts.mjs').RedCommit} RedCommit
 * @typedef {import('./run-facts.mjs').GateFact} GateFact
 * @typedef {import('./run-facts.mjs').ReviewFacts} ReviewFacts
 * @typedef {import('./run-facts.mjs').FindingLine} FindingLine
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
 *   comments of the run details are titled in; testPlans: the test plans DISTILL wrote, matrices: the
 *   consistency matrices DESIGN wrote, those of the latest attempt that wrote any, none when the journal
 *   names none or the tracking folder lost them.
 * @typedef {{ path: string, text: string }} TrackedDocument
 *   path: relative to the tracking folder; text: as the agent wrote it.
 * @typedef {{ title: string, body: string, description: string, details: string[] }} PullRequest
 *   description: the title, a blank line, then the whole body; details: the comments that keep
 *   the folded sections when the whole body is past bodyLimit, none otherwise.
 */

/** The description of the pull request, kept in the tracking folder. */
export const PULL_REQUEST_FILE = 'pull-request.md'
/** Its body alone, which the pull request is opened or updated with. */
export const PULL_REQUEST_BODY_FILE = 'pull-request-body.md'

/** What ends a section cut to keep the body within the forge's limit. */
const CUT = `[cut: the description holds more than a pull request takes; read it whole in the tracking folder, ${PULL_REQUEST_FILE}]`

/**
 * The description whole, and the body the pull request takes: the same while it holds at most the
 * forge's bodyLimit characters. Past it, the body keeps what decides (the sections shown under a
 * heading, those open on a gate that failed or a finding for a human) and a fixed line that sends
 * to the comments; the folded sections go to `details`, one comment per part. What decides is cut
 * with CUT only when it alone is past the limit.
 * @param {PullRequestFacts} facts @returns {PullRequest}
 */
export const renderPullRequest = (facts) => {
  const title = titleOf(facts)
  const sections = SECTIONS.map((section) => section(facts))
  const { body, details } = split(facts, sections)
  return { title, body, description: `${title}\n\n${bodyOf(facts, sections)}`, details }
}

/** @param {PullRequestFacts} facts @param {Section[]} sections */
const split = (facts, sections) => {
  if (bodyOf(facts, sections).length <= facts.bodyLimit) return { body: bodyOf(facts, sections), details: [] }
  const body = fitted(facts, sections.filter(({ detail }) => !detail), [pointerOf(facts.language)])
  const folded = sections.filter(({ detail }) => detail)
  const room = roomOf(facts, folded.length)
  return { body, details: detailParts(facts, folded.map((section) => blockOf(section, room))) }
}

/** A section as one block of a comment, cut to the room a comment leaves it. @param {Section} section @param {number} room */
const blockOf = (section, room) => {
  const block = linesOf(section).join('\n')
  return block.length <= room ? block : linesOf(cut(section, block.length - room)).join('\n')
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
  const first = sections.reduce((best, section, index) => (cutBefore(section, sections[best]) ? index : best), 0)
  const shorter = sections.map((section, index) => (index === first ? cut(section, excess) : section))
  return bodyOf(facts, shorter, tail).length < body.length ? fitted(facts, shorter, tail) : cutWhole(body, facts.bodyLimit)
}

/** The body's first characters, without a tag or block left open, then a blank line and CUT. @param {string} body @param {number} limit */
const cutWhole = (body, limit) => `${closed(body.slice(0, limit - CUT.length - 2))}\n\n${CUT}`

/** A section that yields is cut before one that does not, else the longer first. @param {Section} section @param {Section} other */
const cutBefore = (section, other) => {
  // Stryker disable next-line EqualityOperator: of two sections of the same length, either is the longest
  if (yields(section) === yields(other)) return section.text.length > other.text.length
  return yields(section)
}

/** A section with text left to give, not open on what blocks the work or waits on a human. @param {Section} section */
const yields = ({ open, text }) => !open && text.length > CUT.length + 2

/** The section without as many of its last characters as the excess takes, then a blank line and CUT. @param {Section} section @param {number} excess */
const cut = ({ head, text, foot, open, detail }, excess) => ({ head, foot, open, detail, text: `${closed(text.slice(0, Math.max(0, text.length - excess - CUT.length - 2)))}\n\n${CUT}` })

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

/** @param {string} what */
const notWritten = (what) => [`Not written: the run has no pr-writer step that wrote ${what}.`]

/** @typedef {(facts: PullRequestFacts) => string[]} Lines */

/** A section under its heading. @param {string} heading @param {Lines} lines @returns {(facts: PullRequestFacts) => Section} */
const shown = (heading, lines) => (facts) => ({ head: `## ${heading}`, text: lines(facts).join('\n'), foot: [], open: false, detail: false })

/**
 * @typedef {{ count: string | null, open: boolean }} Fold
 *   count: what the summary says after the heading, null for nothing; open: the block shows its
 *   section until a click folds it, for what blocks the work or waits on a human.
 */

/** A section that counts nothing and folds. */
const FOLDED = Object.freeze({ count: null, open: false })

/**
 * A section in a block whose summary is its heading, then what it counts when it counts something.
 * @param {string} heading @param {Lines} lines @param {(facts: PullRequestFacts) => Fold} fold
 * @returns {(facts: PullRequestFacts) => Section}
 */
const folded = (heading, lines, fold = () => FOLDED) => (facts) => {
  const { count, open } = fold(facts)
  return { head: `<details${open ? ' open' : ''}><summary>${count === null ? heading : `${heading}: ${count}`}</summary>`, text: lines(facts).join('\n'), foot: ['', '</details>'], open, detail: !open }
}

const SECTIONS = Object.freeze([
  shown('What changes', ({ prose }) => (prose === null ? notWritten('what changes') : [inert(prose.what)])),
  shown('Why', ({ prose }) => (prose === null ? notWritten('why') : [inert(prose.why)])),
  shown('Decisions applied', (facts) => decisionLines(facts)),
  folded('Consistency matrix', ({ matrices }) => documentLines(matrices, NO_MATRIX)),
  folded('Tests', ({ testPlans }) => documentLines(testPlans, NO_TEST_PLAN)),
  folded('RED evidence', ({ reds }) => redLines(reds), ({ reds }) => ({ count: counted(reds.length, 'red commit'), open: false })),
  folded('Quality gates', ({ gates }) => gateLines(gates), ({ gates }) => gateFold(gates)),
  folded('Review', ({ review }) => reviewLines(review), ({ review }) => reviewFold(review)),
  folded('Screenshots', ({ visuals, repository }) => screenshotLines(visuals, repository)),
  shown('Out of scope and limitations', ({ prose }) => (prose === null ? notWritten('what is out of scope') : [inert(prose.limitations)])),
  folded('Run summary', ({ status, report }) => [status, '', ...reportTable(report)]),
  folded('AI disclosure', ({ models }) => [disclosure(models)]),
])

/** What a section of a document says when the run has none, or it is empty. */
const NO_MATRIX = 'None recorded: the tracking folder holds no consistency matrix of this run (DESIGN writes it).'
const NO_TEST_PLAN = 'None recorded: the tracking folder holds no test plan of this run (DISTILL writes it).'

/** Where each document of the tracking folder is, then what it says, made inert; the fixed text when there is none. @param {TrackedDocument[]} documents @param {string} none */
const documentLines = (documents, none) => {
  const shown = documents.map(shownDocument).filter((lines) => lines.length > 0)
  return shown.length === 0 ? [none] : shown.flatMap((lines, n) => (n === 0 ? lines : ['', ...lines]))
}

/** @param {TrackedDocument} document */
const shownDocument = ({ path, text }) => {
  const inertText = embedded(text).trim()
  return inertText === '' ? [] : [`From ${code(path)} in the tracking folder:`, '', inertText]
}

/** @param {number} count @param {string} noun */
const counted = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`

/** The gates that failed and those that passed, nothing when none ran; open while one failed. @param {GateFact[]} gates @returns {Fold} */
const gateFold = (gates) => {
  if (gates.length === 0) return FOLDED
  const failed = gates.filter(({ status }) => status === 'fail').length
  return { count: `${failed > 0 ? `${failed} failed, ` : ''}${gates.length - failed} passed`, open: failed > 0 }
}

/** The findings the Review section shows and those left for a human; open while one is. @param {ReviewFacts} review @returns {Fold} */
const reviewFold = ({ counted: counting, refuted, forHuman }) => {
  const findings = counted(counting.length + refuted.length + forHuman.length, 'finding')
  return { count: forHuman.length > 0 ? `${findings}, ${forHuman.length} for a human` : findings, open: forHuman.length > 0 }
}

/** @param {PullRequestFacts} facts */
const decisionLines = ({ adrs, unlocked }) => {
  const lines = [
    ...adrs.map(({ path, number, title }) => `- ADR-${String(number).padStart(3, '0')}${title ? ` ${title}` : ''} (${code(path)}), ratified in this run`),
    ...unlocked.map(({ node, reason }) => `- Locked gate ${code(node)} skipped, unlocked: ${oneLine(reason)}`),
  ]
  return lines.length > 0 ? lines : ['None recorded: no ADR was ratified and no locked gate was unlocked in this run.']
}

/** @param {RedCommit[]} reds */
const redLines = (reds) => (reds.length === 0
  ? ['None recorded: no red commit was accepted in this run.']
  : [
    '| Commit | Subject | Replay exit code |',
    '| --- | --- | ---: |',
    ...reds.map(({ sha, subject, exitCode }) => `| ${code(sha)} | ${cell(subject)} | ${exitCode ?? 'not replayed'} |`),
    '',
    'Output excerpts of the replays are not recorded yet.',
  ])

/** @param {GateFact[]} gates */
const gateLines = (gates) => (gates.length === 0
  ? ['None recorded: no gate ran in this run.']
  : [
    '| Component | Gate | Command | Result | Time | Evidence |',
    '| --- | --- | --- | --- | ---: | --- |',
    ...gates.map(({ component, gate, command, status, durationMs, evidence }) => `| ${component} | ${gate} | ${cell(code(command))} | ${status} | ${durationText(durationMs)} | ${cell(code(evidence))} |`),
  ])

/** @param {ReviewFacts} review */
const reviewLines = ({ counted, refuted, forHuman }) => {
  if ([counted, refuted, forHuman].every((lines) => lines.length === 0)) return ['Every lens of the last pass of each review passed without a finding.']
  return [
    ...findingBlock('Findings that count', counted, () => ''),
    ...findingBlock('Refuted by the finding refuter', refuted, (line) => ` — refuted: ${told(line.finding.reason)}`),
    ...findingBlock('For the human: found by one lens alone, against the lenses that passed', forHuman, (line) => ` — ${line.finding.verdict}${line.finding.reason ? `: ${told(line.finding.reason)}` : ''}`),
  ]
}

/** @param {string} title @param {FindingLine[]} lines @param {(line: FindingLine) => string} after */
const findingBlock = (title, lines, after) => (lines.length === 0 ? [] : [
  `${title}:`,
  '',
  ...lines.map((line) => `- ${line.finding.step} · ${line.cited} (${line.finding.severity}) ${code(line.finding.location)}: ${told(line.finding.description)}${after(line)}`),
  '',
])

/** @param {{ families: string[], models: string[] }} models */
const disclosure = ({ families, models }) => [
  'This pull request was prepared by skraft with AI agents',
  families.length > 0 ? ` on the model families ${families.join(', ')}` : '',
  models.length > 0 ? ` (models the host named: ${models.join(', ')})` : ' (the host named no model)',
  '. What changes, Why and Out of scope were written by the pr-writer agent; every other section is rendered by the engine from the run\'s journal. A human reviews it before it merges.',
].join('')

/** What a lens or the refuter wrote, inert and on one line. @param {string | null} text */
const told = (text) => inert(oneLine(text ?? ''))
