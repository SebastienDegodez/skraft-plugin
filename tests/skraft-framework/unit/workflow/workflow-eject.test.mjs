import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILT_IN_REVIEW, BUILT_IN_WORKFLOW } from '../support/in-memory-host.mjs'
import { loadWorkflow } from '../../../../plugins/skraft-framework/engine/application/workflow/load-workflow.mjs'
import { edit, host, reviewWithLenses } from './support.mjs'

const STAMPED_REVIEW = edit(BUILT_IN_REVIEW, ['input_components="optional"]', 'input_components="optional", skraft_version="2.0.0"]'])
const REVIEW = { pluginVersion: '2.0.0', workflow: 'review' }

const PIPELINE = '.skraft/pipeline.skraft.dot'
const REVIEW_COPY = '.skraft/review.skraft.dot'
const VALID = 'phases RESEARCH, DESIGN, DISTILL, DELIVER, PUBLISH'
const STAMPED = edit(BUILT_IN_WORKFLOW, ['graph [version="2", goal="Deliver the story"]', 'graph [version="2", goal="Deliver the story", skraft_version="2.0.0"]'])

test('eject copies the plugin\'s pipeline into .skraft/pipeline.skraft.dot, stamped, the configuration untouched; the run follows it; a second eject is refused', async () => {
  const { commands, workspace } = host({ files: { 'skraft-config.json': '{ "baseBranch": "develop" }' } })

  assert.deepEqual(await commands.eject({ pluginVersion: '2.0.0' }), { ok: true, path: PIPELINE, reason: `${PIPELINE} holds the skraft 2.0.0 pipeline; the run follows it` })
  assert.deepEqual([...workspace.files.keys()], ['skraft-config.json', PIPELINE])
  assert.equal(await workspace.read(PIPELINE), STAMPED)
  assert.equal(await workspace.read('skraft-config.json'), '{ "baseBranch": "develop" }')
  assert.deepEqual(await commands.check(), { ok: true, name: PIPELINE, errors: [], unlocked: [], warnings: [], reason: `${PIPELINE} is valid: ${VALID}` })

  assert.deepEqual(await commands.eject({ pluginVersion: '2.1.0' }), { ok: false, path: PIPELINE, reason: `${PIPELINE} already exists; edit it, or remove it` })
  assert.equal(await workspace.read(PIPELINE), STAMPED)
})

test('eject review copies the plugin\'s review alone into .skraft/review.skraft.dot, stamped; every call to review runs it and check names it; a second eject is refused', async () => {
  const { commands, workspace } = host()

  assert.deepEqual(await commands.eject(REVIEW), { ok: true, path: REVIEW_COPY, reason: `${REVIEW_COPY} holds the skraft 2.0.0 review; every call to review runs it` })
  assert.deepEqual([...workspace.files.keys()], [REVIEW_COPY])
  assert.equal(await workspace.read(REVIEW_COPY), STAMPED_REVIEW)
  assert.deepEqual(await commands.check(), { ok: true, name: 'skraft', errors: [], unlocked: [], warnings: [], reason: `skraft and ${REVIEW_COPY} are valid: ${VALID}` })
  await commands.eject({ pluginVersion: '2.0.0' })
  assert.equal((await commands.check()).reason, `${PIPELINE} and ${REVIEW_COPY} are valid: ${VALID}`)

  assert.deepEqual(await commands.eject(REVIEW), { ok: false, path: REVIEW_COPY, reason: `${REVIEW_COPY} already exists; edit it, or remove it` })
  assert.equal(await workspace.read(REVIEW_COPY), STAMPED_REVIEW)
})

test('a workflow anywhere but in .skraft/ under its own name is never read: a stray review.dot or skraft-workflow.dot changes nothing', async () => {
  const stray = reviewWithLenses(['cold-reader'])
  const { commands, deps } = host({ files: { 'review.dot': stray, 'review.skraft.dot': stray, '.skraft/review.dot': stray, 'skraft-workflow.dot': 'digraph mine {}' } })

  assert.deepEqual((await commands.check()).reason, `skraft is valid: ${VALID}`)
  assert.equal((await loadWorkflow(deps, {})).workflow.called.review.path, null)
})

test('eject stamps the version whatever graph statement the plugin workflow has', async () => {
  const stamp = async (builtIn) => {
    const { commands, workspace } = host({ builtIn })
    await commands.eject({ pluginVersion: '2.0.0' })
    return workspace.read('.skraft/pipeline.skraft.dot')
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
