// What the decision scenarios share: ADR files as an architect writes them, and an architect
// that writes them into the working copy and commits them.
import { agent, tddCycle } from './pipeline-host.mjs'

export const ADR_1 = 'docs/adr/adr-001-card-payment.md'
export const ADR_2 = 'docs/adr/adr-002-card-tokens.md'
export const INDEX = 'docs/adr/decisions-index.md'

/**
 * An ADR as the architecture-decisions skill lays it out.
 * @param {{ number?: number, title?: string, status?: string, header?: string, body?: string }} [adr]
 *   header: more header lines; body: more text after the status line
 */
export const adrText = ({ number = 1, title = 'Card payment', status = 'Proposed', header = '', body = '' } = {}) => [
  '<!-- markdownlint-disable-file -->',
  '---',
  `adr: ${number}`,
  `title: ${title}`,
  `status: ${status}`,
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
 */
export const architect = (files) => agent({
  work: ({ git, workspace }) => {
    for (const [path, text] of Object.entries(files)) workspace.files.set(path, text)
    git.commit('docs(checkout): decide the card payment', Object.keys(files))
  },
})

/** The agents after DESIGN: the acceptance designer, then the engineer's TDD cycle. */
export const afterDesign = (host) => [agent()(host), agent({ work: tddCycle() })(host)]

/** @param {ReturnType<typeof import('./pipeline-host.mjs').pipelineHost>} host */
export const dispatched = (host) => host.agentRunner.dispatches.map((dispatch) => dispatch.label)

/** @param {ReturnType<typeof import('./pipeline-host.mjs').pipelineHost>} host @param {string} type */
export const eventsOf = (host, type) => host.events().filter((event) => event.type === type)

/**
 * The reason a run gives while it waits for a human to fix the machine.
 * @param {string} step the node that could not run @param {string} reason why @param {number} [count] the environment question's number
 */
export const waitingOnEnvironment = (step, reason, count = 1) =>
  `${step} cannot run on this machine: ${reason}. Fix it, then RETRY; or ABORT the run. Answer with skraft decide environment-${count} RETRY|ABORT.`
