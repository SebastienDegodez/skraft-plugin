import { CONFIG_FILE, LOCAL_CONFIG_FILE, readConfig } from '../../domain/config/skraft-config.mjs'
import { diffWorkflows, stampVersion } from '../../domain/workflow/workflow.mjs'
import { loadWorkflow, readWorkflows, WORKFLOW_FILE } from './load-workflow.mjs'
import { ejectedPath } from './called-workflows.mjs'
import { maskedFamilies } from './masked-families.mjs'

/**
 * @typedef {Omit<import('./load-workflow.mjs').WorkflowDeps, 'workspace'> & { workspace: import('../ports/workspace.mjs').Workspace }} WorkflowCommandDeps
 * @typedef {{ ok: boolean, path: string, reason: string }} EjectOutcome
 * @typedef {{ ok: boolean, name: string, errors: string[], unlocked: Array<{ node: string, reason: string }>, warnings: string[], reason: string }} CheckOutcome
 *   warnings: the families the workflow names that an agent rule of skraft-config.json or
 *   skraft-config.local.json masks.
 * @typedef {{ ok: boolean, name: string, changes: string[], reason: string }} DiffOutcome
 * @typedef {import('../../domain/workflow/workflow.mjs').Workflow} Workflow
 */

export { WORKFLOW_FILE }

/** The plugin's review workflow, which `skraft workflow eject review` copies. */
export const REVIEW = 'review'

/**
 * The `skraft workflow` commands: copy the plugin's workflow into the repository, check the
 * workflow a run would follow, compare the repository's with the plugin's.
 * @param {WorkflowCommandDeps} deps
 */
export const createWorkflowCommands = (deps) => Object.freeze({
  /** @param {{ pluginVersion: string, workflow?: 'review' }} request review: copy review.skraft.dot alone @returns {Promise<EjectOutcome>} */
  eject: (request) => (request.workflow === 'review' ? ejectReview(deps, request) : ejectWorkflow(deps, request)),
  /** @returns {Promise<CheckOutcome>} */
  check: () => checkWorkflow(deps),
  /** @param {{ pluginVersion: string }} request @returns {Promise<DiffOutcome>} */
  diff: (request) => diffWorkflow(deps, request),
})

/** @param {WorkflowCommandDeps} deps @param {{ pluginVersion: string }} request @returns {Promise<EjectOutcome>} */
const ejectWorkflow = async (deps, { pluginVersion }) => ejectCopy(deps, WORKFLOW_FILE, {
  text: await deps.workflowSource.builtIn(), pluginVersion, follows: 'pipeline; the run follows it',
})

/** @param {WorkflowCommandDeps} deps @param {{ pluginVersion: string }} request @returns {Promise<EjectOutcome>} */
const ejectReview = async (deps, { pluginVersion }) => ejectCopy(deps, ejectedPath(REVIEW), {
  text: /** @type {string} */ (await deps.workflowSource.called(REVIEW)), pluginVersion, follows: `${REVIEW}; every call to ${REVIEW} runs it`,
})

/**
 * The plugin's workflow, stamped, at its path in `.skraft/`; never over a copy already there.
 * @param {WorkflowCommandDeps} deps @param {string} path
 * @param {{ text: string, pluginVersion: string, follows: string }} copy follows: what the copy is and who runs it
 * @returns {Promise<EjectOutcome>}
 */
const ejectCopy = async (deps, path, { text, pluginVersion, follows }) => {
  if ((await deps.workspace.read(path)) !== null) return { ok: false, path, reason: `${path} already exists; edit it, or remove it` }
  await deps.workspace.write(path, stampVersion(text, pluginVersion))
  return { ok: true, path, reason: `${path} holds the skraft ${pluginVersion} ${follows}` }
}

/** @param {WorkflowCommandDeps} deps @returns {Promise<CheckOutcome>} */
const checkWorkflow = async (deps) => {
  const reading = readConfig(await deps.workspace.read(CONFIG_FILE), await deps.workspace.read(LOCAL_CONFIG_FILE))
  if (!reading.ok) return { ok: false, name: CONFIG_FILE, errors: reading.errors, unlocked: [], warnings: [], reason: invalidConfig(reading.errors) }
  const loaded = await loadWorkflow(deps, {})
  if (!loaded.ok) return { ok: false, name: loaded.name, errors: loaded.errors, unlocked: [], warnings: [], reason: loaded.reason }
  const skipped = loaded.unlocked.map(({ node, reason }) => `; ${node} is unlocked and skipped: ${reason}`).join('')
  const warnings = maskedFamilies(reading.config, loaded.workflow)
  const names = [loaded.name, ...ownCalled(loaded.workflow).map(([, { path }]) => path)]
  return { ok: true, name: loaded.name, errors: [], unlocked: loaded.unlocked, warnings, reason: `${names.join(' and ')} ${names.length > 1 ? 'are' : 'is'} valid: phases ${loaded.workflow.phases.join(', ')}${skipped}` }
}

/**
 * The workflows of the working copy the workflow calls, by file.
 * @param {Workflow} workflow @returns {Array<[string, { path: string, workflow: Workflow }]>}
 */
const ownCalled = (workflow) => /** @type {Array<[string, { path: string, workflow: Workflow }]>} */ (Object.entries(workflow.called).filter(([, { path }]) => path !== null))

/** @param {WorkflowCommandDeps} deps @param {{ pluginVersion: string }} request @returns {Promise<DiffOutcome>} */
const diffWorkflow = async (deps, { pluginVersion }) => {
  const { name, builtIn, read } = await readWorkflows(deps)
  if (!read.ok) return { ok: false, name, changes: [], reason: `${name} is invalid: ${read.errors.join('; ')}` }
  const called = ownCalled(read.workflow).map(([file, own]) => calledDiff(builtIn.called[file]?.workflow, own, pluginVersion))
  const ejected = name === WORKFLOW_FILE
  if (!ejected && called.length === 0) return { ok: false, name, changes: [], reason: NOTHING_EJECTED }
  const own = ejected ? [fileDiff(name, diffWorkflows(builtIn, read.workflow), read.workflow.skraftVersion, pluginVersion)] : []
  return outcomeOf(name, [...own, ...called])
}

const NOTHING_EJECTED = `the working copy has neither ${WORKFLOW_FILE} nor ${ejectedPath(REVIEW)}; the plugin's run as shipped (skraft workflow eject [review] copies them)`

/** @typedef {{ changes: string[], reason: string }} FileDiff */

/** @param {string} name @param {FileDiff[]} diffs @returns {DiffOutcome} */
const outcomeOf = (name, diffs) => ({ ok: true, name, changes: diffs.flatMap(({ changes }) => changes), reason: diffs.map(({ reason }) => reason).join('; ') })

/**
 * A called workflow of the working copy against the plugin's of the same file, each change
 * prefixed with its path.
 * @param {Workflow | undefined} shipped @param {{ path: string, workflow: Workflow }} own @param {string} pluginVersion
 * @returns {FileDiff}
 */
const calledDiff = (shipped, { path, workflow }, pluginVersion) => {
  if (shipped === undefined) return { changes: [`+ workflow ${path}`], reason: `${path}: no workflow of the plugin to compare with` }
  const { changes, reason } = fileDiff(path, diffWorkflows(shipped, workflow), workflow.skraftVersion, pluginVersion)
  return { changes: changes.map((change) => `${path}: ${change}`), reason }
}

/**
 * @param {string} name @param {string[]} changes the repository file's changes to the plugin's
 * @param {string | null} from the skraft_version it carries @param {string} pluginVersion
 * @returns {FileDiff}
 */
const fileDiff = (name, changes, from, pluginVersion) => {
  const counted = `${changes.length} changes from the skraft ${pluginVersion} workflow`
  if (from === pluginVersion) return { changes, reason: `${name}: ${counted}` }
  return {
    changes: [`skraft_version ${from ?? 'none'} → ${pluginVersion}`, ...changes],
    reason: `${name} carries skraft_version ${from ?? 'none'}, this plugin is ${pluginVersion}; ${counted}`,
  }
}

/** @param {string[]} errors */
const invalidConfig = (errors) => `${CONFIG_FILE} is invalid: ${errors.join('; ')}`
