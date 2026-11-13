import { CONFIG_FILE, withPublishSetting } from '../../domain/config/skraft-config.mjs'
import { APPLY, BLOCKED, REVIEW_CEILING, acceptable, reviewCeilingText, STOP, blockText, decideUsage, edgeAnswerOf, environmentText, mutationPlanText, questionKey, questionOf, ratificationText, readAnswer, scenarioReviewText } from '../../domain/decisions/questions.mjs'
import { deriveRun } from '../../domain/journal/run-state.mjs'
import { namedFeatures } from '../../domain/pipeline/gherkin-records.mjs'
import { scenarioNodes } from '../../domain/workflow/workflow.mjs'
import { trackingFolder } from '../../domain/pipeline/roles.mjs'
import { causeFields } from '../../domain/pipeline/next-step.mjs'
import { issueOf } from '../../domain/pipeline/commits.mjs'
import { dayOf } from '../../domain/pipeline/outputs.mjs'
import { isFrontend, NO_FRONT_END } from '../../domain/reporting/visuals.mjs'
import { proposedAdrs, ratify } from '../decisions/adr-ratification.mjs'
import { loadConfig } from '../config/bases.mjs'
import { forgeMissing } from '../config/forge.mjs'
import { leave } from './run-routes.mjs'
import { verdictPath } from '../review/review-runs.mjs'
import { MACHINE } from '../../domain/pipeline/incidents.mjs'
import { refusedCommit } from './refused-commits.mjs'
import { RUN_REPORT_FILE, runReport } from '../../domain/reporting/run-report.mjs'
import { REPEATED_FAILURES } from '../../domain/pipeline/failure-signature.mjs'
import { mayAnswerQuestion } from '../../domain/decisions/questions.mjs'
import { mayJudgeIncident, recoveryOptions, unforeseenStop, unforeseenText } from '../../domain/decisions/unforeseen.mjs'
import { recordJudgment } from '../decisions/decide-usecase.mjs'
import { knownRecovery } from '../../domain/decisions/known-recoveries.mjs'

/**
 * The questions a run puts to a human: an ask node's, and the one the engine asks when the
 * machine cannot run a step. Asked once and journaled; no answer, the run waits (fail closed);
 * an answer is journaled, then acted on.
 *
 * @typedef {import('./active-run.mjs').RunOutcome} RunOutcome
 * @typedef {import('../../domain/journal/run-state.mjs').RunState} RunState
 * @typedef {import('../../domain/journal/run-state.mjs').AskedQuestion} AskedQuestion
 * @typedef {import('../../domain/journal/run-state.mjs').OpenAttempt} OpenAttempt
 * @typedef {import('../../domain/pipeline/next-step.mjs').WorkStep} WorkStep
 * @typedef {import('../../domain/pipeline/next-step.mjs').BlockedStep} BlockedStep
 * @typedef {import('../../domain/journal/run-state.mjs').RunEvent} RunEvent
 * @typedef {import('../../domain/decisions/questions.mjs').NodeQuestion} NodeQuestion
 * @typedef {{
 *   deps: import('./run-pipeline-usecase.mjs').PipelineDeps, slug: string,
 *   journal: import('../journal/run-journal.mjs').OpenJournal,
 *   config: import('../../domain/config/skraft-config.mjs').SkraftConfig,
 *   loaded: { workflow: import('../../domain/workflow/workflow.mjs').Workflow },
 * }} Context
 * @typedef {{ answer: string, reason: string | null }} Answer
 * @typedef {{ answered: Answer } | { text: string, subjects: string[] } | { environment: string }} Plan
 *   answered: the question needs no human (nothing to ratify);
 *   environment: the machine cannot tell what to ask.
 * @typedef {{ failures: string[] } | { environment: string, incident?: import('../../domain/pipeline/incidents.mjs').Incident, incidents?: import('../../domain/pipeline/incidents.mjs').FailureIncident[] } | { stop: string }} Act
 *   failures: what goes on to the node an answer leads to; stop: why the answer ends the run.
 * @typedef {{ plan: (context: Context) => Promise<Plan>, act: (context: Context, asked: AskedQuestion, run: RunState) => Promise<Act> }} Questionnaire
 */

/** @type {Questionnaire} */
const RATIFICATION = {
  plan: async ({ deps }) => adrPlan(await proposedAdrs(deps)),
  act: async ({ deps, journal, slug }, asked, run) => (asked.answer === 'RATIFIED'
    ? committed({ deps, journal, slug, step: asked.step }, await ratify(deps, { adrs: asked.subjects, day: dayOf(deps.clock.now()), issue: issueOf(run.story) }))
    : { failures: [`${asked.subjects.join(', ')}: ${asked.reason}`] }),
}

/**
 * The mutation plan: the proposals the step before it wrote, asked once; APPLY or the developer's
 * instruction goes on to the node that applies them, STOP ends the run.
 * @type {Questionnaire}
 */
const MUTATION_PLAN = {
  plan: async ({ slug, journal }) => {
    const proposals = proposalsOf(journal.events).map((path) => `${trackingFolder(slug)}/${path}`)
    return { text: mutationPlanText(proposals), subjects: proposals }
  },
  act: async (context, asked) => planChosen(context, asked),
}

/**
 * The outputs the last recorded step wrote on its last visit, each once, relative to the tracking folder.
 * @param {RunEvent[]} events
 */
const proposalsOf = (events) => {
  const last = /** @type {RunEvent} */ (events.findLast((event) => event.type === 'step.recorded'))
  const started = events.filter((event) => event.type === 'step.started' && event.step === last.step && event.visit === last.visit)
  return [...new Set(started.flatMap((event) => event.outputs))]
}

/**
 * What the developer chose: the proposals applied, their own instruction with the proposals it
 * departs from, or the run ended.
 * @param {Context} context @param {AskedQuestion} asked @returns {Act}
 */
const planChosen = ({ deps, slug }, { answer, subjects, step }) => {
  if (answer === STOP) return { stop: `a human stopped the run at ${step}; the proposals are in ${subjects.join(', ')}` }
  const paths = subjects.map((path) => deps.files.location(slug, path.slice(trackingFolder(slug).length + 1))).join(', ')
  return { failures: answer === APPLY ? [`Apply the proposals in ${paths}`] : [/** @type {string} */ (answer), `The proposals it departs from: ${paths}`] }
}

/**
 * The scenario review: the story's scenarios and the red of its walking skeleton, read by a
 * human once before DELIVER builds them; REVISE sends their corrections to DISTILL.
 * @type {Questionnaire}
 */
const SCENARIO_REVIEW = {
  plan: async (context) => scenarioReviewPlan(context, deriveRun(context.journal.events)),
  act: async (_, asked) => ({ failures: asked.answer === 'APPROVED' ? [] : [`A human read the scenarios and the walking skeleton and asks for these corrections: ${asked.reason}`] }),
}

/**
 * The scenarios, the `.feature` files the test plan names and the red of S1, once the node that
 * writes them recorded them; a question the machine cannot ask before.
 * @param {Context} context @param {RunState} run @returns {Promise<Plan>}
 */
const scenarioReviewPlan = async (context, { scenarios, nodes }) => {
  if (scenarios === null) return { environment: 'the run recorded no scenario of the story to show yet; put the scenario review after the node that writes them' }
  const oracle = scenarios.oracles[1]
  const [plan] = nodes[scenarioNodes(context.loaded.workflow)[0]].outputs
  const features = namedFeatures(/** @type {string} */ (await context.deps.files.read(context.slug, plan)))
  return { text: scenarioReviewText({ scenarios: scenarios.list, features, oracle }), subjects: oracle.files }
}

/** @type {Readonly<Record<NodeQuestion, Questionnaire>>} */
const QUESTIONNAIRES = Object.freeze({ 'adr-ratification': RATIFICATION, 'mutation-plan': MUTATION_PLAN, 'scenario-review': SCENARIO_REVIEW })

/** @param {string[] | string} adrs a string: why they cannot be listed @returns {Plan} */
const adrPlan = (adrs) => {
  if (typeof adrs === 'string') return { environment: adrs }
  return adrs.length === 0 ? { answered: { answer: 'RATIFIED', reason: 'no Proposed ADR to ratify' } } : { text: ratificationText(adrs), subjects: adrs }
}

/**
 * The ratification committed goes on; Git refusing its commit asks a human, naming what Git printed.
 * @param {{ deps: import('./run-pipeline-usecase.mjs').PipelineDeps, journal: import('../journal/run-journal.mjs').OpenJournal, slug: string, step: string }} at
 * @param {{ ok: true } | { ok: false, error: string, output: string }} commit
 * @returns {Promise<Act>}
 */
const committed = async ({ deps, journal, slug, step }, commit) => {
  if (commit.ok) return { failures: [] }
  const incident = await refusedCommit({ ...deps, journal }, { slug, step }, commit)
  return { environment: commit.error, incident, incidents: [incident] }
}

/**
 * An ask node: the question asked once, its answer acted on, the run routed by it.
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 * @returns {Promise<RunOutcome | null>}
 */
export const askStep = async (context, run, next) => {
  await openAsk(context, next)
  const asked = Object.values(run.questions).find(({ step, visit, kind }) => step === next.node.id && visit === next.visit && kind === next.node.question)
  if (asked?.answer) return settleAsk(context, run, next, asked)
  if (asked) return answerOrWait(context, asked, next.phase)
  const plan = await QUESTIONNAIRES[/** @type {NodeQuestion} */ (next.node.question)].plan(context)
  if ('environment' in plan) return escalate(context, next, plan.environment)
  if ('answered' in plan) return recordAsk(context, run, next, { ...plan.answered, outcome: 'skipped', failures: [] })
  return answerOrWait(context, await askQuestion(context, nodeQuestion(next), plan), next.phase)
}

/**
 * The key of the next question a node asks: stable across a resume, since the journal keeps
 * every question asked. @param {Context['journal']} journal @param {string} step
 */
const nextKey = (journal, step) => questionKey(step, journal.events.filter((event) => event.type === 'question.asked' && event.step === step).length)

/** @param {Context} context @param {WorkStep} next */
const openAsk = async ({ journal }, next) => {
  const { node, phase, visit, feedback, resumed } = next
  if (resumed) return
  await journal.append('step.started', { step: node.id, phase, question: node.question, visit, attempt: 1, outputs: [], missing: [], feedback, ...causeFields(next), heads: [] })
}

/**
 * Journals a question about a node.
 * @param {Context} context
 * @param {{ kind: import('../../domain/decisions/questions.mjs').QuestionKind, step: string, visit: number }} about
 * @param {{ text: string, subjects: string[] }} plan
 * @returns {Promise<AskedQuestion>}
 */
export const askQuestion = async ({ journal }, { kind, step, visit }, { text, subjects }) => {
  const question = questionOf(kind, nextKey(journal, step), text)
  await journal.append('question.asked', { ...question, step, visit, subjects })
  return { ...question, step, visit, subjects, answer: null, reason: null }
}

/** The question an ask node asks. @param {WorkStep} next */
const nodeQuestion = ({ node, visit }) => ({ kind: /** @type {NodeQuestion} */ (node.question), step: node.id, visit })

/**
 * Asks the human; the run goes on with an answer and waits without one.
 * @param {Context} context @param {AskedQuestion} asked @param {string | null} phase
 * @returns {Promise<RunOutcome | null>}
 */
export const answerOrWait = async (context, asked, phase) => ((await answerNow(context, asked)) === null ? waiting(context, asked, phase) : null)

/**
 * The human's answer, read and journaled; null when there is none, or none the question takes.
 * @param {Context} context @param {AskedQuestion} asked
 * @returns {Promise<Answer | null>}
 */
export const answerNow = async ({ deps, slug, journal }, asked) => {
  const given = await deps.human.ask({ ...questionOf(asked.kind, asked.key, asked.text), options: asked.options })
  if (given === null) return null
  if (asked.kind === 'unforeseen') return liveJudgment({ deps, slug, journal }, asked, given)
  const reading = mayAnswerQuestion(asked.kind, given.by ?? deps.human.by ?? 'host') ? readAnswer(asked, given) : { ok: false, reason: 'this question requires a human answer; host-llm cannot decide it' }
  if (!reading.ok) {
    deps.progress.log(`${slug}: ${asked.key} not answered: ${reading.reason}`)
    return null
  }
  await journal.append('question.answered', { key: asked.key, answer: reading.answer, reason: reading.reason, by: deps.human.by ?? 'host' })
  return reading
}

/** @param {Pick<Context, 'deps' | 'slug' | 'journal'>} context @param {AskedQuestion} asked @param {import('../ports/human-interaction.mjs').HumanAnswer} given @returns {Promise<Answer | null>} */
const liveJudgment = async ({ deps, slug, journal }, asked, given) => {
  const outcome = await recordJudgment(journal, slug, asked, given)
  if (!outcome.ok && outcome.code !== 'invalid-judgment') {
    deps.progress.log(`${slug}: ${asked.key} not answered: ${outcome.reason}`)
    return null
  }
  const recorded = /** @type {RunEvent} */ (journal.events.at(-1))
  return { answer: recorded.answer, reason: recorded.reason }
}

/**
 * The run waits for `skraft decide`: nothing more is journaled.
 * @param {Context} context @param {AskedQuestion} asked @param {string | null} phase
 * @returns {RunOutcome}
 */
export const waiting = ({ slug }, asked, phase) => ({
  status: 'waiting', slug, phase, code: asked.kind,
  reason: `${asked.text} Answer with skraft decide ${asked.key} ${decideUsage(asked)}${asked.refusals.length > 0 ? ' (a refusal with its reason)' : ''}.`,
})

/**
 * Acts on the answer, then routes the run by it.
 * @param {Context} context @param {RunState} run @param {WorkStep} next @param {AskedQuestion} asked
 * @returns {Promise<RunOutcome | null>}
 */
const settleAsk = async (context, run, next, asked) => {
  const done = await QUESTIONNAIRES[/** @type {NodeQuestion} */ (next.node.question)].act(context, asked, run)
  if ('environment' in done) return escalate(context, next, done.environment, done.incident, done.incidents)
  const answered = { answer: /** @type {string} */ (asked.answer), reason: asked.reason, outcome: /** @type {const} */ ('answered') }
  return recordAsk(context, run, next, 'stop' in done ? { ...answered, failures: [], stop: done.stop } : { ...answered, failures: done.failures })
}

/** The code of a run a human's STOP to an ask node ended. */
const STOPPED = 'stopped'

/**
 * Where an answer leads: by the edge of its option, an instruction by the edge of the option
 * that lets the run go on; nowhere when it stops the run.
 * @param {Context} context @param {RunState} run @param {WorkStep['node']} node
 * @param {{ answer: string, failures: string[], stop?: string }} answered
 * @returns {{ next: string | null, code?: string, reason?: string, ceiling?: string | null }}
 */
const routeAnswer = (context, run, node, { answer, failures, stop }) => {
  if (stop !== undefined) return { next: null, code: STOPPED, reason: stop }
  return leave(context, run, node.id, edgeAnswerOf(/** @type {NodeQuestion} */ (node.question), answer), failures)
}

/**
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 * @param {Answer & { outcome: 'answered' | 'skipped', failures: string[], stop?: string }} answered
 * @returns {Promise<null>}
 */
const recordAsk = async (context, run, { node, visit }, { answer, reason, outcome, failures, stop }) => {
  const routed = routeAnswer(context, run, node, { answer, failures, stop })
  await context.journal.append('step.recorded', {
    step: node.id, visit, attempt: 1, outcome, answer, code: routed.code ?? null,
    missing: [], failures, next: routed.next, ceiling: routed.ceiling, reason: routed.reason ?? reason, durationMs: 0,
  })
  context.deps.progress.log(`${context.slug}: ${node.id} ${answer}${reason ? ` (${reason})` : ''}`)
  return null
}

/**
 * The open environment question put to the human: waits without an answer; RETRY reads the
 * configuration again, ABORT is acted on by the next pass.
 * @param {Context} context @param {AskedQuestion} asked @param {string | null} phase
 * @returns {Promise<RunOutcome | null>}
 */
const answerEnvironment = async (context, asked, phase) => {
  const given = await answerNow(context, asked)
  if (given === null) return waiting(context, asked, phase)
  return given.answer === 'RETRY' ? retried(context, phase) : null
}

/**
 * A human answered RETRY in the host's dialog: the configuration they may have fixed is read
 * again before the open step runs again; one they left invalid stops the run before it runs
 * anything, as a run started on it would.
 * @param {Context} context @param {string | null} phase
 * @returns {Promise<RunOutcome | null>}
 */
const retried = async (context, phase) => {
  const config = await loadConfig(context.deps)
  if (!config.ok) return { status: 'blocked', slug: context.slug, phase, code: 'config-invalid', reason: config.reason }
  context.config = config.config
  return null
}

/**
 * The machine cannot run the step: the engine asks a human to fix it and RETRY, or ABORT, with
 * the incident it knows of. The step stays open; the run settles the question before anything else.
 * @param {Context} context @param {Pick<WorkStep, 'node' | 'visit'>} next @param {string} reason
 * @param {import('../../domain/pipeline/incidents.mjs').Incident} [incident]
 * @param {import('../../domain/pipeline/incidents.mjs').FailureIncident[]} [incidents]
 * @returns {Promise<null>}
 */
export const escalate = async (context, { node, visit, attempt = 1 }, reason, incident = MACHINE, incidents = []) => {
  const stop = incidents.find(({ attempts }) => attempts >= REPEATED_FAILURES)
  if (stop !== undefined && incident.owner !== 'unknown') return recordIncidentStop(context, { step: node.id, visit, attempt, reason }, incidents, stop)
  if (incident.owner === 'unknown' && mayJudgeIncident(incidents, context.journal.events)) return askUnforeseen(context, node.id, visit, incident, incidents)
  return askEnvironment(context, node.id, visit, reason, incident, incidents)
}

/** @param {Context} context @param {string} step @param {number} visit @param {string} reason @param {import('../../domain/pipeline/incidents.mjs').Incident} incident @param {import('../../domain/pipeline/incidents.mjs').FailureIncident[]} incidents */
const askEnvironment = async (context, step, visit, reason, incident, incidents) => {
  const { journal } = context
  const question = questionOf('environment', nextKey(journal, step), withReport(context, environmentText(step, reason, incident), step, incidents))
  await journal.append('question.asked', { ...question, step, visit, subjects: [], incident, ...(incidents.length === 0 ? {} : { incidents }) })
  return null
}

/** @param {Context} context @param {string} step @param {number} visit @param {import('../../domain/pipeline/incidents.mjs').Incident} incident @param {import('../../domain/pipeline/incidents.mjs').FailureIncident[]} incidents */
const askUnforeseen = async (context, step, visit, incident, incidents) => {
  const { journal, loaded } = context
  const question = questionOf('unforeseen', nextKey(journal, step), withReport(context, unforeseenText(step, incident.log), step, incidents))
  const options = recoveryOptions(loaded.workflow, step)
  await journal.append('question.asked', { ...question, options, step, visit, subjects: [], incident, incidents })
  const action = knownRecovery(incidents, options)
  if (action !== null) await journal.append('question.answered', { key: question.key, answer: action, reason: null, by: 'known-signature' })
  return null
}

/** @param {Context} context @param {RunState} run @param {AskedQuestion} asked */
export const settleUnforeseen = async (context, run, asked) => {
  const open = /** @type {OpenAttempt} */ (run.nodes[asked.step].open)
  if (asked.answer === null) return answerOrWait(context, asked, open.phase)
  if (asked.answer.startsWith('SEND_TO:')) return sendIncidentBack(context, run, asked, open)
  await context.journal.append('step.recorded', {
    step: asked.step, visit: open.visit, attempt: open.attempt, outcome: 'aborted', ...unforeseenStop(asked),
    missing: [], failures: [], next: null, durationMs: 0,
  })
  return null
}

/** @param {Context} context @param {RunState} run @param {AskedQuestion} asked @param {OpenAttempt} open */
const sendIncidentBack = async (context, run, asked, open) => {
  const failures = [`Unforeseen incident at ${asked.step}; read ${asked.incident?.log ?? 'the run report'}`]
  const routed = leave(context, run, asked.step, 'FAIL', failures)
  if (routed.next !== null && `SEND_TO:${routed.next}` !== asked.answer) return stopChangedRecovery(context, asked, open)
  await context.journal.append('step.recorded', {
    step: asked.step, visit: open.visit, attempt: open.attempt, outcome: 'fail',
    code: routed.code ?? null, reason: routed.reason ?? null, next: routed.next, ceiling: routed.ceiling,
    missing: [], failures, durationMs: 0,
  })
  return null
}

/** @param {Context} context @param {AskedQuestion} asked @param {OpenAttempt} open */
const stopChangedRecovery = async ({ journal }, asked, open) => {
  await journal.append('step.recorded', {
    step: asked.step, visit: open.visit, attempt: open.attempt, outcome: 'aborted', code: 'workflow-changed',
    reason: 'the selected unforeseen recovery edge changed; restore the workflow before continuing',
    missing: [], failures: [], next: null, durationMs: 0,
  })
  return null
}

/** @param {Context} context @param {{ step: string, visit: number, attempt: number, reason: string }} stop @param {import('../../domain/pipeline/incidents.mjs').FailureIncident[]} incidents @param {import('../../domain/pipeline/incidents.mjs').FailureIncident} incident */
const recordIncidentStop = async ({ journal }, { step, visit, attempt, reason }, incidents, incident) => {
  await journal.append('step.recorded', { step, visit, attempt, outcome: 'failed', code: 'repeated-failure', missing: [], failures: [reason], incidents, next: null, reason: `${step} stopped after ${incident.attempts} occurrences of failure signature ${incident.signature}; evidence: ${incident.log ?? 'unavailable'}`, durationMs: 0 })
  return null
}

/**
 * The run's open environment question: asked until answered; ABORT closes the open step
 * with no next node, which blocks the run. The question was asked while its step was open,
 * and nothing closes that step before the question is settled.
 * @param {Context} context @param {RunState} run @param {AskedQuestion} asked
 * @returns {Promise<RunOutcome | null>}
 */
export const settleEnvironment = async (context, run, asked) => {
  const open = /** @type {OpenAttempt} */ (run.nodes[asked.step].open)
  if (asked.answer === null) return answerEnvironment(context, asked, open.phase)
  await context.journal.append('step.recorded', {
    step: asked.step, visit: open.visit, attempt: open.attempt, outcome: 'aborted', code: 'environment',
    missing: [], failures: [], next: null, reason: `aborted by a human: ${asked.text}`, durationMs: 0,
  })
  return null
}

/**
 * The question a block a human can lift puts to them: the one asked already, else asked now;
 * null for a block no instruction lifts.
 * @param {Context} context @param {RunState} run @param {BlockedStep} next
 * @returns {Promise<AskedQuestion | null>}
 */
export const blockQuestion = async (context, run, next) => {
  if (run.question?.kind === BLOCKED || run.question?.kind === REVIEW_CEILING) return run.question
  if (next.reopens === null) return null
  const step = next.reopens
  const ceiling = reviewCeilingOf(context, next, step)
  if (ceiling !== null) {
    const kind = acceptable(ceiling.findings) ? REVIEW_CEILING : BLOCKED
    return askQuestion(context, { kind, step, visit: run.nodes[step].visit }, { text: withReport(context, reviewCeilingText(ceiling), step), subjects: [] })
  }
  return askQuestion(context, { kind: BLOCKED, step, visit: run.nodes[step].visit }, { text: withReport(context, blockText(blockOf(context, next, step)), step), subjects: [] })
}

/**
 * A question on a run that stopped ends with where its report is: the commits and their
 * verdicts, the failures and the incidents so far.
 * @param {Context} context @param {string} text @param {string} step
 */
const withReport = (context, text, step, pendingIncidents = []) => {
  return [text, ...reportContextLines(context, step, pendingIncidents)].join('\n')
}

/** @param {Context} context @param {string} step @param {import('../../domain/pipeline/incidents.mjs').FailureIncident[]} pending */
const reportContextLines = (context, step, pending) => {
  const { events } = context.journal
  const report = runReport(events)
  return [...currentScenarioLines(events, step), ...summaryLines(report, events, step, pending), `The run so far (commits, refusals, incidents): ${context.deps.files.location(context.slug, RUN_REPORT_FILE)}`]
}

/** @param {import('../../domain/reporting/run-report.mjs').RunReport} report @param {RunEvent[]} events @param {string} step @param {import('../../domain/pipeline/incidents.mjs').FailureIncident[]} pending */
const summaryLines = (report, events, step, pending) => [
  `Commits: ${report.commits.map(({ step: name, sha, verdict }) => `${sha} ${name} ${verdict}`).join('; ') || 'none'}.`,
  `Step verdicts: ${report.steps.map(({ step: name, outcome, attempts }) => `${name} ${outcome ?? 'running'} (${attempts} attempts)`).join('; ') || 'none'}.`,
  `Refusals: ${report.refusals.map(({ step: name, owner, times }) => `${name} (${owner}, ${times})`).join('; ') || 'none'}.`,
  ...openFindingsLines(events),
  `Incidents: ${incidentSummary(report.incidents, step, pending) || 'none'}.`,
]

/** @param {import('../../domain/reporting/run-failures.mjs').IncidentRow[]} prior @param {string} step @param {import('../../domain/pipeline/incidents.mjs').FailureIncident[]} pending */
const incidentSummary = (prior, step, pending) => [...prior, ...pending.map((incident) => ({ step, signature: incident.signature, attempts: incident.attempts, log: incident.log }))]
  .map(({ step: name, signature, attempts, log }) => `${name} signature ${signature ?? 'unavailable'}; ${attempts ?? 0} occurrences; log ${log ?? 'unavailable'}`)
  .join('; ')

/** @param {RunEvent[]} events @param {string} step */
const currentScenarioLines = (events, step) => {
  return scenarioLines(scenarioFor(deriveRun(events), step))
}

/** @param {RunState} run @param {string} step */
const scenarioFor = (run, step) => scenarioAt(run.scenarios, groupOf(run, step))

/** @param {RunState} run @param {string} step */
const groupOf = (run, step) => run.nodes[step]?.open?.group ?? run.nodes[step]?.last?.group

/** @param {RunState['scenarios']} scenarios @param {number | null | undefined} index */
const scenarioAt = (scenarios, index) => (index == null ? null : scenarios?.list.find(({ index: number }) => number === index) ?? null)

/** @param {import('../../domain/pipeline/scenarios.mjs').StoryScenario | null} scenario */
const scenarioLines = (scenario) => (scenario === null ? [] : [`Scenario in progress: S${scenario.index} ${scenario.title} (${scenario.component}).`])

/** @param {RunEvent[]} events */
const openFindingsLines = (events) => {
  const latest = events.at(-1)
  if (latest?.type !== 'step.recorded' || !Array.isArray(latest.findings) || latest.findings.length === 0) return ['Open findings: none.']
  return [`Open findings: ${latest.findings.length} after ${latest.visit} review rounds at ${latest.step}.`]
}

/**
 * What a review that reached its ceiling left (#499): its findings with their context and where
 * its verdict is; null for any other block an instruction lifts (an agent's, a lens's, a gate's
 * ceiling), whose step journals no findings, and for a review step journaled without them.
 * @param {Context} context @param {BlockedStep} next @param {string} step the node it loops back to
 * @returns {import('../../domain/decisions/questions.mjs').Ceiling | null}
 */
const reviewCeilingOf = ({ deps, slug }, { last }, step) => {
  const { step: review, visit, findings = [] } = /** @type {RunEvent} */ (last)
  if (findings.length === 0) return null
  return { review, step, passes: visit, findings, verdict: deps.files.location(slug, verdictPath(review, visit)) }
}

/**
 * What the blocked question says of the block: only what the engine checked, and the file that
 * holds the agent's own words. An agent refused the same way twice or on its last attempt is
 * told by that cause, with its missing outputs and refusals.
 * @param {Context} context @param {BlockedStep} next @param {string} step
 * @returns {import('../../domain/decisions/questions.mjs').Block}
 */
const blockOf = (context, { node, last, cause }, step) => {
  const event = /** @type {RunEvent} */ (last)
  const refused = REFUSALS.includes(cause)
  return {
    step, code: refused ? cause : event.code, from: event.step, agent: /** @type {WorkStep['node']} */ (node).agent,
    details: detailsOf(context, event), failures: refused ? refusalLines(context, event) : event.failures, attempt: event.attempt,
  }
}

/** The blocks an agent's refusals cause, asked about by their cause rather than by the code of the last refusal. */
const REFUSALS = Object.freeze(['breaker', 'ceiling'])

/**
 * What an agent's refused attempt left: its missing outputs, where they are, then its refusals.
 * @param {{ deps: { files: import('../ports/tracking-files.mjs').TrackingFiles }, slug: string }} context @param {RunEvent} event
 * @returns {string[]}
 */
export const refusalLines = ({ deps, slug }, event) => [
  ...(event.missing.length > 0 ? [`missing outputs: ${event.missing.map((/** @type {string} */ path) => deps.files.location(slug, path)).join(', ')}`] : []),
  ...event.failures,
]

/**
 * The file that holds what the engine does not repeat of a block, absolute; null when the
 * question says it all.
 * @param {Context} context @param {RunEvent} last
 */
const detailsOf = ({ deps, slug, journal }, last) => {
  const path = DETAILS[last.code]?.(last, journal)
  return path === undefined ? null : deps.files.location(slug, path)
}

/**
 * By the code of the block: the agent's result, the review's verdict.
 * @type {Readonly<Record<string, (last: RunEvent, journal: Context['journal']) => string>>}
 */
const DETAILS = Object.freeze({
  'agent-blocked': (last, journal) => /** @type {RunEvent} */ (journal.events.findLast((event) => event.type === 'step.started' && event.step === last.step)).result,
  'lens-inconclusive': (last) => verdictPath(last.step, last.visit),
})
