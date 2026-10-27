import { bindInputs, calledReasons, foldCall } from '../../domain/workflow/call.mjs'
import { readWorkflow } from '../../domain/workflow/workflow.mjs'

/**
 * @typedef {import('../../domain/workflow/workflow.mjs').Workflow} Workflow
 * @typedef {import('../../domain/workflow/workflow.mjs').WorkflowNode} WorkflowNode
 * @typedef {import('./load-workflow.mjs').WorkflowFiles} WorkflowFiles
 * @typedef {ReturnType<typeof readWorkflow>} Reading
 * @typedef {{ errors: string[] } | { errors: [], node: WorkflowNode, file: string, path: string | null, called: Workflow }} Resolved
 *   path: where the working copy holds the called workflow, null for the plugin's.
 */

/**
 * The workflow with each call node holding the review of the workflow it calls, read next to it
 * in the working copy, else in the plugin; refused with what keeps a call from running.
 * @param {WorkflowFiles} deps @param {Reading} read
 * @param {string} folder where the calling workflow sits in the working copy, '/'-ended or '' for
 *   its root
 * @returns {Promise<Reading>}
 */
export const withCalls = async (deps, read, folder) => {
  if (!read.ok) return read
  const calls = Object.values(read.workflow.nodes).filter(({ kind }) => kind === 'call')
  const resolved = await Promise.all(calls.map((node) => resolveCall(deps, node, folder)))
  const errors = resolved.flatMap((entry) => entry.errors)
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, workflow: calling(read.workflow, /** @type {Array<Extract<Resolved, { node: WorkflowNode }>>} */ (resolved)) }
}

/** @param {Workflow} workflow @param {Array<Extract<Resolved, { node: WorkflowNode }>>} resolved */
const calling = (workflow, resolved) => ({
  ...workflow,
  nodes: Object.fromEntries(Object.values(workflow.nodes).map((node) => [node.id, resolved.find((entry) => entry.node.id === node.id)?.node ?? node])),
  called: Object.fromEntries(resolved.map(({ file, path, called }) => [file, { path, workflow: called }])),
})

/** @param {WorkflowFiles} deps @param {WorkflowNode} node @param {string} folder @returns {Promise<Resolved>} */
const resolveCall = async (deps, node, folder) => {
  const file = /** @type {NonNullable<WorkflowNode['call']>} */ (node.call).workflow
  const found = await calledText(deps, file, folder)
  if (found === null) return { errors: [`node ${node.id}: workflow ${file} is found neither at ${folder}${file} in the working copy nor in the plugin's workflows/`] }
  const shown = found.path ?? file
  const read = readWorkflow(found.text, { called: true })
  if (!read.ok) return { errors: read.errors.map((error) => `${shown}: ${error}`) }
  return bound(node, { file, path: found.path, called: read.workflow }, calledReasons(shown, read.workflow))
}

/**
 * @param {WorkflowNode} node @param {{ file: string, path: string | null, called: Workflow }} found
 * @param {string[]} refused what keeps the workflow from being called @returns {Resolved}
 */
const bound = (node, found, refused) => {
  if (refused.length > 0) return { errors: refused }
  const { inputs, errors } = bindInputs(node, found.called)
  return errors.length > 0 ? { errors } : { errors: [], node: foldCall(node, found.called, inputs), ...found }
}

/**
 * @param {WorkflowFiles} deps @param {string} file @param {string} folder
 * @returns {Promise<{ path: string | null, text: string } | null>}
 */
const calledText = async ({ workspace, workflowSource }, file, folder) => {
  const own = await workspace.read(`${folder}${file}`)
  if (own !== null) return { path: `${folder}${file}`, text: own }
  const shipped = await workflowSource.called(file)
  return shipped === null ? null : { path: null, text: shipped }
}

/**
 * The folder of a working-copy path, '/'-ended, '' at the root.
 * @param {string} path '/'-separated, as skraft-config.json writes it
 */
export const folderOf = (path) => path.slice(0, path.lastIndexOf('/') + 1)
