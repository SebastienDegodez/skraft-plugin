import { reachesExitWithout } from './workflow.mjs'

/**
 * The mandatory nodes of the plugin's workflow a repository workflow drops or breaks. Unlike a
 * locked node, nothing lets a repository skip one: what the plugin's workflow marks counts, the
 * repository copy's `mandatory=` changes nothing.
 *
 * @typedef {import('./workflow.mjs').Workflow} Workflow
 * @typedef {import('./workflow.mjs').WorkflowNode} WorkflowNode
 * @typedef {import('./workflow.mjs').Branch} Branch
 */

const MANDATORY = 'this node is mandatory and cannot be removed'

/** @param {string} id @param {string} what */
const refusal = (id, what) => `mandatory node ${id} ${what}; ${MANDATORY}`

/** @param {boolean} broken @param {string} reason @returns {string[]} */
const when = (broken, reason) => (broken ? [reason] : [])

/** @param {string} spec a lens spec, `<lens>` or `<lens>@<family>` */
const lensOf = (spec) => spec.split('@')[0]

/**
 * A kept mandatory review stays a fan-in on every path from the start and from the agents of its
 * phase to the exit that the plugin's workflow holds it on, with its NEEDS_REWORK edge back to an
 * agent of the plugin's phase; a kept mandatory
 * lens stays between the same fan-out and fan-in, runs the same lens, on every review.
 * @param {Workflow} builtIn @param {Workflow} custom
 * @returns {string[]}
 */
export const checkMandatory = (builtIn, custom) => Object.values(builtIn.nodes).flatMap((node) => [
  ...(node.mandatory === true ? reviewReasons(builtIn, custom, node) : []),
  ...node.branches.filter((branch) => branch.mandatory === true).flatMap((branch) => lensReasons(custom, node, branch)),
])

/** What a mandatory review of the plugin's workflow is, by its kind. @type {Readonly<Record<string, string>>} */
const SHAPES = Object.freeze({ __proto__: null, review: 'a review fan-in (shape=tripleoctagon)', call: 'a call (shape=house)' })

/** @param {Workflow} builtIn @param {Workflow} custom @param {WorkflowNode} node a mandatory review or call of the plugin's workflow */
const reviewReasons = (builtIn, custom, node) => {
  const kept = custom.nodes[node.id]
  if (kept?.kind !== node.kind) return [refusal(node.id, `is missing as ${SHAPES[node.kind]}`)]
  return [...falseFlag(kept), ...calledFanInReasons(node, kept), ...reworkReasons(custom, node), ...bypassReasons(builtIn, custom, node)]
}

/**
 * A mandatory call whose called review has a mandatory fan-in keeps that fan-in, whatever file
 * the copy calls.
 * @param {WorkflowNode} node the plugin's call @param {WorkflowNode} kept the copy's
 */
const calledFanInReasons = ({ call }, kept) => {
  if (call?.mandatory !== true) return []
  const { fanIn, mandatory, workflow } = /** @type {import('./workflow.mjs').Call} */ (kept.call)
  if (fanIn !== call.fanIn) return [refusal(/** @type {string} */ (call.fanIn), `(the fan-in of ${workflow}) is missing`)]
  return falseFlag({ id: fanIn, mandatory })
}

/** @param {Workflow} custom @param {WorkflowNode} node the plugin's review, whose phase counts */
const reworkReasons = (custom, { id, phase }) => {
  const target = custom.edges.find((edge) => edge.from === id && edge.label === 'NEEDS_REWORK')?.to
  if (target === undefined) return [refusal(id, `has no NEEDS_REWORK edge back to an agent of ${phase}`)]
  const back = custom.nodes[target]
  return back.kind === 'agent' && back.phase === phase ? [] : [refusal(id, `must send NEEDS_REWORK back to an agent of ${phase}, not to ${target}`)]
}

/**
 * The nodes the copy must not reach the exit from without the review: the start, the agent its
 * NEEDS_REWORK edge sends the work back to, and each agent of the review's phase the run only
 * reaches through the review (one added after it). A path the plugin's workflow has too is
 * kept (mutation_review runs only after kill_mutants: the start goes around it there).
 * @param {Workflow} builtIn @param {Workflow} custom @param {WorkflowNode} node the plugin's review
 */
const bypassReasons = (builtIn, custom, node) => [custom.start, ...custom.order.filter((id) => checkedAgent(custom, node, id))]
  .filter((from) => reachesExitWithout(custom, from, node.id) && !(from in builtIn.nodes && reachesExitWithout(builtIn, from, node.id)))
  .map((from) => `${from} reaches the exit without passing mandatory node ${node.id}; ${MANDATORY}`)

/** @param {Workflow} custom @param {WorkflowNode} node the plugin's review @param {string} id */
const checkedAgent = (custom, node, id) => {
  const { kind, phase } = custom.nodes[id]
  if (kind !== 'agent' || phase !== node.phase) return false
  // Stryker disable next-line LogicalOperator,ConditionalExpression: an agent of the phase an APPROVED edge leads to is reached only through the review, so it is checked either way
  return custom.edges.some((edge) => edge.from === node.id && edge.to === id && edge.label === 'NEEDS_REWORK') || !reachedWithout(custom, id, node.id)
}

/** Whether the start reaches the node by a path that avoids `avoided`. @param {Workflow} workflow @param {string} id @param {string} avoided */
const reachedWithout = (workflow, id, avoided) => {
  const seen = [workflow.start]
  for (const at of seen) {
    for (const { to } of workflow.edges.filter((edge) => edge.from === at && edge.to !== avoided && !seen.includes(edge.to))) seen.push(to)
  }
  return seen.includes(id)
}

/**
 * A mandatory lens stays a branch of the copy's node of the same id as the plugin's review (the
 * call, for a review a call runs), under the same fan-out; a lens node of the same id anywhere
 * else stands for nothing.
 * @param {Workflow} custom @param {WorkflowNode} review @param {Branch} branch a mandatory lens node of the plugin's review
 */
const lensReasons = (custom, review, branch) => {
  const lens = lensOf(branch.lens)
  const holder = custom.nodes[review.id]
  const kept = holder?.branches.find(({ id }) => id === branch.id)
  const between = betweenOf(review)
  if (kept === undefined) return [refusal(branch.id, `(lens ${lens} between ${between}) is missing`)]
  return [
    ...when(holder.fanOut !== review.fanOut, refusal(branch.id, `must stay between ${between}`)),
    ...keptLensReasons(kept, lens),
  ]
}

/** The fan-out and the fan-in of a review, in the workflow a call calls. @param {WorkflowNode} review */
const betweenOf = ({ id, fanOut, call }) => (call === null ? `${fanOut} and ${id}` : `${fanOut} and ${call.fanIn} of ${call.workflow}`)

/** @param {Branch} kept the copy's lens node @param {string} lens the lens the plugin's runs */
const keptLensReasons = (kept, lens) => [
  ...when(lensOf(kept.lens) !== lens, refusal(kept.id, `must run lens ${lens}`)),
  ...when(kept.when !== null, refusal(kept.id, 'must run on every review, without when')),
  ...falseFlag(kept),
]

/** @param {{ id: string, mandatory: boolean | null }} kept */
const falseFlag = (kept) => when(kept.mandatory === false, refusal(kept.id, 'says mandatory=false, which changes nothing'))
