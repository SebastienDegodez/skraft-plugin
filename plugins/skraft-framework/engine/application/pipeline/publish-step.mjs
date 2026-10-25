import { isFrontend, NO_FRONT_END } from '../../domain/reporting/visuals.mjs'
import { publishPullRequest } from '../publish/pull-request.mjs'
import { recordVisuals } from '../publish/visuals.mjs'
import { leave } from './run-routes.mjs'

/**
 * @typedef {import('./run-pipeline-usecase.mjs').Context} Context
 * @typedef {import('../../domain/journal/run-state.mjs').RunState} RunState
 * @typedef {import('../../domain/pipeline/next-step.mjs').WorkStep} WorkStep
 * @typedef {{ outcome: string, reason: string }} Published
 */

/**
 * A publish node: the run's pull request described in the tracking folder, then opened or
 * updated when the developer consented and the forge can be reached; or the screenshots of
 * the front ends' e2e runs kept on the working branch. Either way the run goes on, and the
 * step says how. A node whose `when` the configuration does not meet is skipped.
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 * @returns {Promise<null>}
 */
export const publishStep = async (context, run, next) => {
  const { deps, journal } = context
  if (!next.resumed) await journal.append('step.started', { step: next.node.id, phase: next.phase, publish: next.node.publish, visit: next.visit, attempt: 1 })
  const started = deps.clock.now()
  const published = unmet(context, next.node) ?? (await PUBLISHERS[/** @type {import('../../domain/workflow/workflow.mjs').Publication} */ (next.node.publish)](context, run, next))
  await recordPublish(context, run, next, { published, durationMs: deps.clock.now().getTime() - started.getTime() })
  return null
}

/**
 * Skipped, when the node runs only for a kind of component the configuration has none of.
 * @param {Context} context @param {WorkStep['node']} node @returns {Published | null}
 */
const unmet = ({ config }, { when }) => (when === 'frontend' && !config.components.some(isFrontend)
  ? { outcome: 'skipped', reason: NO_FRONT_END }
  : null)

/** @type {Readonly<Record<import('../../domain/workflow/workflow.mjs').Publication, (context: Context, run: RunState, next: WorkStep) => Promise<Published>>>} */
const PUBLISHERS = Object.freeze({
  'pull-request': async ({ deps, slug, journal, config, loaded }) => {
    const publication = await publishPullRequest(deps, { slug, journal, config, workflow: loaded.workflow })
    return { outcome: publication.published ? 'published' : 'local', reason: publication.reason }
  },
  'playwright-visuals': (context, run, next) => visualsOf(context, run, next),
})

/**
 * The visuals recorded, then journaled for the pull request to show.
 * @param {Context} context @param {RunState} run @param {WorkStep} next @returns {Promise<Published>}
 */
const visualsOf = async ({ deps, slug, journal, config }, run, { node, visit }) => {
  const { outcome, reason, visuals } = await recordVisuals(deps, { slug, journal, config, run })
  await journal.append('visuals.recorded', { step: node.id, visit, ...visuals })
  return { outcome, reason }
}

/**
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 * @param {{ published: Published, durationMs: number }} done
 */
const recordPublish = async (context, run, { node, visit }, { published, durationMs }) => {
  // Stryker disable next-line ArrayDeclaration: a publish node's one edge never refuses the run, so no failure is told
  const routed = leave(context, run, node.id, null, [])
  await context.journal.append('step.recorded', {
    step: node.id, visit, attempt: 1, outcome: published.outcome, code: routed.code ?? null,
    missing: [], failures: [], next: routed.next, reason: routed.reason ?? published.reason, durationMs,
  })
  context.deps.progress.log(`${context.slug}: ${node.id}: ${published.reason}`)
}
