import { groupFindings } from '../review/finding-groups.mjs'
import { isMatrix } from '../pipeline/design-records.mjs'
import { acceptedFindings } from './accepted-findings.mjs'
import { reviewModels } from './agent-models.mjs'

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
 * @typedef {{ step: string, lens: string, id: string, gate: string, severity: string, location: string, description: string, verdict: string | null, reason: string | null, dissent: boolean, carried: number | null, since: number | null, accepted: boolean }} FindingFact
 *   verdict: the refuter's, null for a finding it does not check (noted); carried: the pass
 *   whose refutation this one repeats, null when the refuter judged it on this pass; since: the
 *   pass since which its line is unchanged when the review noted it, null otherwise; accepted: a
 *   human accepted it as it stands at the review's ceiling.
 * @typedef {'fix' | 'decide' | 'accepted' | 'note' | 'refuted'} ReviewStatus
 *   fix: it counts, whatever its severity (confirmed, or the refuter could not settle it);
 *   decide: one lens alone found it, against the lenses that passed (the Dissent Rule), and the
 *   refuter refuted it: a human decides; accepted: it counted, and a human accepted it as it
 *   stands at the review's ceiling; note: new on a line unchanged since an earlier pass: it never
 *   counts; refuted: the refuter refuted it, on this pass or an earlier one.
 * @typedef {{ status: ReviewStatus, cited: string, finding: FindingFact }} FindingLine
 *   cited: `<lens> <id> <gate>` of each lens that found it at that line, with that severity and status.
 * @typedef {{ step: string, passes: number, lenses: string, refuter: string, lines: FindingLine[] }} StepReview
 *   passes: how many passes the step ran; lenses, refuter: what they ran on (`reviewModels`);
 *   lines: grouped by status, in the order of REVIEW_STATUSES.
 * @typedef {StepReview[]} ReviewFacts
 *   the review steps whose last pass found something, in the order they ran.
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

/** The statuses of a review's findings, in the order a review shows them. */
export const REVIEW_STATUSES = Object.freeze(/** @type {const} */ (['fix', 'decide', 'accepted', 'note', 'refuted']))

/**
 * What the last pass of each review step found, each finding with its status; findings of
 * several lenses at one line with one status go together.
 * @param {RunEvent[]} events @returns {ReviewFacts}
 */
export const reviewFacts = (events) => {
  const lenses = events.filter((event) => event.type === 'review.lens')
  const last = lenses.filter((lens) => !lenses.some((other) => other.step === lens.step && other.visit > lens.visit))
  const steps = [...new Set(last.map(({ step }) => step))]
  const accepted = acceptedFindings(events).map(({ review, lens, id }) => `${review} ${lens} ${id}`)
  return steps.map((step) => ({ step, passes: passesOf(lenses, step), ...reviewModels(events, step), lines: linesOf(last.filter((lens) => lens.step === step).flatMap((lens) => findingsOf(events, lens, accepted))) }))
    .filter(({ lines }) => lines.length > 0)
}

/** How many passes a review step ran: its visits a lens answered on. @param {RunEvent[]} lenses review.lens events @param {string} step */
const passesOf = (lenses, step) => new Set(lenses.filter((lens) => lens.step === step).map(({ visit }) => visit)).size

/** A finding that counts becomes accepted when a human accepted it. @param {FindingFact} finding @returns {ReviewStatus} */
const statusOf = (finding) => {
  const status = countedStatus(finding)
  // Stryker disable next-line ConditionalExpression: a finding a human accepted is one of the last pass that counts, so always one to fix
  return status === 'fix' && finding.accepted ? 'accepted' : status
}

/** @param {FindingFact} finding @returns {ReviewStatus} */
const countedStatus = (finding) => {
  if (finding.since !== null) return 'note'
  if (finding.verdict !== 'refuted') return 'fix'
  return finding.dissent ? 'decide' : 'refuted'
}

/**
 * The findings of one lens on the last pass of its review step, each with what the pass journaled
 * of it: the refuter's word (`review.refuted`) or a note (`review.noted`), never both; only those
 * two events name a finding.
 * @param {RunEvent[]} events @param {RunEvent} lens a review.lens event
 * @param {string[]} accepted `<step> <lens> <id>` of each finding a human accepted at a review's ceiling
 * @returns {FindingFact[]}
 */
const findingsOf = (events, { step, visit, lens, findings }, accepted) => {
  const said = events.filter((event) => event.step === step && event.visit === visit && event.lens === lens)
  return findings.map((/** @type {any} */ finding) => findingFact({ step, lens }, finding, said.findLast((event) => event.finding === finding.id), accepted))
}

/**
 * @param {{ step: string, lens: string }} of @param {any} finding
 * @param {RunEvent | undefined} said what the pass journaled last of that finding @param {string[]} accepted
 * @returns {FindingFact}
 */
const findingFact = ({ step, lens }, { id, gate, severity, location, description }, said, accepted) => ({
  step, lens, id, gate, severity, location, description, ...saidOf(said ?? {}), accepted: accepted.includes(`${step} ${lens} ${id}`),
})

/** @param {Partial<RunEvent>} said */
const saidOf = ({ verdict = null, reason = null, dissent, carried = null, since = null }) => ({ verdict, reason, dissent: dissent === true, carried, since })

/** The findings as lines, grouped by status in the order of REVIEW_STATUSES. @param {FindingFact[]} findings @returns {FindingLine[]} */
const linesOf = (findings) => REVIEW_STATUSES.flatMap((status) => groupFindings(findings.filter((finding) => statusOf(finding) === status).map((finding) => ({ lens: finding.lens, finding })))
  .map((members) => ({ status, cited: members.map(({ lens, finding }) => `${lens} ${finding.id} ${finding.gate}`).join(', '), finding: members[0].finding })))

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

/** A file named `test-plan-…`, wherever in the tracking folder. @param {string} path */
export const isTestPlan = (path) => /** @type {string} */ (path.split('/').at(-1)).startsWith('test-plan-')

/**
 * The paths the latest attempt naming any of the kind names, under `field`; none when no attempt does.
 * @param {RunEvent[]} events @param {'outputs' | 'documents'} field @param {(path: string) => boolean} is @returns {string[]}
 */
const latestNamed = (events, field, is) => events.findLast((event) => event[field]?.some(is))?.[field].filter(is) ?? []

/** The test plans the last attempt naming one among its outputs names. @param {RunEvent[]} events */
export const testPlanPaths = (events) => latestNamed(events, 'outputs', isTestPlan)

/** The consistency matrices the last attempt that wrote one wrote. @param {RunEvent[]} events */
export const matrixPaths = (events) => latestNamed(events, 'documents', isMatrix)
