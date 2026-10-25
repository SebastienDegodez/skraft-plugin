import { publishPullRequest } from '../publish/pull-request.mjs'
import { leave } from './run-routes.mjs'

/**
 * @typedef {import('./run-pipeline-usecase.mjs').Context} Context
 * @typedef {import('../../domain/journal/run-state.mjs').RunState} RunState
 * @typedef {import('../../domain/pipeline/next-step.mjs').WorkStep} WorkStep
 * @typedef {import('../publish/pull-request.mjs').Publication} Publication
 */

/**
 * A publish node: the run's pull request described in the tracking folder, then opened or
 * updated when the developer consented and the forge can be reached. Either way the run goes
 * on, and the step says which.
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 * @returns {Promise<null>}
 */
export const publishStep = async (context, run, next) => {
  const { deps, slug, journal, config, loaded } = context
  if (!next.resumed) await journal.append('step.started', { step: next.node.id, phase: next.phase, publish: next.node.publish, visit: next.visit, attempt: 1 })
  const started = deps.clock.now()
  const publication = await publishPullRequest(deps, { slug, journal, config, workflow: loaded.workflow })
  await recordPublish(context, run, next, { publication, durationMs: deps.clock.now().getTime() - started.getTime() })
  return null
}

/**
 * @param {Context} context @param {RunState} run @param {WorkStep} next
 * @param {{ publication: Publication, durationMs: number }} done
 */
const recordPublish = async (context, run, { node, visit }, { publication, durationMs }) => {
  // Stryker disable next-line ArrayDeclaration: a publish node's one edge never refuses the run, so no failure is told
  const routed = leave(context, run, node.id, null, [])
  await context.journal.append('step.recorded', {
    step: node.id, visit, attempt: 1, outcome: publication.published ? 'published' : 'local', code: routed.code ?? null,
    missing: [], failures: [], next: routed.next, reason: routed.reason ?? publication.reason, durationMs,
  })
  context.deps.progress.log(`${context.slug}: ${node.id}: ${publication.reason}`)
}
