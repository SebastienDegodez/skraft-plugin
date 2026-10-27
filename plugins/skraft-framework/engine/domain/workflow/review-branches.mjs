/**
 * A review as a workflow writes it: a fan-out (shape=component) whose every branch holds one
 * lens node (shape=note) and ends in the same fan-in (shape=tripleoctagon). The fan-in is the
 * review step the run follows: it refutes, computes the verdict and carries the APPROVED and
 * NEEDS_REWORK edges; its lenses are read from the branches.
 *
 * @typedef {import('./workflow.mjs').WorkflowNode} WorkflowNode
 * @typedef {import('./workflow.mjs').WorkflowEdge} WorkflowEdge
 * @typedef {import('./workflow.mjs').Branch} Branch
 * @typedef {Record<string, WorkflowNode>} Nodes
 */

/** The nodes a review folds into its fan-in. */
const FOLDED = Object.freeze(['fan-out', 'lens'])

/** The lenses the engine gave a trigger before a workflow named it, with that trigger. */
const FORMER_TRIGGERS = Object.freeze({ __proto__: null, 'mock-fidelity': 'mock', 'contract-fidelity': 'contract' })

/** @param {Nodes} nodes @param {string} id */
const kindOf = (nodes, id) => nodes[id]?.kind

/** @param {boolean} broken @param {string} reason @returns {string[]} */
const when = (broken, reason) => (broken ? [reason] : [])

/** @param {string} name a lens name @param {string} review the fan-in id */
const lensNodeId = (name, review) => `${review}_${name.replaceAll('-', '_')}`

/**
 * Each review node written with the old `lenses=` attribute, and what replaces it: the plugin's
 * call when the plugin's pipeline calls a workflow from that node, else the nodes and edges of a
 * fan-out and a fan-in.
 * @param {import('./dot.mjs').DotGraph} graph @param {Record<string, string>} calls the workflow
 *   each call node of the plugin's pipeline calls, by node id
 * @returns {string[]}
 */
export const formerReviewReasons = (graph, calls) => graph.nodes
  .filter(({ attributes }) => 'lenses' in attributes)
  .map(({ id, attributes }) => (Object.hasOwn(calls, id) ? callMigrationOf(id, attributes, calls[id]) : migrationOf(id, attributes, graph.edges)))

/** @param {string} id @param {Record<string, string>} attributes @param {string} workflow the workflow the plugin's node calls */
const callMigrationOf = (id, attributes, workflow) => {
  const families = ['model', 'refuter'].filter((key) => key in attributes).map((key) => `${key}="${attributes[key]}"`)
  return [
    `node ${id}: lenses="${attributes.lenses}" is the former review form, no longer read; replace node ${id} with the plugin's call:`,
    `${id} [shape=house, workflow="${workflow}"${movedOf(attributes, ['label', 'phase'])}];`,
    `keep the edges entering and leaving ${id}; its lenses live in ${workflow}: skraft workflow eject ${workflow} copies it into .skraft/${workflow}.skraft.dot${families.length === 0 ? '' : `, where its fan-in takes ${families.join(' and ')}`};`,
    `the plugin's mandatory=true stays on ${id}`,
  ].join(' ')
}

/** @param {string} id @param {Record<string, string>} attributes @param {import('./dot.mjs').DotEdge[]} edges the graph's */
const migrationOf = (id, attributes, edges) => {
  const lenses = attributes.lenses.split(',').map((spec) => lensNodeOf(id, spec.trim()))
  return [
    `node ${id}: lenses="${attributes.lenses}" is the former review form, no longer read; replace node ${id} with:`,
    `${id}_lenses [shape=component];`,
    ...lenses.map(({ node }) => `${node};`),
    `${id} [shape=tripleoctagon${movedOf(attributes, ['label', 'phase', 'model', 'refuter'])}];`,
    ...edges.filter((edge) => edge.to === id).map((edge) => `${edge.from} -> ${id}_lenses${attributesOf(edge.attributes)};`),
    ...lenses.map(({ lensId }) => `${id}_lenses -> ${lensId} -> ${id};`),
    `keep the edges leaving ${id}; the plugin's mandatory=true stays on ${id}`,
  ].join(' ')
}

/** @param {string} review @param {string} spec */
const lensNodeOf = (review, spec) => {
  const [name, model] = spec.split('@')
  const trigger = FORMER_TRIGGERS[name]
  const lensId = lensNodeId(name, review)
  return { lensId, node: `${lensId} [shape=note, lens="${name}"${model === undefined ? '' : `, model="${model}"`}${trigger === undefined ? '' : `, when="${trigger}"`}]` }
}

/** What the former review node set that the node replacing it takes. @param {Record<string, string>} attributes @param {string[]} keys */
const movedOf = (attributes, keys) => keys.filter((key) => key in attributes).map((key) => `, ${key}="${attributes[key]}"`).join('')

/** An edge's attributes as DOT, none when it has none. @param {Record<string, string>} attributes */
const attributesOf = (attributes) => {
  const listed = Object.entries(attributes).map(([key, value]) => `${key}="${value}"`)
  return listed.length === 0 ? '' : ` [${listed.join(', ')}]`
}

/**
 * Every fan-out leads each branch through one lens node to one fan-in, each lens once; a fan-in
 * is entered by the lens nodes of one fan-out only.
 * @param {{ nodes: Nodes, edges: WorkflowEdge[] }} draft @returns {string[]}
 */
export const branchReasons = ({ nodes, edges }) => Object.values(nodes).flatMap((node) => BRANCH_CHECKS[node.kind]?.(node, nodes, edges) ?? [])

/** @param {WorkflowNode} node @param {Nodes} nodes @param {WorkflowEdge[]} edges */
const fanOutReasons = (node, nodes, edges) => {
  const out = edges.filter((edge) => edge.from === node.id)
  const lenses = out.filter((edge) => kindOf(nodes, edge.to) === 'lens').map((edge) => nodes[edge.to])
  return [
    ...when(out.length === 0, `node ${node.id}: a fan-out needs one branch per lens, has none`),
    ...out.filter((edge) => kindOf(nodes, edge.to) !== 'lens').map((edge) => `edge ${node.id} -> ${edge.to}: each branch of a fan-out holds exactly one lens node (shape=note), then the fan-in`),
    ...fanInsReasons(node, lenses, edges, nodes),
    ...twiceReasons(node, lenses),
  ]
}

/** @param {WorkflowNode} node a fan-out @param {WorkflowNode[]} lenses its lens nodes @param {WorkflowEdge[]} edges @param {Nodes} nodes */
const fanInsReasons = (node, lenses, edges, nodes) => {
  const ends = [...new Set(lenses.flatMap((lens) => edges.filter((edge) => edge.from === lens.id && kindOf(nodes, edge.to) === 'review').map((edge) => edge.to)))]
  return when(ends.length > 1, `node ${node.id}: its branches end in ${ends.join(', ')}; every branch of a fan-out ends in the same fan-in`)
}

/** @param {WorkflowNode} node a fan-out @param {WorkflowNode[]} lenses its lens nodes */
const twiceReasons = (node, lenses) => {
  const names = lenses.flatMap((lens) => lens.lenses).map(nameOf)
  return [...new Set(names.filter((name, index) => names.indexOf(name) !== index))].map((name) => `node ${node.id}: lens ${name} runs twice; a lens runs at most once per review`)
}

/** The lens a spec names, readable or not (its node's error says so). @param {string} spec */
const nameOf = (spec) => spec.split('@')[0]

/** @param {WorkflowNode} node @param {Nodes} nodes @param {WorkflowEdge[]} edges */
const lensReasons = (node, nodes, edges) => {
  const into = edges.filter((edge) => edge.to === node.id)
  const out = edges.filter((edge) => edge.from === node.id)
  return [
    ...when(into.length !== 1 || kindOf(nodes, into[0].from) !== 'fan-out', `node ${node.id}: a lens node is entered by exactly one edge, from a fan-out (shape=component)`),
    ...lensExitReasons(node, out, nodes),
  ]
}

/** A lens node with one way out (oneOutgoing counts them) takes it to a fan-in. @param {WorkflowNode} node @param {WorkflowEdge[]} out @param {Nodes} nodes */
const lensExitReasons = (node, out, nodes) => {
  if (out.length !== 1 || kindOf(nodes, out[0].to) === 'review') return []
  return [`node ${node.id}: a lens node leads to its review's fan-in (shape=tripleoctagon), not to ${out[0].to}`]
}

/** @param {WorkflowNode} node @param {Nodes} nodes @param {WorkflowEdge[]} edges */
const fanInReasons = (node, nodes, edges) => {
  const into = edges.filter((edge) => edge.to === node.id)
  const strangers = into.filter((edge) => kindOf(nodes, edge.from) !== 'lens').map((edge) => edge.from)
  const fanOuts = [...new Set(into.flatMap((edge) => edges.filter((other) => other.to === edge.from && kindOf(nodes, other.from) === 'fan-out').map((other) => other.from)))]
  return [
    ...when(strangers.length > 0, `node ${node.id}: a fan-in is entered only by the lens nodes of one fan-out, not by ${strangers.join(', ')}`),
    ...when(fanOuts.length > 1, `node ${node.id}: its lens nodes come from ${fanOuts.join(', ')}; a fan-in closes one fan-out`),
  ]
}

/** @type {Readonly<Record<string, (node: WorkflowNode, nodes: Nodes, edges: WorkflowEdge[]) => string[]>>} */
const BRANCH_CHECKS = Object.freeze({ __proto__: null, 'fan-out': fanOutReasons, lens: lensReasons, review: fanInReasons })

/**
 * The graph the run follows: each review folded into its fan-in, its lenses read from its
 * branches in the fan-out's edge order; an edge into a fan-out enters the fan-in instead.
 * @param {Nodes} nodes @param {WorkflowEdge[]} edges a graph `branchReasons` accepts
 * @returns {{ nodes: Nodes, edges: WorkflowEdge[] }}
 */
export const foldReviews = (nodes, edges) => {
  const kept = Object.values(nodes).filter((node) => !FOLDED.includes(node.kind))
  return {
    nodes: Object.fromEntries(kept.map((node) => [node.id, node.kind === 'review' ? fanInOf(node, nodes, edges) : node])),
    edges: edges.filter((edge) => !FOLDED.includes(nodes[edge.from].kind)).map((edge) => enteringFanIn(edge, nodes, edges)),
  }
}

/** @param {WorkflowNode} node a fan-in @param {Nodes} nodes @param {WorkflowEdge[]} edges @returns {WorkflowNode} */
const fanInOf = (node, nodes, edges) => {
  const lens = /** @type {WorkflowEdge} */ (edges.find((edge) => edge.to === node.id)).from
  const fanOut = /** @type {WorkflowEdge} */ (edges.find((edge) => edge.to === lens)).from
  const branches = edges.filter((edge) => edge.from === fanOut).map((edge) => branchOf(nodes[edge.to]))
  return { ...node, fanOut, branches, lenses: branches.map((branch) => branch.lens) }
}

/** @param {WorkflowNode} lens @returns {Branch} */
const branchOf = (lens) => ({ id: lens.id, lens: lens.lenses[0], when: /** @type {Branch['when']} */ (lens.when), mandatory: lens.mandatory })

/** @param {WorkflowEdge} edge @param {Nodes} nodes @param {WorkflowEdge[]} edges */
const enteringFanIn = (edge, nodes, edges) => {
  if (nodes[edge.to].kind !== 'fan-out') return edge
  const lens = /** @type {WorkflowEdge} */ (edges.find((other) => other.from === edge.to)).to
  return { ...edge, to: /** @type {WorkflowEdge} */ (edges.find((other) => other.from === lens)).to }
}
