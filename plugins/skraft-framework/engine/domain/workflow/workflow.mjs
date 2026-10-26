import { isAbsolutePath } from '../config/skraft-config.mjs'
import { NODE_QUESTIONS, questionSpec } from '../decisions/questions.mjs'
import { GATE_ORDER } from '../gates/gate-plan.mjs'
import { FAMILY, readLensSpec, TRIGGER_NAMES } from '../review/lenses.mjs'
import { isKeyword, isSymbol, parseDot, tokenizeDot } from './dot.mjs'
import { branchReasons, foldReviews, formerReviewReasons } from './review-branches.mjs'

/**
 * A skraft workflow: the DOT graph read as the pipeline the engine runs, and checked before any
 * run.
 *
 * @typedef {'start' | 'exit' | 'agent' | 'gate' | 'review' | 'ask' | 'publish' | 'fan-out' | 'lens'} NodeKind
 *   review: a review's fan-in (shape=tripleoctagon); fan-out (shape=component) and lens
 *   (shape=note) nodes are folded into it (`review-branches.mjs`) and never reach a Workflow.
 * @typedef {'frontend' | import('../review/lenses.mjs').TriggerName} When
 * @typedef {{ id: string, lens: string, when: import('../review/lenses.mjs').TriggerName | null, mandatory: boolean | null }} Branch
 *   a lens node of a review: its id, its lens spec, its trigger, its mandatory= (null when it writes none).
 * @typedef {{
 *   id: string, kind: NodeKind, phase: string | null, agent: string | null, gates: string[],
 *   lenses: string[], question: import('../decisions/questions.mjs').NodeQuestion | null,
 *   goal: boolean, locked: boolean, unlock: string | null, outputs: string[], writes: string[],
 *   maxAttempts: number | null, model: string | null, refuter: string | null, each: 'survivor-file' | null,
 *   publish: Publication | null, when: When | null, fanOut: string | null, branches: Branch[],
 *   mandatory: boolean | null,
 * }} WorkflowNode
 *   phase: its own, else the phase of its first predecessor in `order`. lenses: the lenses a
 *   review node runs, each as the agent `<lens>-lens`, written `<lens>` or `<lens>@<family>`
 *   (a lens node's `model=`); fanOut and branches: the fan-out a review opens with and its
 *   lens nodes, in edge order.
 *   question: what an ask node asks a human. outputs: relative to the tracking folder (`{date}`,
 *   `{slug}` filled at dispatch); writes: relative to the working copy. model: the family an
 *   agent node's agent runs on, or a review node's lenses that name none; refuter: the family a
 *   review node's refuter runs on. each: an agent node the mutation gate sends its surviving
 *   mutants to runs its agent once per file that holds some. publish: what a publish node (a
 *   parallelogram with `publish=`) publishes: the run's pull request, or the screenshots of the
 *   e2e runs of its front ends. when: a publish node runs only when skraft-config.json has a
 *   component of that kind, and is skipped otherwise.
 * @typedef {'pull-request' | 'playwright-visuals'} Publication
 * @typedef {'PASS' | 'FAIL' | 'APPROVED' | 'NEEDS_REWORK'} EdgeLabel
 * @typedef {{ from: string, to: string, label: string | null, maxVisits: number | null }} WorkflowEdge
 *   label: PASS or FAIL on an edge leaving a gate (unlabeled means PASS), APPROVED or
 *   NEEDS_REWORK on an edge leaving a review (unlabeled means APPROVED); on an edge leaving an
 *   ask node, one of its question's answers (unlabeled: every answer but a refusal that has no
 *   edge of its own); null elsewhere.
 * @typedef {{
 *   version: string | null, skraftVersion: string | null, goal: string | null, start: string,
 *   nodes: Record<string, WorkflowNode>, order: string[], edges: WorkflowEdge[], phases: string[],
 * }} Workflow
 *   nodes in declaration order; order: breadth-first from start, edges in declaration order;
 *   phases: the distinct phases along `order`.
 */

/** @type {ReadonlyMap<string, NodeKind>} */
const KINDS = new Map([['Mdiamond', 'start'], ['Msquare', 'exit'], ['box', 'agent'], ['parallelogram', 'gate'], ['component', 'fan-out'], ['note', 'lens'], ['tripleoctagon', 'review'], ['hexagon', 'ask']])
const COMMON = Object.freeze(['label', 'shape', 'phase'])
/** @type {Readonly<Record<NodeKind, { required: string[], optional: string[] }>>} */
const ATTRIBUTES = Object.freeze({
  start: { required: [], optional: [] },
  exit: { required: [], optional: [] },
  agent: { required: ['agent'], optional: ['model', 'outputs', 'writes', 'max_attempts', 'each'] },
  gate: { required: ['gate'], optional: ['goal_gate', 'locked', 'unlock'] },
  'fan-out': { required: [], optional: [] },
  lens: { required: ['lens'], optional: ['model', 'when', 'mandatory'] },
  review: { required: [], optional: ['model', 'refuter', 'mandatory'] },
  ask: { required: ['question'], optional: [] },
  publish: { required: ['publish'], optional: ['when'] },
})
/** What `when=` names, by the kind of node it is on. @type {Readonly<Partial<Record<NodeKind, readonly string[]>>>} */
const WHENS = Object.freeze({ publish: Object.freeze(['frontend']), lens: TRIGGER_NAMES })
/** What a publish node publishes. @type {readonly Publication[]} */
const PUBLICATIONS = Object.freeze(/** @type {Publication[]} */ (['pull-request', 'playwright-visuals']))

/**
 * The kind of a node: its shape's, a parallelogram that publishes being a publish node.
 * @param {Record<string, string>} attributes @returns {NodeKind | undefined}
 */
const shapeKind = (attributes) => {
  const kind = KINDS.get(attributes.shape)
  return kind === 'gate' && 'publish' in attributes ? 'publish' : kind
}
/** The labels an edge leaving a node of that kind takes, its default first. @type {Readonly<Partial<Record<NodeKind, readonly EdgeLabel[]>>>} */
const LABELS = Object.freeze({ gate: Object.freeze(/** @type {EdgeLabel[]} */ (['PASS', 'FAIL'])), review: Object.freeze(/** @type {EdgeLabel[]} */ (['APPROVED', 'NEEDS_REWORK'])) })
const PHASE = /^[A-Z][A-Z0-9_]*$/
const AGENT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const POSITIVE = /^[1-9][0-9]*$/
/** A node id names the node's files in the tracking folder: a word, never a path. */
const NODE_ID = /^[A-Za-z_][A-Za-z0-9_-]*$/

/** @param {string} value @returns {string[]} */
const listOf = (value) => value.split(',').map((item) => item.trim()).filter((item) => item !== '')

/** @param {string} value */
const family = (value) => (FAMILY.test(value) ? null : 'must be a model family, a kebab-case word whose every part starts with a letter, such as reviewer, planner or gpt-codex')

/** @param {string} value */
const positive = (value) => (POSITIVE.test(value) ? null : 'must be a positive integer')
/** @param {string} value */
const flag = (value) => (value === 'true' || value === 'false' ? null : 'must be true or false')

/** What is wrong with a node attribute's value on a node of that kind; null when nothing is. @type {Record<string, (value: string, kind: NodeKind) => string | null>} */
const NODE_CHECKS = {
  phase: (value) => (PHASE.test(value) ? null : 'must be an upper-case word'),
  agent: (value) => (AGENT_ID.test(value) ? null : 'must be a kebab-case agent id'),
  lens: (value) => (AGENT_ID.test(value) ? null : 'must be a kebab-case lens name'),
  question: (value) => (NODE_QUESTIONS.some((known) => known === value) ? null : `must be one of ${NODE_QUESTIONS.join(', ')}`),
  gate: (value) => (listOf(value).length > 0 && listOf(value).every((gate) => GATE_ORDER.includes(gate)) ? null : `must list gates among ${GATE_ORDER.join(', ')}`),
  goal_gate: flag,
  locked: flag,
  mandatory: flag,
  unlock: (value) => (value.trim() === '' ? 'needs the reason the node is skipped' : null),
  outputs: (value) => (listOf(value).every((path) => !isAbsolutePath(path) && !path.split(/[\\/]/).includes('..')) ? null : 'must list paths relative to the tracking folder, without ..'),
  writes: (value) => (listOf(value).every((path) => !isAbsolutePath(path)) ? null : 'must list paths relative to the working copy'),
  max_attempts: positive,
  each: (value) => (value === 'survivor-file' ? null : 'must be survivor-file'),
  publish: (value) => (PUBLICATIONS.some((known) => known === value) ? null : `must be ${PUBLICATIONS.join(' or ')}`),
  when: (value, kind) => {
    const known = /** @type {readonly string[]} */ (WHENS[kind])
    return known.includes(value) ? null : `must be ${known.join(' or ')}`
  },
  model: family,
  refuter: family,
}

/** @type {Record<string, (value: string) => string | null>} */
const EDGE_CHECKS = {
  // A label's value depends on the kind of node the edge leaves: labelReasons checks it.
  label: () => null,
  max_visits: positive,
}

/**
 * The graph read so far: its nodes of known shape (phases inherited), its edges, the ids in
 * declaration order, the start and exit ids, and `order` / `phases` as in a Workflow.
 * @typedef {{
 *   graph: import('./dot.mjs').DotGraph, nodes: Record<string, WorkflowNode>, edges: WorkflowEdge[],
 *   ids: string[], starts: string[], exits: string[], order: string[], phases: string[],
 * }} Draft
 */

/**
 * @param {string} text the DOT file
 * @returns {{ ok: true, workflow: Workflow } | { ok: false, errors: string[] }}
 */
export const readWorkflow = (text) => {
  const parsed = parseDot(text)
  if (!parsed.ok) return parsed
  const former = formerReviewReasons(parsed.graph)
  if (former.length > 0) return { ok: false, errors: former }
  const draft = draftOf(parsed.graph)
  const errors = WORKFLOW_CHECKS.flatMap((check) => check(draft))
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, workflow: workflowOf(draft) }
}

/** @param {import('./dot.mjs').DotGraph} graph @returns {Draft} */
const draftOf = (graph) => {
  const nodes = nodesOf(graph)
  const edges = graph.edges.map((edge) => edgeOf(edge, nodes[edge.from]))
  const ids = graph.nodes.map(({ id }) => id)
  const starts = ids.filter((id) => kindOf(nodes, id) === 'start')
  const exits = ids.filter((id) => kindOf(nodes, id) === 'exit')
  const order = walk(starts, edges, 'from', 'to')
  inheritPhases(nodes, order, edges)
  const phases = phasesAlong(nodes, order)
  return { graph, nodes, edges, ids, starts, exits, order, phases }
}

/** The draft with its reviews folded into their fan-ins. @param {Draft} draft @returns {Workflow} */
const workflowOf = ({ graph, nodes, edges, starts }) => {
  const folded = foldReviews(nodes, edges)
  const order = walk(starts, folded.edges, 'from', 'to')
  return { ...headerOf(graph), start: starts[0], ...folded, order, phases: phasesAlong(folded.nodes, order) }
}

/** @param {import('./dot.mjs').DotGraph} graph */
const headerOf = ({ attributes }) => ({
  version: attributes.version ?? null,
  skraftVersion: attributes.skraft_version ?? null,
  goal: attributes.goal ?? null,
})

/** The distinct phases along the order. @param {Record<string, WorkflowNode>} nodes @param {string[]} order */
const phasesAlong = (nodes, order) => [...new Set(order.map((id) => nodes[id]?.phase ?? null).filter((phase) => phase !== null))]

/** @param {Record<string, WorkflowNode>} nodes @param {string} id @returns {NodeKind | null} */
const kindOf = (nodes, id) => nodes[id]?.kind ?? null

/** @param {boolean} broken @param {string} reason @returns {string[]} */
const when = (broken, reason) => (broken ? [reason] : [])

/** @param {import('./dot.mjs').DotGraph} graph @returns {Record<string, WorkflowNode>} the nodes whose shape a workflow takes */
const nodesOf = (graph) => {
  /** @type {Record<string, WorkflowNode>} */
  const nodes = {}
  for (const { id, attributes } of graph.nodes) {
    const kind = shapeKind(attributes)
    if (kind !== undefined) nodes[id] = nodeOf(id, kind, attributes)
  }
  return nodes
}

/** @param {string} id @param {NodeKind} kind @param {Record<string, string>} attributes @returns {WorkflowNode} */
const nodeOf = (id, kind, attributes) => ({
  id,
  kind,
  phase: attributes.phase ?? null,
  agent: attributes.agent ?? null,
  lenses: attributes.lens === undefined ? [] : [attributes.model === undefined ? attributes.lens : `${attributes.lens}@${attributes.model}`],
  question: NODE_QUESTIONS.find((known) => known === attributes.question) ?? null,
  model: attributes.model ?? null,
  refuter: attributes.refuter ?? null,
  ...gateSettingsOf(attributes),
  ...stepSettingsOf(attributes),
})

/** @param {Record<string, string>} attributes */
const gateSettingsOf = (attributes) => ({
  gates: listOf(attributes.gate ?? ''),
  goal: attributes.goal_gate === 'true',
  locked: attributes.locked === 'true',
  unlock: attributes.unlock ?? null,
})

/** @param {Record<string, string>} attributes */
const stepSettingsOf = (attributes) => ({
  outputs: listOf(attributes.outputs ?? ''),
  writes: listOf(attributes.writes ?? ''),
  maxAttempts: attributes.max_attempts === undefined ? null : Number(attributes.max_attempts),
  each: attributes.each === 'survivor-file' ? /** @type {const} */ ('survivor-file') : null,
  publish: PUBLICATIONS.find((known) => known === attributes.publish) ?? null,
  when: /** @type {When | undefined} */ (attributes.when) ?? null,
  fanOut: null,
  branches: [],
  mandatory: attributes.mandatory === undefined ? null : attributes.mandatory === 'true',
})

/** @param {import('./dot.mjs').DotEdge} edge @param {WorkflowNode | undefined} source the node of `from` @returns {WorkflowEdge} */
const edgeOf = ({ from, to, attributes }, source) => ({
  from,
  to,
  label: attributes.label ?? (source === undefined ? null : LABELS[source.kind]?.[0] ?? null),
  maxVisits: attributes.max_visits === undefined ? null : Number(attributes.max_visits),
})

/** A node with no phase takes the phase of its first predecessor in `order`. @param {Record<string, WorkflowNode>} nodes @param {string[]} order @param {WorkflowEdge[]} edges */
const inheritPhases = (nodes, order, edges) => {
  for (const id of order.filter((candidate) => candidate in nodes)) {
    const first = order.find((other) => edges.some((edge) => edge.from === other && edge.to === id))
    nodes[id].phase ??= first === undefined ? null : nodes[first]?.phase ?? null
  }
}

/** @param {string} name @param {string} key @param {string} value @param {string | null} problem */
const valueReasons = (name, key, value, problem) => when(problem !== null, `${name}: ${key}=${JSON.stringify(value)} ${problem}`)

/** Known shapes, known attributes, valid values, required attributes. @param {Draft} draft */
const nodeAttributeReasons = ({ graph }) => graph.nodes.flatMap(nodeReasons)

/** @param {import('./dot.mjs').DotNode} node */
const nodeReasons = ({ id, attributes }) => {
  if (!NODE_ID.test(id)) return [`node ${JSON.stringify(id)}: an id is a word of letters, digits, _ and -, since it names the node's files`]
  const { shape } = attributes
  const kind = shapeKind(attributes)
  if (kind === undefined) return [shapeReason(id, shape)]
  const { required, optional } = ATTRIBUTES[kind]
  const allowed = [...COMMON, ...required, ...optional]
  return [
    ...Object.entries(attributes).flatMap(([key, value]) => nodeAttributeReason(`node ${id}`, shape, kind, allowed, key, value)),
    ...required.filter((key) => !(key in attributes)).map((key) => `node ${id}: a ${shape} node needs ${key}="…"`),
  ]
}

/** @param {string} id @param {string | undefined} shape */
const shapeReason = (id, shape) => (shape === undefined
  ? `node ${id} has no shape; declare it with shape=Mdiamond, Msquare, box, parallelogram, component, note, tripleoctagon or hexagon`
  : `node ${id}: shape ${shape} is not supported (supported: ${[...KINDS.keys()].join(', ')})`)

/** @param {string} name @param {string} shape @param {NodeKind} kind @param {string[]} allowed @param {string} key @param {string} value */
const nodeAttributeReason = (name, shape, kind, allowed, key, value) => {
  if (!allowed.includes(key)) return [`${name}: attribute ${key} is not supported on a ${shape} node (supported: ${allowed.join(', ')})`]
  return valueReasons(name, key, value, NODE_CHECKS[key]?.(value, kind) ?? null)
}

/**
 * The labels an edge leaving the node takes; undefined when it takes none, null when its
 * question is unknown (the node's own error says so).
 * @param {WorkflowNode | undefined} node @returns {readonly string[] | null | undefined}
 */
const labelsOf = (node) => {
  if (node?.kind !== 'ask') return node === undefined ? undefined : LABELS[node.kind]
  return node.question === null ? null : questionSpec(node.question).options
}

/** Known attributes, valid values, labels only on gates, reviews and ask nodes. @param {Draft} draft */
const edgeAttributeReasons = ({ graph, nodes }) => graph.edges.flatMap((edge) => edgeReasons(edge, nodes[edge.from]))

/** @param {import('./dot.mjs').DotEdge} edge @param {WorkflowNode | undefined} source the node of `from` */
const edgeReasons = ({ from, to, attributes }, source) => {
  const name = `edge ${from} -> ${to}`
  return [
    ...Object.entries(attributes).flatMap(([key, value]) => edgeAttributeReason(name, key, value)),
    ...labelReasons(name, attributes.label, labelsOf(source)),
  ]
}

/** @param {string} name @param {string | undefined} label @param {readonly string[] | null | undefined} labels those its source takes */
const labelReasons = (name, label, labels) => {
  if (label === undefined || labels === null) return []
  if (labels === undefined) return [`${name}: only an edge leaving a gate, a review's fan-in (shape=tripleoctagon) or an ask node takes a label`]
  return valueReasons(name, 'label', label, labels.includes(label) ? null : `must be ${labels.join(' or ')}`)
}

/** @param {string} name @param {string} key @param {string} value */
const edgeAttributeReason = (name, key, value) => {
  if (!(key in EDGE_CHECKS)) return [`${name}: attribute ${key} is not supported (supported: ${Object.keys(EDGE_CHECKS).join(', ')})`]
  return valueReasons(name, key, value, EDGE_CHECKS[key](value))
}

/** Each node leaves by the edges its kind takes. @param {Draft} draft */
const outgoingEdgeReasons = ({ nodes, edges }) => Object.values(nodes).flatMap((node) => OUTGOING[node.kind](node, edges.filter((edge) => edge.from === node.id)))

/** @param {WorkflowNode} node @param {WorkflowEdge[]} out its outgoing edges */
const oneOutgoing = (node, out) => when(out.length !== 1, `node ${node.id}: ${node.kind} node needs exactly one outgoing edge, has ${out.length}`)

/** @param {WorkflowNode} node @param {WorkflowEdge[]} out its outgoing edges */
const noOutgoing = (node, out) => when(out.length > 0, `node ${node.id}: exit node takes no outgoing edge, has ${out.length}`)

/** @param {WorkflowNode} node @param {WorkflowEdge[]} out its outgoing edges */
const gateOutgoing = (node, out) => {
  const fail = out.filter((edge) => edge.label === 'FAIL').length
  return [
    ...when(out.length - fail !== 1, `node ${node.id}: gate node needs exactly one PASS edge, has ${out.length - fail}`),
    ...when(fail > 1, `node ${node.id}: gate node takes at most one FAIL edge, has ${fail}`),
  ]
}

/** @param {WorkflowNode} node @param {WorkflowEdge[]} out its outgoing edges */
const reviewOutgoing = (node, out) => {
  const rework = out.filter((edge) => edge.label === 'NEEDS_REWORK').length
  return [
    ...when(out.length - rework !== 1, `node ${node.id}: review node needs exactly one APPROVED edge, has ${out.length - rework}`),
    ...when(rework > 1, `node ${node.id}: review node takes at most one NEEDS_REWORK edge, has ${rework}`),
  ]
}

/**
 * An ask node leads every answer somewhere: each answer by its own edge or the unlabeled one, a
 * refusal by its own edge only.
 * @param {WorkflowNode} node @param {WorkflowEdge[]} out its outgoing edges
 */
const askOutgoing = (node, out) => {
  if (node.question === null) return []
  const { options, refusals } = questionSpec(node.question)
  const unlabeled = out.filter((edge) => edge.label === null).length
  return [
    ...when(unlabeled > 1, `node ${node.id}: ask node takes at most one unlabeled edge, has ${unlabeled}`),
    ...options.flatMap((answer) => answerEdgeReasons(node, out, answer, { refusal: refusals.includes(answer), unlabeled: unlabeled > 0 })),
  ]
}

/**
 * @param {WorkflowNode} node @param {WorkflowEdge[]} out @param {string} answer
 * @param {{ refusal: boolean, unlabeled: boolean }} how
 */
const answerEdgeReasons = (node, out, answer, { refusal, unlabeled }) => {
  const own = out.filter((edge) => edge.label === answer).length
  if (own > 1) return [`node ${node.id}: ask node takes one ${answer} edge, has ${own}`]
  if (own === 1 || (unlabeled && !refusal)) return []
  return [refusal
    ? `node ${node.id}: ${answer} needs an edge of its own, back to the node whose work it refuses`
    : `node ${node.id}: no edge for ${answer}; label one ${answer}, or leave one unlabeled`]
}

/** @type {Readonly<Record<NodeKind, (node: WorkflowNode, out: WorkflowEdge[]) => string[]>>} */
const OUTGOING = Object.freeze({
  start: oneOutgoing,
  agent: oneOutgoing,
  exit: noOutgoing,
  gate: gateOutgoing,
  review: reviewOutgoing,
  ask: askOutgoing,
  publish: oneOutgoing,
  // A fan-out's edges are its branches: branchReasons checks them.
  'fan-out': () => [],
  lens: oneOutgoing,
})

/** @param {Draft} draft */
const startAndExitReasons = ({ starts, exits }) => [
  ...when(starts.length !== 1, `the workflow needs exactly one start node (shape=Mdiamond), has ${starts.length}`),
  ...when(exits.length === 0, 'the workflow needs at least one exit node (shape=Msquare)'),
]

/** @param {Draft} draft */
const unreachableReasons = ({ ids, starts, order }) => {
  if (starts.length === 0) return []
  return ids.filter((id) => !order.includes(id)).map((id) => `node ${id} is unreachable from start`)
}

/** @param {Draft} draft */
const deadEndReasons = ({ ids, exits, edges }) => {
  if (exits.length === 0) return []
  const reaching = walk(exits, edges, 'to', 'from')
  return ids.filter((id) => !reaching.includes(id)).map((id) => `node ${id} never reaches an exit`)
}

/** @param {Draft} draft */
const unboundedLoopReasons = ({ ids, edges }) => loopsOf(ids, edges.filter((edge) => edge.maxVisits === null)).map((loop) => `loop ${loop.join(' -> ')} has no max_visits`)

/** The kinds of node that do the run's work, each in a phase. */
const WORKING = Object.freeze(['agent', 'gate', 'review', 'ask', 'publish'])

/** @param {Draft} draft */
const missingPhaseReasons = ({ nodes, order }) => order
  .filter((id) => id in nodes)
  .filter((id) => nodes[id].phase === null && WORKING.includes(nodes[id].kind))
  .map((id) => `node ${id} has no phase; set phase="<PHASE>" on it or on a node before it`)

/** No edge enters the start; no edge but one to an exit goes back to an earlier phase. @param {Draft} draft */
const edgeDirectionReasons = ({ nodes, edges, phases }) => edges.flatMap(({ from, to }) => {
  if (kindOf(nodes, to) === 'start') return [`edge ${from} -> ${to}: no edge may enter the start node`]
  if (kindOf(nodes, to) === 'exit') return []
  return backwardsReasons(phases, from, to, nodes[from]?.phase ?? null, nodes[to]?.phase ?? null)
})

/** @param {string[]} phases @param {string} from @param {string} to @param {string | null} before @param {string | null} after */
const backwardsReasons = (phases, from, to, before, after) => when(
  after !== null && phases.indexOf(after) < phases.indexOf(/** @type {string} */ (before)),
  `edge ${from} -> ${to} goes back from ${before} to ${after}`,
)

/** The checks of a workflow, in the order their reasons are listed. */
const WORKFLOW_CHECKS = Object.freeze([
  nodeAttributeReasons,
  edgeAttributeReasons,
  outgoingEdgeReasons,
  branchReasons,
  startAndExitReasons,
  unreachableReasons,
  deadEndReasons,
  unboundedLoopReasons,
  missingPhaseReasons,
  edgeDirectionReasons,
])

/**
 * Breadth-first from the roots along the edges, in declaration order.
 * @param {string[]} roots @param {WorkflowEdge[]} edges
 * @param {'from' | 'to'} near @param {'from' | 'to'} far
 */
const walk = (roots, edges, near, far) => {
  const seen = [...roots]
  for (const id of seen) {
    for (const edge of edges) if (edge[near] === id && !seen.includes(edge[far])) seen.push(edge[far])
  }
  return seen
}

/**
 * The cycles of the graph, each as the path `a -> … -> a` closed by its last edge.
 * @param {string[]} ids @param {WorkflowEdge[]} edges
 */
const loopsOf = (ids, edges) => {
  /** @type {LoopSearch} */
  const search = { edges, loops: [], done: new Set(), path: [] }
  for (const id of ids) if (!search.done.has(id)) visitLoops(search, id)
  return search.loops
}

/**
 * @typedef {{ edges: WorkflowEdge[], loops: string[][], done: Set<string>, path: string[] }} LoopSearch
 *   done: the nodes whose every path is explored; path: from the root of the search to the current node.
 */

/** Depth-first from the node, recording each edge that closes on the path. @param {LoopSearch} search @param {string} id */
const visitLoops = (search, id) => {
  search.path.push(id)
  for (const { from, to } of search.edges.filter((edge) => edge.from === id)) {
    if (search.path.includes(to)) search.loops.push([from, ...search.path.slice(search.path.indexOf(to))])
    else if (!search.done.has(to)) visitLoops(search, to)
  }
  search.path.pop()
  search.done.add(id)
}

/**
 * The locked nodes of the built-in workflow a repository workflow keeps, skips or breaks. A
 * kept one must keep its gates, its goal, its FAIL edge back to an agent of its phase, and no
 * path may reach the exit around it from the start or from an agent of its phase.
 * @param {Workflow} builtIn @param {Workflow} custom
 * @returns {{ errors: string[], unlocked: Array<{ node: string, reason: string }> }}
 */
export const checkLocks = (builtIn, custom) => {
  const locked = Object.values(builtIn.nodes).filter((node) => node.locked)
  return {
    errors: locked.flatMap((node) => lockReasons(builtIn, custom, node)),
    unlocked: locked.flatMap((node) => unlockedOf(custom.nodes[node.id], node)),
  }
}

/** @param {WorkflowNode | undefined} kept the node of the same id in the repository workflow @param {WorkflowNode} node a locked built-in node */
const unlockedOf = (kept, node) => (kept?.kind === 'gate' && kept.unlock !== null ? [{ node: node.id, reason: kept.unlock }] : [])

/** @param {Workflow} builtIn @param {Workflow} custom @param {WorkflowNode} node a locked built-in node */
const lockReasons = (builtIn, custom, node) => {
  const kept = custom.nodes[node.id]
  if (kept?.kind !== 'gate') return [`locked node ${node.id} is missing; keep it with unlock="<reason>" to skip it`]
  if (kept.unlock !== null) return []
  return keptLockReasons(builtIn, custom, node, kept)
}

/** @param {Workflow} builtIn @param {Workflow} custom @param {WorkflowNode} node a locked built-in node @param {WorkflowNode} kept the gate kept for it */
const keptLockReasons = (builtIn, custom, node, kept) => {
  const dropped = node.gates.filter((gate) => !kept.gates.includes(gate))
  return [
    ...when(dropped.length > 0, `locked node ${node.id} drops ${dropped.join(', ')}; keep them, or skip the node with unlock="<reason>"`),
    ...when(node.goal && !kept.goal, `locked node ${node.id} must stay goal_gate=true; skip it with unlock="<reason>" instead`),
    ...failEdge(builtIn, custom, kept),
    ...bypasses(custom, kept),
  ]
}

/**
 * A kept locked gate whose built-in one sends FAIL back must send it to an agent of its phase.
 * @param {Workflow} builtIn @param {Workflow} custom @param {WorkflowNode} kept
 */
const failEdge = (builtIn, custom, kept) => {
  const target = custom.edges.find((edge) => edge.from === kept.id && edge.label === 'FAIL')?.to
  if (target === undefined) return [`locked node ${kept.id} has no FAIL edge back to an agent of ${kept.phase}`]
  const back = custom.nodes[target]
  return back.kind === 'agent' && back.phase === kept.phase ? [] : [`locked node ${kept.id} must send FAIL back to an agent of ${kept.phase}, not to ${target}`]
}

/**
 * The start and the agents of a locked gate's phase from which an exit is reached without it.
 * @param {Workflow} custom @param {WorkflowNode} kept
 */
const bypasses = (custom, kept) => [custom.start, ...custom.order.filter((id) => custom.nodes[id].kind === 'agent' && custom.nodes[id].phase === kept.phase)]
  .filter((from) => reachesExitWithout(custom, from, kept.id))
  .map((from) => `${from} reaches the exit without passing ${kept.id}; keep the run going through ${kept.id}, or skip ${kept.id} with unlock="<reason>"`)

/** @param {Workflow} workflow @param {string} from @param {string} avoided */
export const reachesExitWithout = (workflow, from, avoided) => {
  // Stryker disable next-line ArrayDeclaration: without the start in seen, an edge back to it queues it once more and finds nothing new
  const seen = new Set([from])
  const queue = [from]
  while (queue.length > 0) {
    const id = /** @type {string} */ (queue.shift())
    if (workflow.nodes[id].kind === 'exit') return true
    enqueueNext(workflow, id, avoided, seen, queue)
  }
  return false
}

/** @param {Workflow} workflow @param {string} id @param {string} avoided @param {Set<string>} seen @param {string[]} queue */
const enqueueNext = (workflow, id, avoided, seen, queue) => {
  for (const { to } of workflow.edges.filter((edge) => edge.from === id && edge.to !== avoided && !seen.has(edge.to))) {
    seen.add(to)
    queue.push(to)
  }
}

/** @typedef {WorkflowNode & { fanIn?: string }} DiffedNode a node as a diff compares it; fanIn: the review a lens node is a branch of */

/** @param {DiffedNode} node @returns {Array<[string, string | null]>} */
const factsOf = (node) => [
  ['kind', node.kind],
  ['agent', node.agent],
  ['gate', node.gates.join(',')],
  ...workFactsOf(node),
  ['phase', node.phase],
  ...gateFactsOf(node),
  ...stepFactsOf(node),
  ...modelFactsOf(node),
]

/** @param {WorkflowNode} node @returns {Array<[string, string | null]>} */
const stepFactsOf = (node) => [
  ['outputs', node.outputs.join(', ')],
  ['writes', node.writes.join(', ')],
  ['max_attempts', node.maxAttempts === null ? null : String(node.maxAttempts)],
  ['each', node.each],
]

/** @param {WorkflowNode} node @returns {Array<[string, string | null]>} */
const workFactsOf = (node) => [['lens', node.kind === 'lens' ? node.lenses[0] : null], ['question', node.question], ['publish', node.publish], ['when', node.when]]

/** @param {DiffedNode} node @returns {Array<[string, string | null]>} */
const modelFactsOf = (node) => [['model', node.model], ['refuter', node.refuter], ['fan-in', node.fanIn ?? null]]

/** @param {WorkflowNode} node @returns {Array<[string, string | null]>} */
const gateFactsOf = (node) => [
  ['goal_gate', String(node.goal)],
  ['locked', String(node.locked)],
  ['unlock', node.unlock],
]

/** @param {WorkflowEdge} edge @returns {Array<[string, string | null]>} */
const edgeFactsOf = (edge) => [
  ['label', edge.label],
  ['max_visits', edge.maxVisits === null ? null : String(edge.maxVisits)],
]

/** @param {string | null} value */
const shown = (value) => (value === null || value === '' ? 'none' : value)

/**
 * @template T
 * @param {Map<string, T>} before @param {Map<string, T>} after
 * @param {(item: T) => Array<[string, string | null]>} facts
 * @param {(item: T) => string} [mark] what follows each change of the item as it was
 */
const changesOf = (before, after, facts, mark = () => '') => [...after].flatMap(([key, item]) => {
  const old = before.get(key)
  if (old === undefined) return []
  const was = new Map(facts(old))
  return facts(item).filter(([fact, value]) => was.get(fact) !== value).map(([fact, value]) => `${key}: ${fact} ${shown(was.get(fact) ?? null)} → ${shown(value)}${mark(old)}`)
})

/**
 * What a repository workflow changes in another: nodes added, removed, changed, then edges.
 * @param {Workflow} from @param {Workflow} to
 * @returns {string[]}
 */
export const diffWorkflows = (from, to) => [...nodeChanges(from, to), ...edgeChanges(from, to)]

/** @param {Workflow} from @param {Workflow} to */
const nodeChanges = (from, to) => {
  const before = diffedNodes(from)
  const after = diffedNodes(to)
  return [
    ...[...after.values()].filter((node) => !before.has(node.id)).map(addedNode),
    ...[...before.values()].filter((node) => !after.has(node.id)).map((node) => `- node ${node.id}${mandatoryMark(node)}`),
    ...changesOf(before, after, factsOf, mandatoryMark).map((change) => `~ node ${change}`),
  ]
}

/** @param {DiffedNode} node a node of the workflow the diff starts from */
const mandatoryMark = (node) => (node.mandatory === true ? ' (mandatory)' : '')

/** Each node, a review's lens nodes just before it. @param {Workflow} workflow @returns {Map<string, DiffedNode>} */
const diffedNodes = (workflow) => new Map(Object.values(workflow.nodes)
  .flatMap((node) => [...node.branches.map((branch) => lensNodeOf(node, branch)), node])
  .map((node) => [node.id, node]))

/** @param {WorkflowNode} review @param {Branch} branch @returns {DiffedNode} */
const lensNodeOf = (review, branch) => {
  const { name, model } = /** @type {import('../review/lenses.mjs').LensSpec} */ (readLensSpec(branch.lens))
  const attributes = { lens: name, ...(model === null ? {} : { model }), ...(branch.when === null ? {} : { when: branch.when }) }
  return { ...nodeOf(branch.id, 'lens', attributes), lenses: [name], fanIn: review.id, mandatory: branch.mandatory }
}

/** @param {WorkflowNode} node */
const addedNode = (node) => `+ node ${node.id} (${[node.kind, node.agent, node.gates.join(','), node.lenses.join(','), node.question, node.publish].filter(Boolean).join(' ')})`

/** @param {Workflow} from @param {Workflow} to */
const edgeChanges = (from, to) => {
  const old = edgesByKey(from.edges)
  const now = edgesByKey(to.edges)
  return [
    ...[...now.keys()].filter((key) => !old.has(key)).map((key) => `+ edge ${key}`),
    ...[...old.keys()].filter((key) => !now.has(key)).map((key) => `- edge ${key}`),
    ...changesOf(old, now, edgeFactsOf).map((change) => `~ edge ${change}`),
  ]
}

/** @param {WorkflowEdge[]} edges @returns {Map<string, WorkflowEdge>} */
const edgesByKey = (edges) => new Map(edges.map((edge) => [`${edge.from} -> ${edge.to}`, edge]))

/**
 * The DOT text with `skraft_version` set in its `graph [...]` statements, every other byte kept:
 * each value replaced, else added to the first statement, else a statement added after `{`.
 * @param {string} text a DOT file `parseDot` accepts
 * @param {string} version
 */
export const stampVersion = (text, version) => {
  const lexed = /** @type {{ tokens: DotToken[] }} */ (tokenizeDot(text))
  const tokens = lexed.tokens.filter((token) => token.kind !== 'newline')
  const edits = versionEdits(tokens, `"${version}"`)
  return edits.reduceRight((stamped, edit) => `${stamped.slice(0, edit.start)}${edit.text}${stamped.slice(edit.end)}`, text)
}

/**
 * @typedef {import('./dot.mjs').DotToken} DotToken
 * @typedef {{ start: number, end: number, text: string }} TextEdit
 * @typedef {{ inside: boolean, closing: number | null, replaced: TextEdit[] }} GraphAttributeScan
 *   inside: within a `graph [...]` list; closing: the `]` of the first one; replaced: each skraft_version value, replaced.
 */

/** @param {DotToken[]} tokens without newlines @param {string} value the quoted version @returns {TextEdit[]} */
const versionEdits = (tokens, value) => {
  const scan = scanGraphAttributes(tokens, value)
  if (scan.replaced.length > 0) return scan.replaced
  if (scan.closing !== null) return [appendedVersion(tokens[scan.closing - 1], value)]
  return [versionStatement(tokens, value)]
}

/** @param {DotToken[]} tokens @param {string} value @returns {GraphAttributeScan} */
const scanGraphAttributes = (tokens, value) => {
  /** @type {GraphAttributeScan} */
  const scan = { inside: false, closing: null, replaced: [] }
  tokens.forEach((token, index) => scanGraphToken(scan, tokens, index, value))
  return scan
}

/** @param {GraphAttributeScan} scan @param {DotToken[]} tokens @param {number} index @param {string} value */
const scanGraphToken = (scan, tokens, index, value) => {
  if (opensGraphAttributes(tokens, index)) scan.inside = true
  if (scan.inside && isSymbol(tokens[index], ']')) closeGraphAttributes(scan, index)
  if (scan.inside && setsVersion(tokens, index)) scan.replaced.push({ ...tokens[index + 2], text: value })
}

/** @param {DotToken[]} tokens @param {number} index */
const opensGraphAttributes = (tokens, index) => isSymbol(tokens[index], '[') && isKeyword(tokens[index - 1], 'graph')

/** @param {DotToken[]} tokens @param {number} index */
const setsVersion = (tokens, index) => tokens[index].value === 'skraft_version' && isSymbol(tokens[index + 1], '=')

/** @param {GraphAttributeScan} scan @param {number} index the `]` */
const closeGraphAttributes = (scan, index) => {
  scan.closing ??= index
  scan.inside = false
}

/** @param {DotToken} last the token before the `]` of the first graph statement @param {string} value @returns {TextEdit} */
const appendedVersion = (last, value) => ({ start: last.end, end: last.end, text: `${isSymbol(last, '[') ? '' : ', '}skraft_version=${value}` })

/** @param {DotToken[]} tokens @param {string} value @returns {TextEdit} a graph statement after the opening `{` */
const versionStatement = (tokens, value) => {
  const brace = /** @type {DotToken} */ (tokens.find((token) => isSymbol(token, '{')))
  return { start: brace.end, end: brace.end, text: `\n  graph [skraft_version=${value}]` }
}
