/**
 * A call node (shape=house) runs another workflow, the review it holds, and leaves by the verdict
 * that review returns. The called workflow declares its inputs as graph attributes
 * (`input_<name>="required"` or `"optional"`); the call binds each one by name to a value the run
 * holds, or to the one its `with_<name>=` names.
 *
 * @typedef {import('./workflow.mjs').Workflow} Workflow
 * @typedef {import('./workflow.mjs').WorkflowNode} WorkflowNode
 */

/** What a run holds that a call binds an input to. */
export const RUN_VALUES = Object.freeze(['base', 'head', 'story', 'documents', 'components'])

/** What a review cannot run without: the changes from base to head. */
const CHANGES = Object.freeze(['base', 'head'])

/** @param {boolean} broken @param {string} reason @returns {string[]} */
const when = (broken, reason) => (broken ? [reason] : [])

/**
 * What keeps a workflow from being called: a call of its own, or anything else than one review
 * from its start to its exit, with no NEEDS_REWORK edge.
 * @param {string} file @param {Workflow} called a workflow read as called
 * @returns {string[]}
 */
export const calledReasons = (file, called) => {
  const working = Object.values(called.nodes).filter(({ kind }) => kind !== 'start' && kind !== 'exit')
  const calls = working.filter(({ kind }) => kind === 'call')
  if (calls.length > 0) return calls.map(({ id, call }) => `${file}: node ${id} calls ${/** @type {NonNullable<WorkflowNode['call']>} */ (call).workflow}; a called workflow calls no other workflow`)
  const broken = working.length !== 1 || working[0].kind !== 'review' || called.edges.some(({ label }) => label === 'NEEDS_REWORK')
  return when(broken, `${file} must run one review, start -> fan-out -> lens nodes -> fan-in -> exit, with no NEEDS_REWORK edge: the calling node carries it`)
}

/**
 * The value of the run each input of the called workflow is bound to, by input; refused: a
 * `with_` that names no input, a required input left unbound, changes not bound from base to head.
 * @param {WorkflowNode} node a call node @param {Workflow} called
 * @returns {{ inputs: Record<string, string>, errors: string[] }}
 */
export const bindInputs = (node, called) => {
  const given = /** @type {NonNullable<WorkflowNode['call']>} */ (node.call)
  const inputs = Object.fromEntries(Object.keys(called.inputs).flatMap((input) => boundTo(given.with, input)))
  return { inputs, errors: bindingReasons(node, called, inputs) }
}

/**
 * @param {WorkflowNode} node a call node @param {Workflow} called
 * @param {Record<string, string>} inputs the run value each input is bound to
 */
const bindingReasons = ({ id, call }, called, inputs) => {
  const { workflow, with: given } = /** @type {NonNullable<WorkflowNode['call']>} */ (call)
  const unbound = Object.entries(called.inputs).filter(([input, need]) => need === 'required' && !(input in inputs)).map(([input]) => input)
  const missing = CHANGES.filter((value) => !Object.values(inputs).includes(value))
  return [
    ...Object.keys(given).filter((input) => !(input in called.inputs)).map((input) => `node ${id}: with_${input} binds no input of ${workflow}`),
    ...unbound.map((input) => `node ${id}: ${workflow} needs input ${input}; bind it with with_${input}="<${RUN_VALUES.join(' | ')}>"`),
    ...when(missing.length > 0, `node ${id}: ${workflow} binds no input to ${missing.join(', ')}; a review reads the changes from base to head`),
  ]
}

/** @param {Record<string, string>} given the call's with_ bindings @param {string} input @returns {Array<[string, string]>} */
const boundTo = (given, input) => {
  const value = given[input] ?? (RUN_VALUES.includes(input) ? input : null)
  return value === null ? [] : [[input, value]]
}

/**
 * The call node with the review of the workflow it calls: its fan-out, branches and lenses, the
 * families its fan-in names, and its fan-in.
 * @param {WorkflowNode} node a call node @param {Workflow} called a workflow `calledReasons` accepts
 * @param {Record<string, string>} inputs as `bindInputs` binds them
 * @returns {WorkflowNode}
 */
export const foldCall = (node, called, inputs) => {
  const review = /** @type {WorkflowNode} */ (Object.values(called.nodes).find(({ kind }) => kind === 'review'))
  const call = /** @type {NonNullable<WorkflowNode['call']>} */ (node.call)
  const { fanOut, branches, lenses, model, refuter } = review
  return { ...node, fanOut, branches, lenses, model, refuter, call: { ...call, inputs, fanIn: review.id, mandatory: review.mandatory } }
}
