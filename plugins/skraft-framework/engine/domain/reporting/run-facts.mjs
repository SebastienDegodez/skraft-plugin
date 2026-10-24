import { groupFindings } from '../review/finding-groups.mjs'

/**
 * The facts of a run a pull request description shows, read from its journal alone: the red
 * commits replayed, the last result of each gate, what the review found and what it refuted,
 * the model families and models the agents ran on.
 *
 * @typedef {import('../journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {{ sha: string, subject: string, exitCode: number | null }} RedCommit
 *   exitCode: the test command's at the commit, null when it was not replayed (a test that kills mutants).
 * @typedef {{ component: string, gate: string, command: string | null, status: string, durationMs: number, evidence: string | null, survivors: number | null }} GateFact
 * @typedef {{ step: string, lens: string, id: string, severity: string, location: string, description: string, verdict: string, reason: string | null, dissent: boolean }} FindingFact
 *   verdict: the refuter's, `not checked` for a finding it does not check (low).
 * @typedef {{ cited: string, finding: FindingFact }} FindingLine
 *   cited: `<lens> <id>` of each lens that found it at that line, with that severity.
 * @typedef {{ counted: FindingLine[], refuted: FindingLine[], forHuman: FindingLine[] }} ReviewFacts
 *   forHuman: one lens alone found it, against the lenses that passed (the Dissent Rule), whatever
 *   the refuter said. A finding the refuter confirmed or could not settle keeps the work back, so
 *   on an approved review only the ones it did not check (low) count, and a lone lens's is refuted.
 */

/** The red commits the run accepted, each once, in commit order. @param {RunEvent[]} events @returns {RedCommit[]} */
export const redCommits = (events) => {
  const commits = events.filter((event) => event.type === 'commits.checked').flatMap((event) => event.commits)
  const last = new Map(commits.map((/** @type {any} */ commit) => [commit.sha, commit]))
  return [...last.values()]
    .filter((commit) => commit.kind === 'red' && commit.verdict === 'ok')
    .map((commit) => ({ sha: commit.sha.slice(0, 7), subject: commit.subject, exitCode: commit.replay?.exitCode ?? null }))
}

/** The last result of each gate of each component, in the order they first ran. @param {RunEvent[]} events @returns {GateFact[]} */
export const finalGates = (events) => {
  /** @type {Map<string, GateFact>} */
  const gates = new Map()
  for (const event of events.filter((candidate) => candidate.type === 'gate.ran')) gates.set(`${event.component}/${event.gate}`, gateOf(event))
  return [...gates.values()]
}

/** @param {RunEvent} event @returns {GateFact} */
const gateOf = ({ component, gate, command, status, durationMs, evidence, survivors }) => ({ component, gate, command, status, durationMs, evidence, survivors: survivors ?? null })

/**
 * What the last pass of each review step found: the findings that count, those the refuter
 * refuted, those left for a human; findings of several lenses at one line go together.
 * @param {RunEvent[]} events @returns {ReviewFacts}
 */
export const reviewFacts = (events) => {
  const findings = lastPasses(events).flatMap((pass) => findingsOf(events, pass))
  return {
    counted: linesOf(findings.filter((finding) => finding.verdict !== 'refuted')),
    refuted: linesOf(findings.filter((finding) => !forHuman(finding) && finding.verdict === 'refuted')),
    forHuman: linesOf(findings.filter(forHuman)),
  }
}

/** A finding one lens alone held against the others. @param {FindingFact} finding */
const forHuman = (finding) => finding.dissent

/** The last visit of each review step: `{ step, visit }`, in the order the steps first ran. @param {RunEvent[]} events */
const lastPasses = (events) => {
  /** @type {Map<string, number>} */
  const visits = new Map()
  for (const event of events.filter((candidate) => candidate.type === 'review.lens')) visits.set(event.step, event.visit)
  return [...visits].map(([step, visit]) => ({ step, visit }))
}

/** @param {RunEvent[]} events @param {{ step: string, visit: number }} pass @returns {FindingFact[]} */
const findingsOf = (events, { step, visit }) => {
  const ofPass = (/** @type {string} */ type) => events.filter((event) => event.type === type && event.step === step && event.visit === visit)
  const refutations = ofPass('review.refuted')
  return ofPass('review.lens').flatMap((lens) => lens.findings.map((/** @type {any} */ finding) => findingFact(step, lens.lens, finding, refutations)))
}

/** @param {string} step @param {string} lens @param {any} finding @param {RunEvent[]} refutations */
const findingFact = (step, lens, finding, refutations) => {
  const checked = refutations.findLast((event) => event.lens === lens && event.finding === finding.id)
  const { id, severity, location, description } = finding
  return { step, lens, id, severity, location, description, verdict: checked?.verdict ?? 'not checked', reason: checked?.reason ?? null, dissent: checked?.dissent === true }
}

/** @param {FindingFact[]} findings @returns {FindingLine[]} */
const linesOf = (findings) => groupFindings(findings.map((finding) => ({ lens: finding.lens, finding })))
  .map((members) => ({ cited: members.map(({ lens, finding }) => `${lens} ${finding.id}`).join(', '), finding: members[0].finding }))

/**
 * The model families the agents were assigned and the models their hosts named, each once, sorted.
 * @param {RunEvent[]} events @returns {{ families: string[], models: string[] }}
 */
export const modelsOf = (events) => ({
  families: sortedOnce(events.flatMap(familiesOf)),
  models: sortedOnce(events.filter((event) => ['step.recorded', 'review.lens', 'review.refuted'].includes(event.type)).map((event) => event.model)),
})

/** @param {RunEvent} event @returns {unknown[]} */
const familiesOf = (event) => {
  if (event.type === 'review.lens' || event.type === 'review.refuted') return [event.assignment?.family]
  return event.type === 'step.started' ? [event.assignment?.family] : []
}

/** @param {unknown[]} values @returns {string[]} */
const sortedOnce = (values) => [...new Set(values.filter((value) => typeof value === 'string'))].sort()
