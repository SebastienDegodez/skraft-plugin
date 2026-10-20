import { createInit } from '../../application/init.mjs'
import { createRunPipeline } from '../../application/run-pipeline.mjs'
import { createNodeAdapters } from '../../infrastructure/node-adapters.mjs'
import { createCtxAgentRunner } from './ctx-agent-runner.mjs'
import { createCtxHuman } from './ctx-human.mjs'
import { createCtxProgress } from './ctx-progress.mjs'

/**
 * @typedef {import('../../application/active-run.mjs').RunOutcome} RunOutcome
 * @typedef {{ slug?: unknown, issue?: unknown, title?: unknown, base?: unknown, fromArtifacts?: unknown, agentIds?: unknown, models?: unknown }} WorkflowArgs
 * @typedef {import('./ctx-agent-runner.mjs').AgentContext & import('./ctx-human.mjs').PauseContext & { args?: WorkflowArgs }} WorkflowContext
 * @typedef {{ cwd: string, pluginRoot: string }} Host
 */

export const SKRAFT_PIPELINE_META = Object.freeze({
  name: 'skraft-pipeline',
  // Stryker disable StringLiteral: text shown to the host and the model; no engine behaviour reads it
  description:
    'SKRAFT engineering pipeline for one story, run from its journal and resumable. ' +
    'args: { slug?: kebab-case feature scope (omit to resume the active pipeline), issue?: number, title?: string, ' +
    'base?: git ref to diff against instead of the configured base (new slug only), ' +
    'fromArtifacts?: true to start a new slug in DESIGN from the DISCUSS stories in its tracking folder, ' +
    'agentIds?: { [agent file id]: session agent id }, ' +
    'models?: { [model family of the workflow, e.g. sonnet]: Copilot model name or names, e.g. claude-sonnet-5.5 } }.',
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
      models: Object.freeze({ type: 'object' }),
    }),
  }),
})

/**
 * The `skraft-pipeline` workflow body: with a slug, Init then RunPipeline on it; without,
 * RunPipeline on the active pipeline.
 * @param {WorkflowContext} ctx
 * @param {Host} host
 * @returns {Promise<RunOutcome>}
 */
export const runSkraftPipelineWorkflow = async (ctx, { cwd, pluginRoot }) => {
  const { slug, issue, title, base, fromArtifacts, agentIds, models } = ctx.args ?? {}
  const adapters = createNodeAdapters({ cwd, pluginRoot, agentHost: 'copilot' })
  const runner = { pluginRoot, agentIds, models }
  const outcome = slug === undefined || slug === null
    ? await run(ctx, adapters, runner)
    : await initThenRun(ctx, adapters, { ...runner, slug, story: storyOf(issue, title), base, fromArtifacts: fromArtifacts === true })
  ctx.log(`${outcome.slug ?? 'skraft'}: ${outcome.status}${outcome.code ? ` (${outcome.code})` : ''}: ${outcome.reason}`)
  return outcome
}

/**
 * @param {WorkflowContext} ctx
 * @param {ReturnType<typeof createNodeAdapters>} adapters
 * @param {{ pluginRoot: string, agentIds: unknown, models: unknown, slug: unknown, story: import('../../application/init.mjs').Story, base: unknown, fromArtifacts: boolean }} request
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
 * @param {{ pluginRoot: string, agentIds: unknown, models: unknown, slug?: string }} request
 */
const run = (ctx, adapters, { pluginRoot, agentIds, models, slug }) => createRunPipeline({
  ...adapters,
  agentRunner: createCtxAgentRunner({ ctx, pluginRoot, agentIds: isRecord(agentIds) ? agentIds : {}, models: isRecord(models) ? models : {} }),
  human: createCtxHuman({ ctx }),

  progress: createCtxProgress({ ctx }),
}).run(slug ? { slug } : {})

/** @param {unknown} issue @param {unknown} title */
const storyOf = (issue, title) => {
  const story = { issue: Number.isInteger(issue) ? /** @type {number} */ (issue) : null, title: typeof title === 'string' && title !== '' ? title : null }
  return story.issue === null && story.title === null ? null : story
}

/** @param {unknown} value @returns {value is Record<string, any>} */
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
