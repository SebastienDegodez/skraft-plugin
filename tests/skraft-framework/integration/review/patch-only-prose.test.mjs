import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PATCH_ONLY } from '../../../../plugins/skraft-framework/engine/domain/review/lenses.mjs'
import { PLUGIN_ROOT } from '../support/workspace.mjs'

/** What a lens's brief says when it judges the changes alone; cold-reader reads the changed code only. */
const READS_ONLY_THE_CHANGES = Object.freeze({ __proto__: null, 'cold-reader': 'Read the changed code and tests' })

/** The lens's agent file under each host, its front matter left out. @param {string} name */
const bodiesOf = (name) => [
  join(PLUGIN_ROOT, 'com.anthropic.claude-code', 'agents', `${name}-lens.md`),
  join(PLUGIN_ROOT, 'com.github.copilot', 'agents', `${name}-lens.agent.md`),
].map((path) => ({ path, body: readFileSync(path, 'utf8').replace(/^---\n[^]*?\n---\n/, '') }))

test('every lens the review does not ask without change says, on both hosts, that it reads only the changes', () => {
  assert.ok(PATCH_ONLY.length > 0)
  for (const name of PATCH_ONLY) {
    const phrase = READS_ONLY_THE_CHANGES[name] ?? 'Read the patch'
    for (const { path, body } of bodiesOf(name)) assert.ok(body.includes(phrase), `${path} no longer says "${phrase}": take ${name} out of PATCH_ONLY or restore its prose`)
  }
})

test('a lens that reads a document outside the patch is not in the patch-only list', () => {
  for (const name of ['consistency', 'fitness', 'architecture-compliance', 'testability', 'boundary-enforcement', 'test-integrity', 'architecture-boundaries']) {
    assert.ok(!PATCH_ONLY.includes(name), name)
  }
})
