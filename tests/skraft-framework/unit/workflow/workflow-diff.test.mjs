import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_WORKFLOW } from '../support/in-memory-host.mjs'
import { designating, edit, host, WITH_SECURITY } from './support.mjs'

test('diff lists the nodes and edges a repository workflow adds, drops and changes, after the version it was ejected from', async () => {
  const ejected = edit(
    WITH_SECURITY,
    ['goal="Deliver the story"]', 'goal="Deliver the story", skraft_version="1.9.0"]'],
    ['gates -> deliver [label="FAIL", max_visits=3]', 'gates -> deliver [label="FAIL", max_visits=5]'],
  )
  const files = designating(ejected)
  const { commands, workspace } = host({ files })

  assert.deepEqual(await commands.diff({ pluginVersion: '2.0.0' }), {
    ok: true,
    name: 'skraft-workflow.dot',
    changes: [
      'skraft_version 1.9.0 → 2.0.0',
      '+ node security (agent acme-security-reviewer)',
      '+ edge adr -> security',
      '+ edge security -> distill',
      '- edge adr -> distill',
      '~ edge gates -> deliver: max_visits 3 → 5',
    ],
    reason: 'skraft-workflow.dot carries skraft_version 1.9.0, this plugin is 2.0.0; 5 changes from the skraft 2.0.0 workflow',
  })
  assert.deepEqual(Object.fromEntries(workspace.files), files)
})

test('diff names every fact of a node or an edge that changed, and the nodes removed', async () => {
  const reshaped = edit(
    BUILT_IN_WORKFLOW,
    ['  research [shape=box, agent="solution-researcher", phase="RESEARCH"]\n', ''],
    ['start -> research -> design', 'start -> design'],
    ['phase="DESIGN"', 'phase="ARCHITECTURE"'],
    ['lenses="consistency,architecture-compliance,fitness"]', 'lenses="consistency,architecture-compliance,fitness", refuter="opus"]'],
    ['distill  [shape=box, agent="acceptance-designer", phase="DISTILL"]', 'distill  [shape=parallelogram, gate="test", phase="DISTILL"]'],
    ['agent="software-engineer", phase="DELIVER"', 'agent="software-engineer", phase="DELIVER", model="opus", max_attempts=4, outputs="code.md, notes.md", writes="src/, tests/"'],
    ['gate="build,format,lint,test,architecture,coverage,mutation", goal_gate=true, locked=true', 'gate="build,test", goal_gate=false, locked=false, unlock="the CI runs the rest"'],
    ['gates -> deliver [label="FAIL", max_visits=3]', 'gates -> deliver [label="PASS", max_visits=3]'],
    ['gates -> deliver_review [label="PASS"]', 'gates -> deliver_review [label="FAIL"]'],
    ['graph [version="2", goal="Deliver the story"]', 'graph [version="2", goal="Deliver the story", skraft_version="2.0.0"]'],
  )
  const { commands } = host({ files: designating(reshaped) })

  assert.deepEqual(await commands.diff({ pluginVersion: '2.0.0' }), {
    ok: true,
    name: 'skraft-workflow.dot',
    changes: [
      '- node research',
      '~ node design: phase DESIGN → ARCHITECTURE',
      '~ node design_review: phase DESIGN → ARCHITECTURE',
      '~ node design_review: refuter none → opus',
      '~ node adr: phase DESIGN → ARCHITECTURE',
      '~ node distill: kind agent → gate',
      '~ node distill: agent acceptance-designer → none',
      '~ node distill: gate none → test',
      '~ node deliver: outputs none → code.md, notes.md',
      '~ node deliver: writes none → src/, tests/',
      '~ node deliver: max_attempts none → 4',
      '~ node deliver: model none → opus',
      '~ node gates: gate build,format,lint,test,architecture,coverage,mutation → build,test',
      '~ node gates: goal_gate true → false',
      '~ node gates: locked true → false',
      '~ node gates: unlock none → the CI runs the rest',
      '+ edge start -> design',
      '- edge start -> research',
      '- edge research -> design',
      '~ edge distill -> distill_review: label none → PASS',
      '~ edge gates -> deliver: label FAIL → PASS',
      '~ edge gates -> deliver_review: label PASS → FAIL',
    ],
    reason: 'skraft-workflow.dot: 22 changes from the skraft 2.0.0 workflow',

  })
})

test('diff of a workflow just ejected lists nothing; one without skraft_version says so', async () => {
  const { commands } = host()
  await commands.eject({ pluginVersion: '2.0.0' })
  assert.deepEqual(await commands.diff({ pluginVersion: '2.0.0' }), { ok: true, name: 'skraft-workflow.dot', changes: [], reason: 'skraft-workflow.dot: 0 changes from the skraft 2.0.0 workflow' })

  const handWritten = host({ files: designating(edit(
    BUILT_IN_WORKFLOW,
    ['  exit     [shape=Msquare]', '  done     [shape=Msquare]\n  smoke    [shape=parallelogram, gate="build,test"]\n  smoke -> done'],
    ['deliver_review -> exit ', 'deliver_review -> smoke '],
  )) })
  assert.deepEqual(await handWritten.commands.diff({ pluginVersion: '2.0.0' }), {
    ok: true,
    name: 'skraft-workflow.dot',
    changes: [
      'skraft_version none → 2.0.0',
      '+ node done (exit)',
      '+ node smoke (gate build,test)',
      '- node exit',
      '+ edge smoke -> done',
      '+ edge deliver_review -> smoke',
      '- edge deliver_review -> exit',
    ],
    reason: 'skraft-workflow.dot carries skraft_version none, this plugin is 2.0.0; 6 changes from the skraft 2.0.0 workflow',
  })
})

test('diff is refused without a repository workflow, or when it or skraft-config.json is invalid', async () => {
  assert.deepEqual(await host().commands.diff({ pluginVersion: '2.0.0' }), {
    ok: false, name: 'skraft', changes: [], reason: "skraft-config.json designates no workflow; the plugin's runs as shipped (skraft workflow eject copies it)",
  })
  assert.deepEqual(await host({ files: { 'skraft-config.json': '{ "workflow": "team.dot" }' } }).commands.diff({ pluginVersion: '2.0.0' }), {
    ok: false, name: 'team.dot', changes: [], reason: 'team.dot is invalid: team.dot does not exist',
  })
  assert.deepEqual(await host({ files: designating('digraph {\n  a -- b\n}') }).commands.diff({ pluginVersion: '2.0.0' }), {
    ok: false, name: 'skraft-workflow.dot', changes: [], reason: 'skraft-workflow.dot is invalid: line 2: undirected edges (--) are not supported; use ->',
  })
  assert.deepEqual(await host({ files: designating('digraph {\n  a [shape=box]\n}') }).commands.diff({ pluginVersion: '2.0.0' }), {
    ok: false,
    name: 'skraft-workflow.dot',
    changes: [],
    reason: 'skraft-workflow.dot is invalid: node a: a box node needs agent="…"; node a: agent node needs exactly one outgoing edge, has 0; '
      + 'the workflow needs exactly one start node (shape=Mdiamond), has 0; the workflow needs at least one exit node (shape=Msquare)',
  })
  assert.deepEqual(await host({ files: { 'skraft-config.json': '[]' } }).commands.diff({ pluginVersion: '2.0.0' }), {
    ok: false, name: 'skraft-config.json', changes: [], reason: 'skraft-config.json is invalid: skraft-config.json must hold a JSON object',
  })
})
