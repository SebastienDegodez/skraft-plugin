import { createInit } from '../../application/pipeline/init-usecase.mjs'
import { createRunPipeline } from '../../application/pipeline/run-pipeline-usecase.mjs'
import { createNodeAdapters } from '../../infrastructure/node-adapters.mjs'
import { createCtxAgentRunner } from './ctx-agent-runner.mjs'
import { createCtxHuman } from './ctx-human.mjs'
import { createCtxProgress } from './ctx-progress.mjs'
import { isCancellation } from './cancellation.mjs'
import { readArgs } from './workflow-args.mjs'

/**
 * @typedef {import('../../application/pipeline/active-run.mjs').RunOutcome | { status: 'error', slug: null, phase: null, code: 'unexpected', reason: string }} RunOutcome
 *   error: the run stopped on an exception; its reason is fixed, never the exception's text.
 * @typedef {{ slug?: unknown, issue?: unknown, title?: unknown, base?: unknown, fromArtifacts?: unknown, agentIds?: unknown }} WorkflowArgs
 * @typedef {import('./ctx-agent-runner.mjs').AgentContext & import('./ctx-human.mjs').PauseContext & { args?: WorkflowArgs, signal?: AbortSignal }} WorkflowContext
 * @typedef {{ cwd: string | null, pluginRoot: string, home: string }} Host
 *   cwd: the session's working directory when the run starts, null while unknown;
 *   home: the folder that holds the developer's `.skraft/config.json`.
 */

export const SKRAFT_PIPELINE_META = Object.freeze({
  name: 'skraft-pipeline',
  // Stryker disable StringLiteral: text shown to the host and the model; no engine behaviour reads it
  description:
    'SKRAFT engineering pipeline for one story, run from its journal and resumable. ' +
    'args: { slug?: kebab-case feature scope (omit to resume the active pipeline), issue?: number, title?: string, ' +
    'base?: git ref to diff against instead of the configured base (new slug only), ' +
    'fromArtifacts?: true to start a new slug in DESIGN from the DISCUSS stories in its tracking folder, ' +
    'agentIds?: { [agent file id]: session agent id } }. ' +
    'The Copilot model and reasoning effort of each agent come from models and assign in the skraft configuration, never from args.',
  phases: Object.freeze([
    Object.freeze({ title: 'RESEARCH', detail: 'Solution Researcher' }),
    Object.freeze({ title: 'DESIGN', detail: 'Solution Architect' }),
    Object.freeze({ title: 'DISTILL', detail: 'Acceptance Designer' }),
    Object.freeze({ title: 'DELIVER', detail: 'Software Engineer and gates' }),
  ]),
  // Stryker restore StringLiteral
  argsSchema: Object.freeze({
    type: 'object',
    properties: Object.freeze({
      slug: Object.freeze({ type: 'string' }),
      issue: Object.freeze({ type: 'integer' }),
      title: Object.freeze({ type: 'string' }),
      base: Object.freeze({ type: 'string' }),
      fromArtifacts: Object.freeze({ type: 'boolean' }),
      agentIds: Object.freeze({ type: 'object' }),
    }),
  }),
})

/**
 * The `skraft-pipeline` workflow body: with a slug, Init then RunPipeline on it; without,
 * RunPipeline on the active pipeline. Every failure is an outcome with each key present: a caller
 * gates on a `completed` run whose `outcome.status` is the one it expects. Only a cancellation
 * (the run's signal aborted, an AbortError) is rethrown.
 * @param {WorkflowContext} ctx
 * @param {Host} host
 * @returns {Promise<RunOutcome>}
 */
export const runSkraftPipelineWorkflow = async (ctx, host) => {
  const outcome = await guarded(ctx, host, ctx.signal)
  ctx.log(`${outcome.slug ?? 'skraft'}: ${outcome.status}${outcome.code ? ` (${outcome.code})` : ''}: ${outcome.reason}`)
  return outcome
}

/** @type {RunOutcome} */
const NO_DIRECTORY = Object.freeze({ status: 'refused', slug: null, phase: null, code: 'no-directory', reason: 'the session has no working directory yet' })

/** @type {RunOutcome} */
const UNEXPECTED = Object.freeze({
  status: 'error', slug: null, phase: null, code: 'unexpected',
  reason: 'the run stopped on an unexpected error; nothing past the last journaled step was done, and the run can be started again',
})

/**
 * @param {WorkflowContext} ctx @param {Host} host @param {AbortSignal | undefined} signal the run's, read when it starts
 * @returns {Promise<RunOutcome>}
 */
const guarded = async (ctx, { cwd, pluginRoot, home }, signal) => {
  try {
    return cwd === null ? NO_DIRECTORY : await runIn(ctx, { cwd, pluginRoot, home })
  } catch (error) {
    if (isCancellation(error, signal)) throw error
    return UNEXPECTED
  }
}

/**
 * @param {WorkflowContext} ctx
 * @param {{ cwd: string, pluginRoot: string, home: string }} host
 * @returns {Promise<RunOutcome>}
 */
const runIn = async (ctx, { cwd, pluginRoot, home }) => {
  const read = await readArgs(ctx)
  if (!read.ok) return read.outcome
  const { slug, issue, title, base, fromArtifacts, agentIds } = read.args
  const adapters = createNodeAdapters({ cwd, pluginRoot, agentHost: 'copilot', home })
  const runner = { pluginRoot, agentIds }
  return slug === undefined || slug === null
    ? run(ctx, adapters, runner)
    : initThenRun(ctx, adapters, { ...runner, slug, story: storyOf(issue, title), base, fromArtifacts: fromArtifacts === true })
}

/**
 * @param {WorkflowContext} ctx
 * @param {ReturnType<typeof createNodeAdapters>} adapters
 * @param {{ pluginRoot: string, agentIds: Record<string, string>, slug: unknown, story: import('../../application/pipeline/init-usecase.mjs').Story, base: unknown, fromArtifacts: boolean }} request
 * @returns {Promise<RunOutcome>}
 */
const initThenRun = async (ctx, adapters, { slug, story, base, fromArtifacts, ...runner }) => {
  const initialised = await createInit(adapters).init({ slug, story, base, fromArtifacts })
  if (initialised.ok) return run(ctx, adapters, { ...runner, slug: initialised.slug })
  return initialised.code === 'journal-tampered'
    ? { status: 'blocked', slug: initialised.slug, phase: null, code: initialised.code, reason: initialised.reason }
    : { status: 'refused', slug: null, phase: null, code: initialised.code, reason: initialised.reason }
}

/**
 * @param {WorkflowContext} ctx
 * @param {ReturnType<typeof createNodeAdapters>} adapters
 * @param {{ pluginRoot: string, agentIds: Record<string, string>, slug?: string }} request
 */
const run = (ctx, adapters, { pluginRoot, agentIds, slug }) => createRunPipeline({
  ...adapters,
  agentRunner: createCtxAgentRunner({ ctx, pluginRoot, agentIds }),
  human: createCtxHuman({ ctx }),

  progress: createCtxProgress({ ctx }),
}).run(slug ? { slug } : {})

/** @param {unknown} issue @param {unknown} title */
const storyOf = (issue, title) => {
  const story = { issue: Number.isInteger(issue) ? /** @type {number} */ (issue) : null, title: typeof title === 'string' && title !== '' ? title : null }
  return story.issue === null && story.title === null ? null : story
}
