import { readConfig, writeConfig } from '../../domain/config/skraft-config.mjs'
import { RULE_FILES } from '../../domain/review/context.mjs'
import { PULL_REQUEST_FILE, pullRequestText } from '../../domain/review/pull-request.mjs'
import { newComponents } from '../config/detected-components.mjs'
import { runDocuments } from './run-documents.mjs'

/**
 * What a pull request hands its review: the changes from the merge base to its head, its number
 * as the story (its title and body only in pull-request.md, framed as its author's), the repository's decision records as documents, and the components of
 * skraft-config.json, else those `skraft init` would detect, written nowhere. When a skraft run of
 * this working copy opened the pull request, the documents its own review read come too
 * (`run-documents.mjs`).
 *
 * @typedef {import('./review-runs.mjs').ReviewInputs} ReviewInputs
 * @typedef {import('../ports/pull-requests.mjs').PullRequestFacts} PullRequestFacts
 * @typedef {import('../../domain/config/skraft-config.mjs').Component} Component
 * @typedef {import('./run-documents.mjs').RunDeps} InputDeps
 * @typedef {{
 *   slug: string, pullRequest: PullRequestFacts, base: ReviewInputs['base'], components: Component[],
 *   declared: Record<string, 'required' | 'optional'>, workingCopyName: string,
 *   committed: import('../ports/workspace.mjs').ConfigSource,
 *   workflow: import('../../domain/workflow/workflow.mjs').Workflow, phase: string,
 * }} InputFacts
 *   components: those of skraft-config.json; declared: the inputs the review reads; committed:
 *   the files as the pull request's base holds them, where the decision records are read;
 *   workflow and phase: the pipeline that calls the review, and the phase of that call.
 */

/** Whether the base holds any of the project's rule files, its decision records' index included. @param {InputFacts['committed']} committed */
const holdsRules = async (committed) => (await Promise.all(RULE_FILES.map((path) => committed.read(path)))).some((text) => text !== null)

/**
 * The inputs the review declares, each the pull request has.
 * @param {InputDeps} deps @param {InputFacts} facts @returns {Promise<ReviewInputs>}
 */
export const pullRequestInputs = async (deps, facts) => {
  const all = {
    base: facts.base,
    story: { issue: facts.pullRequest.number, title: null },
    documents: 'documents' in facts.declared ? await documentsOf(deps, facts) : undefined,
    components: (await componentsOf(deps, facts)).map((component) => ({ ...component, gates: [] })),
  }
  return /** @type {ReviewInputs} */ (Object.fromEntries(Object.entries(all).filter(([name]) => name in facts.declared)))
}

/**
 * The pull request's body, kept beside the review, the documents of the run that opened it, and
 * the decision records the review reads as a project rule; none when it has none of them.
 * @param {InputDeps} deps @param {InputFacts} facts
 * @returns {Promise<import('./review-runs.mjs').ReviewDocuments | undefined>}
 */
const documentsOf = async (deps, facts) => {
  const { slug, pullRequest, committed } = facts
  const told = pullRequest.body.trim() !== ''
  const run = await runDocuments(deps, { slug, number: pullRequest.number, head: pullRequest.head.sha, workflow: facts.workflow, phase: facts.phase })
  if (!told && run === null && !(await holdsRules(committed))) return undefined
  if (told) await deps.reviewFiles.write(slug, PULL_REQUEST_FILE, pullRequestText(pullRequest))
  // Stryker disable next-line ArrayDeclaration: the review hands a lens only the documents the tracking folder holds
  const artifacts = told ? [PULL_REQUEST_FILE] : []
  return withRun(artifacts, run)
}

/**
 * The pull request's own documents, then the run's.
 * @param {string[]} artifacts @param {import('./review-runs.mjs').ReviewDocuments | null} run
 * @returns {import('./review-runs.mjs').ReviewDocuments}
 */
const withRun = (artifacts, run) => {
  // Stryker disable next-line ArrayDeclaration: the review hands a lens only the documents the tracking folder holds
  if (run === null) return { outputs: [], context: artifacts, artifacts, phases: [] }
  return { outputs: run.outputs, context: [...artifacts, ...run.context], artifacts: [...artifacts, ...run.artifacts], phases: run.phases }
}

/**
 * The components of skraft-config.json; without any, those `skraft init` would detect, with the
 * defaults the file would give them.
 * @param {InputDeps} deps @param {InputFacts} facts @returns {Promise<Component[]>}
 */
const componentsOf = async ({ workspace }, { components, workingCopyName }) => {
  if (components.length > 0) return components
  // Stryker disable next-line ArrayDeclaration: a listed component without a root or a name holds back no project
  const detected = await newComponents(workspace, ['.'], [], workingCopyName)
  return /** @type {{ config: { components: Component[] } }} */ (readConfig(writeConfig({}, detected))).config.components
}
