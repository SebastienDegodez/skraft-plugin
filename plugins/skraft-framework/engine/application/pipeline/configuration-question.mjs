import { LOCAL_CONFIG_FILE, withConfirmedConfiguration } from '../../domain/config/skraft-config.mjs'
import { CONFIGURATION, CONFIGURATION_TEXT, START } from '../../domain/decisions/questions.mjs'
import { loadConfig } from '../config/bases.mjs'
import { ignoreLocalConfig } from '../config/local-config.mjs'
import { answerNow, askQuestion, waiting } from './run-questions.mjs'

/**
 * The question a run puts before anything starts when its driver asks to confirm the
 * configuration: `once`, while nobody confirmed the configuration of this working copy; `always`,
 * at each start. START is kept in skraft-config.local.json and the run goes on with the
 * configuration as it is then; STOP starts nothing, and the next start asks again.
 *
 * @typedef {import('./run-pipeline-usecase.mjs').Context} Context
 * @typedef {import('./active-run.mjs').RunOutcome} RunOutcome
 * @typedef {import('../../domain/journal/run-state.mjs').RunState} RunState
 * @typedef {import('../../domain/journal/run-state.mjs').AskedQuestion} AskedQuestion
 * @typedef {'once' | 'always' | null} Confirm null: the driver asks no confirmation
 */

/** The step the question is asked at, which keys it. */
const STEP = 'configuration'

const STOPPED = 'you chose not to start with this configuration; change it in the Configuration tab of the skraft canvas or in skraft-config.json, then start the pipeline again'

/**
 * @param {Context} context @param {RunState} run @param {Confirm} confirm
 * @returns {Promise<RunOutcome | null>} null: the run goes on
 */
export const confirmConfiguration = async (context, run, confirm) => {
  const open = run.question?.kind === CONFIGURATION ? run.question : null
  if (open?.answer === START) return started(context)
  const asked = await questionOf(context, open, confirm)
  return asked === null ? null : answered(context, asked)
}

/**
 * The question nobody answered yet, asked again; else a new one when the driver asks for it.
 * @param {Context} context @param {AskedQuestion | null} open @param {Confirm} confirm @returns {Promise<AskedQuestion | null>}
 */
const questionOf = (context, open, confirm) => (open?.answer === null ? Promise.resolve(open) : newQuestion(context, confirm))

/**
 * The configuration put in front of the person, then their answer acted on; the run waits
 * without one.
 * @param {Context} context @param {AskedQuestion} asked @returns {Promise<RunOutcome | null>}
 */
const answered = async (context, asked) => {
  await context.deps.human.show?.(CONFIGURATION)
  const given = await answerNow(context, asked)
  if (given === null) return waiting(context, asked, null)
  return given.answer === START ? started(context) : { status: 'refused', slug: context.slug, phase: null, code: 'configuration-stopped', reason: STOPPED }
}

/** @param {Context} context @param {Confirm} confirm @returns {Promise<AskedQuestion | null>} */
const newQuestion = async (context, confirm) => {
  const asks = confirm === 'always' || (confirm === 'once' && !context.config.configurationConfirmed)
  return asks ? askQuestion(context, { kind: CONFIGURATION, step: STEP, visit: 0 }, { text: CONFIGURATION_TEXT, subjects: [] }) : null
}

/**
 * START kept in skraft-config.local.json, every other key kept, and the configuration read again:
 * the person may have changed it before answering.
 * @param {Context} context @returns {Promise<RunOutcome | null>}
 */
const started = async (context) => {
  const { workspace } = context.deps
  const config = await loadConfig(context.deps)
  if (!config.ok) return { status: 'blocked', slug: context.slug, phase: null, code: 'config-invalid', reason: config.reason }
  await workspace.write(LOCAL_CONFIG_FILE, withConfirmedConfiguration(config.local))
  await ignoreLocalConfig(workspace)
  context.config = { ...config.config, configurationConfirmed: true }
  return null
}
