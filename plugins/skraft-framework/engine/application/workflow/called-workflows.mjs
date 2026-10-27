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

/** Where the working copy keeps the workflows it ejected. */
export const EJECTED = '.skraft'

/** The working-copy path of the ejected workflow of that name. @param {string} name */
export const ejectedPath = (name) => `${EJECTED}/${name}.skraft.dot`

/**
 * The workflow with each call node holding the review of the workflow it calls by name, read from
 * `.skraft/<name>.skraft.dot` in the working copy, else from the plugin; refused with what keeps a
 * call from running.
 * @param {WorkflowFiles} deps @param {Reading} read
 * @returns {Promise<Reading>}
 */
export const withCalls = async (deps, read) => {
  if (!read.ok) return read
  const calls = Object.values(read.workflow.nodes).filter(({ kind }) => kind === 'call')
  const resolved = await Promise.all(calls.map((node) => resolveCall(deps, node)))
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

/** @param {WorkflowFiles} deps @param {WorkflowNode} node @returns {Promise<Resolved>} */
const resolveCall = async (deps, node) => {
  const file = /** @type {NonNullable<WorkflowNode['call']>} */ (node.call).workflow
  const found = await calledText(deps, file)
  if (found === null) return { errors: [`node ${node.id}: workflow ${file} is found neither at ${ejectedPath(file)} nor in the plugin's workflows/`] }
  const shown = found.path ?? `${file}.skraft.dot`
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
 * @param {WorkflowFiles} deps @param {string} name
 * @returns {Promise<{ path: string | null, text: string } | null>}
 */
const calledText = async ({ workspace, workflowSource }, name) => {
  const own = await workspace.read(ejectedPath(name))
  if (own !== null) return { path: ejectedPath(name), text: own }
  const shipped = await workflowSource.called(name)
  return shipped === null ? null : { path: null, text: shipped }
}
