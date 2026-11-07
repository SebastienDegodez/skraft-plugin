import { consentsAsked, unsettledConsents } from '../../domain/decisions/consents.mjs'
import { isFrontend } from '../../domain/reporting/visuals.mjs'
import { joinRelative } from '../../domain/config/relative-path.mjs'
import { forgeMissing } from '../config/forge.mjs'

/**
 * What stops a run before its first agent: a configuration nobody settled, or a forge out of this
 * machine's reach that the run would publish on. `/skraft-init` settles the consents once, before
 * any run, so that no run stops to ask; a machine a developer has still to fix is a refusal, not a
 * question, for the same reason.
 *
 * @typedef {import('./run-pipeline-usecase.mjs').Context} Context
 * @typedef {import('./active-run.mjs').RunOutcome} RunOutcome
 * @typedef {import('../../domain/decisions/consents.mjs').ConsentKey} ConsentKey
 * @typedef {import('../../domain/decisions/consents.mjs').ConsentState} ConsentState
 */

/** What the developer runs to settle the configuration. */
const SETTLE = 'run /skraft-init'

/** @param {Context} context @returns {Promise<RunOutcome | null>} null: the run may start */
export const cannotStart = async (context) => configurationIncomplete(context)
  ?? await stepsUnbound(context)
  ?? await forgeOutOfReach(context)

/** @param {Context} context @returns {RunOutcome | null} null: the configuration is settled */
const configurationIncomplete = (context) => {
  const unsettled = [
    ...unsettledConsents(context.config.publish, consentsAsked(publicationsOf(context))).map(stateLine),
    ...undecidedGherkin(context.config.components),
  ]
  if (unsettled.length === 0) return null
  return { status: 'refused', slug: context.slug, phase: null, code: 'configuration-incomplete', reason: `skraft is not initialised: ${SETTLE} (${unsettled.join(', ')})` }
}

/**
 * The components that say neither that they decline Gherkin nor where their scenarios live: a
 * component held to a folder nobody chose would be held to one its runner may never read.
 * @param {readonly import('../../domain/config/skraft-config.mjs').Component[]} components
 */
const undecidedGherkin = (components) => components.filter(({ bdd }) => bdd === null).map(({ name }) => `${name}: bdd is unanswered`)

/**
 * The first runner of the configuration whose step definitions sit in a folder the working copy has
 * not got: it executes no scenario, and the run spends no agent writing for it. The scenarios'
 * folder is not asked for — DISTILL creates it when it writes the first one — but nothing but the
 * developer writes a binding.
 * @param {Context} context @returns {Promise<RunOutcome | null>}
 */
const stepsUnbound = async (context) => {
  for (const component of context.config.components) {
    // Stryker disable next-line ConditionalExpression: a pair that binds nothing asks the port about its root, which is a folder whenever the run reads the configuration at all, so reading it or skipping it refuses the same runs; the condition says why it is skipped
    for (const pair of component.bddPaths.filter((entry) => entry.runner !== null && entry.steps !== null)) {
      if (await isFolder(context, component.root, /** @type {string} */ (pair.steps))) continue
      const reason = `${component.name}: ${pair.runner} reads its step definitions in ${pair.steps}, which is no folder of the working copy. Fix it, then start the run again.`
      return { status: 'refused', slug: context.slug, phase: null, code: 'bdd-unbound', reason }
    }
  }
  return null
}

/** Whether a folder of the component is a folder of the working copy. @param {Context} context @param {string} root @param {string} inner */
const isFolder = async ({ deps }, root, inner) => (await deps.workspace.list(joinRelative(root, inner))) !== null

/** Why one consent is not settled. @param {{ key: ConsentKey, state: ConsentState }} unsettled */
const stateLine = ({ key, state }) => `publish.${key} ${state === 'outdated' ? 'answers an earlier question' : 'is unanswered'}`

/**
 * What the run's workflow publishes: a node whose `when` the configuration does not meet asks for
 * no consent, since the run never reaches it.
 * @param {Context} context @returns {Array<string | null>}
 */
const publicationsOf = ({ loaded, config }) => Object.values(loaded.workflow.nodes)
  .filter((node) => isPublication(node) && (node.when !== 'frontend' || config.components.some(isFrontend)))
  .map((node) => node.publish)

/** @param {import('../../domain/workflow/workflow.mjs').WorkflowNode} node */
// Stryker disable next-line ConditionalExpression: a node that is no publication publishes nothing, so it asks for no consent either way
const isPublication = (node) => node.kind === 'publish'

/**
 * The forge a publication of the run would open its pull request on, out of this machine's reach:
 * the run spends no agent on work it cannot publish. A consent nobody accepted asks for no forge.
 * @param {Context} context @returns {Promise<RunOutcome | null>}
 */
const forgeOutOfReach = async (context) => {
  if (!publishesPullRequest(context) || context.config.publish.pullRequest !== true) return null
  const missing = await forgeMissing(context.deps, context.config.forge)
  if (missing === null) return null
  return { status: 'refused', slug: context.slug, phase: null, code: 'forge-unreachable', reason: `${missing}. Fix it, then start the run again.` }
}

/** @param {Context} context */
const publishesPullRequest = (context) => publicationsOf(context).includes('pull-request')
