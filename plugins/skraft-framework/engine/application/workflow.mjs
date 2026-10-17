import { CONFIG_FILE, readConfig, writeWorkflow } from '../domain/config/skraft-config.mjs'
import { diffWorkflows, stampVersion } from '../domain/workflow/workflow.mjs'
import { BUILT_IN, loadWorkflow, readWorkflows } from './load-workflow.mjs'

/**
 * @typedef {Omit<import('./load-workflow.mjs').WorkflowDeps, 'workspace'> & { workspace: import('./ports/workspace.mjs').Workspace }} WorkflowCommandDeps
 * @typedef {{ ok: boolean, path: string, reason: string }} EjectOutcome
 * @typedef {{ ok: boolean, name: string, errors: string[], unlocked: Array<{ node: string, reason: string }>, reason: string }} CheckOutcome
 * @typedef {{ ok: boolean, name: string, changes: string[], reason: string }} DiffOutcome
 */

/** Where `skraft workflow eject` copies the plugin's workflow, relative to the working copy. */
export const WORKFLOW_FILE = 'skraft-workflow.dot'

/**
 * The `skraft workflow` commands: copy the plugin's workflow into the repository, check the
 * workflow a run would follow, compare the repository's with the plugin's.
 * @param {WorkflowCommandDeps} deps
 */
export const createWorkflowCommands = (deps) => Object.freeze({
  /** @param {{ pluginVersion: string }} request @returns {Promise<EjectOutcome>} */
  eject: (request) => ejectWorkflow(deps, request),
  /** @returns {Promise<CheckOutcome>} */
  check: () => checkWorkflow(deps),
  /** @param {{ pluginVersion: string }} request @returns {Promise<DiffOutcome>} */
  diff: (request) => diffWorkflow(deps, request),
})

/** @param {WorkflowCommandDeps} deps @param {{ pluginVersion: string }} request @returns {Promise<EjectOutcome>} */
const ejectWorkflow = async (deps, { pluginVersion }) => {
  const reading = readConfig(await deps.workspace.read(CONFIG_FILE))
  if (!reading.ok) return { ok: false, path: WORKFLOW_FILE, reason: invalidConfig(reading.errors) }
  const refusal = await ejectRefusal(deps, reading.config.workflow)
  if (refusal !== null) return refusal
  await deps.workspace.write(WORKFLOW_FILE, stampVersion(await deps.workflowSource.builtIn(), pluginVersion))
  await deps.workspace.write(CONFIG_FILE, writeWorkflow(reading.raw, WORKFLOW_FILE))
  return { ok: true, path: WORKFLOW_FILE, reason: `${WORKFLOW_FILE} holds the skraft ${pluginVersion} workflow and ${CONFIG_FILE} designates it` }
}

/**
 * @param {WorkflowCommandDeps} deps @param {string | null} designated the workflow the configuration designates
 * @returns {Promise<EjectOutcome | null>} null when nothing stands in the way of the copy
 */
const ejectRefusal = async (deps, designated) => {
  if (designated !== null) return { ok: false, path: designated, reason: `${CONFIG_FILE} already designates ${designated}; edit that file` }
  if ((await deps.workspace.read(WORKFLOW_FILE)) !== null) {
    return { ok: false, path: WORKFLOW_FILE, reason: `${WORKFLOW_FILE} already exists; designate it with "workflow": "${WORKFLOW_FILE}" in ${CONFIG_FILE}, or remove it` }
  }
  return null
}

/** @param {WorkflowCommandDeps} deps @returns {Promise<CheckOutcome>} */
const checkWorkflow = async (deps) => {
  const reading = readConfig(await deps.workspace.read(CONFIG_FILE))
  if (!reading.ok) return { ok: false, name: CONFIG_FILE, errors: reading.errors, unlocked: [], reason: invalidConfig(reading.errors) }
  const loaded = await loadWorkflow(deps, { config: reading.config })
  if (!loaded.ok) return { ok: false, name: loaded.name, errors: loaded.errors, unlocked: [], reason: loaded.reason }
  const skipped = loaded.unlocked.map(({ node, reason }) => `; ${node} is unlocked and skipped: ${reason}`).join('')
  return { ok: true, name: loaded.name, errors: [], unlocked: loaded.unlocked, reason: `${loaded.name} is valid: phases ${loaded.workflow.phases.join(', ')}${skipped}` }
}

/** @param {WorkflowCommandDeps} deps @param {{ pluginVersion: string }} request @returns {Promise<DiffOutcome>} */
const diffWorkflow = async (deps, { pluginVersion }) => {
  const reading = readConfig(await deps.workspace.read(CONFIG_FILE))
  if (!reading.ok) return { ok: false, name: CONFIG_FILE, changes: [], reason: invalidConfig(reading.errors) }
  if (reading.config.workflow === null) {
    return { ok: false, name: BUILT_IN, changes: [], reason: `${CONFIG_FILE} designates no workflow; the plugin's runs as shipped (skraft workflow eject copies it)` }
  }
  const { name, builtIn, read } = await readWorkflows(deps, reading.config)
  if (!read.ok) return { ok: false, name, changes: [], reason: `${name} is invalid: ${read.errors.join('; ')}` }
  return diffOutcome(name, diffWorkflows(builtIn, read.workflow), read.workflow.skraftVersion, pluginVersion)
}

/**
 * @param {string} name @param {string[]} changes the repository workflow's changes to the plugin's
 * @param {string | null} from the skraft_version it carries @param {string} pluginVersion
 * @returns {DiffOutcome}
 */
const diffOutcome = (name, changes, from, pluginVersion) => {
  const counted = `${changes.length} changes from the skraft ${pluginVersion} workflow`
  if (from === pluginVersion) return { ok: true, name, changes, reason: `${name}: ${counted}` }
  return {
    ok: true,
    name,
    changes: [`skraft_version ${from ?? 'none'} → ${pluginVersion}`, ...changes],
    reason: `${name} carries skraft_version ${from ?? 'none'}, this plugin is ${pluginVersion}; ${counted}`,
  }
}

/** @param {string[]} errors */
const invalidConfig = (errors) => `${CONFIG_FILE} is invalid: ${errors.join('; ')}`
