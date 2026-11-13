// What the decision scenarios share: ADR files as an architect writes them, and an architect
// that writes them into the working copy and commits them.
import { agent, green, SLUG, TRACKING } from './pipeline-host.mjs'

export const ADR_1 = 'docs/adr/adr-001-card-payment.md'
export const ADR_2 = 'docs/adr/adr-002-card-tokens.md'
export const INDEX = 'docs/adr/decisions-index.md'

/**
 * An ADR as the architecture-decisions skill lays it out.
 * @param {{ number?: number, title?: string, status?: string, decision?: string | null, header?: string, body?: string }} [adr]
 *   decision: the header's value, as written, null for no field; header: more header lines; body: more text after the status line
 */
export const adrText = ({ number = 1, title = 'Card payment', status = 'Proposed', decision = 'We will pay by card.', header = '', body = '' } = {}) => [
  '<!-- markdownlint-disable-file -->',
  '---',
  `adr: ${number}`,
  `title: ${title}`,
  `status: ${status}`,
  ...(decision === null ? [] : [`decision: ${decision}`]),
  'supersedes: null',
  'ratified_by: null',
  ...(header === '' ? [] : [header]),
  '---',
  '',
  `# ADR-${String(number).padStart(3, '0')} — ${title}`,
  '',
  `**Status:** ${status}`,
  ...(body === '' ? [] : ['', body]),
  '',
].join('\n')

export const indexText = (rows) => [
  '# ADR decision index (append-only digest)',
  '',
  '| ADR | Title | Status | Chosen | Decision (1 line) | Ratified by | Date |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...rows,
  '',
].join('\n')

/**
 * An architect that writes these files into the working copy, then commits them.
 * @param {Record<string, string>} files path → text
 * @param {string} [body] the commit's body: `Refs: #<issue>` for a story with one
 */
export const architect = (files, body = '') => agent({
  work: ({ git, workspace }) => {
    for (const [path, text] of Object.entries(files)) workspace.files.set(path, text)
    const rows = Object.keys(files).map((path) => /^docs\/adr\/adr-(\d+)/.exec(path)?.[1]).filter((digits) => digits !== undefined).map(Number)
    if (rows.length > 0) workspace.files.set(INDEX, withRows(workspace.files.get(INDEX) ?? indexText([]), rows))
    git.commit('docs(checkout): decide the card payment', [...Object.keys(files), ...(rows.length > 0 ? [INDEX] : [])], body)
  },
})

/** An index holding a row for each of these ADR numbers. @param {...number} numbers */
export const indexFor = (...numbers) => withRows(indexText([]), numbers)

/** The index with a row for each ADR number it lacks, as the architect appends them. @param {string} index @param {number[]} numbers */
const withRows = (index, numbers) => numbers.reduce((text, number) => {
  const label = `ADR-${String(number).padStart(3, '0')}`
  return new RegExp(`^\\|\\s*\\[?ADR-0*${number}\\b`, 'm').test(text) ? text : text.replace(/\n*$/, `\n| ${label} | Card payment | Proposed | — | We will pay by card. | — | 2026-10-11 |\n`)
}, index)

/**
 * The agents after DESIGN: the acceptance designer, then the engineer's green of the scenario.
 * @param {ReturnType<typeof import('./pipeline-host.mjs').pipelineHost>} host @param {string} [body] the green's body
 */
export const afterDesign = (host, body = '') => [agent()(host), agent({ work: green(SLUG, 'Checkout', body) })(host)]

/** @param {ReturnType<typeof import('./pipeline-host.mjs').pipelineHost>} host */
export const dispatched = (host) => host.agentRunner.dispatches.map((dispatch) => dispatch.label)

/** @param {ReturnType<typeof import('./pipeline-host.mjs').pipelineHost>} host @param {string} type */
export const eventsOf = (host, type) => host.events().filter((event) => event.type === type)

/**
 * The reason a run gives while it waits for a human to fix the machine.
 * @param {string} step the node that could not run @param {string} reason why @param {number} [count] the rank of the question among those the node asked
 */
export const waitingOnEnvironment = (step, reason, count = 1, incident = {}) =>
  `${environmentQuestion(step, reason, incident)} Answer with skraft decide ${step}-${count} RETRY|ABORT.`

/** What a human reads of each cause the engine does not send back to an agent. */
const CAUSES = Object.freeze({
  environment: 'the machine: a program, a service, a permission or a Git hook it lacks or refuses',
  config: 'skraft-config.json: a command or a path it gives the engine',
  unknown: 'none the engine knows: the command was stopped by a signal or crashed, which no failing check explains',
  judge: 'what the replay judge read in the replay of a commit: nothing an agent can change fixes it',
})

/**
 * The text of the environment question on a step: why it cannot run, its cause, the log of what
 * the failing command printed, what each answer does.
 * @param {string} step @param {string} reason @param {{ owner?: keyof typeof CAUSES, log?: string | null }} [incident]
 */
export const environmentQuestion = (step, reason, { owner = 'environment', log = null } = {}) => [
  `${step} cannot run on this machine: ${reason}.`,
  `Cause: ${CAUSES[owner]}.`,
  ...(log === null ? [] : [`Output: ${log}`]),
  ...(owner === 'config' ? ['Run `skraft doctor` to check the command and runtime.'] : []),
  `Fix it, then RETRY: ${step} runs again where it stopped, using no new attempt; or ABORT: the run ends.`,
  REPORT_LINE,
].join('\n')

/** The line a question on a stopped run ends with: where its report is. */
export const REPORT_LINE = `The run so far (commits, refusals, incidents): ${TRACKING}/run-report.md`

/** The text of a question on a stopped run, its report named last. @param {string} text */
export const withReport = (text) => `${text}\n${REPORT_LINE}`

/** Removes the diagnostic block from an exact-message assertion; dedicated tests assert its contents. */
export const withoutReportSummary = (value) => {
  if (typeof value === 'string') return value.replace(/\n(?:Scenario in progress: [^\n]+\n)?Commits: [^\n]*\nStep verdicts: [^\n]*\nRefusals: [^\n]*\nOpen findings: [^\n]*\nIncidents: [^\n]*(?=\nThe run so far)/, '')
  if (Array.isArray(value)) return value.map(withoutReportSummary)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withoutReportSummary(item)]))
  return value
}

/** Why an ADR folder the machine cannot list stops a run: fixed, never the text of what refused it. */
export const UNLISTABLE_ADRS = 'docs/adr cannot be listed: Git or the file system refused to read it'
