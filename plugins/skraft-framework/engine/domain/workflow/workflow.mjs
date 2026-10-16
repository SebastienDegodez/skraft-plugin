import { isAbsolutePath } from '../config/skraft-config.mjs'
import { GATE_ORDER } from '../gates/gate-plan.mjs'
import { isKeyword, isSymbol, parseDot, tokenizeDot } from './dot.mjs'

/**
 * A skraft workflow: the DOT graph read as the pipeline the engine runs, and checked before any
 * run.
 *
 * @typedef {'start' | 'exit' | 'agent' | 'gate'} NodeKind
 * @typedef {{
 *   id: string, kind: NodeKind, phase: string | null, agent: string | null, gates: string[],
 *   goal: boolean, locked: boolean, unlock: string | null, outputs: string[], writes: string[],
 *   maxAttempts: number | null,
 * }} WorkflowNode
 *   phase: its own, else the phase of its first predecessor in `order`. outputs: relative to the
 *   tracking folder (`{date}`, `{slug}` filled at dispatch); writes: relative to the working copy.
 * @typedef {{ from: string, to: string, label: 'PASS' | 'FAIL' | null, maxVisits: number | null }} WorkflowEdge
 *   label: PASS or FAIL on an edge leaving a gate (unlabeled means PASS), null elsewhere.
 * @typedef {{
 *   version: string | null, skraftVersion: string | null, goal: string | null, start: string,
 *   nodes: Record<string, WorkflowNode>, order: string[], edges: WorkflowEdge[], phases: string[],
 * }} Workflow
 *   nodes in declaration order; order: breadth-first from start, edges in declaration order;
 *   phases: the distinct phases along `order`.
 */

/** @type {ReadonlyMap<string, NodeKind>} */
const KINDS = new Map([['Mdiamond', 'start'], ['Msquare', 'exit'], ['box', 'agent'], ['parallelogram', 'gate']])
const COMMON = Object.freeze(['label', 'shape', 'phase'])
/** @type {Readonly<Record<NodeKind, { required: string[], optional: string[] }>>} */
const ATTRIBUTES = Object.freeze({
  start: { required: [], optional: [] },
  exit: { required: [], optional: [] },
  agent: { required: ['agent'], optional: ['outputs', 'writes', 'max_attempts'] },
  gate: { required: ['gate'], optional: ['goal_gate', 'locked', 'unlock'] },
})
const PHASE = /^[A-Z][A-Z0-9_]*$/
const AGENT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const POSITIVE = /^[1-9][0-9]*$/

/** @param {string} value @returns {string[]} */
const listOf = (value) => value.split(',').map((item) => item.trim()).filter((item) => item !== '')

/** @param {string} value */
const positive = (value) => (POSITIVE.test(value) ? null : 'must be a positive integer')
/** @param {string} value */
const flag = (value) => (value === 'true' || value === 'false' ? null : 'must be true or false')

/** What is wrong with a node attribute's value; null when nothing is. @type {Record<string, (value: string) => string | null>} */
const NODE_CHECKS = {
  phase: (value) => (PHASE.test(value) ? null : 'must be an upper-case word'),
  agent: (value) => (AGENT_ID.test(value) ? null : 'must be a kebab-case agent id'),
  gate: (value) => (listOf(value).length > 0 && listOf(value).every((gate) => GATE_ORDER.includes(gate)) ? null : `must list gates among ${GATE_ORDER.join(', ')}`),
  goal_gate: flag,
  locked: flag,
  unlock: (value) => (value.trim() === '' ? 'needs the reason the node is skipped' : null),
  outputs: (value) => (listOf(value).every((path) => !isAbsolutePath(path) && !path.split(/[\\/]/).includes('..')) ? null : 'must list paths relative to the tracking folder, without ..'),
  writes: (value) => (listOf(value).every((path) => !isAbsolutePath(path)) ? null : 'must list paths relative to the working copy'),
  max_attempts: positive,
}

/** @type {Record<string, (value: string) => string | null>} */
const EDGE_CHECKS = {
  label: (value) => (value === 'PASS' || value === 'FAIL' ? null : 'must be PASS or FAIL'),
  max_visits: positive,
}

/**
 * @param {string} text the DOT file
 * @returns {{ ok: true, workflow: Workflow } | { ok: false, errors: string[] }}
 */
export const readWorkflow = (text) => {
  const parsed = parseDot(text)
  if (!parsed.ok) return parsed
  const { graph } = parsed
  /** @type {string[]} */
  const errors = []
  /** @type {Record<string, WorkflowNode>} */
  const nodes = {}
  for (const { id, attributes } of graph.nodes) {
    const node = nodeOf(id, attributes, errors)
    if (node !== null) nodes[id] = node
  }
  const kindOf = (/** @type {string} */ id) => nodes[id]?.kind ?? null
  const edges = graph.edges.map(({ from, to, attributes }) => edgeOf(from, to, attributes, kindOf(from), errors))
  const ids = graph.nodes.map(({ id }) => id)
  const outgoing = (/** @type {string} */ id) => edges.filter((edge) => edge.from === id)

  for (const node of Object.values(nodes)) checkExits(node, outgoing(node.id), errors)
  const starts = ids.filter((id) => kindOf(id) === 'start')
  const exits = ids.filter((id) => kindOf(id) === 'exit')
  if (starts.length !== 1) errors.push(`the workflow needs exactly one start node (shape=Mdiamond), has ${starts.length}`)
  if (exits.length === 0) errors.push('the workflow needs at least one exit node (shape=Msquare)')

  const order = walk(starts, edges, 'from', 'to')
  if (starts.length > 0) for (const id of ids.filter((id) => !order.includes(id))) errors.push(`node ${id} is unreachable from start`)
  const reaching = walk(exits, edges, 'to', 'from')
  if (exits.length > 0) for (const id of ids.filter((id) => !reaching.includes(id))) errors.push(`node ${id} never reaches an exit`)
  for (const loop of loopsOf(ids, edges.filter((edge) => edge.maxVisits === null))) errors.push(`loop ${loop.join(' -> ')} has no max_visits`)

  for (const id of order.filter((id) => id in nodes)) {
    const first = order.find((other) => edges.some((edge) => edge.from === other && edge.to === id))
    const node = nodes[id]
    node.phase ??= first === undefined ? null : nodes[first]?.phase ?? null
    if (node.phase === null && (node.kind === 'agent' || node.kind === 'gate')) errors.push(`node ${id} has no phase; set phase="<PHASE>" on it or on a node before it`)
  }
  const phases = [...new Set(order.map((id) => nodes[id]?.phase ?? null).filter((phase) => phase !== null))]
  for (const { from, to } of edges) {
    const [before, after] = [nodes[from]?.phase ?? null, nodes[to]?.phase ?? null]
    if (kindOf(to) === 'start') errors.push(`edge ${from} -> ${to}: no edge may enter the start node`)
    else if (after !== null && phases.indexOf(after) < phases.indexOf(/** @type {string} */ (before))) errors.push(`edge ${from} -> ${to} goes back from ${before} to ${after}`)
  }
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    workflow: {
      version: graph.attributes.version ?? null,
      skraftVersion: graph.attributes.skraft_version ?? null,
      goal: graph.attributes.goal ?? null,
      start: starts[0],
      nodes,
      order,
      edges,
      phases,
    },
  }
}

/**
 * @param {string} id @param {Record<string, string>} attributes @param {string[]} errors
 * @returns {WorkflowNode | null} null when its shape is not one a workflow takes
 */
const nodeOf = (id, attributes, errors) => {
  const { shape } = attributes
  const kind = KINDS.get(shape ?? '')
  if (kind === undefined) {
    errors.push(shape === undefined
      ? `node ${id} has no shape; declare it with shape=Mdiamond, Msquare, box or parallelogram`
      : `node ${id}: shape ${shape} is not supported (supported: ${[...KINDS.keys()].join(', ')})`)
    return null
  }
  const { required, optional } = ATTRIBUTES[kind]
  const allowed = [...COMMON, ...required, ...optional]
  for (const [key, value] of Object.entries(attributes)) {
    if (!allowed.includes(key)) {
      errors.push(`node ${id}: attribute ${key} is not supported on a ${shape} node (supported: ${allowed.join(', ')})`)
      continue
    }
    const problem = NODE_CHECKS[key]?.(value) ?? null
    if (problem !== null) errors.push(`node ${id}: ${key}=${JSON.stringify(value)} ${problem}`)
  }
  for (const key of required.filter((key) => !(key in attributes))) errors.push(`node ${id}: a ${shape} node needs ${key}="…"`)
  return {
    id,
    kind,
    phase: attributes.phase ?? null,
    agent: attributes.agent ?? null,
    gates: listOf(attributes.gate ?? ''),
    goal: attributes.goal_gate === 'true',
    locked: attributes.locked === 'true',
    unlock: attributes.unlock ?? null,
    outputs: listOf(attributes.outputs ?? ''),
    writes: listOf(attributes.writes ?? ''),
    maxAttempts: attributes.max_attempts === undefined ? null : Number(attributes.max_attempts),
  }
}

/**
 * @param {string} from @param {string} to @param {Record<string, string>} attributes
 * @param {NodeKind | null} source the kind of `from` @param {string[]} errors
 * @returns {WorkflowEdge}
 */
const edgeOf = (from, to, attributes, source, errors) => {
  const name = `edge ${from} -> ${to}`
  for (const [key, value] of Object.entries(attributes)) {
    if (!(key in EDGE_CHECKS)) {
      errors.push(`${name}: attribute ${key} is not supported (supported: ${Object.keys(EDGE_CHECKS).join(', ')})`)
      continue
    }
    const problem = EDGE_CHECKS[key](value)
    if (problem !== null) errors.push(`${name}: ${key}=${JSON.stringify(value)} ${problem}`)
  }
  const { label, max_visits: visits } = attributes
  if (label !== undefined && source !== 'gate') errors.push(`${name}: only an edge leaving a gate takes a label`)
  return {
    from,
    to,
    label: /** @type {'PASS' | 'FAIL' | null} */ (label ?? (source === 'gate' ? 'PASS' : null)),
    maxVisits: visits === undefined ? null : Number(visits),
  }
}

/** @param {WorkflowNode} node @param {WorkflowEdge[]} out its outgoing edges @param {string[]} errors */
const checkExits = (node, out, errors) => {
  const at = `node ${node.id}`
  if ((node.kind === 'start' || node.kind === 'agent') && out.length !== 1) errors.push(`${at}: ${node.kind} node needs exactly one outgoing edge, has ${out.length}`)
  if (node.kind === 'exit' && out.length > 0) errors.push(`${at}: exit node takes no outgoing edge, has ${out.length}`)
  if (node.kind !== 'gate') return
  const fail = out.filter((edge) => edge.label === 'FAIL').length
  if (out.length - fail !== 1) errors.push(`${at}: gate node needs exactly one PASS edge, has ${out.length - fail}`)
  if (fail > 1) errors.push(`${at}: gate node takes at most one FAIL edge, has ${fail}`)
}

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
  /** @type {string[][]} */
  const loops = []
  /** @type {Set<string>} */
  const done = new Set()
  /** @type {string[]} */
  const path = []
  /** @param {string} id */
  const visit = (id) => {
    path.push(id)
    for (const { from, to } of edges.filter((edge) => edge.from === id)) {
      if (path.includes(to)) loops.push([from, ...path.slice(path.indexOf(to))])
      else if (!done.has(to)) visit(to)
    }
    path.pop()
    done.add(id)
  }
  for (const id of ids) if (!done.has(id)) visit(id)
  return loops
}

/**
 * The locked nodes of the built-in workflow a repository workflow keeps, skips or breaks. A
 * kept one must keep its gates, its goal, its FAIL edge back to an agent of its phase, and no
 * path may reach the exit around it from the start or from an agent of its phase.
 * @param {Workflow} builtIn @param {Workflow} custom
 * @returns {{ errors: string[], unlocked: Array<{ node: string, reason: string }> }}
 */
export const checkLocks = (builtIn, custom) => {
  /** @type {string[]} */
  const errors = []
  /** @type {Array<{ node: string, reason: string }>} */
  const unlocked = []
  for (const node of Object.values(builtIn.nodes).filter((node) => node.locked)) {
    const kept = custom.nodes[node.id]
    if (kept?.kind !== 'gate') {
      errors.push(`locked node ${node.id} is missing; keep it with unlock="<reason>" to skip it`)
    } else if (kept.unlock !== null) {
      unlocked.push({ node: node.id, reason: kept.unlock })
    } else {
      const dropped = node.gates.filter((gate) => !kept.gates.includes(gate))
      if (dropped.length > 0) errors.push(`locked node ${node.id} drops ${dropped.join(', ')}; keep them, or skip the node with unlock="<reason>"`)
      if (node.goal && !kept.goal) errors.push(`locked node ${node.id} must stay goal_gate=true; skip it with unlock="<reason>" instead`)
      errors.push(...failEdge(builtIn, custom, kept), ...bypasses(custom, kept))
    }
  }
  return { errors, unlocked }
}

/**
 * A kept locked gate whose built-in one sends FAIL back must send it to an agent of its phase.
 * @param {Workflow} builtIn @param {Workflow} custom @param {WorkflowNode} kept
 */
const failEdge = (builtIn, custom, kept) => {
  if (!builtIn.edges.some((edge) => edge.from === kept.id && edge.label === 'FAIL')) return []
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
const reachesExitWithout = (workflow, from, avoided) => {
  const seen = new Set([from])
  const queue = [from]
  while (queue.length > 0) {
    const id = /** @type {string} */ (queue.shift())
    if (workflow.nodes[id].kind === 'exit') return true
    for (const { to } of workflow.edges.filter((edge) => edge.from === id && edge.to !== avoided && !seen.has(edge.to))) {
      seen.add(to)
      queue.push(to)
    }
  }
  return false
}

/** @param {WorkflowNode} node @returns {Array<[string, string | null]>} */
const factsOf = (node) => [
  ['kind', node.kind],
  ['agent', node.agent],
  ['gate', node.gates.join(',')],
  ['phase', node.phase],
  ['goal_gate', String(node.goal)],
  ['locked', String(node.locked)],
  ['unlock', node.unlock],
  ['outputs', node.outputs.join(', ')],
  ['writes', node.writes.join(', ')],
  ['max_attempts', node.maxAttempts === null ? null : String(node.maxAttempts)],
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
 */
const changesOf = (before, after, facts) => [...after].flatMap(([key, item]) => {
  const old = before.get(key)
  if (old === undefined) return []
  const was = new Map(facts(old))
  return facts(item).filter(([fact, value]) => was.get(fact) !== value).map(([fact, value]) => `${key}: ${fact} ${shown(was.get(fact) ?? null)} → ${shown(value)}`)
})

/**
 * What a repository workflow changes in another: nodes added, removed, changed, then edges.
 * @param {Workflow} from @param {Workflow} to
 * @returns {string[]}
 */
export const diffWorkflows = (from, to) => {
  const [before, after] = [new Map(Object.entries(from.nodes)), new Map(Object.entries(to.nodes))]
  const edgeKey = (/** @type {WorkflowEdge} */ edge) => `${edge.from} -> ${edge.to}`
  const [old, now] = [new Map(from.edges.map((edge) => [edgeKey(edge), edge])), new Map(to.edges.map((edge) => [edgeKey(edge), edge]))]
  return [
    ...[...after.values()].filter((node) => !before.has(node.id)).map((node) => `+ node ${node.id} (${[node.kind, node.agent, node.gates.join(',')].filter(Boolean).join(' ')})`),
    ...[...before.keys()].filter((id) => !after.has(id)).map((id) => `- node ${id}`),
    ...changesOf(before, after, factsOf).map((change) => `~ node ${change}`),
    ...[...now.keys()].filter((key) => !old.has(key)).map((key) => `+ edge ${key}`),
    ...[...old.keys()].filter((key) => !now.has(key)).map((key) => `- edge ${key}`),
    ...changesOf(old, now, edgeFactsOf).map((change) => `~ edge ${change}`),
  ]
}

/**
 * The DOT text with `skraft_version` set in its `graph [...]` statements, every other byte kept:
 * each value replaced, else added to the first statement, else a statement added after `{`.
 * @param {string} text a DOT file `parseDot` accepts
 * @param {string} version
 */
export const stampVersion = (text, version) => {
  const lexed = /** @type {{ tokens: import('./dot.mjs').DotToken[] }} */ (tokenizeDot(text))
  const tokens = lexed.tokens.filter((token) => token.kind !== 'newline')
  const value = `"${version}"`
  /** @type {Array<{ start: number, end: number, text: string }>} */
  const edits = []
  let inside = false
  /** @type {number | null} the `]` of the first graph statement */
  let closing = null
  tokens.forEach((token, index) => {
    if (isSymbol(token, '[') && isKeyword(tokens[index - 1], 'graph')) inside = true
    if (inside && isSymbol(token, ']')) {
      closing ??= index
      inside = false
    }
    if (inside && token.value === 'skraft_version' && isSymbol(tokens[index + 1], '=')) edits.push({ ...tokens[index + 2], text: value })
  })
  if (edits.length === 0 && closing !== null) {
    const last = tokens[closing - 1]
    edits.push({ start: last.end, end: last.end, text: `${isSymbol(last, '[') ? '' : ', '}skraft_version=${value}` })
  }
  if (edits.length === 0) {
    const brace = /** @type {import('./dot.mjs').DotToken} */ (tokens.find((token) => isSymbol(token, '{')))
    edits.push({ start: brace.end, end: brace.end, text: `\n  graph [skraft_version=${value}]` })
  }
  return edits.reduceRight((stamped, edit) => `${stamped.slice(0, edit.start)}${edit.text}${stamped.slice(edit.end)}`, text)
}
