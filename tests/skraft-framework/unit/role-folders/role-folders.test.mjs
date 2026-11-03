import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nominal, REFS_42, scripted } from '../support/pipeline-host.mjs'

// #498: on a repository with no docs folders, the agent's tools may only create files in
// existing folders, so the engine creates the folders of the agent's role before dispatching it.
test('the engine creates the docs folders of a role that the repository does not have yet, each with an empty .gitkeep, and leaves existing ones alone', async () => {
  const host = scripted({}, (it) => nominal(it, REFS_42))

  const outcome = await host.start({ story: { issue: 42, title: 'Pay by card' } })

  assert.equal(outcome.status, 'done')
  const kept = [...host.workspace.files.keys()].filter((path) => path.endsWith('/.gitkeep')).sort()
  assert.deepEqual(kept, ['docs/adr/.gitkeep', 'docs/domain/event-model/.gitkeep', 'docs/features/.gitkeep'])
  assert.equal(host.workspace.files.get('docs/adr/.gitkeep'), '')
  assert.equal(host.workspace.files.get('docs/architecture/context-map.md'), '# Context map\n')
})
