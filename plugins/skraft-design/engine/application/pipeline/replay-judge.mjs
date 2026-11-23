import { judgeBrief, readVerdict, REPLAY_JUDGE } from '../../domain/pipeline/replay-verdict.mjs'
import { reviewLabel } from '../../domain/review/lens-brief.mjs'
import { modelText, onHost } from '../../domain/reporting/agent-models.mjs'
import { modelOf } from '../config/agent-models.mjs'

/**
 * The replay judge, asked about one red or green commit the engine replayed: up to twice when
 * its answer cannot be read; a human is asked when it cannot answer at all.
 *
 * @typedef {import('../../domain/pipeline/replay-verdict.mjs').Decision} Decision
 * @typedef {import('../../domain/pipeline/replay-verdict.mjs').JudgeRequest} JudgeRequest
 * @typedef {import('../../domain/config/model-assignment.mjs').ResolvedAssignment} ResolvedAssignment
 * @typedef {{
 *   source: import('../ports/agent-catalog.mjs').AgentSource, assignment: ResolvedAssignment,
 *   slug: string, step: string, visit: number, attempt: number,
 * }} JudgeRun
 *   what the judge runs on, and the attempt whose commits it judges.
 * @typedef {{ decision: Decision, answer: string | null, why: string | null, model: string | null, cost?: number, assignment: ResolvedAssignment }} Judgement
 *   answer: the absolute path of the judge's answer, kept as it wrote it; null when it gave none,
 *   why then saying so; cost: what the judge cost, when the host tells.
 * @typedef {{
 *   agentRunner: import('../ports/agent-runner.mjs').AgentRunner,
 *   files: import('../ports/tracking-files.mjs').TrackingFiles,
 *   progress: import('../ports/pipeline-progress.mjs').PipelineProgress,
 * }} JudgeDeps
 */

/** How often the judge is asked before its unreadable answer goes to a human. */
const MAX_ASKS = 2

/**
 * @param {JudgeDeps} deps @param {JudgeRun} judge @param {JudgeRequest} request
 * @returns {Promise<Judgement>}
 */
export const judgeCommit = (deps, judge, request) => {
  deps.progress.log(`${judge.slug}: ${judge.step} judges the ${request.kind} commit ${request.sha.slice(0, 7)} — ${modelText(onHost(judge.assignment, deps.agentRunner.host))}`)
  return askJudge(deps, judge, request, { ask: 1, error: null, cost: undefined })
}

/**
 * @param {JudgeDeps} deps @param {JudgeRun} judge @param {JudgeRequest} request
 * @param {{ ask: number, error: string | null, cost: number | undefined }} asking cost: what the asks before this one cost
 * @returns {Promise<Judgement>}
 */
const askJudge = async (deps, judge, request, asking) => {
  const answer = await deps.agentRunner.run(dispatchOf(judge, request, asking))
  const cost = sumOf(asking.cost, answer.costUsd)
  if (answer.unavailable === true) return unanswered(judge, `the host could not start ${REPLAY_JUDGE}`, cost)
  const read = answer.ok ? readVerdict(answer.text) : { ok: /** @type {const} */ (false), error: 'it ended with no answer' }
  if (read.ok) return judged(deps, { judge, request }, read.decision, { ...answer, costUsd: cost })
  if (asking.ask < MAX_ASKS) return askJudge(deps, judge, request, { ask: asking.ask + 1, error: read.error, cost })
  return unanswered(judge, `${REPLAY_JUDGE} answered ${MAX_ASKS} times with no verdict the engine reads (${read.error})`, cost)
}

/** What the asks cost together; undefined while the host tells none. @param {number | undefined} before @param {number | undefined} cost */
const sumOf = (before, cost) => (cost === undefined ? before : (before ?? 0) + cost)

/**
 * @param {JudgeRun} judge @param {JudgeRequest} request @param {{ ask: number, error: string | null }} asking
 * @returns {import('../ports/agent-runner.mjs').AgentDispatch}
 */
const dispatchOf = (judge, request, { ask, error }) => ({
  agent: REPLAY_JUDGE,
  source: judge.source,
  label: reviewLabel({ slug: judge.slug, step: judge.step, visit: judge.visit, what: `judge ${request.kind} ${request.sha.slice(0, 7)}${request.retried ? ' again' : ''} of attempt ${judge.attempt}`, attempt: ask }),
  prompt: judgeBrief(request, error),
  ...modelOf(judge.assignment),
})

/**
 * The judge's answer kept in the run's logs as it wrote it, with its decision.
 * @param {JudgeDeps} deps @param {{ judge: JudgeRun, request: JudgeRequest }} asked @param {Decision} decision
 * @param {import('../ports/agent-runner.mjs').AgentAnswer} answer
 * @returns {Promise<Judgement>}
 */
const judged = async ({ files }, { judge, request }, decision, answer) => {
  const path = `logs/judge-${request.sha.slice(0, 7)}-${request.kind}.md`
  await files.write(judge.slug, path, answer.text)
  return { decision, answer: files.location(judge.slug, path), why: null, model: answer.model ?? null, cost: answer.costUsd, assignment: judge.assignment }
}

/** @param {JudgeRun} judge @param {string} why @param {number | undefined} cost @returns {Judgement} */
const unanswered = ({ assignment }, why, cost) => ({ decision: 'ask-human', answer: null, why, model: null, cost, assignment })
