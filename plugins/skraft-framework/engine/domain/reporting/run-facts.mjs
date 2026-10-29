import { groupFindings } from '../review/finding-groups.mjs'

/**
 * The facts of a run a pull request description shows, read from its journal alone: the red
 * commits replayed, the last result of each gate, what the review found and what it refuted,
 * the model families and models the agents ran on.
 *
 * @typedef {import('../journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {{ sha: string, subject: string, exitCode: number | null }} RedCommit
 *   exitCode: that of the replay that proved the commit red (its test or e2e command), null when it was not replayed (a test that kills mutants).
 * @typedef {{ component: string, gate: string, command: string, status: string, durationMs: number, evidence: string, survivors?: number | null }} GateFact
 *   survivors: the mutants a mutation gate handed out, null when it passed or could not tell; absent for any other gate.
 * @typedef {{ step: string, lens: string, id: string, severity: string, location: string, description: string, verdict: string | null, reason: string | null, dissent: boolean }} FindingFact
 *   verdict: the refuter's, null for a finding it does not check (low).
 * @typedef {{ cited: string, finding: FindingFact }} FindingLine
 *   cited: `<lens> <id>` of each lens that found it at that line, with that severity.
 * @typedef {{ counted: FindingLine[], refuted: FindingLine[], forHuman: FindingLine[] }} ReviewFacts
 *   forHuman: one lens alone found it, against the lenses that passed (the Dissent Rule), whatever
 *   the refuter said. A finding the refuter confirmed or could not settle keeps the work back, so
 *   on an approved review only the ones it did not check (low) count, and a lone lens's is refuted.
 */

/**
 * The red commits the run accepted, each once, in commit order; a check the machine stopped
 * (`settled: false`) accepted none of its commits.
 * @param {RunEvent[]} events @returns {RedCommit[]}
 */
export const redCommits = (events) => {
  const commits = events.filter((event) => event.type === 'commits.checked' && event.settled !== false).flatMap((event) => event.commits)
  const last = new Map(commits.map((/** @type {any} */ commit) => [commit.sha, commit]))
  return [...last.values()]
    .filter((commit) => commit.kind === 'red' && commit.verdict === 'ok')
    .map((commit) => ({ sha: commit.sha.slice(0, 7), subject: commit.subject, exitCode: commit.replay?.exitCode ?? null }))
}

/**
 * The last result of each gate of each component, in the order they first ran; a component the
 * machine could not gate (`none`, retried since) is no gate.
 * @param {RunEvent[]} events @returns {GateFact[]}
 */
export const finalGates = (events) => {
  /** @type {Map<string, GateFact>} */
  const gates = new Map()
  for (const event of events.filter((candidate) => candidate.type === 'gate.ran' && candidate.gate !== 'none')) gates.set(`${event.component}/${event.gate}`, gateOf(event))
  return [...gates.values()]
}

/** @param {RunEvent} event @returns {GateFact} */
const gateOf = ({ component, gate, command, status, durationMs, evidence, survivors }) => ({ component, gate, command, status, durationMs, evidence, survivors })

/**
 * What the last pass of each review step found: the findings that count, those the refuter
 * refuted, those left for a human; findings of several lenses at one line go together.
 * @param {RunEvent[]} events @returns {ReviewFacts}
 */
export const reviewFacts = (events) => {
  const lenses = events.filter((event) => event.type === 'review.lens')
  const last = lenses.filter((lens) => !lenses.some((other) => other.step === lens.step && other.visit > lens.visit))
  const findings = last.flatMap((lens) => findingsOf(events, lens))
  return {
    counted: linesOf(findings.filter((finding) => finding.verdict !== 'refuted')),
    refuted: linesOf(findings.filter((finding) => !forHuman(finding) && finding.verdict === 'refuted')),
    forHuman: linesOf(findings.filter(forHuman)),
  }
}

/** A finding one lens alone held against the others. @param {FindingFact} finding */
const forHuman = (finding) => finding.dissent

/**
 * The findings of one lens on the last pass of its review step, each with what the refuter said.
 * @param {RunEvent[]} events @param {RunEvent} lens a review.lens event @returns {FindingFact[]}
 */
const findingsOf = (events, { step, visit, lens, findings }) => {
  // Stryker disable next-line ConditionalExpression: only a review.refuted carries a finding id, which the lookup matches
  const refutations = events.filter((event) => event.type === 'review.refuted' && event.step === step && event.visit === visit)
  return findings.map((/** @type {any} */ finding) => findingFact(step, lens, finding, refutations))
}

/** @param {string} step @param {string} lens @param {any} finding @param {RunEvent[]} refutations */
const findingFact = (step, lens, finding, refutations) => {
  const checked = refutations.findLast((event) => event.lens === lens && event.finding === finding.id)
  const { id, severity, location, description } = finding
  return { step, lens, id, severity, location, description, verdict: checked?.verdict ?? null, reason: checked?.reason ?? null, dissent: checked?.dissent === true }
}

/** @param {FindingFact[]} findings @returns {FindingLine[]} */
const linesOf = (findings) => groupFindings(findings.map((finding) => ({ lens: finding.lens, finding })))
  .map((members) => ({ cited: members.map(({ lens, finding }) => `${lens} ${finding.id}`).join(', '), finding: members[0].finding }))

/**
 * The model families the agents were assigned and the models their hosts named, each once, sorted:
 * an agent's step.started, a lens and a check carry the assignment; what ran carries the model.
 * @param {RunEvent[]} events @returns {{ families: string[], models: string[] }}
 */
export const modelsOf = (events) => ({
  families: sortedOnce(events.map((event) => event.assignment?.family)),
  models: sortedOnce(events.map((event) => event.model)),
})

/** @param {unknown[]} values @returns {string[]} */
const sortedOnce = (values) => [...new Set(values.filter((value) => typeof value === 'string'))].sort()
