import { createInit } from '../../application/init.mjs'
import { createRunPipeline } from '../../application/run-pipeline.mjs'
import { createNodeAdapters } from '../../infrastructure/node-adapters.mjs'
import { createCtxAgentRunner } from './ctx-agent-runner.mjs'
import { createCtxProgress } from './ctx-progress.mjs'

/**
 * @typedef {import('../../application/active-run.mjs').RunOutcome} RunOutcome
 * @typedef {{ slug?: unknown, issue?: unknown, title?: unknown, base?: unknown, agentIds?: unknown }} WorkflowArgs
 * @typedef {import('./ctx-agent-runner.mjs').AgentContext & { args?: WorkflowArgs, log: (message: string) => void }} WorkflowContext
 * @typedef {{ cwd: string, pluginRoot: string }} Host
 */

export const SKRAFT_PIPELINE_META = Object.freeze({
  name: 'skraft-pipeline',
  description:
    'SKRAFT engineering pipeline for one story, run from its journal and resumable. ' +
    'args: { slug?: kebab-case feature scope (omit to resume the active pipeline), issue?: number, title?: string, ' +
    'base?: git ref to diff against instead of the configured base (new slug only), ' +
    'agentIds?: { [agent file id]: session agent id } }.',
  phases: Object.freeze([Object.freeze({ title: 'RESEARCH', detail: 'Solution Researcher' })]),
  argsSchema: Object.freeze({
    type: 'object',
    properties: Object.freeze({
      slug: Object.freeze({ type: 'string' }),
      issue: Object.freeze({ type: 'integer' }),
      title: Object.freeze({ type: 'string' }),
      base: Object.freeze({ type: 'string' }),
      agentIds: Object.freeze({ type: 'object' }),
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
  const { slug, issue, title, base, agentIds } = ctx.args ?? {}
  const adapters = createNodeAdapters({ cwd, pluginRoot })
  const outcome = slug === undefined || slug === null
    ? await run(ctx, adapters, { pluginRoot, agentIds })
    : await initThenRun(ctx, adapters, { pluginRoot, agentIds, slug, story: storyOf(issue, title), base })
  ctx.log(`${outcome.slug ?? 'skraft'}: ${outcome.status}${outcome.code ? ` (${outcome.code})` : ''}: ${outcome.reason}`)
  return outcome
}

/**
 * @param {WorkflowContext} ctx
 * @param {ReturnType<typeof createNodeAdapters>} adapters
 * @param {{ pluginRoot: string, agentIds: unknown, slug: unknown, story: import('../../application/init.mjs').Story, base: unknown }} request
 * @returns {Promise<RunOutcome>}
 */
const initThenRun = async (ctx, adapters, { slug, story, base, ...runner }) => {
  const initialised = await createInit(adapters).init({ slug, story, base })
  if (initialised.ok) return run(ctx, adapters, { ...runner, slug: initialised.slug })
  return initialised.code === 'journal-tampered'
    ? { status: 'blocked', slug: initialised.slug, phase: null, code: initialised.code, reason: initialised.reason }
    : { status: 'refused', slug: null, phase: null, code: initialised.code, reason: initialised.reason }
}

/**
 * @param {WorkflowContext} ctx
 * @param {ReturnType<typeof createNodeAdapters>} adapters
 * @param {{ pluginRoot: string, agentIds: unknown, slug?: string }} request
 */
const run = (ctx, adapters, { pluginRoot, agentIds, slug }) => createRunPipeline({
  ...adapters,
  agentRunner: createCtxAgentRunner({ ctx, pluginRoot, agentIds: isRecord(agentIds) ? agentIds : {} }),
  progress: createCtxProgress({ ctx }),
}).run(slug ? { slug } : {})

/** @param {unknown} issue @param {unknown} title */
const storyOf = (issue, title) => {
  const story = { issue: Number.isInteger(issue) ? /** @type {number} */ (issue) : null, title: typeof title === 'string' && title !== '' ? title : null }
  return story.issue === null && story.title === null ? null : story
}

/** @param {unknown} value @returns {value is Record<string, string>} */
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
