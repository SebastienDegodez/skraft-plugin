import { CONFIG_FILE, withVisualsConsent } from '../domain/config/skraft-config.mjs'
import { CONSENT_TEXT, environmentText, questionKey, questionOf, ratificationText, readAnswer } from '../domain/decisions/questions.mjs'
import { dayOf } from '../domain/pipeline/outputs.mjs'
import { proposedAdrs, ratify } from './adr-ratification.mjs'
import { loadConfig } from './bases.mjs'
import { leave } from './run-routes.mjs'

/**
 * The questions a run puts to a human: an ask node's, and the one the engine asks when the
 * machine cannot run a step. Asked once and journaled; no answer, the run waits (fail closed);
 * an answer is journaled, then acted on.
 *
 * @typedef {import('./active-run.mjs').RunOutcome} RunOutcome
 * @typedef {import('../domain/journal/run-state.mjs').RunState} RunState
 * @typedef {import('../domain/journal/run-state.mjs').AskedQuestion} AskedQuestion
 * @typedef {import('../domain/pipeline/next-step.mjs').WorkStep} WorkStep
 * @typedef {import('../domain/decisions/questions.mjs').NodeQuestion} NodeQuestion
 * @typedef {{
 *   deps: import('./run-pipeline.mjs').PipelineDeps, slug: string,
 *   journal: import('./run-journal.mjs').OpenJournal,
 *   config: import('../domain/config/skraft-config.mjs').SkraftConfig,
 *   loaded: { workflow: import('../domain/workflow/workflow.mjs').Workflow },
 * }} Context
 * @typedef {{ answer: string, reason: string | null }} Answer
 * @typedef {{ answered: Answer } | { text: string, subjects: string[] } | { environment: string }} Plan
 *   answered: the question needs no human (nothing to ratify, consent already given);
 *   environment: the machine cannot tell what to ask.
 * @typedef {{ failures: string[] } | { environment: string }} Act
 *   failures: what goes back to the node a refusal leads to.
 * @typedef {{ plan: (context: Context) => Promise<Plan>, act: (context: Context, asked: AskedQuestion) => Promise<Act> }} Questionnaire
 */

/** @type {Questionnaire} */
const RATIFICATION = {
  plan: async ({ deps }) => adrPlan(await proposedAdrs(deps)),
  act: async ({ deps }, asked) => (asked.answer === 'RATIFIED'
    ? committed(await ratify(deps, { adrs: asked.subjects, day: dayOf(deps.clock.now()) }))
    : { failures: [`${asked.subjects.join(', ')}: ${asked.reason}`] }),
}

/** @type {Questionnaire} */
const CONSENT = {
  plan: async ({ config }) => consentPlan(config.publish.visuals),
  act: async ({ deps }, asked) => keepConsent(deps, asked.answer === 'ACCEPTED'),
}

/** @type {Readonly<Record<NodeQuestion, Questionnaire>>} */
const QUESTIONNAIRES = Object.freeze({ 'adr-ratification': RATIFICATION, 'reporting-consent': CONSENT })

/** @param {string[] | string} adrs a string: why they cannot be listed @returns {Plan} */
const adrPlan = (adrs) => {
  if (typeof adrs === 'string') return { environment: adrs }
  return adrs.length === 0 ? { answered: { answer: 'RATIFIED', reason: 'no Proposed ADR to ratify' } } : { text: ratificationText(adrs), subjects: adrs }
}

/** @param {boolean | null} visuals @returns {Plan} */
const consentPlan = (visuals) => (visuals === null
  ? { text: CONSENT_TEXT, subjects: [] }
  : { answered: { answer: visuals ? 'ACCEPTED' : 'DECLINED', reason: `${CONFIG_FILE} sets publish.visuals to ${visuals}` } })

/** @param {{ ok: true } | { ok: false, error: string }} commit @returns {Act} */
const committed = (commit) => (commit.ok ? { failures: [] } : { environment: commit.error })

/** @param {Context['deps']} deps @param {boolean} visuals @returns {Promise<Act>} */
const keepConsent = async (deps, visuals) => {
  const config = await loadConfig(deps)
  if (!config.ok) return { environment: config.reason }
  await deps.workspace.write(CONFIG_FILE, withVisualsConsent(config.raw, visuals))
  return { failures: [] }
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
  return answerOrWait(context, await askQuestion(context, next, plan), next.phase)
}

/**
 * The key of the next question a node asks: stable across a resume, since the journal keeps
 * every question asked. @param {Context['journal']} journal @param {string} step
 */
const nextKey = (journal, step) => questionKey(step, journal.events.filter((event) => event.type === 'question.asked' && event.step === step).length)

/** @param {Context} context @param {WorkStep} next */
const openAsk = async ({ journal }, { node, phase, visit, feedback, sentBy, resumed }) => {
  if (resumed) return
  await journal.append('step.started', { step: node.id, phase, question: node.question, visit, attempt: 1, outputs: [], missing: [], feedback, ...(sentBy === null ? {} : { sentBy }), heads: [] })
}

/**
 * Journals the question an ask node asks.
 * @param {Context} context @param {WorkStep} next @param {{ text: string, subjects: string[] }} plan
 * @returns {Promise<AskedQuestion>}
 */
const askQuestion = async ({ journal }, next, { text, subjects }) => {
  const question = questionOf(/** @type {NodeQuestion} */ (next.node.question), nextKey(journal, next.node.id), text)
  await journal.append('question.asked', { ...question, step: next.node.id, visit: next.visit, subjects })
  return { ...question, step: next.node.id, visit: next.visit, subjects, answer: null, reason: null }
}

/**
 * Asks the human; the run goes on with an answer and waits without one.
 * @param {Context} context @param {AskedQuestion} asked @param {string | null} phase
 * @returns {Promise<RunOutcome | null>}
 */
const answerOrWait = async (context, asked, phase) => ((await answerNow(context, asked)) === null ? waiting(context, asked, phase) : null)

/**
 * The human's answer, read and journaled; null when there is none, or none the question takes.
 * @param {Context} context @param {AskedQuestion} asked
 * @returns {Promise<Answer | null>}
 */
const answerNow = async ({ deps, slug, journal }, asked) => {
  const given = await deps.human.ask(questionOf(asked.kind, asked.key, asked.text))
  if (given === null) return null
  const reading = readAnswer(asked, given)
  if (!reading.ok) {
    deps.progress.log(`${slug}: ${asked.key} not answered: ${reading.reason}`)
    return null
  }
  await journal.append('question.answered', { key: asked.key, answer: reading.answer, reason: reading.reason, by: 'host' })
  return reading
}

/**
 * The run waits for `skraft decide`: nothing more is journaled.
 * @param {Context} context @param {AskedQuestion} asked @param {string | null} phase
 * @returns {RunOutcome}
 */
const waiting = ({ slug }, asked, phase) => ({
  status: 'waiting', slug, phase, code: asked.kind,
  reason: `${asked.text} Answer with skraft decide ${asked.key} ${asked.options.join('|')}${asked.refusals.length > 0 ? ' (a refusal with its reason)' : ''}.`,
})

/**
 * Acts on the answer, then routes the run by it.
 * @param {Context} context @param {RunState} run @param {WorkStep} next @param {AskedQuestion} asked
 * @returns {Promise<RunOutcome | null>}
 */
const settleAsk = async (context, run, next, asked) => {
  const done = await QUESTIONNAIRES[/** @type {NodeQuestion} */ (next.node.question)].act(context, asked)
  if ('environment' in done) return escalate(context, next, done.environment)
  return recordAsk(context, run, next, { answer: /** @type {string} */ (asked.answer), reason: asked.reason, outcome: 'answered', failures: done.failures })
}

/**
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 * @param {Answer & { outcome: 'answered' | 'skipped', failures: string[] }} answered
 * @returns {Promise<null>}
 */
const recordAsk = async (context, run, { node, visit }, { answer, reason, outcome, failures }) => {
  const routed = leave(context, run, node.id, answer, failures)
  await context.journal.append('step.recorded', {
    step: node.id, visit, attempt: 1, outcome, answer, code: routed.code ?? null,
    missing: [], failures, next: routed.next, reason: routed.reason ?? reason, durationMs: 0,
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
 * The machine cannot run the step: the engine asks a human to fix it and RETRY, or ABORT. The
 * step stays open; the run settles the question before anything else.
 * @param {Context} context @param {Pick<WorkStep, 'node' | 'visit'>} next @param {string} reason
 * @returns {Promise<null>}
 */
export const escalate = async ({ journal }, { node, visit }, reason) => {
  const question = questionOf('environment', nextKey(journal, node.id), environmentText(node.id, reason))
  await journal.append('question.asked', { ...question, step: node.id, visit, subjects: [] })
  return null
}

/**
 * The run's open environment question: asked until answered; ABORT closes the open step
 * with no next node, which blocks the run.
 * @param {Context} context @param {RunState} run @param {AskedQuestion} asked
 * @returns {Promise<RunOutcome | null>}
 */
export const settleEnvironment = async (context, run, asked) => {
  const open = run.nodes[asked.step].open
  if (asked.answer === null) return answerEnvironment(context, asked, open?.phase ?? null)
  await context.journal.append('step.recorded', {
    step: asked.step, visit: open?.visit ?? asked.visit, attempt: open?.attempt ?? 1, outcome: 'aborted', code: 'environment',
    missing: [], failures: [], next: null, reason: `aborted by a human: ${asked.text}`, durationMs: 0,
  })
  return null
}
