import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { findShippedWorkflows } from '../../../eng/lib/shipped-workflows.mjs'

test('independent workflows keep separate agent identities without replacing the engineering entrypoint', () => {
  const workflows = findShippedWorkflows(fileURLToPath(new URL('../../../', import.meta.url)))
  assert.deepEqual(workflows.filter(({ entry }) => entry).map(({ pluginDir }) => pluginDir), ['skraft-framework'])
  for (const kind of ['design', 'deliver']) {
    const own = workflows.filter(({ pluginDir }) => pluginDir === `skraft-${kind}`)
    assert.ok(own.some(({ path }) => path.endsWith('/pipeline.skraft.dot')))
    assert.ok(own.every(({ agents }) => agents.every((agent) => agent.startsWith(`${kind}-`))))
    assert.ok(own.some(({ agents }) => agents.includes(`${kind}-finding-refuter`)))
  }
})
