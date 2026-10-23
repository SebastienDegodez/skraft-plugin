import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_WORKFLOW } from '../support/in-memory-host.mjs'
import { edit, host } from './support.mjs'

const STAMPED = edit(BUILT_IN_WORKFLOW, ['graph [version="2", goal="Deliver the story"]', 'graph [version="2", goal="Deliver the story", skraft_version="2.0.0"]'])

test('eject copies the plugin workflow, stamped with the plugin version, and designates it; a second eject is refused', async () => {
  const { commands, workspace } = host()

  assert.deepEqual(await commands.eject({ pluginVersion: '2.0.0' }), {
    ok: true, path: 'skraft-workflow.dot', reason: 'skraft-workflow.dot holds the skraft 2.0.0 workflow and skraft-config.json designates it',
  })
  assert.equal(await workspace.read('skraft-workflow.dot'), STAMPED)
  assert.equal(await workspace.read('skraft-config.json'), '{\n  "workflow": "skraft-workflow.dot"\n}\n')
  assert.deepEqual(await commands.check(), { ok: true, name: 'skraft-workflow.dot', errors: [], unlocked: [], warnings: [], reason: 'skraft-workflow.dot is valid: phases RESEARCH, DESIGN, DISTILL, DELIVER' })

  assert.deepEqual(await commands.eject({ pluginVersion: '2.1.0' }), {
    ok: false, path: 'skraft-workflow.dot', reason: 'skraft-config.json already designates skraft-workflow.dot; edit that file',
  })
  assert.equal(await workspace.read('skraft-workflow.dot'), STAMPED)
})

test('eject keeps every other key of skraft-config.json', async () => {
  const { commands, workspace } = host({ files: { 'skraft-config.json': '{ "baseBranch": "develop", "components": [] }' } })

  assert.equal((await commands.eject({ pluginVersion: '2.0.0' })).ok, true)
  assert.deepEqual(workspace.config(), { baseBranch: 'develop', components: [], workflow: 'skraft-workflow.dot' })
})

test('eject refuses to overwrite a skraft-workflow.dot, or to touch an invalid skraft-config.json', async () => {
  const existing = host({ files: { 'skraft-workflow.dot': 'digraph mine {}' } })
  assert.deepEqual(await existing.commands.eject({ pluginVersion: '2.0.0' }), {
    ok: false,
    path: 'skraft-workflow.dot',
    reason: 'skraft-workflow.dot already exists; designate it with "workflow": "skraft-workflow.dot" in skraft-config.json, or remove it',
  })
  assert.deepEqual([...existing.workspace.files.keys()], ['skraft-workflow.dot'])

  const invalid = host({ files: { 'skraft-config.json': '{ "tdd": 3, "components": 3 }' } })
  assert.deepEqual(await invalid.commands.eject({ pluginVersion: '2.0.0' }), {
    ok: false, path: 'skraft-workflow.dot', reason: 'skraft-config.json is invalid: tdd must be { "replay": "all" or "last-red" }; components must be an array',
  })
  assert.deepEqual([...invalid.workspace.files.keys()], ['skraft-config.json'])

  const elsewhere = host({ files: { 'skraft-config.json': '{ "workflow": "flows/team.dot" }' } })
  assert.deepEqual(await elsewhere.commands.eject({ pluginVersion: '2.0.0' }), {
    ok: false, path: 'flows/team.dot', reason: 'skraft-config.json already designates flows/team.dot; edit that file',
  })
})

test('eject stamps the version whatever graph statement the plugin workflow has', async () => {
  const stamp = async (builtIn) => {
    const { commands, workspace } = host({ builtIn })
    await commands.eject({ pluginVersion: '2.0.0' })
    return workspace.read('skraft-workflow.dot')
  }

  assert.equal(
    await stamp('digraph skraft {\n  graph [goal="skraft_version"]\n  graph [skraft_version="1.9.0"] // shipped\n  start [skraft_version="1.9.0"]\n}\n'),
    'digraph skraft {\n  graph [goal="skraft_version"]\n  graph [skraft_version="2.0.0"] // shipped\n  start [skraft_version="1.9.0"]\n}\n',
  )
  assert.equal(await stamp('digraph skraft {\n  graph []\n}\n'), 'digraph skraft {\n  graph [skraft_version="2.0.0"]\n}\n')
  assert.equal(await stamp('digraph skraft {\n  graph [\n    version="2"\n  ]\n}\n'), 'digraph skraft {\n  graph [\n    version="2", skraft_version="2.0.0"\n  ]\n}\n')
  assert.equal(
    await stamp('/* { graph [x=1] } */ digraph skraft {\n  "graph" [shape=box]\n}\n'),
    '/* { graph [x=1] } */ digraph skraft {\n  graph [skraft_version="2.0.0"]\n  "graph" [shape=box]\n}\n',
  )
})
