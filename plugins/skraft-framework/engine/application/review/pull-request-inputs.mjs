import { readConfig, writeConfig } from '../../domain/config/skraft-config.mjs'
import { PULL_REQUEST_FILE, pullRequestText } from '../../domain/review/pull-request.mjs'
import { newComponents } from '../config/detected-components.mjs'

/**
 * What a pull request hands its review: the changes from the merge base to its head, its title
 * and body as the story, the repository's decision records as documents, and the components of
 * skraft-config.json, else those `skraft init` would detect, written nowhere.
 *
 * @typedef {import('./review-runs.mjs').ReviewInputs} ReviewInputs
 * @typedef {import('../ports/pull-requests.mjs').PullRequestFacts} PullRequestFacts
 * @typedef {import('../../domain/config/skraft-config.mjs').Component} Component
 * @typedef {{
 *   reviewFiles: import('../ports/tracking-files.mjs').TrackingFiles,
 *   workspace: import('../ports/workspace.mjs').Workspace,
 * }} InputDeps
 * @typedef {{
 *   slug: string, pullRequest: PullRequestFacts, base: ReviewInputs['base'], components: Component[],
 *   declared: Record<string, 'required' | 'optional'>, workingCopyName: string,
 * }} InputFacts
 *   components: those of skraft-config.json; declared: the inputs the review reads.
 */

/** The index of the repository's decision records. */
const DECISIONS = 'docs/adr/decisions-index.md'

/**
 * The inputs the review declares, each the pull request has.
 * @param {InputDeps} deps @param {InputFacts} facts @returns {Promise<ReviewInputs>}
 */
export const pullRequestInputs = async (deps, facts) => {
  const all = {
    base: facts.base,
    story: { issue: facts.pullRequest.number, title: facts.pullRequest.title },
    documents: 'documents' in facts.declared ? await documentsOf(deps, facts) : undefined,
    components: (await componentsOf(deps, facts)).map((component) => ({ ...component, gates: [] })),
  }
  return /** @type {ReviewInputs} */ (Object.fromEntries(Object.entries(all).filter(([name, value]) => name in facts.declared && value !== undefined)))
}

/**
 * The pull request's body, kept beside the review, and the decision records the review reads as
 * a project rule; none when it has neither.
 * @param {InputDeps} deps @param {InputFacts} facts
 * @returns {Promise<import('./review-runs.mjs').ReviewDocuments | undefined>}
 */
const documentsOf = async (deps, { slug, pullRequest }) => {
  const told = pullRequest.body.trim() !== ''
  if (!told && (await deps.workspace.read(DECISIONS)) === null) return undefined
  if (told) await deps.reviewFiles.write(slug, PULL_REQUEST_FILE, pullRequestText(pullRequest))
  const artifacts = told ? [PULL_REQUEST_FILE] : []
  return { outputs: [], context: artifacts, artifacts, phases: [] }
}

/**
 * The components of skraft-config.json; without any, those `skraft init` would detect, with the
 * defaults the file would give them.
 * @param {InputDeps} deps @param {InputFacts} facts @returns {Promise<Component[]>}
 */
const componentsOf = async ({ workspace }, { components, workingCopyName }) => {
  if (components.length > 0) return components
  const detected = await newComponents(workspace, ['.'], [], workingCopyName)
  return /** @type {{ config: { components: Component[] } }} */ (readConfig(writeConfig({}, detected))).config.components
}
