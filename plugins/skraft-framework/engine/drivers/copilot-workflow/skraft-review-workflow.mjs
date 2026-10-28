import { basename } from 'node:path'
import { createReviewPullRequest } from '../../application/review/review-pull-request-usecase.mjs'
import { createNodeAdapters } from '../../infrastructure/node-adapters.mjs'
import { createCtxAgentRunner } from './ctx-agent-runner.mjs'
import { createCtxProgress } from './ctx-progress.mjs'
import { isCancellation } from './cancellation.mjs'
import { readReviewArgs } from './workflow-args.mjs'

/**
 * @typedef {import('../../application/review/review-pull-request-usecase.mjs').ReviewOutcome} ReviewOutcome
 * @typedef {{ status: 'refused' | 'error', number: number | null, code: string, reason: string }} Refusal
 *   error: the review stopped on an exception; its reason is fixed, never the exception's text.
 * @typedef {import('./ctx-agent-runner.mjs').AgentContext & { phase: (title: string) => void, log: (message: string) => void, args?: unknown, signal?: AbortSignal }} ReviewContext
 * @typedef {import('../../application/ports/decision-confirmation.mjs').DecisionConfirmation & { ask: (message: string) => Promise<import('../../application/ports/decision-confirmation.mjs').Confirmed> }} HostConfirmation
 * @typedef {{ cwd: string | null, pluginRoot: string, home: string, confirmation: HostConfirmation }} ReviewHost
 *   cwd: the session's working directory when the review starts, null while unknown;
 *   confirmation: how the person confirms the consent to publish in the host.
 */

export const SKRAFT_REVIEW_META = Object.freeze({
  name: 'skraft-review',
  // Stryker disable StringLiteral: text shown to the host and the model; no engine behaviour reads it
  description:
    'Review one pull request with the skraft review workflow: the lenses in parallel, the refuter, a computed verdict. ' +
    'The working copy must be checked out on the pull request\'s head. ' +
    'args: { pr: the pull request number, publish?: true to keep the verdict in one comment of the pull request (the person confirms the consent once per repository), ' +
    'agentIds?: { [agent file id]: session agent id } }.',
  phases: Object.freeze([
    Object.freeze({ title: 'REVIEW', detail: 'Lenses, refuter and verdict' }),
  ]),
  // Stryker restore StringLiteral
  argsSchema: Object.freeze({
    type: 'object',
    properties: Object.freeze({
      pr: Object.freeze({ type: 'integer' }),
      publish: Object.freeze({ type: 'boolean' }),
      agentIds: Object.freeze({ type: 'object' }),
    }),
    required: Object.freeze(['pr']),
  }),
})

/** @type {Refusal} */
const NO_DIRECTORY = Object.freeze({ status: 'refused', number: null, code: 'no-directory', reason: 'the session has no working directory yet' })

/** @type {Refusal} */
const UNEXPECTED = Object.freeze({ status: 'error', number: null, code: 'unexpected', reason: 'the review stopped on an unexpected error; start it again to resume it from its journal' })

/**
 * The `skraft-review` workflow body: ReviewPullRequest on the pull request the arguments name.
 * Every failure is an outcome; only a cancellation is rethrown.
 * @param {ReviewContext} ctx @param {ReviewHost} host
 * @returns {Promise<ReviewOutcome | Refusal>}
 */
export const runSkraftReviewWorkflow = async (ctx, host) => {
  const signal = ctx.signal
  try {
    return host.cwd === null ? NO_DIRECTORY : await reviewIn(ctx, /** @type {ReviewHost & { cwd: string }} */ (host))
  } catch (error) {
    if (isCancellation(signal)) throw error
    return UNEXPECTED
  }
}

/** @param {ReviewContext} ctx @param {ReviewHost & { cwd: string }} host @returns {Promise<ReviewOutcome | Refusal>} */
const reviewIn = async (ctx, host) => {
  const read = await readReviewArgs(ctx)
  if (!read.ok) return { ...read.refusal, number: null }
  const outcome = await reviewInPhase(ctx, host, read.args)
  ctx.log(`skraft review #${read.args.pr}: ${outcome.status}${outcome.code ? ` (${outcome.code})` : ''}: ${outcome.reason}`)
  return outcome
}

/**
 * The review in its REVIEW phase, opened on the host before the first lens so the host counts its
 * agents there.
 * @param {ReviewContext} ctx @param {ReviewHost & { cwd: string }} host
 * @param {{ pr: number, publish: boolean, agentIds: Record<string, string> }} args
 * @returns {Promise<ReviewOutcome>}
 */
const reviewInPhase = (ctx, { cwd, pluginRoot, home, confirmation }, { pr, publish, agentIds }) => {
  const ports = hostPorts(ctx, { pluginRoot, agentIds, confirmation, number: pr })
  ports.progress.phase(SKRAFT_REVIEW_META.phases[0].title)
  return createReviewPullRequest({
    ...createNodeAdapters({ cwd, pluginRoot, agentHost: 'copilot', home, signal: ctx.signal }),
    ...ports,
  }).review({ number: pr, publish, workingCopyName: basename(cwd) })
}

/**
 * What the Copilot host does for the review: start its agents, ask its person, show its progress.
 * @param {ReviewContext} ctx
 * @param {{ pluginRoot: string, agentIds: Record<string, string>, confirmation: ReviewHost['confirmation'], number: number }} host
 */
const hostPorts = (ctx, { pluginRoot, agentIds, confirmation, number }) => ({
  agentRunner: createCtxAgentRunner({ ctx, pluginRoot, agentIds }),
  human: confirmedHuman(ctx, confirmation, number),
  progress: createCtxProgress({ ctx }),
})

/**
 * The consent under Copilot: its text in the log, then the person's confirmation in the host's
 * dialog (`session.ui.confirm`); recorded only on a literal yes. A refusal of the host (no
 * dialog, autopilot) or a no is no answer, its fixed reason logged.
 * @param {ReviewContext} ctx @param {ReviewHost['confirmation']} confirmation @param {number} number
 * @returns {import('../../application/ports/human-interaction.mjs').HumanInteraction}
 */
const confirmedHuman = (ctx, confirmation, number) => Object.freeze({
  by: confirmation.by,
  ask: async ({ text, options }) => {
    ctx.log(`Waiting for you — ${text}`)
    const confirmed = await confirmation.ask(`skraft: keep one review comment on pull request #${number}, rewritten at each review and posted as you?`)
    if (confirmed.ok) return { answer: options[0], reason: null }
    ctx.log(refusalOf(confirmed.code, number))
    return null
  },
})

/**
 * Why the consent was not recorded, for the review: fixed by code, the number the engine checked.
 * @param {string} code @param {number} number
 */
// Stryker disable next-line StringLiteral: text shown to the person; the code is what callers read
const refusalOf = (code, number) => {
  const terminal = `run skraft review --pr ${number} --publish in a terminal`
  return ({
    'no-elicitation': `this Copilot host cannot ask you to confirm; ${terminal}`,
    autopilot: `a consent is not recorded in autopilot; ${terminal}`,
    'mode-unknown': `Copilot did not say whether a person is there; ${terminal}`,
    'rate-limited': `too many questions asked in a short time; wait, or ${terminal}`,
  })[code] ?? `you did not confirm keeping a review comment on pull request #${number}`
}
