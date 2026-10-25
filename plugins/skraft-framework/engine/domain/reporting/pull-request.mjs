import { durationText, reportTable } from './run-report.mjs'
import { SUMMARY_LENGTH } from './pull-request-prose.mjs'
import { cell, code, inert, oneLine } from './markdown-safety.mjs'
import { screenshotLines } from './visuals.mjs'

/**
 * The description of the pull request a run opens, as "Writing good CL descriptions" lays it
 * out: a summary line, then what and why, then the facts the engine read in the journal, each
 * section saying so when this run recorded nothing for it. Only What changes, Why and Out of
 * scope come from the pr-writer agent.
 *
 * @typedef {import('./pull-request-prose.mjs').Prose} Prose
 * @typedef {import('./run-facts.mjs').RedCommit} RedCommit
 * @typedef {import('./run-facts.mjs').GateFact} GateFact
 * @typedef {import('./run-facts.mjs').ReviewFacts} ReviewFacts
 * @typedef {import('./run-facts.mjs').FindingLine} FindingLine
 * @typedef {{
 *   slug: string, story: { issue?: number | null, title?: string | null } | null, closes: boolean, prose: Prose | null,
 *   adrs: Array<{ path: string, number: number, title: string | null }>, unlocked: Array<{ node: string, reason: string }>,
 *   reds: RedCommit[], gates: GateFact[], review: ReviewFacts, status: string,
 *   report: import('./run-report.mjs').RunReport, models: { families: string[], models: string[] },
 *   visuals: import('./visuals.mjs').Visuals | null, repository: import('./visuals.mjs').Repository,
 * }} PullRequestFacts
 *   closes: the pull request targets the default branch, so its body may close the story's issue.
 *   visuals: what the run's last visuals step recorded, null without one; repository: the one the
 *   remote names on its forge, where the kept screenshots are shown from.
 * @typedef {{ title: string, body: string, description: string }} PullRequest
 *   description: the title, a blank line, then the body.
 */

/** The description of the pull request, kept in the tracking folder. */
export const PULL_REQUEST_FILE = 'pull-request.md'
/** Its body alone, which the pull request is opened or updated with. */
export const PULL_REQUEST_BODY_FILE = 'pull-request-body.md'

/** A body the forge takes: GitHub refuses one past 65,536 characters. */
const BODY_LENGTH = 60_000
/** What ends a section cut to keep the body within BODY_LENGTH. */
const CUT = `[cut: the description holds more than a pull request takes; read it whole in the tracking folder, ${PULL_REQUEST_FILE}]`

/**
 * The description whole, and the body the pull request takes: the same, its longest sections cut
 * with CUT until it holds at most BODY_LENGTH characters.
 * @param {PullRequestFacts} facts @returns {PullRequest}
 */
export const renderPullRequest = (facts) => {
  const title = titleOf(facts)
  const sections = SECTIONS.map(([heading, lines]) => ({ heading, text: lines(facts).join('\n') }))
  return { title, body: bodyOf(facts, fitted(facts, sections)), description: `${title}\n\n${bodyOf(facts, sections)}` }
}

/** @typedef {{ heading: string, text: string }} Section */

/** @param {PullRequestFacts} facts @param {Section[]} sections */
const bodyOf = (facts, sections) => [...issueLine(facts), ...sections.flatMap(({ heading, text }) => [`## ${heading}`, '', text, ''])].join('\n')

/**
 * The sections, the longest cut until the body holds at most BODY_LENGTH characters.
 * @param {PullRequestFacts} facts @param {Section[]} sections @returns {Section[]}
 */
const fitted = (facts, sections) => {
  const excess = bodyOf(facts, sections).length - BODY_LENGTH
  // Stryker disable next-line EqualityOperator: a body of exactly BODY_LENGTH cut by nothing is the same body
  if (excess <= 0) return sections
  // Stryker disable next-line EqualityOperator: of two sections of the same length, either is the longest
  const longest = sections.reduce((best, section, index) => (section.text.length > sections[best].text.length ? index : best), 0)
  return fitted(facts, sections.map((section, index) => (index === longest ? cut(section, excess) : section)))
}

/** The section without as many of its last characters as the excess takes, then a blank line and CUT. @param {Section} section @param {number} excess */
const cut = ({ heading, text }, excess) => ({ heading, text: `${text.slice(0, Math.max(0, text.length - excess - CUT.length - 2))}\n\n${CUT}` })

/** The summary line: the pr-writer's, else the story's title, else the slug, cut to 72 characters. @param {PullRequestFacts} facts */
const titleOf = ({ prose, story, slug }) => {
  const line = prose === null ? story?.title || slug : inert(prose.summary)
  return line.length > SUMMARY_LENGTH ? `${line.slice(0, SUMMARY_LENGTH - 1)}…` : line
}

/** `Closes #N` when the pull request targets the default branch, `Refs #N` otherwise. @param {PullRequestFacts} facts */
const issueLine = ({ story, closes }) => (story?.issue ? [`${closes ? 'Closes' : 'Refs'} #${story.issue}`, ''] : [])

/** @param {string} what */
const notWritten = (what) => [`Not written: the run has no pr-writer step that wrote ${what}.`]

/** @type {ReadonlyArray<[string, (facts: PullRequestFacts) => string[]]>} */
const SECTIONS = Object.freeze([
  ['What changes', ({ prose }) => (prose === null ? notWritten('what changes') : [inert(prose.what)])],
  ['Why', ({ prose }) => (prose === null ? notWritten('why') : [inert(prose.why)])],
  ['Decisions applied', (facts) => decisionLines(facts)],
  ['Tests', () => ['Not recorded yet: this run journals no grid from acceptance criteria to tests.']],
  ['RED evidence', ({ reds }) => redLines(reds)],
  ['Quality gates', ({ gates }) => gateLines(gates)],
  ['Review', ({ review }) => reviewLines(review)],
  ['Screenshots', ({ visuals, repository }) => screenshotLines(visuals, repository)],
  ['Out of scope and limitations', ({ prose }) => (prose === null ? notWritten('what is out of scope') : [inert(prose.limitations)])],
  ['Run summary', ({ status, report }) => [status, '', ...reportTable(report)]],
  ['AI disclosure', ({ models }) => [disclosure(models)]],
])

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
