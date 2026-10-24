import { createRunPipeline } from '../../application/pipeline/run-pipeline-usecase.mjs'
import { HandedOver, createLoopAgentRunner, forgetReplies, pendingDispatches, takeReplies } from './loop-agent-runner.mjs'

/**
 * The agent loop: the fallback driver of a host that can neither start agents for the engine
 * nor hold a dialog (VS Code without the Copilot SDK). `next` runs the active pipeline until it
 * needs agents or a human, and says what to do; the agent that conducts the loop starts the
 * agents, saves their replies, then `record` hands the replies to the run and goes on. The
 * engine decides every step; the instructions are fixed here.
 *
 * @typedef {import('../../application/pipeline/active-run.mjs').RunOutcome} RunOutcome
 * @typedef {import('./loop-agent-runner.mjs').HandedDispatch} HandedDispatch
 * @typedef {Omit<Parameters<typeof createRunPipeline>[0], 'agentRunner' | 'human' | 'progress'>} LoopAdapters
 * @typedef {{ agent: string, model: string | null, prompt: string, brief: string, reply: string }} LoopDispatch
 *   prompt: what the agent is started with; brief, reply: absolute paths.
 * @typedef {{
 *   status: RunOutcome['status'] | 'dispatch', slug: string | null, phase: string | null, code: string | null,
 *   reason: string, dispatches: LoopDispatch[], then: string | null,
 * }} LoopStep
 *   then: the command to run once the step is done, null when the loop ends.
 * @typedef {{ adapters: LoopAdapters, command: string, log: (line: string) => void }} LoopDeps
 *   command: how the conducting agent runs this command line (`node "<path>/skraft.mjs"`);
 *   log: where the run's progress goes.
 */

/** @param {LoopDeps} deps */
export const createAgentLoop = (deps) => Object.freeze({
  /** @returns {Promise<LoopStep>} */
  next: () => next(deps),
  /** @returns {Promise<LoopStep>} */
  record: () => record(deps),
})

/**
 * Runs on afresh, unless agents were handed over and their replies are not recorded yet.
 * @param {LoopDeps} deps @returns {Promise<LoopStep>}
 */
const next = async (deps) => {
  const slug = await deps.adapters.activePipeline.current()
  if (slug === null) return advance(deps, slug, new Map())
  const pending = await pendingDispatches(deps.adapters.files, slug)
  if (pending.length > 0) return notRecorded(deps, slug, pending)
  await forgetReplies(deps.adapters.files, slug)
  return advance(deps, slug, new Map())
}

/** @param {LoopDeps} deps @param {string} slug @param {HandedDispatch[]} pending @returns {LoopStep} */
const notRecorded = (deps, slug, pending) => ({
  ...handedStep(deps, slug, pending),
  status: 'refused', code: 'not-recorded',
  reason: `${pending.length} handed over agents are not recorded yet: start each one, save its reply, then record`,
})

/**
 * Hands the saved replies to the run, which goes on from the step that waited for them.
 * @param {LoopDeps} deps @returns {Promise<LoopStep>}
 */
const record = async (deps) => {
  const slug = await deps.adapters.activePipeline.current()
  const pending = slug === null ? [] : await pendingDispatches(deps.adapters.files, slug)
  if (pending.length === 0) return ended({ status: 'refused', slug, phase: null, code: 'nothing-to-record', reason: 'no agent was handed over; run next' })
  return advance(deps, slug, await takeReplies(deps.adapters.files, /** @type {string} */ (slug), pending))
}

/**
 * The run, from where its journal stands, until it ends, waits for a human, or hands agents over.
 * @param {LoopDeps} deps @param {string | null} slug
 * @param {ReadonlyMap<string, import('../../application/ports/agent-runner.mjs').AgentAnswer>} replies
 * @returns {Promise<LoopStep>}
 */
const advance = async (deps, slug, replies) => {
  const shown = { phase: /** @type {string | null} */ (null) }
  try {
    return afterRun(deps, await runPipeline(deps, { slug, replies, shown }))
  } catch (error) {
    if (!(error instanceof HandedOver)) throw error
    const pending = await pendingDispatches(deps.adapters.files, /** @type {string} */ (slug))
    return { ...handedStep(deps, /** @type {string} */ (slug), pending), phase: shown.phase }
  }
}

/**
 * @param {LoopDeps} deps
 * @param {{ slug: string | null, replies: ReadonlyMap<string, import('../../application/ports/agent-runner.mjs').AgentAnswer>, shown: { phase: string | null } }} run
 */
const runPipeline = ({ adapters, log }, { slug, replies, shown }) => createRunPipeline({
  ...adapters,
  agentRunner: createLoopAgentRunner({ files: adapters.files, slug, replies }),
  human: { ask: async () => null },
  progress: { phase: (phase) => showPhase(shown, phase, log), log },
}).run()

/** @param {{ phase: string | null }} shown @param {string} phase @param {(line: string) => void} log */
const showPhase = (shown, phase, log) => {
  shown.phase = phase
  log(`phase ${phase}`)
}

/**
 * A run that waits for a human goes on with `next` once they answered; any other outcome ends the loop.
 * @param {LoopDeps} deps @param {RunOutcome} outcome @returns {LoopStep}
 */
const afterRun = (deps, outcome) => (outcome.status === 'waiting'
  ? { ...outcome, dispatches: [], then: `${deps.command} next` }
  : ended(outcome))

/** @param {RunOutcome} outcome @returns {LoopStep} */
const ended = (outcome) => ({ ...outcome, dispatches: [], then: null })

/**
 * The agents handed over, as the conducting agent starts them, and the record that follows.
 * @param {LoopDeps} deps @param {string} slug @param {HandedDispatch[]} pending @returns {LoopStep}
 */
const handedStep = ({ adapters, command }, slug, pending) => ({
  status: 'dispatch', slug, phase: null, code: null,
  reason: `start ${pending.length === 1 ? 'this agent' : `these ${pending.length} agents, one after the other`}, save each final reply as it is to its reply file, then record`,
  dispatches: pending.map(({ agent, model, brief, reply }) => loopDispatch(adapters.files.location(slug, brief), { agent, model, reply: adapters.files.location(slug, reply) })),
  then: `${command} record`,
})

/**
 * @param {string} brief the absolute path of the brief
 * @param {{ agent: string, model: string | null, reply: string }} dispatch
 * @returns {LoopDispatch}
 */
const loopDispatch = (brief, { agent, model, reply }) => ({
  agent, model, brief, reply,
  prompt: `Your brief is the file ${brief}. Read it whole and do what it asks. Your last message is the reply it asks for.`,
})
