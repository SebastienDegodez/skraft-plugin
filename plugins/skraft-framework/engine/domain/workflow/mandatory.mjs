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
 * A kept mandatory review stays a fan-in on every path from the start to the exit, and from the
 * agent its NEEDS_REWORK edge sends the work back to, an agent of its phase; a kept mandatory
 * lens stays between the same fan-out and fan-in, runs the same lens, on every review.
 * @param {Workflow} builtIn @param {Workflow} custom
 * @returns {string[]}
 */
export const checkMandatory = (builtIn, custom) => Object.values(builtIn.nodes).flatMap((node) => [
  ...(node.mandatory === true ? reviewReasons(custom, node) : []),
  ...node.branches.filter((branch) => branch.mandatory === true).flatMap((branch) => lensReasons(custom, node, branch)),
])

/** @param {Workflow} custom @param {WorkflowNode} node a mandatory review of the plugin's workflow */
const reviewReasons = (custom, node) => {
  const kept = custom.nodes[node.id]
  if (kept?.kind !== 'review') return [refusal(node.id, 'is missing as a review fan-in (shape=tripleoctagon)')]
  const rework = custom.edges.find((edge) => edge.from === kept.id && edge.label === 'NEEDS_REWORK')?.to
  return [...falseFlag(kept), ...reworkReasons(custom, kept, rework), ...bypassReasons(custom, kept.id, [custom.start, ...(rework === undefined ? [] : [rework])])]
}

/** @param {Workflow} custom @param {WorkflowNode} kept @param {string | undefined} target where its NEEDS_REWORK edge leads */
const reworkReasons = (custom, kept, target) => {
  if (target === undefined) return [refusal(kept.id, `has no NEEDS_REWORK edge back to an agent of ${kept.phase}`)]
  const back = custom.nodes[target]
  return back.kind === 'agent' && back.phase === kept.phase ? [] : [refusal(kept.id, `must send NEEDS_REWORK back to an agent of ${kept.phase}, not to ${target}`)]
}

/** The nodes from which the exit is reached without the review. @param {Workflow} custom @param {string} id @param {string[]} froms */
const bypassReasons = (custom, id, froms) => froms
  .filter((from) => reachesExitWithout(custom, from, id))
  .map((from) => `${from} reaches the exit without passing mandatory node ${id}; ${MANDATORY}`)

/**
 * A fan-out has one fan-in: keeping the fan-out keeps the fan-in.
 * @param {Workflow} custom @param {WorkflowNode} review @param {Branch} branch a mandatory lens node of the plugin's review
 */
const lensReasons = (custom, review, branch) => {
  const lens = lensOf(branch.lens)
  const holder = Object.values(custom.nodes).find((node) => node.branches.some(({ id }) => id === branch.id))
  if (holder === undefined) return [refusal(branch.id, `(lens ${lens} between ${review.fanOut} and ${review.id}) is missing`)]
  const kept = /** @type {Branch} */ (holder.branches.find(({ id }) => id === branch.id))
  return [
    ...when(holder.fanOut !== review.fanOut, refusal(branch.id, `must stay between ${review.fanOut} and ${review.id}`)),
    ...when(lensOf(kept.lens) !== lens, refusal(branch.id, `must run lens ${lens}`)),
    ...when(kept.when !== null, refusal(branch.id, 'must run on every review, without when')),
    ...falseFlag(kept),
  ]
}

/** @param {{ id: string, mandatory: boolean | null }} kept */
const falseFlag = (kept) => when(kept.mandatory === false, refusal(kept.id, 'says mandatory=false, which changes nothing'))
