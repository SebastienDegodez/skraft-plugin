import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createNodeAdapters } from '../../../../plugins/skraft-framework/engine/infrastructure/node-adapters.mjs'
import { PLUGIN_ROOT, tempFolder } from '../support/workspace.mjs'

test('the built-in workflow is the DOT file the plugin ships', async (t) => {
  const { workflowSource } = createNodeAdapters({ cwd: tempFolder(t), pluginRoot: PLUGIN_ROOT })

  assert.equal(await workflowSource.builtIn(), readFileSync(join(PLUGIN_ROOT, 'workflows', 'skraft.dot'), 'utf8'))
})

test('a plugin without its workflow fails loudly', async (t) => {
  const { workflowSource } = createNodeAdapters({ cwd: tempFolder(t), pluginRoot: tempFolder(t) })

  await assert.rejects(workflowSource.builtIn(), { message: 'the plugin has no workflows/skraft.dot' })
})
