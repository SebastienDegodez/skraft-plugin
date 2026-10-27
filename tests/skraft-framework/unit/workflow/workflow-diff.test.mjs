import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_REVIEW, BUILT_IN_WORKFLOW } from '../support/in-memory-host.mjs'
import { DELIVER_LENSES, ejectedPipeline, edit, host, reviewWithLenses, WITH_SECURITY, withLenses } from './support.mjs'

test('diff lists the changes of the .skraft/review.skraft.dot of the working copy, prefixed with its path, even when only .skraft/review.skraft.dot was ejected', async () => {
  const { commands, workspace } = host()
  await commands.eject({ pluginVersion: '2.0.0', workflow: 'review' })
  assert.deepEqual(await commands.diff({ pluginVersion: '2.0.0' }), { ok: true, name: 'skraft', changes: [], reason: '.skraft/review.skraft.dot: 0 changes from the skraft 2.0.0 workflow' })

  await workspace.write('.skraft/review.skraft.dot', reviewWithLenses(['acme-security', ...DELIVER_LENSES], await workspace.read('.skraft/review.skraft.dot')))
  assert.deepEqual(await commands.diff({ pluginVersion: '2.1.0' }), {
    ok: true,
    name: 'skraft',
    changes: [
      '.skraft/review.skraft.dot: skraft_version 2.0.0 → 2.1.0',
      '.skraft/review.skraft.dot: + node acme_security (lens acme-security)',
    ],
    reason: '.skraft/review.skraft.dot carries skraft_version 2.0.0, this plugin is 2.1.0; 1 changes from the skraft 2.1.0 workflow',
  })
})

test('diff lists the changes of the designated workflow, then those of each workflow of the working copy it calls; one the plugin does not ship is said so', async () => {
  const stamped = edit(BUILT_IN_WORKFLOW, ['goal="Deliver the story"]', 'goal="Deliver the story", skraft_version="2.0.0"]'])
  const review = edit(BUILT_IN_REVIEW, ['input_components="optional"]', 'input_components="optional", skraft_version="2.0.0"]'], ['lens="cold-reader"', 'lens="cold-reader", model="economy"'], ['lens="mock-fidelity"', 'lens="acme-mocks"'])
  const both = host({ files: { ...ejectedPipeline(edit(stamped, ['gates -> deliver [label="FAIL", max_visits=3]', 'gates -> deliver [label="FAIL", max_visits=5]'])), '.skraft/review.skraft.dot': review } })
  assert.deepEqual(await both.commands.diff({ pluginVersion: '2.0.0' }), {
    ok: true,
    name: '.skraft/pipeline.skraft.dot',
    changes: ['~ edge gates -> deliver: max_visits 3 → 5', '.skraft/review.skraft.dot: ~ node cold_reader: model none → economy', '.skraft/review.skraft.dot: ~ node mock_fidelity: lens mock-fidelity → acme-mocks'],
    reason: '.skraft/pipeline.skraft.dot: 1 changes from the skraft 2.0.0 workflow; .skraft/review.skraft.dot: 2 changes from the skraft 2.0.0 workflow',
  })

  const team = host({ files: { ...ejectedPipeline(edit(stamped, ['workflow="review"', 'workflow="team-review"'])), '.skraft/team-review.skraft.dot': BUILT_IN_REVIEW } })
  assert.deepEqual(await team.commands.diff({ pluginVersion: '2.0.0' }), {
    ok: true,
    name: '.skraft/pipeline.skraft.dot',
    changes: ['~ node deliver_review: workflow review → team-review (mandatory)', '+ workflow .skraft/team-review.skraft.dot'],
    reason: '.skraft/pipeline.skraft.dot: 1 changes from the skraft 2.0.0 workflow; .skraft/team-review.skraft.dot: no workflow of the plugin to compare with',
  })
})

test('diff lists the nodes and edges a repository workflow adds, drops and changes, after the version it was ejected from', async () => {
  const ejected = edit(
    WITH_SECURITY,
    ['goal="Deliver the story"]', 'goal="Deliver the story", skraft_version="1.9.0"]'],
    ['gates -> deliver [label="FAIL", max_visits=3]', 'gates -> deliver [label="FAIL", max_visits=5]'],
  )
  const files = ejectedPipeline(ejected)
  const { commands, workspace } = host({ files })

  assert.deepEqual(await commands.diff({ pluginVersion: '2.0.0' }), {
    ok: true,
    name: '.skraft/pipeline.skraft.dot',
    changes: [
      'skraft_version 1.9.0 → 2.0.0',
      '+ node security (agent acme-security-reviewer)',
      '+ edge design -> security',
      '+ edge security -> design_review',
      '- edge design -> design_review',
      '~ edge gates -> deliver: max_visits 3 → 5',
    ],
    reason: '.skraft/pipeline.skraft.dot carries skraft_version 1.9.0, this plugin is 2.0.0; 5 changes from the skraft 2.0.0 workflow',
  })
  assert.deepEqual(Object.fromEntries(workspace.files), files)
})

test('diff names every fact of a node or an edge that changed, and the nodes removed', async () => {
  const reshaped = edit(
    BUILT_IN_WORKFLOW,
    ['  research [shape=box, agent="solution-researcher", phase="RESEARCH"]\n', ''],
    ['start -> publish_consent -> visuals_consent -> research -> design', 'start -> publish_consent -> visuals_consent -> design'],
    ['phase="DESIGN"', 'phase="ARCHITECTURE"'],
    ['design_review [shape=tripleoctagon, mandatory=true]', 'design_review [shape=tripleoctagon, mandatory=true, refuter="opus"]'],
    ['distill  [shape=box, agent="acceptance-designer", phase="DISTILL"]', 'distill  [shape=parallelogram, gate="test", phase="DISTILL"]'],
    ['agent="software-engineer", phase="DELIVER"', 'agent="software-engineer", phase="DELIVER", model="opus", max_attempts=4, outputs="code.md, notes.md", writes="src/, tests/"'],
    ['gate="build,format,lint,test,architecture,coverage", goal_gate=true, locked=true', 'gate="build,test", goal_gate=false, locked=false, unlock="the CI runs the rest"'],
    ['agent="software-engineer", each="survivor-file"]', 'agent="software-engineer"]'],
    ['gates -> deliver [label="FAIL", max_visits=3]', 'gates -> deliver [label="PASS", max_visits=3]'],
    ['gates -> mutation [label="PASS"]', 'gates -> mutation [label="FAIL"]'],
    ['graph [version="2", goal="Deliver the story"]', 'graph [version="2", goal="Deliver the story", skraft_version="2.0.0"]'],
  )
  const { commands } = host({ files: ejectedPipeline(reshaped) })

  assert.deepEqual(await commands.diff({ pluginVersion: '2.0.0' }), {
    ok: true,
    name: '.skraft/pipeline.skraft.dot',
    changes: [
      '- node research',
      '~ node design: phase DESIGN → ARCHITECTURE',
      '~ node design_review: phase DESIGN → ARCHITECTURE (mandatory)',
      '~ node design_review: refuter none → opus (mandatory)',
      '~ node adr: phase DESIGN → ARCHITECTURE',
      '~ node distill: kind agent → gate',
      '~ node distill: agent acceptance-designer → none',
      '~ node distill: gate none → test',
      '~ node deliver: outputs none → code.md, notes.md',
      '~ node deliver: writes none → src/, tests/',
      '~ node deliver: max_attempts none → 4',
      '~ node deliver: model none → opus',
      '~ node gates: gate build,format,lint,test,architecture,coverage → build,test',
      '~ node gates: goal_gate true → false',
      '~ node gates: locked true → false',
      '~ node gates: unlock none → the CI runs the rest',
      '~ node kill_mutants: each survivor-file → none',
      '+ edge visuals_consent -> design',
      '- edge visuals_consent -> research',
      '- edge research -> design',
      '~ edge distill -> distill_review: label none → PASS',
      '~ edge gates -> deliver: label FAIL → PASS',
      '~ edge gates -> mutation: label PASS → FAIL',
    ],
    reason: '.skraft/pipeline.skraft.dot: 23 changes from the skraft 2.0.0 workflow',

  })
})

test('diff names a publish node added, a node turned from publish to gate, a condition dropped, a question changed, and each lens node added, dropped or changed', async () => {
  const reshaped = edit(
    withLenses(BUILT_IN_WORKFLOW, 'mutation_review', ['cold-reader', 'test-integrity']),
    ['    design_review_fitness [shape=note, lens="fitness"]\n', ''],
    ['  design_review_lenses -> design_review_fitness -> design_review\n', ''],
    ['lens="coverage"', 'lens="coverage", when="mock", model="frontier"'],
    ['  distill_review_lenses -> distill_review_testability -> distill_review\n', ''],
    ['  mutation_review_lenses -> mutation_review_cold_reader', '  mutation_review_lenses -> distill_review_testability -> mutation_review\n  mutation_review_lenses -> mutation_review_cold_reader'],
    ['publish  [shape=parallelogram, publish="pull-request"]', 'publish  [shape=parallelogram, gate="build"]\n  notify   [shape=parallelogram, publish="pull-request"]'],
    ['pr_writer -> publish -> exit', 'pr_writer -> publish -> notify -> exit'],
    ['question="publish-consent"', 'question="reporting-consent"'],
    ['publish="playwright-visuals", when="frontend"]', 'publish="playwright-visuals"]'],
    ['graph [version="2", goal="Deliver the story"]', 'graph [version="2", goal="Deliver the story", skraft_version="2.0.0"]'],
  )
  const { commands } = host({ files: ejectedPipeline(reshaped) })

  assert.deepEqual((await commands.diff({ pluginVersion: '2.0.0' })).changes, [
    '+ node mutation_review_cold_reader (lens cold-reader)',
    '+ node notify (publish pull-request)',
    '- node design_review_fitness',
    '~ node publish_consent: question publish-consent → reporting-consent',
    '~ node distill_review_coverage: when none → mock',
    '~ node distill_review_coverage: model none → frontier',
    '~ node distill_review_testability: fan-in distill_review → mutation_review',
    '~ node visuals: when frontend → none',
    '~ node publish: kind publish → gate',
    '~ node publish: gate none → build',
    '~ node publish: publish pull-request → none',
    '+ edge publish -> notify',
    '+ edge notify -> exit',
    '- edge publish -> exit',
  ])
})

test('diff of a workflow just ejected lists nothing; one without skraft_version says so', async () => {
  const { commands } = host()
  await commands.eject({ pluginVersion: '2.0.0' })
  assert.deepEqual(await commands.diff({ pluginVersion: '2.0.0' }), { ok: true, name: '.skraft/pipeline.skraft.dot', changes: [], reason: '.skraft/pipeline.skraft.dot: 0 changes from the skraft 2.0.0 workflow' })

  const handWritten = host({ files: ejectedPipeline(edit(
    BUILT_IN_WORKFLOW,
    ['  exit     [shape=Msquare]', '  done     [shape=Msquare]\n  smoke    [shape=parallelogram, gate="build,test"]\n  smoke -> done'],
    ['pr_writer -> publish -> exit', 'pr_writer -> publish -> smoke'],
  )) })
  assert.deepEqual(await handWritten.commands.diff({ pluginVersion: '2.0.0' }), {
    ok: true,
    name: '.skraft/pipeline.skraft.dot',
    changes: [
      'skraft_version none → 2.0.0',
      '+ node done (exit)',
      '+ node smoke (gate build,test)',
      '- node exit',
      '+ edge smoke -> done',
      '+ edge publish -> smoke',
      '- edge publish -> exit',
    ],
    reason: '.skraft/pipeline.skraft.dot carries skraft_version none, this plugin is 2.0.0; 6 changes from the skraft 2.0.0 workflow',
  })
})

test('diff is refused without an ejected workflow, or when one is invalid', async () => {
  assert.deepEqual(await host().commands.diff({ pluginVersion: '2.0.0' }), {
    ok: false, name: 'skraft', changes: [], reason: "the working copy has neither .skraft/pipeline.skraft.dot nor .skraft/review.skraft.dot; the plugin's run as shipped (skraft workflow eject [review] copies them)",
  })
  assert.deepEqual(await host({ files: { '.skraft/review.skraft.dot': 'digraph {}' } }).commands.diff({ pluginVersion: '2.0.0' }), {
    ok: false, name: 'skraft', changes: [], reason: 'skraft is invalid: .skraft/review.skraft.dot: the workflow needs exactly one start node (shape=Mdiamond), has 0; .skraft/review.skraft.dot: the workflow needs at least one exit node (shape=Msquare)',
  })
  assert.deepEqual(await host({ files: ejectedPipeline('digraph {\n  a -- b\n}') }).commands.diff({ pluginVersion: '2.0.0' }), {
    ok: false, name: '.skraft/pipeline.skraft.dot', changes: [], reason: '.skraft/pipeline.skraft.dot is invalid: line 2: undirected edges (--) are not supported; use ->',
  })
  assert.deepEqual(await host({ files: ejectedPipeline('digraph {\n  a [shape=box]\n}') }).commands.diff({ pluginVersion: '2.0.0' }), {
    ok: false,
    name: '.skraft/pipeline.skraft.dot',
    changes: [],
    reason: '.skraft/pipeline.skraft.dot is invalid: node a: a box node needs agent="…"; node a: agent node needs exactly one outgoing edge, has 0; '
      + 'the workflow needs exactly one start node (shape=Mdiamond), has 0; the workflow needs at least one exit node (shape=Msquare)',
  })
})
