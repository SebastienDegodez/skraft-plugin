import { CONFIG_FILE, withPublishSetting } from '../../domain/config/skraft-config.mjs'
import { CONSENT_TEXT, PUBLISH_CONSENT_TEXT, environmentText, questionKey, questionOf, ratificationText, readAnswer } from '../../domain/decisions/questions.mjs'
import { issueOf } from '../../domain/pipeline/commits.mjs'
import { dayOf } from '../../domain/pipeline/outputs.mjs'
import { isFrontend, NO_FRONT_END } from '../../domain/reporting/visuals.mjs'
import { proposedAdrs, ratify } from '../decisions/adr-ratification.mjs'
import { loadConfig } from '../config/bases.mjs'
import { leave } from './run-routes.mjs'

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
 * @typedef {import('../../domain/decisions/questions.mjs').NodeQuestion} NodeQuestion
 * @typedef {{
 *   deps: import('./run-pipeline-usecase.mjs').PipelineDeps, slug: string,
 *   journal: import('../journal/run-journal.mjs').OpenJournal,
 *   config: import('../../domain/config/skraft-config.mjs').SkraftConfig,
 *   loaded: { workflow: import('../../domain/workflow/workflow.mjs').Workflow },
 * }} Context
 * @typedef {{ answer: string, reason: string | null }} Answer
 * @typedef {{ answered: Answer } | { text: string, subjects: string[] } | { environment: string }} Plan
 *   answered: the question needs no human (nothing to ratify, consent already given);
 *   environment: the machine cannot tell what to ask.
 * @typedef {{ failures: string[] } | { environment: string }} Act
 *   failures: what goes back to the node a refusal leads to.
 * @typedef {{ plan: (context: Context) => Promise<Plan>, act: (context: Context, asked: AskedQuestion, run: RunState) => Promise<Act> }} Questionnaire
 */

/** @type {Questionnaire} */
const RATIFICATION = {
  plan: async ({ deps }) => adrPlan(await proposedAdrs(deps)),
  act: async ({ deps }, asked, run) => (asked.answer === 'RATIFIED'
    ? committed(await ratify(deps, { adrs: asked.subjects, day: dayOf(deps.clock.now()), issue: issueOf(run.story) }))
    : { failures: [`${asked.subjects.join(', ')}: ${asked.reason}`] }),
}

/**
 * A consent asked once per repository, kept in skraft-config.json under publish; not asked, and
 * nothing kept, while the configuration has nothing it is about.
 * @param {'visuals' | 'pullRequest'} key
 * @param {(config: import('../../domain/config/skraft-config.mjs').SkraftConfig) => string | null} [moot] why there is nothing to consent to
 * @returns {Questionnaire}
 */
const consent = (key, moot = () => null) => ({
  plan: async ({ config }) => {
    const why = moot(config)
    return why === null ? consentPlan(key, config.publish[key]) : { answered: { answer: 'DECLINED', reason: why } }
  },
  act: async (context, asked) => keepConsent(context, key, asked.answer === 'ACCEPTED'),
})

/** @param {import('../../domain/config/skraft-config.mjs').SkraftConfig} config */
const noFrontEnd = (config) => (config.components.some(isFrontend) ? null : `${NO_FRONT_END}, so no screenshot is taken`)

/** @type {Readonly<Record<NodeQuestion, Questionnaire>>} */
const QUESTIONNAIRES = Object.freeze({ 'adr-ratification': RATIFICATION, 'reporting-consent': consent('visuals', noFrontEnd), 'publish-consent': consent('pullRequest') })

/** @param {string[] | string} adrs a string: why they cannot be listed @returns {Plan} */
const adrPlan = (adrs) => {
  if (typeof adrs === 'string') return { environment: adrs }
  return adrs.length === 0 ? { answered: { answer: 'RATIFIED', reason: 'no Proposed ADR to ratify' } } : { text: ratificationText(adrs), subjects: adrs }
}

/** The question each consent asks. */
const CONSENT_TEXTS = Object.freeze({ visuals: CONSENT_TEXT, pullRequest: PUBLISH_CONSENT_TEXT })

/** @param {'visuals' | 'pullRequest'} key @param {boolean | null} given @returns {Plan} */
const consentPlan = (key, given) => (given === null
  ? { text: CONSENT_TEXTS[key], subjects: [] }
  : { answered: { answer: given ? 'ACCEPTED' : 'DECLINED', reason: `${CONFIG_FILE} sets publish.${key} to ${given}` } })

/** @param {{ ok: true } | { ok: false, error: string }} commit @returns {Act} */
const committed = (commit) => (commit.ok ? { failures: [] } : { environment: commit.error })

/**
 * The answer written into skraft-config.json, and into the configuration the run goes on with.
 * @param {Context} context @param {'visuals' | 'pullRequest'} key @param {boolean} value @returns {Promise<Act>}
 */
const keepConsent = async (context, key, value) => {
  const config = await loadConfig(context.deps)
  if (!config.ok) return { environment: config.reason }
  await context.deps.workspace.write(CONFIG_FILE, withPublishSetting(config.raw, key, value))
  context.config = { ...config.config, publish: { ...config.config.publish, [key]: value } }
  return { failures: [] }
}

/**
 * The screenshots consent, asked by the visuals node itself when a front end is there and nobody
 * answered it yet: asked once, kept like the reporting-consent node keeps it.
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 * @returns {Promise<{ stop: RunOutcome | null } | null>} null: the node goes on; stop: what the run stops with
 */
export const visualsConsent = async (context, run, next) => {
  if (context.config.publish.visuals !== null || !context.config.components.some(isFrontend)) return null
  // The node's first question is its consent: once kept, the configuration answers it on every later visit.
  const open = Object.values(run.questions).find(({ step }) => step === next.node.id)
    ?? (await askQuestion(context, { ...next, node: { ...next.node, question: 'reporting-consent' } }, { text: CONSENT_TEXT, subjects: [] }))
  const answer = open.answer ?? (await answerNow(context, open))?.answer
  if (answer === undefined) return { stop: waiting(context, open, next.phase) }
  return keptAtStep(context, next, await keepConsent(context, 'visuals', answer === 'ACCEPTED'))
}

/** @param {Context} context @param {WorkStep} next @param {Act} done @returns {Promise<{ stop: RunOutcome | null } | null>} */
const keptAtStep = async (context, next, done) => ('environment' in done ? { stop: await escalate(context, next, done.environment) } : null)

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
  const done = await QUESTIONNAIRES[/** @type {NodeQuestion} */ (next.node.question)].act(context, asked, run)
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
