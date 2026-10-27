import { randomUUID } from 'node:crypto'
import { createReviewPullRequest } from '../../application/review/review-pull-request-usecase.mjs'
import { reviewSlug } from '../../domain/review/pull-request.mjs'
import { HandedOver, PENDING_FILE, REPLIES_FILE, createLoopAgentRunner, forgetPending, forgetReplies, markTaken, pendingDispatches, pendingTaken, takeReplies } from './loop-agent-runner.mjs'
import { loopOwner } from './agent-loop.mjs'

/**
 * `skraft review --pr <number>` on the command line, through the agent loop: the review runs
 * until it needs its lenses or the refuter, hands them to the agent that conducts it, and
 * `--record` hands their replies back. The consent to publish is asked at the terminal.
 *
 * @typedef {import('../../application/review/review-pull-request-usecase.mjs').ReviewOutcome} ReviewOutcome
 * @typedef {import('../../application/review/review-pull-request-usecase.mjs').ReviewDeps} ReviewDeps
 * @typedef {import('./agent-loop.mjs').LoopDispatch} LoopDispatch
 * @typedef {(ReviewOutcome | (Omit<ReviewOutcome, 'status'> & { status: 'dispatch' | 'refused' })) & { dispatches: LoopDispatch[], then: string | null }} ReviewStep
 *   dispatch: agents handed over, `then` records them; refused: the loop's own files stop it.
 * @typedef {{
 *   adapters: Omit<ReviewDeps, 'agentRunner' | 'human' | 'progress'>, command: string, log: (line: string) => void,
 *   confirm: (question: string) => Promise<boolean | null>,
 * }} ReviewLoopDeps
 * @typedef {{ number: number, publish: boolean, record: boolean, workingCopyName: string }} ReviewCommand
 * @typedef {{ pending: import('./loop-agent-runner.mjs').HandedDispatch[], taken: boolean } | null} Recorded
 *   the agents `--record` takes back, and whether a record already took them; null without `--record`.
 */

/** @param {ReviewLoopDeps} deps @param {ReviewCommand} command @returns {Promise<ReviewStep>} */
export const reviewThroughLoop = async (deps, command) => {
  const slug = reviewSlug(command.number)
  const pending = await pendingDispatches(deps.adapters.reviewFiles, slug)
  if (pending === null) return unreadable(deps, command, PENDING_FILE)
  if (command.record) return recorded(deps, command, pending)
  if (pending.length > 0) return refused(command, 'not-recorded', `${pending.length} handed over agents are not recorded yet: start each one, save its reply, then record`)
  await forgetReplies(deps.adapters.reviewFiles, slug)
  return advance(deps, command, new Map(), null)
}

/**
 * @param {ReviewLoopDeps} deps @param {ReviewCommand} command
 * @param {import('./loop-agent-runner.mjs').HandedDispatch[]} pending
 */
const recorded = async (deps, command, pending) => {
  if (pending.length === 0) return refused(command, 'nothing-to-record', 'no agent was handed over; run the review without --record')
  const slug = reviewSlug(command.number)
  const replies = await takeReplies(deps.adapters.reviewFiles, slug, pending)
  if (replies === null) return unreadable(deps, command, REPLIES_FILE)
  return advance(deps, command, replies, { pending, taken: await pendingTaken(deps.adapters.reviewFiles, slug) })
}

/**
 * The review, until it ends or hands agents over. Taken back with the lease, the agents a record
 * recorded are forgotten once the review ends, or once another session took the lease.
 * @param {ReviewLoopDeps} deps @param {ReviewCommand} command
 * @param {ReadonlyMap<string, import('../../application/ports/agent-runner.mjs').AgentAnswer>} replies
 * @param {Recorded} recorded
 * @returns {Promise<ReviewStep>}
 */
const advance = async (deps, command, replies, recorded) => {
  const lease = { held: false }
  try {
    const outcome = await reviewed(deps, command, { replies, recorded, lease })
    if (recorded !== null && (lease.held || outcome.code === 'lock-lost')) await forgetPending(deps.adapters.reviewFiles, reviewSlug(command.number))
    return { ...outcome, dispatches: [], then: null }
  } catch (error) {
    if (!(error instanceof HandedOver)) throw error
    return handed(deps, command)
  }
}

/**
 * The review under the loop's own session id, kept from one command to the next, so that
 * `--record` takes back the lease the handing over left.
 * @param {ReviewLoopDeps} deps @param {ReviewCommand} command
 * @param {{ replies: ReadonlyMap<string, import('../../application/ports/agent-runner.mjs').AgentAnswer>, recorded: Recorded, lease: { held: boolean } }} run
 */
const reviewed = async ({ adapters, log, confirm }, { number, publish, workingCopyName }, { replies, recorded, lease }) => {
  const slug = reviewSlug(number)
  return createReviewPullRequest({
    ...adapters,
    reviewLock: { ...adapters.reviewLock, owner: await loopOwner(adapters.reviewFiles, slug) },
    agentRunner: createLoopAgentRunner({ files: adapters.reviewFiles, slug, replies, token: randomUUID, held: () => heldBy(adapters.reviewFiles, slug, { recorded, lease }) }),
    human: terminalHuman(confirm),
    progress: { phase: log, log },
  }).review({ number, publish, workingCopyName, handedBack: recorded !== null && !recorded.taken })
}

/**
 * The review holds its lease: the agents a record takes back are marked taken.
 * @param {import('../../application/ports/tracking-files.mjs').TrackingFiles} files @param {string} slug
 * @param {{ recorded: Recorded, lease: { held: boolean } }} run
 */
const heldBy = async (files, slug, { recorded, lease }) => {
  lease.held = true
  if (recorded !== null) await markTaken(files, slug, recorded.pending)
}

/**
 * The consent asked at the terminal: yes is its first option, no its second; nobody to type, no answer.
 * @param {ReviewLoopDeps['confirm']} confirm
 * @returns {import('../../application/ports/human-interaction.mjs').HumanInteraction}
 */
const terminalHuman = (confirm) => Object.freeze({
  by: 'cli-tty',
  ask: async ({ text, options }) => {
    const said = await confirm(`${text} [y/N] `)
    return said === null ? null : { answer: options[said ? 0 : 1], reason: null }
  },
})

/** The agents handed over, as the conducting agent starts them. @param {ReviewLoopDeps} deps @param {ReviewCommand} command @returns {Promise<ReviewStep>} */
const handed = async ({ adapters, command: skraft }, command) => {
  const slug = reviewSlug(command.number)
  const pending = /** @type {import('./loop-agent-runner.mjs').HandedDispatch[]} */ (await pendingDispatches(adapters.reviewFiles, slug))
  const at = (/** @type {string} */ path) => adapters.reviewFiles.location(slug, path)
  return {
    ...empty(command, 'dispatch', `start ${pending.length === 1 ? 'this agent' : `these ${pending.length} agents, one after the other`}, save each final reply as it is to its reply file, then record`),
    dispatches: pending.map(({ agent, model, brief, reply }) => ({ agent, model, brief: at(brief), reply: at(reply), prompt: `Your brief is the file ${at(brief)}. Read it whole and do what it asks. Your last message is the reply it asks for.` })),
    then: `${skraft} review --pr ${command.number} --record${command.publish ? ' --publish' : ''}`,
  }
}

/** @param {ReviewCommand} command @param {string} code @param {string} reason @returns {ReviewStep} */
const refused = (command, code, reason) => ({ ...empty(command, 'refused', reason), code, dispatches: [], then: null })

/** A loop file skraft did not write stops the loop with a reason. @param {ReviewLoopDeps} deps @param {ReviewCommand} command @param {string} path */
const unreadable = ({ adapters }, command, path) => {
  const at = (/** @type {string} */ file) => adapters.reviewFiles.location(reviewSlug(command.number), file)
  return refused(command, 'loop-file-unreadable', `${at(path)} is not what skraft wrote; remove ${at(PENDING_FILE)}, then run the review again to hand the agents over again`)
}

/** @param {ReviewCommand} command @param {'dispatch' | 'refused'} status @param {string} reason */
const empty = ({ number }, status, reason) => ({ status, number, pass: null, code: null, reason, reasons: [], details: [], file: null, comment: null, unpublished: null })
