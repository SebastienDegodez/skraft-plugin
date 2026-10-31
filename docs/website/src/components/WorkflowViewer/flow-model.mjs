import dagre from '@dagrejs/dagre'

/**
 * The view model of the workflow viewer: a Workflow read by the engine's `readWorkflow`
 * becomes React Flow nodes and edges laid out by dagre. Pure: no DOM, no React, no fetch.
 *
 * @typedef {'LR' | 'TB'} Direction
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{
 *   id: string, type: string, position: Point, width: number, height: number,
 *   data: { node?: object, title: string, rows?: string[], branches?: object[], answers?: string[], calls?: string | null },
 * }} FlowNode
 * @typedef {{ id: string, source: string, target: string, type: 'route', data: { label: string | null, maxVisits: number | null, points: Point[], labelAt: Point | null } }} FlowEdge
 * @typedef {{ nodes: FlowNode[], edges: FlowEdge[], width: number, height: number }} Flow
 */

const CARD = 236
const PILL = { width: 96, height: 40 }
const HEADER = 34
const ROW = 20
const CHIP = 26
const PADDING = 14
const ROW_CHARS = 30
const LANE_PADDING = 18
const LANE_LABEL = 26
const MARGIN = 24

/** Greedy packing of short words into rows of at most ROW_CHARS characters. @param {string[]} words */
export const packRows = (words) => words.reduce((rows, word) => {
  const last = rows.at(-1)
  if (last !== undefined && `${last}, ${word}`.length <= ROW_CHARS) rows[rows.length - 1] = `${last}, ${word}`
  else rows.push(word)
  return rows
}, /** @type {string[]} */ ([]))

const ROWS = {
  agent: (node) => [
    `agent ${node.agent}`,
    ...(node.model ? [`model ${node.model}`] : []),
    ...(node.each ? [`each ${node.each}${node.proposal ? ', proposal' : ''}`] : []),
    ...node.outputs.map((output) => `→ ${output}`),
    ...node.writes.map((write) => `✎ ${write}`),
  ],
  gate: (node) => [
    ...packRows(node.gates),
    ...(node.goal ? ['goal gate'] : []),
    ...(node.unlock ? [`unlocked: ${node.unlock}`] : []),
  ],
  review: (node) => [
    ...(node.model ? [`model ${node.model}`] : []),
    ...(node.refuter ? [`refuter ${node.refuter}`] : []),
  ],
  ask: (node, answers) => [`asks ${node.question}`, ...packRows(answers)],
  publish: (node) => [`publishes ${node.publish}`, ...(node.when ? [`when ${node.when}`] : [])],
  call: (node) => [`runs workflow ${node.call.workflow}`],
}

/** The answers an ask node leads on: the engine's options, else its edges' labels. */
const answersFor = (node, workflow, answersOf) =>
  answersOf?.(node.question) ?? workflow.edges.filter(({ from, label }) => from === node.id && label).map(({ label }) => label)

const titleOf = (node) => (node.kind === 'review' ? (node.phase ? `${node.phase} review` : 'review') : node.id)

/** @returns {FlowNode} the node, sized, without a position yet */
const flowNodeOf = (node, workflow, answersOf) => {
  if (node.kind === 'start' || node.kind === 'exit') return { id: node.id, type: node.kind, position: { x: 0, y: 0 }, ...PILL, data: { node, title: node.kind } }
  const answers = node.kind === 'ask' ? answersFor(node, workflow, answersOf) : []
  const rows = (ROWS[node.kind] ?? (() => []))(node, answers)
  const chips = node.kind === 'review' ? node.branches.length + 1 : 0 // the lenses, then the verdict
  const height = HEADER + rows.length * ROW + chips * CHIP + PADDING
  return {
    id: node.id, type: node.kind, position: { x: 0, y: 0 }, width: CARD, height,
    data: { node, title: titleOf(node), rows, branches: node.branches, answers, calls: node.call?.workflow ?? null },
  }
}

const laneId = (phase) => `phase:${phase}`

const graphOf = (direction) => {
  const graph = new dagre.graphlib.Graph({ compound: true, multigraph: true })
  graph.setGraph({ rankdir: direction, nodesep: 36, ranksep: 64, edgesep: 18, marginx: MARGIN, marginy: MARGIN })
  graph.setDefaultEdgeLabel(() => ({}))
  return graph
}

const LABEL_SIZE = (label, maxVisits) => ({
  width: label || maxVisits ? 8 * ((label ?? '').length + (maxVisits ? 4 : 0)) + 16 : 0,
  height: label || maxVisits ? 22 : 0,
})

const edgeIdOf = (edge, index) => `${edge.from}->${edge.to}#${index}`

/** Lays the nodes out, phases as clusters so a phase stays one block. */
const layout = (workflow, flowNodes, direction) => {
  const graph = graphOf(direction)
  for (const phase of workflow.phases) graph.setNode(laneId(phase), { paddingTop: LANE_LABEL + LANE_PADDING, paddingLeft: LANE_PADDING, paddingRight: LANE_PADDING, paddingBottom: LANE_PADDING })
  for (const node of flowNodes) {
    graph.setNode(node.id, { width: node.width, height: node.height })
    const phase = workflow.nodes[node.id].phase
    if (phase) graph.setParent(node.id, laneId(phase))
  }
  workflow.edges.forEach((edge, index) => {
    graph.setEdge(edge.from, edge.to, { ...LABEL_SIZE(edge.label, edge.maxVisits), labelpos: 'c' }, edgeIdOf(edge, index))
  })
  dagre.layout(graph)
  return graph
}

const topLeft = ({ x, y, width, height }) => ({ x: x - width / 2, y: y - height / 2 })

/** A lane is the box of its nodes, grown by its padding and label: dagre's cluster box can cut its own nodes. */
const laneOf = (phase, members) => {
  const left = Math.min(...members.map(({ position }) => position.x)) - LANE_PADDING
  const top = Math.min(...members.map(({ position }) => position.y)) - LANE_PADDING - LANE_LABEL
  const right = Math.max(...members.map(({ position, width }) => position.x + width)) + LANE_PADDING
  const bottom = Math.max(...members.map(({ position, height }) => position.y + height)) + LANE_PADDING
  return { id: laneId(phase), type: 'phase', position: { x: left, y: top }, width: right - left, height: bottom - top, data: { title: phase } }
}

/** Shifts every point so the drawing starts at (MARGIN, MARGIN), and measures it. */
const normalise = (nodes, edges) => {
  const left = Math.min(...nodes.map(({ position }) => position.x)) - MARGIN
  const top = Math.min(...nodes.map(({ position }) => position.y)) - MARGIN
  const move = ({ x, y }) => ({ x: x - left, y: y - top })
  const moved = nodes.map((node) => ({ ...node, position: move(node.position) }))
  const routes = edges.map((edge) => ({ ...edge, data: { ...edge.data, points: edge.data.points.map(move), labelAt: edge.data.labelAt && move(edge.data.labelAt) } }))
  const width = Math.max(...moved.map(({ position, width }) => position.x + width)) + MARGIN
  const height = Math.max(...moved.map(({ position, height }) => position.y + height)) + MARGIN
  return { nodes: moved, edges: routes, width, height }
}

/**
 * @param {object} workflow a Workflow from the engine's readWorkflow
 * @param {{ direction?: Direction, answersOf?: (question: string) => string[] }} [options]
 * @returns {Flow}
 */
export const toFlow = (workflow, { direction = 'LR', answersOf } = {}) => {
  const sized = Object.values(workflow.nodes).map((node) => flowNodeOf(node, workflow, answersOf))
  const graph = layout(workflow, sized, direction)
  const nodes = sized.map((node) => ({ ...node, position: topLeft({ ...graph.node(node.id), width: node.width, height: node.height }) }))
  const lanes = workflow.phases.map((phase) => laneOf(phase, nodes.filter(({ id }) => workflow.nodes[id].phase === phase)))
  const edges = workflow.edges.map((edge, index) => {
    const routed = graph.edge(edge.from, edge.to, edgeIdOf(edge, index))
    const labelled = edge.label !== null || edge.maxVisits !== null
    return {
      id: edgeIdOf(edge, index), source: edge.from, target: edge.to, type: 'route',
      data: { label: edge.label, maxVisits: edge.maxVisits, points: routed.points.map(({ x, y }) => ({ x, y })), labelAt: labelled ? { x: routed.x, y: routed.y } : null },
    }
  })
  return normalise([...lanes, ...nodes], edges)
}

const REFERENCE = 'reference/workflow-dot'
const at = (anchor) => ({ to: `${REFERENCE}#${anchor}`, label: anchor })

/** Where the reference explains each field (the shared EN/FR heading ids). */
const FIELD_LINKS = {
  id: () => [at('node-shapes')],
  kind: () => [at('node-shapes')],
  phase: (node) => [{ to: `reference/phases#${node.phase.toLowerCase()}`, label: node.phase }],
  agent: () => [at('node-attributes')],
  gates: (node) => node.gates.map((gate) => ({ to: 'reference/gates#command-gates', label: gate })),
  lenses: () => [at('reviews')],
  question: () => [{ to: 'reference/phases#human-questions', label: 'human-questions' }],
  goal: () => [at('node-attributes')],
  locked: () => [at('locked-nodes')],
  unlock: () => [at('locked-nodes')],
  outputs: () => [at('node-attributes')],
  writes: () => [at('node-attributes')],
  maxAttempts: () => [at('node-attributes')],
  model: () => [at('node-attributes')],
  refuter: () => [at('reviews')],
  each: () => [at('node-attributes')],
  proposal: () => [at('node-attributes')],
  publish: () => [at('node-attributes')],
  when: () => [at('node-attributes')],
  fanOut: () => [at('reviews')],
  branches: (node) => [at('reviews'), ...(node.branches.some(({ when }) => when) ? [at('conditional-lenses')] : [])],
  mandatory: () => [at('mandatory-nodes')],
  call: () => [at('call-node')],
}

const branchText = ({ lens, when, mandatory }) => `${lens}${mandatory ? ' (mandatory)' : ''}${when ? ` (when=${when})` : ''}`

const VALUES = {
  branches: (branches) => branches.map(branchText).join(', '),
  call: (call) => call.workflow,
}

/** A field the node sets: not null, not false, not an empty list. */
const isSet = (value) => value !== null && value !== false && !(Array.isArray(value) && value.length === 0)

const valueText = (key, value) => (VALUES[key] ?? ((given) => (Array.isArray(given) ? given.join(', ') : String(given))))(value)

/**
 * The fields of a node the side panel lists, in the engine's order, each with its reference links.
 * @param {object} node a WorkflowNode
 * @returns {{ key: string, value: string, links: { to: string, label: string }[] }[]}
 */
export const panelFields = (node) => Object.entries(node)
  .filter(([key, value]) => key in FIELD_LINKS && isSet(value))
  .map(([key, value]) => ({ key, value: valueText(key, value), links: FIELD_LINKS[key](node) }))
