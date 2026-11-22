import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadWorkflow } from '../../../../plugins/skraft-framework/engine/application/workflow/load-workflow.mjs'
import { BUILT_IN_WORKFLOW } from '../support/in-memory-host.mjs'
import { ejectedPipeline, edit, host, WITH_SECURITY } from './support.mjs'

const LENSES = {
  design_review: ['consistency', 'architecture-compliance', 'fitness'],
  distill_review: ['coverage', 'business-alignment', 'testability', 'boundary-enforcement'],
  deliver_review: ['test-integrity', 'architecture-boundaries', 'cold-reader', 'quality-gates', 'mock-fidelity', 'contract-fidelity'],
}
const PLUGIN_AGENTS = {
  'solution-researcher': 'plugin', 'solution-architect': 'plugin', 'acceptance-designer': 'plugin', 'software-engineer': 'plugin',
  ...Object.fromEntries(Object.values(LENSES).flat().map((lens) => [`${lens}-lens`, 'plugin'])),
  'finding-refuter': 'plugin', 'pr-writer': 'plugin',
}
const GATE_GONE = 'a gate node is gone: skraft runs no gate. The software engineer runs each gate through skraft_repl, and the DELIVER review reads the traced runs of its attempt; remove the node and its PASS and FAIL edges (skraft workflow diff shows the plugin\'s pipeline)'
/** The line, from 1, of the first line of the text that starts with `start`. */
const lineOf = (text, start) => text.split('\n').findIndex((line) => line.startsWith(start)) + 1
const node = (id, kind, fields = {}) => ({ id, kind, phase: null, agent: null, lenses: [], question: null, outputs: [], writes: [], maxAttempts: null, model: null, refuter: null, publish: null, when: null, fanOut: null, branches: [], mandatory: null, call: null, refutedBy: null, ...fields })
/**
 * A review fan-in as the run follows it: its lenses read from the branches of `<id>_lenses`, each lens node `<id>_<lens>`.
 * @param {{ triggers?: Record<string, string>, mandatory?: string[] }} [marks] the lenses' when=; the lenses marked mandatory=true, `review` for the fan-in
 */
const review = (id, phase, { triggers = {}, mandatory = [] } = {}) => node(id, 'review', {
  phase,
  lenses: LENSES[id],
  fanOut: `${id}_lenses`,
  mandatory: mandatory.includes('review') ? true : null,
  refutedBy: { id: `${id}_refuter`, mandatory: true },
  branches: LENSES[id].map((lens) => ({ id: `${id}_${lens.replaceAll('-', '_')}`, lens, when: triggers[lens] ?? null, mandatory: mandatory.includes(lens) ? true : null })),
})

/** The plugin's DELIVER review: a call to .skraft/review.skraft.dot, whose review is folded into it, each lens node named after its lens. */
const DELIVER_CALL = node('deliver_review', 'call', {
  phase: 'DELIVER',
  lenses: LENSES.deliver_review,
  fanOut: 'lenses',
  mandatory: true,
  branches: LENSES.deliver_review.map((lens) => ({ id: lens.replaceAll('-', '_'), lens, when: { 'quality-gates': 'delivery', 'mock-fidelity': 'mock', 'contract-fidelity': 'contract' }[lens] ?? null, mandatory: ['test-integrity', 'architecture-boundaries'].includes(lens) ? true : null })),
  refutedBy: { id: 'refuter', mandatory: true },
  call: { workflow: 'review', with: {}, inputs: { base: 'base', head: 'head', story: 'story', documents: 'documents', components: 'components', trace: 'trace' }, fanIn: 'verdict', mandatory: true },
})

/** check() refused with these errors, in this order. */
/** The plugin workflow a case's dot was edited from: the mutation loop's cases come from MUTATION_WORKFLOW. @param {string} dot */
const builtInOf = () => BUILT_IN_WORKFLOW

const refused = (name, errors) => ({ ok: false, name, errors, warnings: [], reason: `${name} is invalid: ${errors.join('; ')}` })

test('with no workflow designated, the plugin workflow runs and checks ok with its five phases', async () => {
  const { commands, deps } = host()

  assert.deepEqual(await commands.check(), { ok: true, name: 'skraft', errors: [], warnings: [], reason: 'skraft is valid: phases RESEARCH, DESIGN, DISTILL, DELIVER, PUBLISH' })
  const { workflow: { called, ...workflow }, ...loaded } = await loadWorkflow(deps, {})
  assert.deepEqual(Object.entries(called).map(([file, { path }]) => [file, path]), [['review', null]])
  assert.deepEqual({ ...loaded, workflow }, {
    ok: true,
    name: 'skraft',
   
    sources: PLUGIN_AGENTS,
    workflow: {
      version: '2',
      skraftVersion: null,
      goal: 'Deliver the story',
      start: 'start',
      nodes: {
        start: node('start', 'start'),
        research: node('research', 'agent', { phase: 'RESEARCH', agent: 'solution-researcher' }),
        design: node('design', 'agent', { phase: 'DESIGN', agent: 'solution-architect' }),
        design_review: review('design_review', 'DESIGN', { mandatory: ['review'] }),
        adr: node('adr', 'ask', { phase: 'DESIGN', question: 'adr-ratification' }),
        distill: node('distill', 'agent', { phase: 'DISTILL', agent: 'acceptance-designer' }),
        distill_review: review('distill_review', 'DISTILL', { mandatory: ['review'] }),
        scenario_review: node('scenario_review', 'ask', { phase: 'DISTILL', question: 'scenario-review' }),
        deliver: node('deliver', 'agent', { phase: 'DELIVER', agent: 'software-engineer' }),
       
        deliver_review: DELIVER_CALL,
        visuals: node('visuals', 'publish', { phase: 'DELIVER', publish: 'playwright-visuals', when: 'frontend' }),
        pr_writer: node('pr_writer', 'agent', { phase: 'PUBLISH', agent: 'pr-writer' }),
        publish: node('publish', 'publish', { phase: 'PUBLISH', publish: 'pull-request' }),
        exit: node('exit', 'exit', { phase: 'PUBLISH' }),
      },
      order: ['start', 'research', 'design', 'design_review', 'adr', 'distill', 'distill_review', 'scenario_review', 'deliver', 'deliver_review', 'visuals', 'pr_writer', 'publish', 'exit'],
      edges: [
        { from: 'start', to: 'research', label: null, maxVisits: null },
        { from: 'research', to: 'design', label: null, maxVisits: null },
        { from: 'design', to: 'design_review', label: null, maxVisits: null },
        { from: 'design_review', to: 'design', label: 'NEEDS_REWORK', maxVisits: 2 },
        { from: 'design_review', to: 'adr', label: 'APPROVED', maxVisits: null },
        { from: 'adr', to: 'distill', label: 'RATIFIED', maxVisits: null },
        { from: 'adr', to: 'design', label: 'REJECTED', maxVisits: 1 },
        { from: 'distill', to: 'distill_review', label: null, maxVisits: null },
        { from: 'distill_review', to: 'distill', label: 'NEEDS_REWORK', maxVisits: 2 },
        { from: 'distill_review', to: 'scenario_review', label: 'APPROVED', maxVisits: null },
        { from: 'scenario_review', to: 'deliver', label: 'APPROVED', maxVisits: null },
        { from: 'scenario_review', to: 'distill', label: 'REVISE', maxVisits: 2 },
        { from: 'deliver', to: 'deliver_review', label: null, maxVisits: null },
        { from: 'deliver_review', to: 'deliver', label: 'NEEDS_REWORK', maxVisits: 2 },
        { from: 'deliver_review', to: 'visuals', label: 'APPROVED', maxVisits: null },
        { from: 'visuals', to: 'pr_writer', label: null, maxVisits: null },
        { from: 'pr_writer', to: 'publish', label: null, maxVisits: null },
        { from: 'publish', to: 'exit', label: null, maxVisits: null },
      ],
      phases: ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'PUBLISH'],
      inputs: {},
    },
  })
})

test('a repository agent added between design and distill checks ok and runs in the DESIGN phase', async () => {
  const { commands, deps } = host({ files: ejectedPipeline(WITH_SECURITY), repository: ['acme-security-reviewer'] })

  assert.deepEqual(await commands.check(), { ok: true, name: '.skraft/pipeline.skraft.dot', errors: [], warnings: [], reason: '.skraft/pipeline.skraft.dot is valid: phases RESEARCH, DESIGN, DISTILL, DELIVER, PUBLISH' })
  const loaded = await loadWorkflow(deps, {})
  assert.equal(loaded.ok, true)
  assert.deepEqual(loaded.workflow.nodes.security, node('security', 'agent', {
    phase: 'DESIGN',
    agent: 'acme-security-reviewer',
    outputs: ['security/{date}/{slug}-review.md', 'notes.md'],
    writes: ['docs/security/', 'src/'],
    maxAttempts: 2,
  }))
  assert.deepEqual(loaded.workflow.order, ['start', 'research', 'design', 'security', 'design_review', 'adr', 'distill', 'distill_review', 'scenario_review', 'deliver', 'deliver_review', 'visuals', 'pr_writer', 'publish', 'exit'])
  assert.deepEqual(loaded.sources, { ...PLUGIN_AGENTS, 'acme-security-reviewer': 'repository' })
})

test('an agent neither the plugin nor the working copy provides is refused by name, unless agents are not asked', async () => {
  const { commands, deps } = host({ files: ejectedPipeline(WITH_SECURITY) })

  assert.deepEqual(await commands.check(), refused('.skraft/pipeline.skraft.dot', [
    'node security: agent acme-security-reviewer not found in the plugin, .claude/agents/ or .github/agents/',
  ]))
  const structural = await loadWorkflow(deps, { agents: false })
  assert.deepEqual([structural.ok, structural.sources, structural.workflow.phases], [true, {}, ['RESEARCH', 'DESIGN', 'DISTILL', 'DELIVER', 'PUBLISH']])
})

test('an invalid configuration is refused', async () => {
  const invalid = host({ files: { 'skraft-config.json': '{ "baseBranch": "-x" }' } })
  assert.deepEqual((await invalid.commands.check()).name, 'skraft-config.json')
  assert.equal((await invalid.commands.check()).ok, false)
})

test('a loop without max_visits is refused, naming the loop', async () => {
  const { commands } = host({ files: ejectedPipeline(edit(BUILT_IN_WORKFLOW, ['deliver_review -> deliver [label="NEEDS_REWORK", max_visits=2]', 'deliver_review -> deliver [label="NEEDS_REWORK"]'])) })

  assert.deepEqual(await commands.check(), refused('.skraft/pipeline.skraft.dot', ['loop deliver_review -> deliver -> deliver_review has no max_visits']))
})

test('a node the start cannot reach, or one that never reaches an exit, is refused', async () => {
  const orphan = host({
    files: ejectedPipeline(edit(
      BUILT_IN_WORKFLOW,
      ['  exit     [shape=Msquare]', '  exit     [shape=Msquare]\n  orphan   [shape=box, agent="software-engineer", phase="DELIVER"]\n  orphan -> exit'],
    )),
  })
  assert.deepEqual(await orphan.commands.check(), refused('.skraft/pipeline.skraft.dot', ['node orphan is unreachable from start']))

  const spinning = host({
    files: ejectedPipeline(edit(
      BUILT_IN_WORKFLOW,
      ['deliver_review -> deliver [label="NEEDS_REWORK", max_visits=2]', 'deliver_review -> spin [label="NEEDS_REWORK"]\n  spin [shape=box, agent="software-engineer"]\n  spin -> spin [max_visits=2]'],
    )),
  })
  assert.deepEqual(await spinning.commands.check(), refused('.skraft/pipeline.skraft.dot', ['node spin never reaches an exit']))
})

test('a workflow without one start or without an exit is refused', async () => {
  const noStart = host({ files: ejectedPipeline(edit(BUILT_IN_WORKFLOW, ['  start    [shape=Mdiamond]\n', ''], ['start -> research', 'research'])) })
  assert.deepEqual(await noStart.commands.check(), refused('.skraft/pipeline.skraft.dot', ['the workflow needs exactly one start node (shape=Mdiamond), has 0']))

  const noExit = host({ files: ejectedPipeline(edit(BUILT_IN_WORKFLOW, ['  exit     [shape=Msquare]\n', ''], ['  visuals -> pr_writer -> publish -> exit\n', '  visuals -> pr_writer -> publish\n'])) })
  assert.deepEqual(await noExit.commands.check(), refused('.skraft/pipeline.skraft.dot', [
    'node publish: publish node needs exactly one outgoing edge, has 0',
    'the workflow needs at least one exit node (shape=Msquare)',
  ]))
})
test('a node with a shape the engine does not run, or with none, is refused', async () => {
  const ellipse = host({ files: ejectedPipeline(edit(BUILT_IN_WORKFLOW, ['design   [shape=box,', 'design   [shape=ellipse,'], ['"acceptance-designer", phase="DISTILL"', '"acceptance-designer"'])) })
  assert.deepEqual(await ellipse.commands.check(), refused('.skraft/pipeline.skraft.dot', [
    'node design: shape ellipse is not supported (supported: Mdiamond, Msquare, box, parallelogram, component, note, octagon, tripleoctagon, hexagon, house)',
    'node design_review has no phase; set phase="<PHASE>" on it or on a node before it',
    'node adr has no phase; set phase="<PHASE>" on it or on a node before it',
    'node distill has no phase; set phase="<PHASE>" on it or on a node before it',
    'node distill_review has no phase; set phase="<PHASE>" on it or on a node before it',
    'node scenario_review has no phase; set phase="<PHASE>" on it or on a node before it',
  ]))

  const typo = host({ files: ejectedPipeline(edit(BUILT_IN_WORKFLOW, ['research -> design ->', 'research -> desing -> design ->'])) })
  assert.deepEqual(await typo.commands.check(), refused('.skraft/pipeline.skraft.dot', ['node desing has no shape; declare it with shape=Mdiamond, Msquare, box, parallelogram, component, note, octagon, tripleoctagon, hexagon or house']))
})

test('a workflow the DOT parser refuses is refused with the line at fault', async () => {
  const { commands } = host({ files: ejectedPipeline(edit(BUILT_IN_WORKFLOW, ['  exit     [shape=Msquare]', '  exit     [shape=Msquare]\n  { design }'])) })

  assert.deepEqual(await commands.check(), refused('.skraft/pipeline.skraft.dot', [`line ${lineOf(BUILT_IN_WORKFLOW, '  exit     [shape=Msquare]') + 1}: { } groups are not supported`]))
})

test('nodes grouped in a subgraph cluster run as if written outside it; its attributes only draw it, and a subgraph inside another is refused', async () => {
  const grouped = edit(BUILT_IN_WORKFLOW, ['  exit     [shape=Msquare]', '  exit     [shape=Msquare]\n  subgraph cluster_research {\n    label="Research"; graph [goal="drawn only"]\n    research; design [phase="DESIGN"]\n  }'])
  const { commands, deps } = host({ files: ejectedPipeline(grouped) })

  assert.equal((await commands.check()).ok, true)
  const { workflow } = await loadWorkflow(deps, {})
  const { workflow: plugin } = await loadWorkflow(deps, {})
  assert.deepEqual(workflow, plugin)

  const nested = host({ files: ejectedPipeline(edit(grouped, ['    research; design [phase="DESIGN"]\n', '    subgraph cluster_inner { research }\n'])) })
  assert.deepEqual((await nested.commands.check()).errors, [`line ${lineOf(grouped, '    research; design')}: a subgraph holds no other subgraph`])
})

test('every faulty node attribute is reported with its node, in declaration order', async () => {
  const faulty = `digraph faulty {
  start   [shape=Mdiamond]
  plan    [shape=box, agent="Solution Planner", phase="plan", max_attempts=0, outputs="/plan.md", writes="C:/src", model="GPT 5", locked=yes]
  draft   [shape=box, phase="DRAFT", outputs="notes/../draft.md"]
  "../../escape" [shape=box, agent="escaper"]
  check   [shape=parallelogram, gate="build,smoke", goal_gate=yes, locked=maybe, unlock=" ", phase="CHECK", agent="checker"]
  verify  [shape=parallelogram, gate="", phase="CHECK"]
  confirm [shape=parallelogram, phase="CHECK", label="Confirm"]
  done    [shape=Msquare]
  start -> plan -> draft -> "../../escape" -> check -> verify -> confirm -> done
}`
  const { commands } = host({ files: ejectedPipeline(faulty) })

  assert.deepEqual(await commands.check(), refused('.skraft/pipeline.skraft.dot', [
    'node plan: agent="Solution Planner" must be a kebab-case agent id',
    'node plan: phase="plan" must be an upper-case word',
    'node plan: max_attempts="0" must be a positive integer',
    'node plan: outputs="/plan.md" must list paths relative to the tracking folder, without ..',
    'node plan: writes="C:/src" must list paths relative to the working copy',
    'node plan: model="GPT 5" must be a model family, a kebab-case word whose every part starts with a letter, such as reviewer, planner or gpt-codex',
    'node plan: locked is gone with the gate node: skraft runs no gate',
    'node draft: outputs="notes/../draft.md" must list paths relative to the tracking folder, without ..',
    'node draft: a box node needs agent="…"',
    'node "../../escape": an id is a word of letters, digits, _ and -, since it names the node\'s files',
    `node check: ${GATE_GONE}`,
    'node check: goal_gate is gone with the gate node: skraft runs no gate',
    'node check: locked is gone with the gate node: skraft runs no gate',
    'node check: unlock is gone with the gate node: skraft runs no gate',
    'node check: attribute agent is not supported on a parallelogram node (supported: label, shape, phase, publish, when)',
    `node verify: ${GATE_GONE}`,
    `node confirm: ${GATE_GONE}`,
  ]))
})

test('every faulty edge, branching and phase order is reported', async () => {
  const faulty = `digraph faulty {
  start  [shape=Mdiamond]
  first  [shape=Mdiamond]
  plan   [shape=box, agent="planner", phase="PLAN"]
  build  [shape=box, agent="builder", phase="BUILD"]
  loose  [shape=box, agent="builder"]
  idle   [shape=parallelogram, publish="pull-request"]
  check  [shape=parallelogram, publish="pull-request"]
  done   [shape=Msquare]
  start -> plan
  start -> build
  first -> loose [weight=2]
  plan -> build [label="PASS"]
  build -> check
  check -> plan [label="FAIL", max_visits=2]
  check -> start [label="FAIL", max_visits=0]
  check -> done [label="pass"]
  check -> done
  done -> loose [max_visits=1]
  loose -> idle -> done
}`
  const { commands } = host({ files: ejectedPipeline(faulty) })

  assert.deepEqual(await commands.check(), refused('.skraft/pipeline.skraft.dot', [
    'edge first -> loose: attribute weight is not supported (supported: label, max_visits)',
    "edge plan -> build: only an edge leaving a review's fan-in (shape=tripleoctagon), a call (shape=house) or an ask node takes a label",
    "edge check -> plan: only an edge leaving a review's fan-in (shape=tripleoctagon), a call (shape=house) or an ask node takes a label",
    'edge check -> start: max_visits="0" must be a positive integer',
    "edge check -> start: only an edge leaving a review's fan-in (shape=tripleoctagon), a call (shape=house) or an ask node takes a label",
    "edge check -> done: only an edge leaving a review's fan-in (shape=tripleoctagon), a call (shape=house) or an ask node takes a label",
    'node start: start node needs exactly one outgoing edge, has 2',
    'node check: publish node needs exactly one outgoing edge, has 4',
    'node done: exit node takes no outgoing edge, has 1',
    'the workflow needs exactly one start node (shape=Mdiamond), has 2',
    'node loose has no phase; set phase="<PHASE>" on it or on a node before it',
    'node idle has no phase; set phase="<PHASE>" on it or on a node before it',
    'edge check -> plan goes back from BUILD to PLAN',
    'edge check -> start: no edge may enter the start node',
  ]))
})

test('an agent with two ways out is refused', async () => {
  const { commands } = host({ files: ejectedPipeline(edit(BUILT_IN_WORKFLOW, ['  deliver_review -> visuals ', '  design -> distill\n  deliver_review -> visuals '])) })

  assert.deepEqual(await commands.check(), refused('.skraft/pipeline.skraft.dot', ['node design: agent node needs exactly one outgoing edge, has 2']))
})
test('an ask node names a question the engine knows, and leads each of its answers somewhere, a refusal by an edge of its own', async () => {
  const cases = [
    { dot: edit(BUILT_IN_WORKFLOW, ['question="adr-ratification"', 'question="budget"']), errors: ['node adr: question="budget" must be one of adr-ratification, scenario-review'] },
    { dot: edit(BUILT_IN_WORKFLOW, [', question="adr-ratification"', '']), errors: ['node adr: a hexagon node needs question="…"'] },
    { dot: edit(BUILT_IN_WORKFLOW, ['  adr -> design    [label="REJECTED", max_visits=1]\n', '']), errors: ['node adr: REJECTED needs an edge of its own, back to the node whose work it refuses'] },
    { dot: edit(BUILT_IN_WORKFLOW, ['adr -> distill   [label="RATIFIED"]', 'adr -> distill']), errors: [] },
    { dot: edit(BUILT_IN_WORKFLOW, ['adr -> distill   [label="RATIFIED"]', 'adr -> distill   [label="PASS"]']), errors: ['edge adr -> distill: label="PASS" must be RATIFIED or REJECTED', 'node adr: no edge for RATIFIED; label one RATIFIED, or leave one unlabeled'] },
    {
      dot: edit(BUILT_IN_WORKFLOW, ['  exit     [shape=Msquare]', '  exit     [shape=Msquare]\n  note     [shape=box, agent="solution-researcher"]'], ['adr -> distill   [label="RATIFIED"]', 'adr -> distill\n  adr -> note\n  note -> distill']),
      errors: ['node adr: ask node takes at most one unlabeled edge, has 2'],
    },
    { dot: edit(BUILT_IN_WORKFLOW, ['adr -> design    [label="REJECTED", max_visits=1]', 'adr -> design    [label="REJECTED", max_visits=1]\n  adr -> design    [label="REJECTED", max_visits=1]']), errors: ['node adr: ask node takes one REJECTED edge, has 2'] },
  ]
  for (const { dot, errors } of cases) {
    const { commands } = host({ files: ejectedPipeline(dot), })
    const checked = await commands.check()
    assert.deepEqual(checked.errors, errors, dot)
  }
})

test('each="scenario" is gone, and the scenario review needs the node that writes the scenarios and the node that delivers them', async () => {
  const gone = (id) => `node ${id}: each is gone with the mutation the engine ran: mutation testing is a recipe of the session (the skraft-mutation skill), not a node`
  const cases = [
    { dot: edit(BUILT_IN_WORKFLOW, ['agent="software-engineer", phase="DELIVER"]', 'agent="software-engineer", phase="DELIVER", each="scenario"]']), errors: [gone('deliver')] },
    {
      dot: edit(BUILT_IN_WORKFLOW, ['agent="acceptance-designer", phase="DISTILL"]', 'agent="acceptance-designer", phase="DISTILL", each="scenario"]'], ['agent="pr-writer", phase="PUBLISH"]', 'agent="pr-writer", phase="PUBLISH", each="scenario"]']),
      errors: [gone('distill'), gone('pr_writer')],
    },
    {
      dot: edit(BUILT_IN_WORKFLOW, ['agent="software-engineer", phase="DELIVER"]', 'agent="pr-writer", phase="DELIVER"]']),
      errors: ['node scenario_review: question="scenario-review" needs the node that writes the scenarios and the node that delivers them'],
    },
    {
      dot: edit(BUILT_IN_WORKFLOW, ['agent="software-engineer", phase="DELIVER"]', 'agent="pr-writer", phase="DELIVER"]'], ['distill_review -> scenario_review [label="APPROVED"]', 'distill_review -> deliver [label="APPROVED"]'], ['  scenario_review [shape=hexagon, question="scenario-review"]\n', ''], ['  scenario_review -> deliver [label="APPROVED"]\n', ''], ['  scenario_review -> distill [label="REVISE", max_visits=2]\n', '']),
      errors: [],
    },
    { dot: edit(BUILT_IN_WORKFLOW, ['  scenario_review -> distill [label="REVISE", max_visits=2]\n', '']), errors: ['node scenario_review: REVISE needs an edge of its own, back to the node whose work it refuses'] },
  ]
  for (const { dot, errors } of cases) {
    const { commands } = host({ files: ejectedPipeline(dot), })
    assert.deepEqual((await commands.check()).errors, errors, dot)
  }
})
test('a publish node publishes the pull request or the screenshots, runs when a kind of component is there, takes no other attribute, and has a phase like any working node', async () => {
  const cases = [
    { dot: edit(BUILT_IN_WORKFLOW, ['publish="pull-request"]', 'publish="visuals"]']), errors: ['node publish: publish="visuals" must be pull-request or playwright-visuals'] },
    { dot: edit(BUILT_IN_WORKFLOW, ['publish="pull-request"]', 'publish="pull-request", goal_gate=true]']), errors: ['node publish: goal_gate is gone with the gate node: skraft runs no gate'] },
    { dot: edit(BUILT_IN_WORKFLOW, ['publish="pull-request"]', 'publish="pull-request", when="backend"]']), errors: ['node publish: when="backend" must be frontend'] },
    { dot: edit(BUILT_IN_WORKFLOW, ['phase="DELIVER"]', 'phase="DELIVER", when="frontend"]']), errors: ['node deliver: attribute when is not supported on a box node (supported: label, shape, phase, agent, model, outputs, writes, max_attempts)'] },
    { dot: edit(BUILT_IN_WORKFLOW, ['agent="pr-writer", phase="PUBLISH"]', 'agent="pr-writer", phase="PUBLISH", publish="pull-request"]']), errors: ['node pr_writer: attribute publish is not supported on a box node (supported: label, shape, phase, agent, model, outputs, writes, max_attempts)'] },
    {
      dot: 'digraph p {\n  start [shape=Mdiamond]\n  publish [shape=parallelogram, publish="pull-request"]\n  exit [shape=Msquare]\n  start -> publish -> exit\n}',
      errors: ['node publish has no phase; set phase="<PHASE>" on it or on a node before it'],
    },
  ]
  for (const { dot, errors } of cases) {
    const { commands } = host({ files: ejectedPipeline(dot), })
    assert.deepEqual((await commands.check()).errors, errors, dot)
  }
})
test('in an ejected workflow, a model=, a lens\'s @family or a refuter= that an agent rule masks is a warning naming the rule, the plugin\'s defaults included', async () => {
  const dot = edit(BUILT_IN_WORKFLOW,
    ['agent="solution-researcher", phase="RESEARCH"]', 'agent="solution-researcher", phase="RESEARCH", model="frontier"]'],
    ['phase="DESIGN"]', 'phase="DESIGN", model="economy"]'],
    ['lens="consistency"]', 'lens="consistency", model="standard"]'],
    ['lens="architecture-compliance"]', 'lens="architecture-compliance", model="standard"]'],
    ['design_review [shape=tripleoctagon, mandatory=true]', 'design_review [shape=tripleoctagon, mandatory=true, model="frontier", refuter="economy"]'])
  const local = { assign: { agents: { 'consistency-lens': 'economy', 'finding-refuter': 'standard' } } }
  const files = { ...ejectedPipeline(dot, { assign: { agents: { 'fitness-lens': { family: 'inherit' }, 'testability-lens': 'frontier' } } }), 'skraft-config.local.json': JSON.stringify(local) }
  const unmask = (agent) => `; set "${agent}": null in assign.agents to let the workflow choose`

  const checked = await host({ files }).commands.check()

  assert.equal(checked.ok, true)
  assert.deepEqual(checked.warnings, [
    `node research: model="frontier" is masked by assign.agents.solution-researcher (researcher, the plugin's default)${unmask('solution-researcher')}`,
    `node design: model="economy" is masked by assign.agents.solution-architect (planner, the plugin's default)${unmask('solution-architect')}`,
    `node design_review_consistency: model="standard" is masked by assign.agents.consistency-lens (economy)${unmask('consistency-lens')}`,
    `node design_review: model="frontier" is masked for fitness-lens by assign.agents.fitness-lens (inherit)${unmask('fitness-lens')}`,
    `node design_review: refuter="economy" is masked by assign.agents.finding-refuter (standard)${unmask('finding-refuter')}`,
  ])

  const unmasked = { ...files, 'skraft-config.local.json': JSON.stringify({ assign: { agents: { 'solution-researcher': null, 'solution-architect': { family: null }, 'consistency-lens': null, 'finding-refuter': { copilot: { effort: 'high' } } } } }) }
  assert.deepEqual((await host({ files: unmasked }).commands.check()).warnings.map((warning) => warning.split(' is masked')[0]), ['node design_review: model="frontier"'])
})

test('a review is a fan-out whose every branch runs one lens node into the same refuter, then its fan-in; each other shape is refused with its reason', async () => {
  const cases = [
    {
      what: 'a branch that skips its refuter',
      dot: edit(BUILT_IN_WORKFLOW, ['design_review_fitness -> design_review_refuter', 'design_review_fitness -> adr']),
      errors: ["node design_review_fitness: a lens node leads to its review's refuter (shape=octagon), not to adr"],
    },
    {
      what: 'a refuter that skips its fan-in',
      dot: edit(BUILT_IN_WORKFLOW, ['design_review_refuter -> design_review\n', 'design_review_refuter -> adr\n']),
      errors: [
        "node design_review_refuter: a refuter leads to its review's fan-in (shape=tripleoctagon), not to adr",
        'node design_review is unreachable from start',
      ],
    },
    {
      what: 'a lens node that enters the fan-in beside the refuter',
      dot: edit(BUILT_IN_WORKFLOW, ['design_review_fitness -> design_review_refuter', 'design_review_fitness -> design_review']),
      errors: [
        "node design_review_fitness: a lens node leads to its review's refuter (shape=octagon), not to design_review",
        'node design_review: a fan-in is entered only by its refuter (shape=octagon), not by design_review_fitness',
      ],
    },
    {
      what: 'a refuter entered by something else than a lens node',
      dot: edit(BUILT_IN_WORKFLOW, ['  adr -> design    [label="REJECTED", max_visits=1]', '  adr -> design_review_refuter    [label="REJECTED", max_visits=1]']),
      errors: ['node design_review_refuter: a refuter is entered only by the lens nodes of one fan-out, not by adr'],
    },
    {
      what: 'a fan-in two refuters enter',
      dot: edit(BUILT_IN_WORKFLOW,
        ['    design_review_refuter [shape=octagon, mandatory=true]', '    design_review_refuter [shape=octagon, mandatory=true]\n    design_review_second [shape=octagon]'],
        ['design_review_fitness -> design_review_refuter', 'design_review_fitness -> design_review_second -> design_review']),
      errors: [
        'node design_review_lenses: its branches end in design_review_refuter, design_review_second; every branch of a fan-out ends in the same refuter',
        'node design_review: it is entered by design_review_second, design_review_refuter; a fan-in closes one refuter',
      ],
    },
    {
      what: 'a branch with no lens node',
      dot: edit(BUILT_IN_WORKFLOW, ['design_review_lenses -> design_review_fitness -> design_review_refuter', 'design_review_lenses -> design_review_refuter']),
      errors: [
        'node design_review_fitness: lens node needs exactly one outgoing edge, has 0',
        'edge design_review_lenses -> design_review_refuter: each branch of a fan-out holds exactly one lens node (shape=note), then the refuter',
        'node design_review_fitness: a lens node is entered by exactly one edge, from a fan-out (shape=component)',
        'node design_review_refuter: a refuter is entered only by the lens nodes of one fan-out, not by design_review_lenses',
        'node design_review_fitness is unreachable from start',
        'node design_review_fitness never reaches an exit',
      ],
    },
    {
      what: 'a fan-in without a fan-out',
      dot: edit(BUILT_IN_WORKFLOW, ['design -> design_review_lenses', 'design -> design_review']),
      errors: [
        'node design_review: a fan-in is entered only by its refuter (shape=octagon), not by design',
        ...['design_review_lenses', 'design_review_consistency', 'design_review_architecture_compliance', 'design_review_fitness', 'design_review_refuter'].map((id) => `node ${id} is unreachable from start`),
      ],
    },
    {
      what: 'a lens node outside any review',
      dot: edit(BUILT_IN_WORKFLOW, ['adr -> distill   [label="RATIFIED"]', 'adr -> stray   [label="RATIFIED"]\n  stray [shape=note, lens="fitness"]\n  stray -> distill']),
      errors: [
        'node stray: a lens node is entered by exactly one edge, from a fan-out (shape=component)',
        "node stray: a lens node leads to its review's refuter (shape=octagon), not to distill",
      ],
    },
    {
      what: 'a lens node two fan-outs share',
      dot: edit(BUILT_IN_WORKFLOW, ['  distill_review_lenses -> distill_review_coverage', '  distill_review_lenses -> design_review_fitness\n  distill_review_lenses -> distill_review_coverage']),
      errors: [
        'node design_review_fitness: a lens node is entered by exactly one edge, from a fan-out (shape=component)',
        'node design_review_refuter: its lens nodes come from design_review_lenses, distill_review_lenses; a refuter closes one fan-out',
        'node distill_review_lenses: its branches end in design_review_refuter, distill_review_refuter; every branch of a fan-out ends in the same refuter',
        'loop design_review_fitness -> design_review_refuter -> design_review -> adr -> distill -> distill_review_lenses -> design_review_fitness has no max_visits',
        'edge distill_review_lenses -> design_review_fitness goes back from DISTILL to DESIGN',
      ],
    },
    {
      what: 'a verdict edge on the fan-out',
      dot: edit(BUILT_IN_WORKFLOW, ['design_review -> design  [label="NEEDS_REWORK", max_visits=2]', 'design_review_lenses -> design  [label="NEEDS_REWORK", max_visits=1]']),
      errors: [
        "edge design_review_lenses -> design: only an edge leaving a review's fan-in (shape=tripleoctagon), a call (shape=house) or an ask node takes a label",
        'edge design_review_lenses -> design: each branch of a fan-out holds exactly one lens node (shape=note), then the refuter',
      ],
    },
    {
      what: 'a fan-out with no branch',
      dot: edit(BUILT_IN_WORKFLOW, ['design -> design_review_lenses', 'design -> design_review_lenses\n  side_lenses [shape=component]\n  design_review_lenses -> side_lenses']),
      errors: [
        'edge design_review_lenses -> side_lenses: each branch of a fan-out holds exactly one lens node (shape=note), then the refuter',
        'node side_lenses: a fan-out needs one branch per lens, has none',
        'node side_lenses never reaches an exit',
      ],
    },
    {
      what: 'a refuter with an attribute it does not take',
      dot: edit(BUILT_IN_WORKFLOW, ['design_review_refuter [shape=octagon, mandatory=true]', 'design_review_refuter [shape=octagon, mandatory=true, model="frontier"]']),
      errors: ['node design_review_refuter: attribute model is not supported on a octagon node (supported: label, shape, phase, mandatory)'],
    },
    {
      what: 'a trigger the engine does not know',
      dot: edit(BUILT_IN_WORKFLOW, ['lens="coverage"', 'lens="coverage", when="frontend"']),
      errors: ['node distill_review_coverage: when="frontend" must be mock or contract or delivery'],
    },
  ]
  for (const { what, dot, errors } of cases) {
    assert.deepEqual((await host({ files: ejectedPipeline(dot) }).commands.check()).errors, errors, what)
  }
})

test('a workflow still written with lenses= on a review node is refused, each such node with the nodes and edges that replace it', async () => {
  const former = edit(BUILT_IN_WORKFLOW,
    ['  deliver_review [shape=house, workflow="review", mandatory=true]\n',
      '  deliver_review [shape=component, lenses="test-integrity, cold-reader@frontier,mock-fidelity,contract-fidelity", label="Delivery review", phase="DELIVER", model="economy", refuter="frontier", mandatory=true]\n'])

  const checked = await host({ files: ejectedPipeline(former) }).commands.check()

  assert.deepEqual(checked.errors, [
    'node deliver_review: lenses="test-integrity, cold-reader@frontier,mock-fidelity,contract-fidelity" is the former review form, no longer read; replace node deliver_review with the plugin\'s call:'
      + ' deliver_review [shape=house, workflow="review", label="Delivery review", phase="DELIVER"];'
      + ' keep the edges entering and leaving deliver_review; its lenses live in review: skraft workflow eject review copies it into .skraft/review.skraft.dot,'
      + ' where its fan-in takes model="economy" and refuter="frontier"; the plugin\'s mandatory=true stays on deliver_review',
  ])
  const plain = edit(BUILT_IN_WORKFLOW, ['  deliver_review [shape=house, workflow="review", mandatory=true]\n', '  deliver_review [shape=component, lenses="test-integrity"]\n'])
  assert.deepEqual((await host({ files: ejectedPipeline(plain) }).commands.check()).errors, [
    'node deliver_review: lenses="test-integrity" is the former review form, no longer read; replace node deliver_review with the plugin\'s call: deliver_review [shape=house, workflow="review"];'
      + ' keep the edges entering and leaving deliver_review; its lenses live in review: skraft workflow eject review copies it into .skraft/review.skraft.dot; the plugin\'s mandatory=true stays on deliver_review',
  ])
})
