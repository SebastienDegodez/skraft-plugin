import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadWorkflow } from '../../../../plugins/skraft-framework/engine/application/workflow/load-workflow.mjs'
import { BUILT_IN_WORKFLOW } from '../support/in-memory-host.mjs'
import { ejectedPipeline, edit, host, WITH_SECURITY } from './support.mjs'

const LENSES = {
  design_review: ['consistency', 'architecture-compliance', 'fitness'],
  distill_review: ['coverage', 'business-alignment', 'testability', 'boundary-enforcement'],
  deliver_review: ['test-integrity', 'architecture-boundaries', 'cold-reader', 'mock-fidelity', 'contract-fidelity'],
  mutation_review: ['test-integrity'],
}
const PLUGIN_AGENTS = {
  'solution-researcher': 'plugin', 'solution-architect': 'plugin', 'acceptance-designer': 'plugin', 'software-engineer': 'plugin',
  ...Object.fromEntries(Object.values(LENSES).flat().map((lens) => [`${lens}-lens`, 'plugin'])),
  'finding-refuter': 'plugin', 'pr-writer': 'plugin',
}
/** The line, from 1, of the first line of the text that starts with `start`. */
const lineOf = (text, start) => text.split('\n').findIndex((line) => line.startsWith(start)) + 1
const node = (id, kind, fields = {}) => ({ id, kind, phase: null, agent: null, gates: [], lenses: [], question: null, goal: false, locked: false, unlock: null, outputs: [], writes: [], maxAttempts: null, model: null, refuter: null, each: null, publish: null, when: null, fanOut: null, branches: [], mandatory: null, call: null, ...fields })
/**
 * A review fan-in as the run follows it: its lenses read from the branches of `<id>_lenses`, each lens node `<id>_<lens>`.
 * @param {{ triggers?: Record<string, string>, mandatory?: string[] }} [marks] the lenses' when=; the lenses marked mandatory=true, `review` for the fan-in
 */
const review = (id, phase, { triggers = {}, mandatory = [] } = {}) => node(id, 'review', {
  phase,
  lenses: LENSES[id],
  fanOut: `${id}_lenses`,
  mandatory: mandatory.includes('review') ? true : null,
  branches: LENSES[id].map((lens) => ({ id: `${id}_${lens.replaceAll('-', '_')}`, lens, when: triggers[lens] ?? null, mandatory: mandatory.includes(lens) ? true : null })),
})

/** The plugin's DELIVER review: a call to .skraft/review.skraft.dot, whose review is folded into it, each lens node named after its lens. */
const DELIVER_CALL = node('deliver_review', 'call', {
  phase: 'DELIVER',
  lenses: LENSES.deliver_review,
  fanOut: 'lenses',
  mandatory: true,
  branches: LENSES.deliver_review.map((lens) => ({ id: lens.replaceAll('-', '_'), lens, when: { 'mock-fidelity': 'mock', 'contract-fidelity': 'contract' }[lens] ?? null, mandatory: ['test-integrity', 'architecture-boundaries'].includes(lens) ? true : null })),
  call: { workflow: 'review', with: {}, inputs: { base: 'base', head: 'head', story: 'story', documents: 'documents', components: 'components' }, fanIn: 'verdict', mandatory: true },
})

/** check() refused with these errors, in this order. */
const refused = (name, errors) => ({ ok: false, name, errors, unlocked: [], warnings: [], reason: `${name} is invalid: ${errors.join('; ')}` })

test('with no workflow designated, the plugin workflow runs and checks ok with its five phases', async () => {
  const { commands, deps } = host()

  assert.deepEqual(await commands.check(), { ok: true, name: 'skraft', errors: [], unlocked: [], warnings: [], reason: 'skraft is valid: phases RESEARCH, DESIGN, DISTILL, DELIVER, PUBLISH' })
  const { workflow: { called, ...workflow }, ...loaded } = await loadWorkflow(deps, {})
  assert.deepEqual(Object.entries(called).map(([file, { path }]) => [file, path]), [['review', null]])
  assert.deepEqual({ ...loaded, workflow }, {
    ok: true,
    name: 'skraft',
    unlocked: [],
    sources: PLUGIN_AGENTS,
    workflow: {
      version: '2',
      skraftVersion: null,
      goal: 'Deliver the story',
      start: 'start',
      nodes: {
        start: node('start', 'start'),
        publish_consent: node('publish_consent', 'ask', { phase: 'RESEARCH', question: 'publish-consent' }),
        visuals_consent: node('visuals_consent', 'ask', { phase: 'RESEARCH', question: 'reporting-consent' }),
        research: node('research', 'agent', { phase: 'RESEARCH', agent: 'solution-researcher' }),
        design: node('design', 'agent', { phase: 'DESIGN', agent: 'solution-architect' }),
        design_review: review('design_review', 'DESIGN', { mandatory: ['review'] }),
        adr: node('adr', 'ask', { phase: 'DESIGN', question: 'adr-ratification' }),
        distill: node('distill', 'agent', { phase: 'DISTILL', agent: 'acceptance-designer' }),
        distill_review: review('distill_review', 'DISTILL', { mandatory: ['review'] }),
        deliver: node('deliver', 'agent', { phase: 'DELIVER', agent: 'software-engineer' }),
        gates: node('gates', 'gate', { phase: 'DELIVER', gates: ['build', 'format', 'lint', 'test', 'architecture', 'coverage'], goal: true, locked: true }),
        mutation: node('mutation', 'gate', { phase: 'DELIVER', gates: ['mutation'], goal: true, locked: true }),
        kill_mutants: node('kill_mutants', 'agent', { phase: 'DELIVER', agent: 'software-engineer', each: 'survivor-file' }),
        mutation_review: review('mutation_review', 'DELIVER', { mandatory: ['review'] }),
        deliver_review: DELIVER_CALL,
        visuals: node('visuals', 'publish', { phase: 'DELIVER', publish: 'playwright-visuals', when: 'frontend' }),
        pr_writer: node('pr_writer', 'agent', { phase: 'PUBLISH', agent: 'pr-writer' }),
        publish: node('publish', 'publish', { phase: 'PUBLISH', publish: 'pull-request' }),
        exit: node('exit', 'exit', { phase: 'PUBLISH' }),
      },
      order: ['start', 'publish_consent', 'visuals_consent', 'research', 'design', 'design_review', 'adr', 'distill', 'distill_review', 'deliver', 'gates', 'mutation', 'kill_mutants', 'deliver_review', 'mutation_review', 'visuals', 'pr_writer', 'publish', 'exit'],
      edges: [
        { from: 'start', to: 'publish_consent', label: null, maxVisits: null },
        { from: 'publish_consent', to: 'visuals_consent', label: null, maxVisits: null },
        { from: 'visuals_consent', to: 'research', label: null, maxVisits: null },
        { from: 'research', to: 'design', label: null, maxVisits: null },
        { from: 'design', to: 'design_review', label: null, maxVisits: null },
        { from: 'design_review', to: 'design', label: 'NEEDS_REWORK', maxVisits: 3 },
        { from: 'design_review', to: 'adr', label: 'APPROVED', maxVisits: null },
        { from: 'adr', to: 'distill', label: 'RATIFIED', maxVisits: null },
        { from: 'adr', to: 'design', label: 'REJECTED', maxVisits: 3 },
        { from: 'distill', to: 'distill_review', label: null, maxVisits: null },
        { from: 'distill_review', to: 'distill', label: 'NEEDS_REWORK', maxVisits: 3 },
        { from: 'distill_review', to: 'deliver', label: 'APPROVED', maxVisits: null },
        { from: 'deliver', to: 'gates', label: null, maxVisits: null },
        { from: 'gates', to: 'deliver', label: 'FAIL', maxVisits: 3 },
        { from: 'gates', to: 'mutation', label: 'PASS', maxVisits: null },
        { from: 'mutation', to: 'kill_mutants', label: 'FAIL', maxVisits: 5 },
        { from: 'kill_mutants', to: 'mutation_review', label: null, maxVisits: null },
        { from: 'mutation_review', to: 'kill_mutants', label: 'NEEDS_REWORK', maxVisits: 3 },
        { from: 'mutation_review', to: 'gates', label: 'APPROVED', maxVisits: null },
        { from: 'mutation', to: 'deliver_review', label: 'PASS', maxVisits: null },
        { from: 'deliver_review', to: 'deliver', label: 'NEEDS_REWORK', maxVisits: 3 },
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

  assert.deepEqual(await commands.check(), { ok: true, name: '.skraft/pipeline.skraft.dot', errors: [], unlocked: [], warnings: [], reason: '.skraft/pipeline.skraft.dot is valid: phases RESEARCH, DESIGN, DISTILL, DELIVER, PUBLISH' })
  const loaded = await loadWorkflow(deps, {})
  assert.equal(loaded.ok, true)
  assert.deepEqual(loaded.workflow.nodes.security, node('security', 'agent', {
    phase: 'DESIGN',
    agent: 'acme-security-reviewer',
    outputs: ['security/{date}/{slug}-review.md', 'notes.md'],
    writes: ['docs/security/', 'src/'],
    maxAttempts: 2,
  }))
  assert.deepEqual(loaded.workflow.order, ['start', 'publish_consent', 'visuals_consent', 'research', 'design', 'security', 'design_review', 'adr', 'distill', 'distill_review', 'deliver', 'gates', 'mutation', 'kill_mutants', 'deliver_review', 'mutation_review', 'visuals', 'pr_writer', 'publish', 'exit'])
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
  const { commands } = host({ files: ejectedPipeline(edit(BUILT_IN_WORKFLOW, ['[label="FAIL", max_visits=3]', '[label="FAIL"]'])) })

  assert.deepEqual(await commands.check(), refused('.skraft/pipeline.skraft.dot', ['loop gates -> deliver -> gates has no max_visits']))
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
      ['gates -> deliver [label="FAIL", max_visits=3]', 'gates -> spin [label="FAIL"]\n  spin [shape=box, agent="software-engineer"]\n  spin -> spin [max_visits=2]'],
    )),
  })
  assert.deepEqual(await spinning.commands.check(), refused('.skraft/pipeline.skraft.dot', ['node spin never reaches an exit']))
})

test('a workflow without one start or without an exit is refused', async () => {
  const noStart = host({ files: ejectedPipeline(edit(BUILT_IN_WORKFLOW, ['  start    [shape=Mdiamond]\n', ''], ['start -> publish_consent', 'publish_consent'])) })
  assert.deepEqual(await noStart.commands.check(), refused('.skraft/pipeline.skraft.dot', ['the workflow needs exactly one start node (shape=Mdiamond), has 0']))

  const noExit = host({ files: ejectedPipeline(edit(BUILT_IN_WORKFLOW, ['  exit     [shape=Msquare]\n', ''], ['  visuals -> pr_writer -> publish -> exit\n', '  visuals -> pr_writer -> publish\n'])) })
  assert.deepEqual(await noExit.commands.check(), refused('.skraft/pipeline.skraft.dot', [
    'node publish: publish node needs exactly one outgoing edge, has 0',
    'the workflow needs at least one exit node (shape=Msquare)',
  ]))
})

test('removing the locked gates node is refused, whether it is dropped or turned into an agent', async () => {
  const dropped = edit(
    BUILT_IN_WORKFLOW,
    [/  gates    \[.*\]\n/.exec(BUILT_IN_WORKFLOW)[0], ''],
    ['deliver -> gates', 'deliver -> mutation'],
    ['  gates -> deliver [label="FAIL", max_visits=3]\n  gates -> mutation [label="PASS"]\n', ''],
    ['mutation_review -> gates [label="APPROVED"]', 'mutation_review -> mutation [label="APPROVED"]'],
  )
  const error = 'locked node gates is missing; keep it with unlock="<reason>" to skip it'
  assert.deepEqual(await host({ files: ejectedPipeline(dropped) }).commands.check(), refused('.skraft/pipeline.skraft.dot', [error]))

  const turned = edit(
    BUILT_IN_WORKFLOW,
    [/  gates    \[.*\]\n/.exec(BUILT_IN_WORKFLOW)[0], '  gates    [shape=box, agent="software-engineer", phase="DELIVER"]\n'],
    ['  gates -> deliver [label="FAIL", max_visits=3]\n  gates -> mutation [label="PASS"]\n', '  gates -> mutation\n'],
  )
  assert.deepEqual(await host({ files: ejectedPipeline(turned) }).commands.check(), refused('.skraft/pipeline.skraft.dot', [error]))

  const killLoop = [/  kill_mutants \[.*\]\n(  mutation_review\w* \[.*\]\n)+/.exec(BUILT_IN_WORKFLOW)[0], '']
  const mutationEdges = '  mutation -> kill_mutants [label="FAIL", max_visits=5]\n  kill_mutants -> mutation_review_lenses\n  mutation_review_lenses -> mutation_review_test_integrity -> mutation_review\n  mutation_review -> kill_mutants [label="NEEDS_REWORK", max_visits=3]\n  mutation_review -> gates [label="APPROVED"]\n  mutation -> deliver_review [label="PASS"]\n'
  const mutationMissing = 'locked node mutation is missing; keep it with unlock="<reason>" to skip it'
  const mutationDropped = edit(
    BUILT_IN_WORKFLOW,
    [/  mutation \[.*\]\n/.exec(BUILT_IN_WORKFLOW)[0], ''],
    killLoop,
    [`  gates -> mutation [label="PASS"]\n${mutationEdges}`, '  gates -> deliver_review [label="PASS"]\n'],
  )
  const mutationReviewMissing = 'mandatory node mutation_review is missing as a review fan-in (shape=tripleoctagon); this node is mandatory and cannot be removed'
  assert.deepEqual(await host({ files: ejectedPipeline(mutationDropped) }).commands.check(), refused('.skraft/pipeline.skraft.dot', [mutationMissing, mutationReviewMissing]))

  const mutationTurned = edit(
    BUILT_IN_WORKFLOW,
    [/  mutation \[.*\]\n/.exec(BUILT_IN_WORKFLOW)[0], '  mutation [shape=box, agent="software-engineer", phase="DELIVER"]\n'],
    killLoop,
    [mutationEdges, '  mutation -> deliver_review\n'],
  )
  assert.deepEqual(await host({ files: ejectedPipeline(mutationTurned) }).commands.check(), refused('.skraft/pipeline.skraft.dot', [
    'mutation reaches the exit without passing gates; keep the run going through gates, or skip gates with unlock="<reason>"',
    mutationMissing,
    mutationReviewMissing,
  ]))
})

test('the locked gates node kept with unlock is skipped and said so; dropping gates from it without unlock is refused', async () => {
  const unlocked = host({ files: ejectedPipeline(edit(BUILT_IN_WORKFLOW, ['gate="build,format,lint,test,architecture,coverage"', 'gate="build", unlock="the CI runs the other gates"'])) })
  assert.deepEqual(await unlocked.commands.check(), {
    ok: true,
    name: '.skraft/pipeline.skraft.dot',
    errors: [],
    unlocked: [{ node: 'gates', reason: 'the CI runs the other gates' }],
    warnings: [],
    reason: '.skraft/pipeline.skraft.dot is valid: phases RESEARCH, DESIGN, DISTILL, DELIVER, PUBLISH; gates is unlocked and skipped: the CI runs the other gates',
  })

  const trimmed = host({ files: ejectedPipeline(edit(BUILT_IN_WORKFLOW, ['gate="build,format,lint,test,architecture,coverage"', 'gate="lint,build,format,test"'])) })
  assert.deepEqual(await trimmed.commands.check(), refused('.skraft/pipeline.skraft.dot', [
    'locked node gates drops architecture, coverage; keep them, or skip the node with unlock="<reason>"',
  ]))

  const mutationTrimmed = host({ files: ejectedPipeline(edit(BUILT_IN_WORKFLOW, ['gate="mutation"', 'gate="build"'])) })
  assert.deepEqual(await mutationTrimmed.commands.check(), refused('.skraft/pipeline.skraft.dot', [
    'locked node mutation drops mutation; keep them, or skip the node with unlock="<reason>"',
  ]))
})

test('a node with a shape the engine does not run, or with none, is refused', async () => {
  const ellipse = host({ files: ejectedPipeline(edit(BUILT_IN_WORKFLOW, ['design   [shape=box,', 'design   [shape=ellipse,'], ['"acceptance-designer", phase="DISTILL"', '"acceptance-designer"'])) })
  assert.deepEqual(await ellipse.commands.check(), refused('.skraft/pipeline.skraft.dot', [
    'node design: shape ellipse is not supported (supported: Mdiamond, Msquare, box, parallelogram, component, note, tripleoctagon, hexagon, house)',
    'node design_review has no phase; set phase="<PHASE>" on it or on a node before it',
    'node adr has no phase; set phase="<PHASE>" on it or on a node before it',
    'node distill has no phase; set phase="<PHASE>" on it or on a node before it',
    'node distill_review has no phase; set phase="<PHASE>" on it or on a node before it',
  ]))

  const typo = host({ files: ejectedPipeline(edit(BUILT_IN_WORKFLOW, ['research -> design ->', 'research -> desing -> design ->'])) })
  assert.deepEqual(await typo.commands.check(), refused('.skraft/pipeline.skraft.dot', ['node desing has no shape; declare it with shape=Mdiamond, Msquare, box, parallelogram, component, note, tripleoctagon, hexagon or house']))
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
    'node plan: attribute locked is not supported on a box node (supported: label, shape, phase, agent, model, outputs, writes, max_attempts, each)',
    'node draft: outputs="notes/../draft.md" must list paths relative to the tracking folder, without ..',
    'node draft: a box node needs agent="…"',
    'node "../../escape": an id is a word of letters, digits, _ and -, since it names the node\'s files',
    'node check: gate="build,smoke" must list gates among build, format, lint, test, architecture, coverage, mutation',
    'node check: goal_gate="yes" must be true or false',
    'node check: locked="maybe" must be true or false',
    'node check: unlock=" " needs the reason the node is skipped',
    'node check: attribute agent is not supported on a parallelogram node (supported: label, shape, phase, gate, goal_gate, locked, unlock)',
    'node verify: gate="" must list gates among build, format, lint, test, architecture, coverage, mutation',
    'node confirm: a parallelogram node needs gate="…"',
  ]))
})

test('every faulty edge, branching and phase order is reported', async () => {
  const faulty = `digraph faulty {
  start  [shape=Mdiamond]
  first  [shape=Mdiamond]
  plan   [shape=box, agent="planner", phase="PLAN"]
  build  [shape=box, agent="builder", phase="BUILD"]
  loose  [shape=box, agent="builder"]
  idle   [shape=parallelogram, gate="lint"]
  check  [shape=parallelogram, gate="test"]
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
    "edge plan -> build: only an edge leaving a gate, a review's fan-in (shape=tripleoctagon), a call (shape=house) or an ask node takes a label",
    'edge check -> start: max_visits="0" must be a positive integer',
    'edge check -> done: label="pass" must be PASS or FAIL',
    'node start: start node needs exactly one outgoing edge, has 2',
    'node check: gate node needs exactly one PASS edge, has 2',
    'node check: gate node takes at most one FAIL edge, has 2',
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

test('a workflow that lets the run reach the exit around the locked gates is refused', async () => {
  const bypass = 'keep the run going through gates, or skip gates with unlock="<reason>"'
  const mutationBypass = 'keep the run going through mutation, or skip mutation with unlock="<reason>"'
  const aroundMutation = ['start', 'deliver', 'kill_mutants'].map((node) => `${node} reaches the exit without passing mutation; ${mutationBypass}`)
  const aroundReview = ['start', 'deliver'].map((node) => `${node} reaches the exit without passing mandatory node deliver_review; this node is mandatory and cannot be removed`)
  const cases = [
    {
      dot: edit(BUILT_IN_WORKFLOW, ['gates -> deliver [label="FAIL", max_visits=3]', 'gates -> exit [label="FAIL"]']),
      errors: ['locked node gates must send FAIL back to an agent of DELIVER, not to exit', ...aroundMutation, ...aroundReview],
    },
    {
      dot: edit(BUILT_IN_WORKFLOW,
        ['  exit     [shape=Msquare]', '  exit     [shape=Msquare]\n  review   [shape=box, agent="solution-architect", phase="REVIEW"]\n  reviewed [shape=Msquare]'],
        ['gates -> deliver [label="FAIL", max_visits=3]', 'gates -> review [label="FAIL"]\n  review -> reviewed']),
      errors: ['locked node gates must send FAIL back to an agent of DELIVER, not to review', ...aroundMutation, ...aroundReview],
    },
    {
      dot: edit(BUILT_IN_WORKFLOW, ['  gates -> deliver [label="FAIL", max_visits=3]\n', '']),
      errors: ['locked node gates has no FAIL edge back to an agent of DELIVER'],
    },
    {
      dot: edit(BUILT_IN_WORKFLOW,
        ['distill_review -> deliver [label="APPROVED"]', 'distill_review -> gates [label="APPROVED"]'],
        ['deliver -> gates\n', 'deliver -> mutation\n'],
        ['  gates -> mutation [label="PASS"]\n', '  gates -> deliver\n']),
      errors: [`deliver reaches the exit without passing gates; ${bypass}`],
    },
    {
      dot: edit(BUILT_IN_WORKFLOW,
        ['  exit     [shape=Msquare]', '  exit     [shape=Msquare]\n  quick    [shape=parallelogram, gate="build"]'],
        ['deliver -> gates\n', 'deliver -> quick\n  quick -> exit [label="PASS"]\n  quick -> gates [label="FAIL"]\n']),
      errors: [`start reaches the exit without passing gates; ${bypass}`, `deliver reaches the exit without passing gates; ${bypass}`, ...aroundMutation, ...aroundReview],
    },
    {
      dot: edit(BUILT_IN_WORKFLOW, ['goal_gate=true, locked=true', 'goal_gate=false, locked=true']),
      errors: ['locked node gates must stay goal_gate=true; skip it with unlock="<reason>" instead'],
    },
    {
      dot: edit(BUILT_IN_WORKFLOW, ['gate="mutation", goal_gate=true', 'gate="mutation", goal_gate=false']),
      errors: ['locked node mutation must stay goal_gate=true; skip it with unlock="<reason>" instead'],
    },
  ]
  for (const { dot, errors } of cases) {
    const { commands } = host({ files: ejectedPipeline(dot) })
    assert.deepEqual(await commands.check(), refused('.skraft/pipeline.skraft.dot', errors))
  }
})

test('an ask node names a question the engine knows, and leads each of its answers somewhere, a refusal by an edge of its own', async () => {
  const cases = [
    { dot: edit(BUILT_IN_WORKFLOW, ['question="adr-ratification"', 'question="budget"']), errors: ['node adr: question="budget" must be one of adr-ratification, reporting-consent, publish-consent'] },
    { dot: edit(BUILT_IN_WORKFLOW, [', question="adr-ratification"', '']), errors: ['node adr: a hexagon node needs question="…"'] },
    { dot: edit(BUILT_IN_WORKFLOW, ['  adr -> design    [label="REJECTED", max_visits=3]\n', '']), errors: ['node adr: REJECTED needs an edge of its own, back to the node whose work it refuses'] },
    { dot: edit(BUILT_IN_WORKFLOW, ['adr -> distill   [label="RATIFIED"]', 'adr -> distill']), errors: [] },
    { dot: edit(BUILT_IN_WORKFLOW, ['adr -> distill   [label="RATIFIED"]', 'adr -> distill   [label="PASS"]']), errors: ['edge adr -> distill: label="PASS" must be RATIFIED or REJECTED', 'node adr: no edge for RATIFIED; label one RATIFIED, or leave one unlabeled'] },
    {
      dot: edit(BUILT_IN_WORKFLOW, ['  exit     [shape=Msquare]', '  exit     [shape=Msquare]\n  note     [shape=box, agent="solution-researcher"]'], ['adr -> distill   [label="RATIFIED"]', 'adr -> distill\n  adr -> note\n  note -> distill']),
      errors: ['node adr: ask node takes at most one unlabeled edge, has 2'],
    },
    { dot: edit(BUILT_IN_WORKFLOW, ['adr -> design    [label="REJECTED", max_visits=3]', 'adr -> design    [label="REJECTED", max_visits=3]\n  adr -> design    [label="REJECTED", max_visits=3]']), errors: ['node adr: ask node takes one REJECTED edge, has 2'] },
  ]
  for (const { dot, errors } of cases) {
    const { commands } = host({ files: ejectedPipeline(dot) })
    const checked = await commands.check()
    assert.deepEqual(checked.errors, errors, dot)
  }
})

test('a publish node publishes the pull request or the screenshots, runs when a kind of component is there, takes no other attribute, and has a phase like any working node', async () => {
  const cases = [
    { dot: edit(BUILT_IN_WORKFLOW, ['publish="pull-request"]', 'publish="visuals"]']), errors: ['node publish: publish="visuals" must be pull-request or playwright-visuals'] },
    { dot: edit(BUILT_IN_WORKFLOW, ['publish="pull-request"]', 'publish="pull-request", goal_gate=true]']), errors: ['node publish: attribute goal_gate is not supported on a parallelogram node (supported: label, shape, phase, publish, when)'] },
    { dot: edit(BUILT_IN_WORKFLOW, ['publish="pull-request"]', 'publish="pull-request", when="backend"]']), errors: ['node publish: when="backend" must be frontend'] },
    { dot: edit(BUILT_IN_WORKFLOW, ['phase="DELIVER"]', 'phase="DELIVER", when="frontend"]']), errors: ['node deliver: attribute when is not supported on a box node (supported: label, shape, phase, agent, model, outputs, writes, max_attempts, each)'] },
    { dot: edit(BUILT_IN_WORKFLOW, ['agent="pr-writer", phase="PUBLISH"]', 'agent="pr-writer", phase="PUBLISH", publish="pull-request"]']), errors: ['node pr_writer: attribute publish is not supported on a box node (supported: label, shape, phase, agent, model, outputs, writes, max_attempts, each)'] },
    {
      dot: 'digraph p {\n  start [shape=Mdiamond]\n  publish [shape=parallelogram, publish="pull-request"]\n  exit [shape=Msquare]\n  start -> publish -> exit\n}',
      errors: ['node publish has no phase; set phase="<PHASE>" on it or on a node before it'],
    },
  ]
  for (const { dot, errors } of cases) {
    const { commands } = host({ files: ejectedPipeline(dot) })
    assert.deepEqual((await commands.check()).errors, errors, dot)
  }
})

test('a consent question leads every answer by one unlabeled edge', async () => {
  const consent = edit(BUILT_IN_WORKFLOW,
    ['  exit     [shape=Msquare]', '  exit     [shape=Msquare]\n  consent  [shape=hexagon, question="reporting-consent"]'],
    ['deliver_review -> visuals [label="APPROVED"]', 'deliver_review -> consent [label="APPROVED"]\n  consent -> visuals'])
  const { commands, deps } = host({ files: ejectedPipeline(consent) })

  assert.equal((await commands.check()).ok, true)
  const loaded = await loadWorkflow(deps, {})
  assert.deepEqual(loaded.workflow.nodes.consent, node('consent', 'ask', { phase: 'DELIVER', question: 'reporting-consent' }))
  assert.deepEqual(loaded.workflow.edges.find((edge) => edge.from === 'consent'), { from: 'consent', to: 'visuals', label: null, maxVisits: null })
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

test('a review is a fan-out whose every branch runs one lens node into the same fan-in; each other shape is refused with its reason', async () => {
  const cases = [
    {
      what: 'a branch that skips its fan-in',
      dot: edit(BUILT_IN_WORKFLOW, ['design_review_fitness -> design_review', 'design_review_fitness -> adr']),
      errors: ["node design_review_fitness: a lens node leads to its review's fan-in (shape=tripleoctagon), not to adr"],
    },
    {
      what: 'a branch with no lens node',
      dot: edit(BUILT_IN_WORKFLOW, ['design_review_lenses -> design_review_fitness -> design_review', 'design_review_lenses -> design_review']),
      errors: [
        'node design_review_fitness: lens node needs exactly one outgoing edge, has 0',
        'edge design_review_lenses -> design_review: each branch of a fan-out holds exactly one lens node (shape=note), then the fan-in',
        'node design_review_fitness: a lens node is entered by exactly one edge, from a fan-out (shape=component)',
        'node design_review: a fan-in is entered only by the lens nodes of one fan-out, not by design_review_lenses',
        'node design_review_fitness is unreachable from start',
        'node design_review_fitness never reaches an exit',
      ],
    },
    {
      what: 'a fan-in without a fan-out',
      dot: edit(BUILT_IN_WORKFLOW, ['design -> design_review_lenses', 'design -> design_review']),
      errors: [
        'node design_review: a fan-in is entered only by the lens nodes of one fan-out, not by design',
        ...['design_review_lenses', 'design_review_consistency', 'design_review_architecture_compliance', 'design_review_fitness'].map((id) => `node ${id} is unreachable from start`),
      ],
    },
    {
      what: 'a lens node outside any review',
      dot: edit(BUILT_IN_WORKFLOW, ['adr -> distill   [label="RATIFIED"]', 'adr -> stray   [label="RATIFIED"]\n  stray [shape=note, lens="fitness"]\n  stray -> distill']),
      errors: [
        'node stray: a lens node is entered by exactly one edge, from a fan-out (shape=component)',
        "node stray: a lens node leads to its review's fan-in (shape=tripleoctagon), not to distill",
      ],
    },
    {
      what: 'a lens node two fan-outs share',
      dot: edit(BUILT_IN_WORKFLOW, ['  distill_review_lenses -> distill_review_coverage', '  distill_review_lenses -> design_review_fitness\n  distill_review_lenses -> distill_review_coverage']),
      errors: [
        'node design_review_fitness: a lens node is entered by exactly one edge, from a fan-out (shape=component)',
        'node design_review: its lens nodes come from design_review_lenses, distill_review_lenses; a fan-in closes one fan-out',
        'node distill_review_lenses: its branches end in design_review, distill_review; every branch of a fan-out ends in the same fan-in',
        'loop design_review_fitness -> design_review -> adr -> distill -> distill_review_lenses -> design_review_fitness has no max_visits',
        'edge distill_review_lenses -> design_review_fitness goes back from DISTILL to DESIGN',
      ],
    },
    {
      what: 'a fan-out whose branches end in two fan-ins',
      dot: edit(BUILT_IN_WORKFLOW, ['design_review_fitness -> design_review', 'design_review_fitness -> distill_review']),
      errors: [
        'node design_review_lenses: its branches end in design_review, distill_review; every branch of a fan-out ends in the same fan-in',
        'node distill_review: its lens nodes come from design_review_lenses, distill_review_lenses; a fan-in closes one fan-out',
        ...['coverage', 'business_alignment', 'testability', 'boundary_enforcement'].map((lens) => `edge distill_review_${lens} -> distill_review goes back from DISTILL to DESIGN`),
      ],
    },
    {
      what: 'a verdict edge on the fan-out',
      dot: edit(BUILT_IN_WORKFLOW, ['design_review -> design  [label="NEEDS_REWORK", max_visits=3]', 'design_review_lenses -> design  [label="NEEDS_REWORK", max_visits=3]']),
      errors: [
        "edge design_review_lenses -> design: only an edge leaving a gate, a review's fan-in (shape=tripleoctagon), a call (shape=house) or an ask node takes a label",
        'edge design_review_lenses -> design: each branch of a fan-out holds exactly one lens node (shape=note), then the fan-in',
      ],
    },
    {
      what: 'a fan-out with no branch',
      dot: edit(BUILT_IN_WORKFLOW, ['design -> design_review_lenses', 'design -> design_review_lenses\n  side_lenses [shape=component]\n  design_review_lenses -> side_lenses']),
      errors: [
        'edge design_review_lenses -> side_lenses: each branch of a fan-out holds exactly one lens node (shape=note), then the fan-in',
        'node side_lenses: a fan-out needs one branch per lens, has none',
        'node side_lenses never reaches an exit',
      ],
    },
    {
      what: 'a trigger the engine does not know',
      dot: edit(BUILT_IN_WORKFLOW, ['lens="coverage"', 'lens="coverage", when="frontend"']),
      errors: ['node distill_review_coverage: when="frontend" must be mock or contract'],
    },
  ]
  for (const { what, dot, errors } of cases) {
    assert.deepEqual((await host({ files: ejectedPipeline(dot) }).commands.check()).errors, errors, what)
  }
})

test('a workflow still written with lenses= on a review node is refused, each such node with the nodes and edges that replace it', async () => {
  const former = edit(BUILT_IN_WORKFLOW,
    ['  deliver_review [shape=house, workflow="review", mandatory=true]\n',
      '  deliver_review [shape=component, lenses="test-integrity, cold-reader@frontier,mock-fidelity,contract-fidelity", label="Delivery review", phase="DELIVER", model="economy", refuter="frontier", mandatory=true]\n'],
    ['  mutation_review_lenses [shape=component]\n  mutation_review_test_integrity [shape=note, lens="test-integrity"]\n  mutation_review [shape=tripleoctagon, mandatory=true]\n', '  mutation_review [shape=component, lenses="test-integrity"]\n'],
    ['kill_mutants -> mutation_review_lenses\n  mutation_review_lenses -> mutation_review_test_integrity -> mutation_review\n', 'kill_mutants -> mutation_review\n'])

  const checked = await host({ files: ejectedPipeline(former) }).commands.check()

  const keep = (id) => `keep the edges leaving ${id}; the plugin's mandatory=true stays on ${id}`
  assert.deepEqual(checked.errors, [
    'node mutation_review: lenses="test-integrity" is the former review form, no longer read; replace node mutation_review with:'
      + ' mutation_review_lenses [shape=component]; mutation_review_test_integrity [shape=note, lens="test-integrity"]; mutation_review [shape=tripleoctagon];'
      + ` kill_mutants -> mutation_review_lenses; mutation_review_lenses -> mutation_review_test_integrity -> mutation_review; ${keep('mutation_review')}`,
    'node deliver_review: lenses="test-integrity, cold-reader@frontier,mock-fidelity,contract-fidelity" is the former review form, no longer read; replace node deliver_review with:'
      + ' deliver_review_lenses [shape=component]; deliver_review_test_integrity [shape=note, lens="test-integrity"]; deliver_review_cold_reader [shape=note, lens="cold-reader", model="frontier"];'
      + ' deliver_review_mock_fidelity [shape=note, lens="mock-fidelity", when="mock"]; deliver_review_contract_fidelity [shape=note, lens="contract-fidelity", when="contract"];'
      + ' deliver_review [shape=tripleoctagon, label="Delivery review", phase="DELIVER", model="economy", refuter="frontier"];'
      + ' mutation -> deliver_review_lenses [label="PASS"];'
      + ' deliver_review_lenses -> deliver_review_test_integrity -> deliver_review; deliver_review_lenses -> deliver_review_cold_reader -> deliver_review;'
      + ' deliver_review_lenses -> deliver_review_mock_fidelity -> deliver_review; deliver_review_lenses -> deliver_review_contract_fidelity -> deliver_review;'
      + ` ${keep('deliver_review')}`,
  ])
})
