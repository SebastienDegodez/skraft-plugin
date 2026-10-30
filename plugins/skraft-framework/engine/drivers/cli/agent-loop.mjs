import { randomUUID } from 'node:crypto'
import { createRunPipeline } from '../../application/pipeline/run-pipeline-usecase.mjs'
import { createObserve } from '../../application/pipeline/observe-usecase.mjs'
import { STOP, takesInstruction } from '../../domain/decisions/questions.mjs'
import { HandedOver, OWNER_FILE, PENDING_FILE, REPLIES_FILE, createLoopAgentRunner, forgetPending, forgetReplies, markTaken, pendingDispatches, pendingTaken, takeReplies } from './loop-agent-runner.mjs'

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
  if (slug === null) return advance(deps, slug, new Map(), null)
  const pending = await pendingDispatches(deps.adapters.files, slug)
  if (pending === null) return unreadable(deps, slug, PENDING_FILE)
  if (pending.length > 0) return notRecorded(deps, slug, pending)
  await forgetReplies(deps.adapters.files, slug)
  return advance(deps, slug, new Map(), null)
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
  if (pending === null) return unreadable(deps, /** @type {string} */ (slug), PENDING_FILE)
  if (pending.length === 0) return ended({ status: 'refused', slug, phase: null, code: 'nothing-to-record', reason: 'no agent was handed over; run next' })
  const replies = await takeReplies(deps.adapters.files, /** @type {string} */ (slug), pending)
  if (replies === null) return unreadable(deps, /** @type {string} */ (slug), REPLIES_FILE)
  return advance(deps, slug, replies, { pending, taken: await pendingTaken(deps.adapters.files, /** @type {string} */ (slug)) })
}

/**
 * A loop file that is not what skraft wrote stops the loop with a reason, never a stack trace.
 * @param {LoopDeps} deps @param {string} slug @param {string} path @returns {LoopStep}
 */
const unreadable = ({ adapters }, slug, path) => ended({
  status: 'refused', slug, phase: null, code: 'loop-file-unreadable',
  reason: `${adapters.files.location(slug, path)} is not what skraft wrote; remove ${adapters.files.location(slug, PENDING_FILE)}, then run next to hand the agents over again`,
})

/**
 * The run, from where its journal stands, until it ends, waits for a human, or hands agents over.
 * recorded: the agents `record` takes back, and whether a record already took them (it then runs
 * as any session); null for `next`. Taken back with the lease, they are marked taken at once and
 * forgotten when that run ends; lost to another host, they are forgotten too; refused before the
 * lease, they stay pending.
 * @param {LoopDeps} deps @param {string | null} slug
 * @param {ReadonlyMap<string, import('../../application/ports/agent-runner.mjs').AgentAnswer>} replies
 * @param {{ pending: import('./loop-agent-runner.mjs').HandedDispatch[], taken: boolean } | null} recorded
 * @returns {Promise<LoopStep>}
 */
const advance = async (deps, slug, replies, recorded) => {
  const shown = { phase: /** @type {string | null} */ (null) }
  const lease = { held: false }
  try {
    const outcome = await runPipeline(deps, { slug, replies, shown, recorded, lease })
    await settlePending(deps, slug, { recorded, lease, outcome })
    return await afterRun(deps, outcome)
  } catch (error) {
    return handedOverStep(deps, slug, shown, error)
  }
}

/**
 * The step of a run that handed agents over; any other error goes on up.
 * @param {LoopDeps} deps @param {string | null} slug @param {{ phase: string | null }} shown @param {unknown} error
 * @returns {Promise<LoopStep>}
 */
const handedOverStep = async (deps, slug, shown, error) => {
  if (!(error instanceof HandedOver)) throw error
  const pending = await pendingDispatches(deps.adapters.files, /** @type {string} */ (slug))
  return { ...handedStep(deps, /** @type {string} */ (slug), pending), phase: shown.phase }
}

/**
 * The agents a record took back are recorded once its run held the lease, and lost once another
 * host took it; else they stay pending.
 * @param {LoopDeps} deps @param {string | null} slug
 * @param {{ recorded: Parameters<typeof advance>[3], lease: { held: boolean }, outcome: RunOutcome }} run
 */
const settlePending = async (deps, slug, { recorded, lease, outcome }) => {
  if (recorded !== null && (lease.held || outcome.code === 'lock-lost')) await forgetPending(deps.adapters.files, /** @type {string} */ (slug))
}

/**
 * The run under the loop's own session id, kept from one command to the next, so that `record`
 * takes back the lease `next` left.
 * @param {LoopDeps} deps
 * @param {{ slug: string | null, replies: ReadonlyMap<string, import('../../application/ports/agent-runner.mjs').AgentAnswer>, shown: { phase: string | null }, recorded: Parameters<typeof advance>[3], lease: { held: boolean } }} run
 */
const runPipeline = async ({ adapters, log }, { slug, replies, shown, recorded, lease }) => createRunPipeline({
  ...adapters,
  runLock: { ...adapters.runLock, owner: slug === null ? adapters.runLock.owner : await loopOwner(adapters.files, slug) },
  agentRunner: createLoopAgentRunner({ files: adapters.files, slug, replies, token: randomUUID, held: () => heldBy(adapters.files, slug, { recorded, lease }) }),
  human: { ask: async () => null },
  progress: { phase: (phase) => showPhase(shown, phase, log), log },
}).run({ handedBack: recorded !== null && !recorded.taken })

/**
 * The run holds its lease: the agents a record takes back are marked taken.
 * @param {import('../../application/ports/tracking-files.mjs').TrackingFiles} files @param {string | null} slug
 * @param {{ recorded: Parameters<typeof advance>[3], lease: { held: boolean } }} run
 */
const heldBy = async (files, slug, { recorded, lease }) => {
  lease.held = true
  if (recorded !== null) await markTaken(files, /** @type {string} */ (slug), recorded.pending)
}

/**
 * The loop's session id for the run: the one written in its loop folder, else a new one.
 * @param {import('../../application/ports/tracking-files.mjs').TrackingFiles} files @param {string} slug
 */
export const loopOwner = async (files, slug) => {
  const written = ((await files.read(slug, OWNER_FILE)) ?? '').trim()
  if (/^[0-9a-f-]{36}$/.test(written)) return written
  const owner = randomUUID()
  await files.write(slug, OWNER_FILE, `${owner}\n`)
  return owner
}

/** @param {{ phase: string | null }} shown @param {string} phase @param {(line: string) => void} log */
const showPhase = (shown, phase, log) => {
  shown.phase = phase
  log(`phase ${phase}`)
}

/**
 * A run that waits for a human goes on with `next` once they answered; any other outcome ends the loop.
 * @param {LoopDeps} deps @param {RunOutcome} outcome @returns {Promise<LoopStep>}
 */
const afterRun = async (deps, outcome) => (outcome.status === 'waiting'
  ? { ...outcome, reason: await askTheHuman(deps), dispatches: [], then: `${deps.command} next` }
  : ended(outcome))

/**
 * The question the run waits on, for the conducting agent to show, with no command that answers
 * it: the human answers in their own terminal.
 * @param {LoopDeps} deps
 */
const askTheHuman = async ({ adapters }) => {
  const question = /** @type {NonNullable<import('../../application/pipeline/observe-usecase.mjs').RunView['question']>} */ ((await createObserve(adapters).view()).question)
  return `${question.text} Options: ${optionsText(question)}. Stop here and ask the human to answer it with skraft decide in their own terminal; then run next.`
}

/**
 * The answers a question takes: its options, and the human's own instruction for one that takes it.
 * @param {{ kind: import('../../domain/decisions/questions.mjs').QuestionKind, options: string[] }} question
 */
const optionsText = ({ kind, options }) => (takesInstruction(kind) ? [...options.filter((option) => option !== STOP), `an instruction in quotes, or ${STOP}`] : options).join(', ')

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
